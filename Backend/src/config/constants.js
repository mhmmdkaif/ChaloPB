import { cacheConfig, etaConfig, locationConfig } from "./appConfig.js";

// PHASE7-FIX: Centralized domain constants for GPS, state machine, cache, and ETA.

export const LOCATION_CONSTANTS = {
  GEOFENCE_RADIUS_KM: 0.05,
  MAX_SPEED_KMH: 120,
  ACCURACY_THRESHOLD_M: locationConfig.gpsAccuracyThresholdM,
  STALE_THRESHOLD_SECONDS: locationConfig.staleLocationThresholdS,
};

export const STOP_STATE_CONSTANTS = {
  ARRIVE_RADIUS_M: locationConfig.stopArriveRadiusM,
  APPROACH_RADIUS_M: locationConfig.stopApproachRadiusM,
  DEPART_RADIUS_M: locationConfig.stopDepartRadiusM,
};

export const CACHE_CONSTANTS = {
  ROUTE_STOPS_CACHE_TTL_MS: cacheConfig.routeStopsTtlMs,
  ACTIVE_TRIP_CACHE_TTL_MS: cacheConfig.activeTripTtlMs,
};

export const ETA_CONSTANTS = {
  MIN_SPEED_KMH: etaConfig.minSpeedKmh,
  DWELL_SECONDS_PER_STOP: etaConfig.dwellSecondsPerStop,
};
