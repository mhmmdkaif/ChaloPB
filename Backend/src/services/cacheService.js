import { CACHE_CONSTANTS } from "../config/constants.js";
import { incCounter, log } from "../utils/observability.js";

// Feature flags (safe defaults).
const USE_CACHE = (process.env.USE_CACHE ?? "true") === "true";

// Keep caches bounded to avoid memory growth in long-lived processes.
const MAX_ACTIVE_TRIPS = parseInt(process.env.ACTIVE_TRIP_CACHE_MAX ?? "5000", 10) || 5000;
const MAX_ROUTE_STOPS = parseInt(process.env.ROUTE_STOPS_CACHE_MAX ?? "2000", 10) || 2000;

// Cache entries: { ts, value }
const activeTripCache = new Map(); // busId -> { ts, value }
const routeStopsCache = new Map(); // routeId -> { ts, value }

// Phase 3/4: memory-first realtime state (latest known bus state).
// busId -> { ts, payload, dirty }
const busState = new Map();

function nowMs() {
  return Date.now();
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
    incCounter("cache_active_trip_miss_total");
    const value = await fetchFn();
    activeTripCache.set(key, { ts: nowMs(), value });
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
    incCounter("cache_route_stops_miss_total");
    const value = await fetchFn();
    routeStopsCache.set(key, { ts: nowMs(), value });
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
  incCounter("cache_active_trip_invalidate_total");
}

export function invalidateRouteCache(routeId) {
  const key = Number(routeId);
  if (!Number.isFinite(key) || key <= 0) return;
  routeStopsCache.delete(key);
  incCounter("cache_route_stops_invalidate_total");
}

export function setBusState(busId, payload, { dirty = false } = {}) {
  const key = Number(busId);
  if (!Number.isFinite(key) || key <= 0) return;
  busState.set(key, { ts: nowMs(), payload, dirty: Boolean(dirty) });
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
}

export function listDirtyBusStates() {
  const dirty = [];
  for (const [busId, entry] of busState.entries()) {
    if (entry?.dirty) dirty.push([busId, entry]);
  }
  return dirty;
}

export function clearBusStateDirty(busId) {
  const entry = getBusState(busId);
  if (!entry) return;
  entry.dirty = false;
}

