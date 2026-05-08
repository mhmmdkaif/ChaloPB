import { CACHE_CONSTANTS } from "../config/constants.js";
import { incCounter, log } from "../utils/observability.js";
import { isRedisReady, runRedisCommand } from "./redis.js";

// Feature flags (safe defaults).
const USE_CACHE = (process.env.USE_CACHE ?? "true") === "true";

// Keep caches bounded to avoid memory growth in long-lived processes.
const MAX_ACTIVE_TRIPS = parseInt(process.env.ACTIVE_TRIP_CACHE_MAX ?? "5000", 10) || 5000;
const MAX_ROUTE_STOPS = parseInt(process.env.ROUTE_STOPS_CACHE_MAX ?? "2000", 10) || 2000;

// Cache entries: { ts, value }
const activeTripCache = new Map(); // busId -> { ts, value }
const routeStopsCache = new Map(); // routeId -> { ts, value }
const genericCache = new Map(); // key -> { ts, value, ttlMs }

// Phase 3/4: memory-first realtime state (latest known bus state).
// busId -> { ts, payload, dirty }
const busState = new Map();
const seqFallback = new Map(); // busId -> { seq, ts }

const REDIS_BUS_STATE_TTL_S = Math.max(30, parseInt(process.env.REDIS_BUS_STATE_TTL_S ?? "120", 10) || 120);
const REDIS_SEQUENCE_TTL_S = Math.max(30, parseInt(process.env.REDIS_SEQUENCE_TTL_S ?? "86400", 10) || 86400);
const BUS_OFFLINE_THRESHOLD_MS = Math.max(5000, parseInt(process.env.BUS_OFFLINE_THRESHOLD_MS ?? "30000", 10) || 30000);
const MAX_FALLBACK_SEQ_TRACK = Math.max(1000, parseInt(process.env.SEQ_FALLBACK_MAX ?? "20000", 10) || 20000);

const DIRTY_BUS_SET_KEY = "bus:dirty";
const staleSeqEvalScript = [
  "local key = KEYS[1]",
  "local incoming = tonumber(ARGV[1])",
  "local ttl = tonumber(ARGV[2])",
  "local current = redis.call('GET', key)",
  "local currentNum = current and tonumber(current) or nil",
  "if currentNum and incoming <= currentNum then",
  "  return {0, currentNum}",
  "end",
  "redis.call('SET', key, incoming, 'EX', ttl)",
  "return {1, currentNum or -1}",
].join("\n");

function nowMs() {
  return Date.now();
}

function logNonFatalRedisError(operation, err, extra = {}) {
  incCounter("cache_redis_non_fatal_errors_total");
  log("warn", "cache_redis_non_fatal_error", {
    operation,
    message: err?.message,
    ...extra,
  });
}

function busStateKey(busId) {
  return `bus:state:${busId}`;
}

function busSeqKey(busId) {
  return `bus:seq:${busId}`;
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (err) {
    incCounter("cache_json_stringify_error_total");
    log("warn", "cache_json_stringify_error", { message: err?.message });
    return null;
  }
}

function genericCacheGet(key) {
  const entry = genericCache.get(String(key));
  if (!entry) return null;
  if (entry.ttlMs && nowMs() - entry.ts > entry.ttlMs) {
    genericCache.delete(String(key));
    return null;
  }
  return entry.value;
}

function genericCacheSet(key, value, ttlSeconds) {
  const ttlMs = Number.isFinite(Number(ttlSeconds)) && Number(ttlSeconds) > 0 ? Number(ttlSeconds) * 1000 : null;
  genericCache.set(String(key), { ts: nowMs(), value: String(value), ttlMs });
}

export function safeJsonParse(raw, { context = "cache", fallback = null } = {}) {
  if (raw == null) return fallback;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch (err) {
    incCounter("cache_json_parse_error_total");
    log("warn", "cache_json_parse_error", { context, message: err?.message });
    return fallback;
  }
}

async function redisSetState(busId, entry) {
  if (!isRedisReady()) return;
  const payload = safeStringify(entry);
  if (!payload) return;
  try {
    await runRedisCommand("SET", busStateKey(busId), payload, "EX", String(REDIS_BUS_STATE_TTL_S));
  } catch (err) {
    // Redis failure is intentionally non-fatal; in-memory cache remains source of truth fallback.
    logNonFatalRedisError("SET bus:state", err, { bus_id: Number(busId) });
  }
}

