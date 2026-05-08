import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import jwt from "jsonwebtoken";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { appConfig, redisAdapterConfig } from "./config/appConfig.js";
import { requestLogger } from "./middlewares/requestLogger.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import pool from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import routeRoutes from "./routes/routeRoutes.js";
import stopRoutes from "./routes/stopRoutes.js";
import busRoutes from "./routes/busRoutes.js";
import driverRoutes from "./routes/driverRoutes.js";
import locationRoutes from "./routes/locationRoutes.js";
import adminDriverRoutes from "./routes/adminDriverRoutes.js";
import routeStopRoutes from "./routes/routeStopRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import tripRoutes from "./routes/tripRoutes.js";
import {
  getCountersSnapshot,
  getGpsUpdatesByBusTop,
  getProcessStartTimeMs,
  getUptimeSec,
  incCounter,
  log,
  setGauge,
} from "./utils/observability.js";
import { isBatchWriterRunning, startBatchLocationWriter, stopBatchLocationWriter } from "./services/batchLocationWriter.js";
import { closeRedis, initRedis, isRedisReady } from "./services/redis.js";
import { realtimeBus } from "./services/realtimeBus.js";
import { fetchAndSaveRouteGeometry, isSkippableRouteGeometryError } from "./services/osrmService.js";
import { checkAndAutoCompleteStaleTrips } from "./controllers/driverController.js";
import { startArchivalJob } from "./jobs/archivalJob.js";
// PHASE0-FIX: Validate all required env vars at startup — fail fast
if (!appConfig.jwtSecret) {
  throw new Error("Missing required environment variable: JWT_SECRET");
}

if (appConfig.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long. Generate one with: openssl rand -hex 32');
}

const parsedPort = appConfig.port;
const jwtSecret = appConfig.jwtSecret;
const allowedOrigins = appConfig.corsOrigins;

const app = express();
const server = http.createServer(app);
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

// realtimeBus events -> Socket.IO room broadcasts.
realtimeBus.on("bus:location", (payload) => {
  const { busId, ...rest } = payload;
  if (!Number.isFinite(Number(busId))) return;
  io.to(`bus_${Number(busId)}`).emit("bus_location_update", rest);
});

realtimeBus.on("bus:stop", (payload) => {
  const { busId, ...rest } = payload;
  if (!Number.isFinite(Number(busId))) return;
  io.to(`bus_${Number(busId)}`).emit("trip_stop_update", rest);
});

realtimeBus.on("bus:stale", (payload) => {
  const { driverSocketId, busId, ...rest } = payload;
  if (driverSocketId) {
    io.to(driverSocketId).emit("trip_stale_warning", rest);
    return;
  }
  if (Number.isFinite(Number(busId))) {
    io.to(`bus_${Number(busId)}`).emit("trip_stale_warning", rest);
  }
});

realtimeBus.on("trip:complete", (payload) => {
  const { busId, ...rest } = payload;
  if (!Number.isFinite(Number(busId))) return;
  io.to(`bus_${Number(busId)}`).emit("trip_completed", rest);
});

const setupSocketAdapter = async () => {
  if (!redisAdapterConfig.enabled) {
    log("debug", "socket_adapter_skipped", {
      reason: redisAdapterConfig.reason === "invalid_scheme"
        ? "REDIS_ADAPTER_URL must be redis:// or rediss://"
        : redisAdapterConfig.reason === "placeholder"
          ? "REDIS_ADAPTER_URL looks like a placeholder"
          : "REDIS_ADAPTER_URL not set",
      mode: "single_process",
    });
    return;
  }

  try {
    const redisModule = await import("redis");
    const pubClient = redisModule.createClient({ url: redisAdapterConfig.url });
    const subClient = pubClient.duplicate();

    await pubClient.connect();
    await subClient.connect();
    io.adapter(createAdapter(pubClient, subClient));
    log("info", "socket_adapter_initialized", { mode: "redis_adapter" });
  } catch (err) {
    log("warn", "socket_adapter_fallback", {
      message: err?.message,
      mode: "single_process_fallback",
    });
  }
};

