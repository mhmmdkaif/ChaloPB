import dotenv from "dotenv";

const isProduction = process.env.NODE_ENV === "production";
dotenv.config({ override: false, quiet: true });

function normalizeText(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseInteger(name, fallback, { min = null, max = null } = {}) {
  const raw = normalizeText(process.env[name]);
  const parsed = Number.parseInt(raw || String(fallback), 10);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  if (min != null && value < min) {
    throw new Error(`${name} must be >= ${min}`);
  }
  if (max != null && value > max) {
    throw new Error(`${name} must be <= ${max}`);
  }
  return value;
}

function parseBoolean(name, fallback = false) {
  const raw = normalizeText(process.env[name]);
  if (!raw) return Boolean(fallback);
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function isPlaceholderHost(host) {
  const value = normalizeText(host).toLowerCase();
  return value === "host" || value === "hostname" || value === "db_host" || value === "your_host" || value === "your_database_host";
}

function sanitizePostgresUrl(rawUrl) {
  const value = normalizeText(rawUrl);
  if (!value) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  let url;
  try {
    url = new URL(value);
  } catch (err) {
    throw new Error(`DATABASE_URL is invalid: ${err?.message || String(err)}`);
  }

  const protocol = url.protocol.replace(/:$/, "");
  if (!["postgres", "postgresql"].includes(protocol)) {
    throw new Error(`DATABASE_URL must use the postgres or postgresql scheme, got ${url.protocol}`);
  }

  if (!url.hostname || isPlaceholderHost(url.hostname)) {
    throw new Error(`DATABASE_URL host is invalid or a placeholder: ${url.hostname || "<empty>"}`);
  }

  url.searchParams.delete("sslmode");
  url.searchParams.delete("uselibpqcompat");

  const useSsl = !["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const ssl = useSsl ? { rejectUnauthorized: false } : undefined;

  return {
    connectionString: url.toString(),
    ssl,
    host: url.hostname,
    port: url.port ? Number.parseInt(url.port, 10) : null,
    database: url.pathname.replace(/^\//, ""),
    useSsl,
  };
}

function validateRedisRestConfig() {
  const url = normalizeText(process.env.UPSTASH_REDIS_REST_URL);
  const token = normalizeText(process.env.UPSTASH_REDIS_REST_TOKEN);

  const enabled = Boolean(url && token && !url.includes("YOUR_") && !token.includes("YOUR_"));
  return {
    enabled,
    url: enabled ? url : "",
    token: enabled ? token : "",
  };
}

function validateRedisAdapterConfig() {
  const url = normalizeText(process.env.REDIS_ADAPTER_URL);
  if (!url) {
    return { enabled: false, url: "", reason: "missing" };
  }

  if (!/^rediss?:\/\//i.test(url)) {
    return { enabled: false, url: "", reason: "invalid_scheme" };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { enabled: false, url: "", reason: "invalid_url" };
  }

  const adapterHost = normalizeText(parsed.hostname).toLowerCase();
  if (
    adapterHost === "host" ||
    adapterHost === "hostname" ||
    adapterHost === "db_host" ||
    adapterHost.startsWith("your_") ||
    url.includes("YOUR_") ||
    url.includes("placeholder")
  ) {
    return { enabled: false, url: "", reason: "placeholder" };
  }

  return { enabled: true, url, reason: null };
}

function parseOrigins(raw) {
  return normalizeText(raw)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const appConfig = Object.freeze({
  mode: normalizeText(process.env.NODE_ENV) || "development",
  logLevel: normalizeText(process.env.LOG_LEVEL).toLowerCase() || "info",
  port: parseInteger("PORT", 5000, { min: 1, max: 65535 }),
  corsOrigins: (() => {
    const origins = parseOrigins(process.env.CORS_ORIGIN || "http://localhost:5173");
    if (origins.length === 0) {
      throw new Error("CORS_ORIGIN must include at least one valid origin");
    }
    return origins;
  })(),
  jwtSecret: normalizeText(process.env.JWT_SECRET),
  database: sanitizePostgresUrl(process.env.DATABASE_URL),
  redis: validateRedisRestConfig(),
  redisAdapter: validateRedisAdapterConfig(),
  limits: {
    jsonBodyLimit: normalizeText(process.env.JSON_BODY_LIMIT) || "256kb",
    healthMemoryLimitMb: parseInteger("HEALTH_MEMORY_LIMIT_MB", 1024, { min: 128 }),
    authRateLimitMax: parseInteger("AUTH_RATE_LIMIT_MAX", 60, { min: 1 }),
    gpsRateLimitMax: parseInteger("GPS_RATE_LIMIT_MAX", 30, { min: 1 }),
  },
  featureFlags: {
    useCache: parseBoolean("USE_CACHE", true),
    useBatchWrites: parseBoolean("USE_BATCH_WRITES", false),
    requireLocationOnTripStart: parseBoolean("REQUIRE_LOCATION_ON_TRIP_START", false),
    useWriteThrottle: parseBoolean("USE_WRITE_THROTTLE", true),
  },
  osrm: {
    baseUrl: normalizeText(process.env.OSRM_BASE_URL) || "https://router.project-osrm.org",
  },
  trips: {
    staleMinutes: parseInteger("TRIP_STALE_MINUTES", 120, { min: 1 }),
    eventsRetentionDays: parseInteger("TRIP_EVENTS_RETENTION_DAYS", 90, { min: 1 }),
  },
  batchWriter: {
    intervalMs: parseInteger("BATCH_WRITE_INTERVAL_MS", 5000, { min: 1000 }),
    maxPerTick: parseInteger("BATCH_WRITE_MAX_PER_TICK", 500, { min: 1 }),
  },
  cache: {
    routeStopsTtlMs: parseInteger("ROUTE_STOPS_CACHE_TTL_MS", 60000, { min: 1000 }),
    activeTripTtlMs: parseInteger("ACTIVE_TRIP_CACHE_TTL_MS", 30000, { min: 1000 }),
    activeTripMax: parseInteger("ACTIVE_TRIP_CACHE_MAX", 5000, { min: 1 }),
    routeStopsMax: parseInteger("ROUTE_STOPS_CACHE_MAX", 2000, { min: 1 }),
    redisBusStateTtlS: parseInteger("REDIS_BUS_STATE_TTL_S", 120, { min: 30 }),
    redisSequenceTtlS: parseInteger("REDIS_SEQUENCE_TTL_S", 86400, { min: 30 }),
    busOfflineThresholdMs: parseInteger("BUS_OFFLINE_THRESHOLD_MS", 30000, { min: 5000 }),
    seqFallbackMax: parseInteger("SEQ_FALLBACK_MAX", 20000, { min: 1000 }),
  },
  locations: {
    gpsAccuracyThresholdM: parseInteger("GPS_ACCURACY_THRESHOLD_M", 100, { min: 1 }),
    staleLocationThresholdS: parseInteger("STALE_LOCATION_THRESHOLD_S", 30, { min: 10 }),
    stopArriveRadiusM: parseInteger("STOP_ARRIVE_RADIUS_M", 50, { min: 1 }),
    stopApproachRadiusM: parseInteger("STOP_APPROACH_RADIUS_M", 150, { min: 1 }),
    stopDepartRadiusM: parseInteger("STOP_DEPART_RADIUS_M", 70, { min: 1 }),
    writeSkipDistanceM: parseInteger("WRITE_SKIP_DISTANCE_M", 10, { min: 1 }),
    writeSkipTimeMs: parseInteger("WRITE_SKIP_TIME_MS", 3000, { min: 250 }),
  },
  eta: {
    minSpeedKmh: parseInteger("ETA_MIN_SPEED_KMH", 12, { min: 1 }),
    dwellSecondsPerStop: parseInteger("ETA_DWELL_SECONDS_PER_STOP", 20, { min: 0 }),
  },
  metrics: {
    user: normalizeText(process.env.METRICS_USER),
    pass: normalizeText(process.env.METRICS_PASS),
  },
});

export { appConfig };
export const envMode = appConfig.mode;
export const logLevel = appConfig.logLevel;
export const databaseConfig = appConfig.database;
export const redisConfig = appConfig.redis;
export const redisAdapterConfig = appConfig.redisAdapter;
export const configLimits = appConfig.limits;
export const featureFlags = appConfig.featureFlags;
export const tripConfig = appConfig.trips;
export const batchWriterConfig = appConfig.batchWriter;
export const cacheConfig = appConfig.cache;
export const locationConfig = appConfig.locations;
export const etaConfig = appConfig.eta;
export const metricsConfig = appConfig.metrics;
