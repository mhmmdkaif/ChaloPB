import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

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
import { incCounter, log, renderMetricsText, setGauge } from "./utils/observability.js";
import { startBatchLocationWriter, stopBatchLocationWriter } from "./services/batchLocationWriter.js";
import dotenv from "dotenv";

dotenv.config();

// PHASE0-FIX: Validate all required env vars at startup — fail fast
const requiredEnv = ["JWT_SECRET", "DATABASE_URL", "CORS_ORIGIN", "PORT"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

if (process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}

const parsedPort = Number.parseInt(process.env.PORT, 10);
if (Number.isNaN(parsedPort) || parsedPort <= 0) {
  throw new Error("PORT must be a valid positive integer");
}

const jwtSecret = process.env.JWT_SECRET;
const rawCorsOrigin = process.env.CORS_ORIGIN;

const allowedOrigins = rawCorsOrigin
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  throw new Error("CORS_ORIGIN must include at least one valid origin");
}

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

// Make io globally available for controllers
global.io = io;

// PHASE3-FIX: Per-bus emission state for dedupe, throttle, and sequencing
const busEmitState = new Map();
const BUS_EMIT_THROTTLE_MS = 2000;
const NEGLIGIBLE_LAT_LNG_DELTA = 0.00005;
const NEGLIGIBLE_SPEED_DELTA = 1;

// PHASE3-FIX: Emit bus updates to the bus room only, with sequence and staleness metadata
global.emitBusLocationUpdate = (payload) => {
  const busId = Number(payload?.bus_id);
  if (!Number.isFinite(busId)) return;

  const now = Date.now();
  const previous = busEmitState.get(busId);
  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);
  const speed = Number(payload.speed ?? 0);
  const updatedAtMs = payload.updated_at ? new Date(payload.updated_at).getTime() : now;
  const isStale = payload.is_stale ?? (now - updatedAtMs > 30000);

  if (previous) {
    const elapsed = now - previous.lastEmitAt;
    const negligibleChange =
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude - previous.latitude) < NEGLIGIBLE_LAT_LNG_DELTA &&
      Math.abs(longitude - previous.longitude) < NEGLIGIBLE_LAT_LNG_DELTA &&
      Math.abs(speed - previous.speed) < NEGLIGIBLE_SPEED_DELTA &&
      previous.is_stale === isStale;

    // PHASE3-FIX: Skip emissions that are too frequent or effectively unchanged
    if (elapsed < BUS_EMIT_THROTTLE_MS || negligibleChange) {
      // PHASE6-FIX: Track dropped socket emissions for observability.
      incCounter("socket_bus_updates_dropped_total");
      return;
    }
  }

  const seq = (previous?.seq || 0) + 1;
  const nextPayload = {
    ...payload,
    bus_id: busId,
    seq,
    timestamp: now,
    is_stale: isStale,
  };

  busEmitState.set(busId, {
    seq,
    lastEmitAt: now,
    latitude: Number.isFinite(latitude) ? latitude : previous?.latitude ?? 0,
    longitude: Number.isFinite(longitude) ? longitude : previous?.longitude ?? 0,
    speed,
    is_stale: isStale,
  });

  // PHASE6-FIX: Metrics/logs for realtime bus location emissions.
  incCounter("socket_bus_updates_emitted_total");
  setGauge("socket_bus_rooms_tracked", busEmitState.size);
  log("info", "socket_bus_location_emit", {
    bus_id: busId,
    seq,
    is_stale: isStale,
  });

  io.to(`bus_${busId}`).emit("bus_location_update", nextPayload);
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
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "256kb" }));
app.use(requestLogger);
app.use("/api/auth/login", loginLimiter);

// PHASE6-FIX: Lightweight health endpoint for readiness/liveness checks.
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "chalopb-backend",
    timestamp: new Date().toISOString(),
  });
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
  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.status(200).send(renderMetricsText());
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
server.listen(PORT, () => {
  // PHASE6-FIX: Structured startup log.
  log("info", "server_started", { port: PORT, origins: allowedOrigins.length });
  startBatchLocationWriter(pool);
});

const shutdown = async (signal) => {
  log('info', 'server_shutdown_initiated', { signal });
  stopBatchLocationWriter();
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