const populateMissingGeometry = async () => {
  try {
    const result = await pool.query(
      `SELECT id, route_name FROM routes WHERE route_geometry_distance_m IS NULL`
    );

    if (result.rows.length === 0) return;

    log("info", "route_geometry_backfill_started", { count: result.rows.length });
    let failedCount = 0;
    let skippedCount = 0;
    for (const route of result.rows) {
      try {
        await fetchAndSaveRouteGeometry(Number(route.id));
        log("info", "route_geometry_backfill_success", {
          route_id: Number(route.id),
          route_name: route.route_name,
        });
      } catch (err) {
        if (isSkippableRouteGeometryError(err)) {
          skippedCount += 1;
          log("warn", "route_geometry_backfill_skipped_route", {
            route_id: Number(route.id),
            route_name: route.route_name,
            reason: err?.message,
            stop_count: err?.stop_count ?? null,
            stop_order: err?.stop_order ?? null,
          });
          continue;
        }

        failedCount += 1;
        log("warn", "route_geometry_backfill_failed", {
          route_id: Number(route.id),
          route_name: route.route_name,
          message: err?.message,
        });
      }
    }

    if (failedCount > 0 || skippedCount > 0) {
      log("info", "route_geometry_backfill_completed", {
        failed_count: failedCount,
        skipped_count: skippedCount,
        total_count: result.rows.length,
      });
    }
  } catch (err) {
    log("warn", "route_geometry_backfill_skipped", {
      message: err?.message,
      hint: "Validate DATABASE_URL and OSRM_BASE_URL; startup will not continue with placeholder hosts",
    });
  }
};

// PHASE0-FIX: Configure helmet with HSTS and tightened CSP
app.use(helmet({
  // PHASE0-FIX: HSTS — tell browsers to only use HTTPS for 1 year
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  // PHASE0-FIX: Disable X-Powered-By (already done by helmet default, explicit here)
  hidePoweredBy: true,
  // PHASE0-FIX: Prevent MIME sniffing
  noSniff: true,
  // PHASE0-FIX: Prevent clickjacking
  frameguard: { action: "deny" },
  // PHASE0-FIX: XSS filter for older browsers
  xssFilter: true,
  // NOTE: contentSecurityPolicy is left at helmet default — do not configure here
  // as it would require listing all Socket.IO and API origins explicitly
}));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: appConfig.limits.jsonBodyLimit }));
app.use(requestLogger);
app.use("/api/auth/login", loginLimiter);

function getActiveSocketRooms() {
  const rooms = io?.sockets?.adapter?.rooms;
  if (!rooms || typeof rooms.entries !== "function") return 0;

  let count = 0;
  for (const [roomName, members] of rooms.entries()) {
    if (members?.size === 1 && members.has(roomName)) continue;
    count += 1;
  }
  return count;
}

// PHASE6-FIX: Dependency-aware health endpoint for readiness/liveness checks.
app.get("/health", async (req, res) => {
  const memoryLimitMb = appConfig.limits.healthMemoryLimitMb;
  const mem = process.memoryUsage();
  const rssMb = Math.round((mem.rss / 1024 / 1024) * 100) / 100;

  let dbHealthy = false;
  let dbError = null;
  try {
    await pool.query("SELECT 1");
    dbHealthy = true;
  } catch (err) {
    dbError = err?.message || "db_check_failed";
  }

  const payload = {
    status: dbHealthy ? "ok" : "degraded",
    service: "chalopb-backend",
    timestamp: new Date().toISOString(),
    env_mode: appConfig.mode,
    uptime_sec: getUptimeSec(),
    checks: {
      db: {
        healthy: dbHealthy,
        error: dbHealthy ? null : dbError,
      },
      redis: {
        healthy: isRedisReady(),
      },
      sockets: {
        healthy: true,
        clients: io.engine.clientsCount,
      },
      memory: {
        healthy: rssMb < memoryLimitMb,
        rss_mb: rssMb,
        limit_mb: memoryLimitMb,
      },
    },
  };

  try {
    const statsResult = await pool.query("SELECT get_db_stats() AS stats");
    payload.checks.app_stats = statsResult.rows[0]?.stats || {};
  } catch (err) {
    payload.checks.app_stats = { error: err?.message || "get_db_stats_failed" };
  }

  if (!dbHealthy) {
    return res.status(503).json(payload);
  }
  return res.status(200).json(payload);
});