function setFallbackSequence(busId, sequence) {
  seqFallback.set(busId, { seq: sequence, ts: nowMs() });
  if (seqFallback.size <= MAX_FALLBACK_SEQ_TRACK) return;
  let oldestKey = null;
  let oldestTs = Infinity;
  for (const [key, entry] of seqFallback.entries()) {
    if (entry.ts < oldestTs) {
      oldestTs = entry.ts;
      oldestKey = key;
    }
  }
  if (oldestKey != null) {
    seqFallback.delete(oldestKey);
  }
}

function evictIfNeeded(map, maxSize) {
  if (map.size <= maxSize) return;
  // Evict oldest entries (O(n) but bounded + rare).
  let oldestKey = null;
  let oldestTs = Infinity;
  for (const [key, entry] of map.entries()) {
    if (entry?.ts != null && entry.ts < oldestTs) {
      oldestTs = entry.ts;
      oldestKey = key;
    }
  }
  if (oldestKey != null) map.delete(oldestKey);
}

export async function getActiveTripCached(busId, fetchFn) {
  const key = Number(busId);
  if (!USE_CACHE || !Number.isFinite(key) || key <= 0) {
    return await fetchFn();
  }

  try {
    const cached = activeTripCache.get(key);
    if (cached && nowMs() - cached.ts < CACHE_CONSTANTS.ACTIVE_TRIP_CACHE_TTL_MS) {
      incCounter("cache_active_trip_hit_total");
      return cached.value;
    }

    if (isRedisReady()) {
      try {
        const redisHit = await runRedisCommand("GET", `trip:active:${key}`);
        const parsed = safeJsonParse(redisHit, { context: "active_trip" });
        if (parsed) {
          incCounter("cache_active_trip_hit_total");
          activeTripCache.set(key, { ts: nowMs(), value: parsed });
          evictIfNeeded(activeTripCache, MAX_ACTIVE_TRIPS);
          return parsed;
        }
      } catch (err) {
        // Fall through to memory/database fetch.
        logNonFatalRedisError("GET trip:active", err, { bus_id: key });
      }
    }

    incCounter("cache_active_trip_miss_total");
    const value = await fetchFn();
    activeTripCache.set(key, { ts: nowMs(), value });
    if (isRedisReady()) {
      const encoded = safeStringify(value);
      if (encoded) {
        void runRedisCommand("SET", `trip:active:${key}`, encoded, "PX", String(CACHE_CONSTANTS.ACTIVE_TRIP_CACHE_TTL_MS)).catch((err) => {
          logNonFatalRedisError("SET trip:active", err, { bus_id: key });
        });
      }
    }
    evictIfNeeded(activeTripCache, MAX_ACTIVE_TRIPS);
    return value;
  } catch (err) {
    incCounter("cache_active_trip_error_total");
    log("warn", "cache_active_trip_error", { bus_id: key, message: err?.message });
    return await fetchFn();
  }
}

export async function getRouteStopsCached(routeId, fetchFn) {
  const key = Number(routeId);
  if (!USE_CACHE || !Number.isFinite(key) || key <= 0) {
    return await fetchFn();
  }

  try {
    const cached = routeStopsCache.get(key);
    if (cached && nowMs() - cached.ts < CACHE_CONSTANTS.ROUTE_STOPS_CACHE_TTL_MS) {
      incCounter("cache_route_stops_hit_total");
      return cached.value;
    }

    if (isRedisReady()) {
      try {
        const redisHit = await runRedisCommand("GET", `route:stops:${key}`);
        const parsed = safeJsonParse(redisHit, { context: "route_stops" });
        if (parsed) {
          incCounter("cache_route_stops_hit_total");
          routeStopsCache.set(key, { ts: nowMs(), value: parsed });
          evictIfNeeded(routeStopsCache, MAX_ROUTE_STOPS);
          return parsed;
        }
      } catch (err) {
        // Fall through to memory/database fetch.
        logNonFatalRedisError("GET route:stops", err, { route_id: key });
      }
    }

    incCounter("cache_route_stops_miss_total");
    const value = await fetchFn();
    routeStopsCache.set(key, { ts: nowMs(), value });
    if (isRedisReady()) {
      const encoded = safeStringify(value);
      if (encoded) {
        void runRedisCommand("SET", `route:stops:${key}`, encoded, "PX", String(CACHE_CONSTANTS.ROUTE_STOPS_CACHE_TTL_MS)).catch((err) => {
          logNonFatalRedisError("SET route:stops", err, { route_id: key });
        });
      }
    }
    evictIfNeeded(routeStopsCache, MAX_ROUTE_STOPS);
    return value;
  } catch (err) {
    incCounter("cache_route_stops_error_total");
    log("warn", "cache_route_stops_error", { route_id: key, message: err?.message });
    return await fetchFn();
  }
}

