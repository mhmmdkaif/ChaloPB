// PHASE7-FIX: Centralized domain constants for GPS, state machine, cache, and ETA.

export const LOCATION_CONSTANTS = {
  GEOFENCE_RADIUS_KM: 0.05,
  MAX_SPEED_KMH: 120,
  ACCURACY_THRESHOLD_M: parseInt(process.env.GPS_ACCURACY_THRESHOLD_M ?? "100", 10),
  STALE_THRESHOLD_SECONDS: Math.max(
    10,
    parseInt(process.env.STALE_LOCATION_THRESHOLD_S ?? "30", 10) || 30
  ),
};

export const STOP_STATE_CONSTANTS = {
  ARRIVE_RADIUS_M: parseInt(process.env.STOP_ARRIVE_RADIUS_M ?? "50", 10),
  APPROACH_RADIUS_M: parseInt(process.env.STOP_APPROACH_RADIUS_M ?? "150", 10),
  DEPART_RADIUS_M: parseInt(process.env.STOP_DEPART_RADIUS_M ?? "70", 10),
};

export const CACHE_CONSTANTS = {
  ROUTE_STOPS_CACHE_TTL_MS: parseInt(process.env.ROUTE_STOPS_CACHE_TTL_MS ?? "60000", 10),
  ACTIVE_TRIP_CACHE_TTL_MS: parseInt(process.env.ACTIVE_TRIP_CACHE_TTL_MS ?? "30000", 10),
};

export const ETA_CONSTANTS = {
  MIN_SPEED_KMH: parseInt(process.env.ETA_MIN_SPEED_KMH ?? "12", 10),
  DWELL_SECONDS_PER_STOP: parseInt(process.env.ETA_DWELL_SECONDS_PER_STOP ?? "20", 10),
};