// FIX-6: Protect /metrics with HTTP Basic Auth.
app.use("/metrics", (req, res, next) => {
  const auth = req.headers["authorization"];
  const user = process.env.METRICS_USER;
  const pass = process.env.METRICS_PASS;
  if (!user || !pass) {
    return res.status(503).send("Metrics auth not configured");
  }
  const expected = "Basic " + Buffer.from(user + ":" + pass).toString("base64");
  if (!auth || auth !== expected) {
    res.set("WWW-Authenticate", 'Basic realm="metrics"');
    return res.status(401).send("Unauthorized");
  }
  next();
});

app.get("/metrics", (req, res) => {
  const counters = getCountersSnapshot();
  const metrics = {
    process_start_time_ms: getProcessStartTimeMs(),
    uptime_sec: getUptimeSec(),
    redis_connected: isRedisReady(),
    is_batch_writer_running: isBatchWriterRunning(),
    gps_updates_by_bus: getGpsUpdatesByBusTop(10),
    socket_connections_total: counters.socket_connections_total || 0,
    active_socket_rooms: getActiveSocketRooms(),
    total_socket_clients: io.engine.clientsCount,
  };

  res.status(200).json(metrics);
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/stops", stopRoutes);
app.use("/api/buses", busRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/admin", adminDriverRoutes);
app.use("/api", routeStopRoutes);
app.use("/api", searchRoutes);
app.use("/api", tripRoutes);

app.use(errorHandler);

// Socket auth middleware - drivers only for sending location
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  // Allow unauthenticated connections for users who only listen
  if (!token) {
    socket.user = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, jwtSecret);
    socket.user = decoded;
    next();
  } catch {
    socket.user = null;
    next();
  }
});

io.on("connection", (socket) => {
  const role = socket.user?.role || "guest";
  // PHASE6-FIX: Structured socket connection logs + counters.
  incCounter("socket_connections_total");
  log("info", "socket_connected", { socket_id: socket.id, role });

  // PHASE3-FIX: Join a bus-specific room for targeted realtime updates
  socket.on("joinBus", (busId) => {
    const normalizedBusId = Number(busId);
    if (!Number.isFinite(normalizedBusId)) return;
    socket.join(`bus_${normalizedBusId}`);
    // PHASE6-FIX: Track room joins to audit subscriber behavior.
    incCounter("socket_join_bus_total");
    log("info", "socket_join_bus", { socket_id: socket.id, bus_id: normalizedBusId });
  });

  // sendLocation via socket is disabled — use POST /api/location/update.
  // Handler removed as dead code.

  socket.on("disconnect", () => {
    // PHASE6-FIX: Structured disconnect log + counter.
    incCounter("socket_disconnects_total");
    log("info", "socket_disconnected", { socket_id: socket.id });
  });
});

const PORT = parsedPort;
const startServer = async () => {
  // Explicit Redis bootstrap avoids import-time races and keeps startup deterministic.
  await initRedis();
  await setupSocketAdapter();

  const dbCheck = await pool.query("SELECT 1 AS ok");
  const startupStatus = {
    env_mode: appConfig.mode,
    database: {
      healthy: Array.isArray(dbCheck?.rows) && dbCheck.rows.length > 0,
      host: appConfig.database.host,
      ssl: Boolean(appConfig.database.ssl),
    },
    redis: {
      enabled: appConfig.redis.enabled,
      healthy: isRedisReady(),
      adapter_enabled: redisAdapterConfig.enabled,
    },
    socket_adapter: redisAdapterConfig.enabled ? "redis" : "single_process",
  };

  log("info", "startup_status", startupStatus);

  server.listen(PORT, () => {
    // PHASE6-FIX: Structured startup log.
    log("info", "server_started", { port: PORT, origins: allowedOrigins.length });
    startBatchLocationWriter(pool);
    startArchivalJob();
    void populateMissingGeometry();
    setInterval(async () => {
      try {
        await checkAndAutoCompleteStaleTrips();
      } catch (err) {
        log("error", "stale_trip_checker_failed", { message: err?.message });
      }
    }, 2 * 60 * 1000);
  });
};

startServer().catch((err) => {
  log("error", "server_start_failed", { message: err?.message, stack: err?.stack || null });
  process.exit(1);
});

const shutdown = async (signal) => {
  log('info', 'server_shutdown_initiated', { signal });
  stopBatchLocationWriter();
  await new Promise((resolve) => server.close(resolve));
  await closeRedis();
  await pool.end();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