export function invalidateTripCache(busId) {
  const key = Number(busId);
  if (!Number.isFinite(key) || key <= 0) return;
  activeTripCache.delete(key);
  if (isRedisReady()) {
    void runRedisCommand("DEL", `trip:active:${key}`).catch((err) => {
      logNonFatalRedisError("DEL trip:active", err, { bus_id: key });
    });
  }
  incCounter("cache_active_trip_invalidate_total");
}

export function invalidateRouteCache(routeId) {
  const key = Number(routeId);
  if (!Number.isFinite(key) || key <= 0) return;
  routeStopsCache.delete(key);
  if (isRedisReady()) {
    void runRedisCommand("DEL", `route:stops:${key}`).catch((err) => {
      logNonFatalRedisError("DEL route:stops", err, { route_id: key });
    });
  }
  incCounter("cache_route_stops_invalidate_total");
}

export function setBusState(busId, payload, { dirty = false } = {}) {
  const key = Number(busId);
  if (!Number.isFinite(key) || key <= 0) return;
  const entry = { ts: nowMs(), payload, dirty: Boolean(dirty) };
  busState.set(key, entry);

  void redisSetState(key, entry);
  if (entry.dirty && isRedisReady()) {
    void runRedisCommand("SADD", DIRTY_BUS_SET_KEY, String(key)).catch((err) => {
      logNonFatalRedisError("SADD bus:dirty", err, { bus_id: key });
    });
  }
}

export function getBusState(busId) {
  const key = Number(busId);
  if (!Number.isFinite(key) || key <= 0) return null;
  return busState.get(key) || null;
}

export function markBusStateDirty(busId) {
  const entry = getBusState(busId);
  if (!entry) return;
  entry.dirty = true;
  entry.ts = nowMs();
  void redisSetState(Number(busId), entry);
  if (isRedisReady()) {
    void runRedisCommand("SADD", DIRTY_BUS_SET_KEY, String(Number(busId))).catch((err) => {
      logNonFatalRedisError("SADD bus:dirty", err, { bus_id: Number(busId) });
    });
  }
}

export async function listDirtyBusStates() {
  const dirtyByBusId = new Map();
  for (const [busId, entry] of busState.entries()) {
    if (entry?.dirty) dirtyByBusId.set(busId, entry);
  }

  if (!isRedisReady()) {
    return Array.from(dirtyByBusId.entries());
  }

  try {
    const dirtyIdsRaw = await runRedisCommand("SMEMBERS", DIRTY_BUS_SET_KEY);
    const dirtyIds = Array.isArray(dirtyIdsRaw)
      ? dirtyIdsRaw
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      : [];

    if (dirtyIds.length === 0) {
      return Array.from(dirtyByBusId.entries());
    }

    const keys = dirtyIds.map((busId) => busStateKey(busId));
    const values = await runRedisCommand("MGET", ...keys);
    const rows = Array.isArray(values) ? values : [];

    for (let i = 0; i < dirtyIds.length; i++) {
      const busId = dirtyIds[i];
      const parsed = safeJsonParse(rows[i], { context: `bus_state_${busId}` });
      if (parsed?.dirty) {
        dirtyByBusId.set(busId, parsed);
      }
    }
  } catch (err) {
    incCounter("cache_dirty_list_errors_total");
    log("warn", "cache_dirty_list_error", { message: err?.message });
  }

  return Array.from(dirtyByBusId.entries());
}

export function clearBusStateDirty(busId) {
  const entry = getBusState(busId);
  const key = Number(busId);
  if (entry) {
    entry.dirty = false;
    entry.ts = nowMs();
    void redisSetState(key, entry);
  }
  if (isRedisReady()) {
    void runRedisCommand("SREM", DIRTY_BUS_SET_KEY, String(key)).catch((err) => {
      logNonFatalRedisError("SREM bus:dirty", err, { bus_id: key });
    });
  }
}

export async function acceptBusSequence(busId, sequence) {
  const key = Number(busId);
  if (!Number.isFinite(key) || key <= 0) {
    return { accepted: false, reason: "invalid_bus_id" };
  }

  if (sequence == null) {
    return { accepted: true, reason: "missing_sequence" };
  }

  const incoming = Number(sequence);
  if (!Number.isInteger(incoming) || incoming < 0) {
    return { accepted: false, reason: "invalid_sequence" };
  }

  if (isRedisReady()) {
    try {
      const result = await runRedisCommand(
        "EVAL",
        staleSeqEvalScript,
        "1",
        busSeqKey(key),
        String(incoming),
        String(REDIS_SEQUENCE_TTL_S)
      );

      const accepted = Array.isArray(result) && Number(result[0]) === 1;
      const current = Array.isArray(result) ? Number(result[1]) : null;
      if (!accepted) {
        incCounter("gps_packets_stale_sequence_total");
        log("warn", "gps_packet_rejected", {
          reason: "stale_sequence",
          bus_id: key,
          incoming_sequence: incoming,
          current_sequence: Number.isFinite(current) ? current : null,
        });
      }
      return {
        accepted,
        reason: accepted ? "ok" : "stale_sequence",
        incoming,
        current: Number.isFinite(current) ? current : null,
      };
    } catch (err) {
      incCounter("gps_sequence_eval_errors_total");
      log("warn", "gps_sequence_eval_failed", { bus_id: key, message: err?.message });
    }
  }

  const local = seqFallback.get(key);
  const current = local?.seq;
  if (Number.isInteger(current) && incoming <= current) {
    incCounter("gps_packets_stale_sequence_total");
    log("warn", "gps_packet_rejected", {
      reason: "stale_sequence_fallback",
      bus_id: key,
      incoming_sequence: incoming,
      current_sequence: current,
    });
    return { accepted: false, reason: "stale_sequence", incoming, current };
  }

  setFallbackSequence(key, incoming);
  return { accepted: true, reason: "ok", incoming, current: Number.isInteger(current) ? current : null };
}

export function isBusOffline(busId) {
  const entry = getBusState(busId);
  if (!entry) return true;

  const payloadUpdatedAt = entry?.payload?.updated_at ? new Date(entry.payload.updated_at).getTime() : null;
  const updatedTs = Number.isFinite(payloadUpdatedAt) ? payloadUpdatedAt : entry.ts;
  if (!Number.isFinite(updatedTs)) return true;

  return nowMs() - updatedTs > BUS_OFFLINE_THRESHOLD_MS;
}

export async function setCache(key, value, ttlSeconds = 60) {
  const cacheKey = String(key);
  const cacheValue = String(value);
  genericCacheSet(cacheKey, cacheValue, ttlSeconds);

  if (!isRedisReady()) return;
  try {
    await runRedisCommand("SET", cacheKey, cacheValue, "EX", String(Math.max(1, Number(ttlSeconds) || 1)));
  } catch {
    // Non-fatal: memory fallback is already populated.
  }
}

export async function getCache(key) {
  const cacheKey = String(key);

  if (isRedisReady()) {
    try {
      const value = await runRedisCommand("GET", cacheKey);
      if (value != null) {
        genericCacheSet(cacheKey, value, null);
        return value;
      }
    } catch (err) {
      // Fall back to memory cache.
      logNonFatalRedisError("GET generic", err, { cache_key: cacheKey });
    }
  }

  return genericCacheGet(cacheKey);
}

export async function deleteCache(key) {
  const cacheKey = String(key);
  genericCache.delete(cacheKey);
  if (!isRedisReady()) return;
  try {
    await runRedisCommand("DEL", cacheKey);
  } catch (err) {
    // Ignore delete failures.
    logNonFatalRedisError("DEL generic", err, { cache_key: cacheKey });
  }
}

