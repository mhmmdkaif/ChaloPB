import {
  findActiveTripByBus,
  findBusOwnership,
  getLastLocationByBusId,
  getRouteStops,
  upsertLiveLocation,
} from "../repositories/locationRepository.js";
import { getActiveTripCached, getRouteStopsCached, setBusState, markBusStateDirty } from "./cacheService.js";
import {
  isTeleport,
  resetBusSmoothing,
  shouldDropLowAccuracy,
  smoothCoords,
  smoothSpeed,
  validateAndNormalizeGpsPayload,
} from "./gpsService.js";
import { processStopStateMachine } from "./stopStateMachineService.js";
import { buildRouteEta, calculateRouteDistanceToOrder } from "./etaService.js";
import { emitBusLocation } from "./socketService.js";
import { incCounter, log } from "../utils/observability.js";
import { AppError } from "../utils/AppError.js";
import { invalidateTripCache } from "./cacheService.js";

const USE_WRITE_THROTTLE = (process.env.USE_WRITE_THROTTLE ?? "true") === "true";
const USE_BATCH_WRITES = (process.env.USE_BATCH_WRITES ?? "false") === "true";
const WRITE_SKIP_DISTANCE_M = Math.max(1, parseInt(process.env.WRITE_SKIP_DISTANCE_M ?? "10", 10) || 10);
const WRITE_SKIP_TIME_MS = Math.max(250, parseInt(process.env.WRITE_SKIP_TIME_MS ?? "3000", 10) || 3000);

export function invalidateActiveTripCache(busId) {
  invalidateTripCache(Number(busId));
}

export async function handleLocationUpdate(pool, reqUserId, reqBody) {
  const gps = validateAndNormalizeGpsPayload(reqBody);

  const ownership = await findBusOwnership(pool, gps.busId, reqUserId);
  if (!ownership) {
    throw new AppError("Bus not found or not assigned to you", 403, "BUS_NOT_ASSIGNED");
  }

  if (shouldDropLowAccuracy(gps.accuracy)) {
    incCounter("gps_updates_discarded_low_accuracy_total");
    log("warn", "gps_update_discarded", {
      reason: "low_accuracy",
      bus_id: gps.busId,
      accuracy_m: gps.accuracy,
    });
    return { discarded: true, reason: "low_accuracy" };
  }

  const last = await getLastLocationByBusId(pool, gps.busId);
  if (
    last &&
    isTeleport(
      Number(last.latitude),
      Number(last.longitude),
      new Date(last.updated_at),
      gps.latitude,
      gps.longitude,
      gps.deviceTimestamp || new Date()
    )
  ) {
    incCounter("gps_updates_discarded_teleport_total");
    log("warn", "gps_update_discarded", { reason: "teleport", bus_id: gps.busId });
    return { discarded: true, reason: "teleport" };
  }

  // Reset smoothing buffers on first ping of a new trip
  if (!last) {
    resetBusSmoothing(gps.busId);
  }

  const smoothedSpeed = smoothSpeed(gps.busId, gps.speed);
  const smoothedCoords = smoothCoords(gps.busId, gps.latitude, gps.longitude);

  // PHASE2/4: Optional write throttling + optional batch writes.
  // Always keep socket emission and in-memory state updates.
  let saved;
  const now = Date.now();
  let shouldWriteDb = true;
  if (USE_WRITE_THROTTLE && last?.updated_at) {
    const lastAt = new Date(last.updated_at).getTime();
    const ageMs = Number.isFinite(lastAt) ? now - lastAt : Number.POSITIVE_INFINITY;
    // Rough distance check in meters using haversine already used elsewhere.
    // Avoid importing extra dependencies: compute with existing haversine via gpsService smoothing is sufficient.
    // NOTE: If last lat/lng missing, we fall back to writing.
    const lastLat = last.latitude != null ? Number(last.latitude) : null;
    const lastLng = last.longitude != null ? Number(last.longitude) : null;
    if (Number.isFinite(lastLat) && Number.isFinite(lastLng) && Number.isFinite(ageMs)) {
      const distM = Math.hypot(smoothedCoords.lat - lastLat, smoothedCoords.lng - lastLng) * 111_320;
      if (distM < WRITE_SKIP_DISTANCE_M && ageMs < WRITE_SKIP_TIME_MS) {
        shouldWriteDb = false;
        incCounter("gps_db_writes_skipped_total");
        log("info", "gps_db_write_skipped", { bus_id: gps.busId, dist_m: Math.round(distM), age_ms: Math.round(ageMs) });
      }
    }
  }

  // In-memory state is always updated.
  setBusState(gps.busId, {
    bus_id: gps.busId,
    latitude: smoothedCoords.lat,
    longitude: smoothedCoords.lng,
    speed: smoothedSpeed,
    accuracy: gps.accuracy,
    device_timestamp: gps.deviceTimestamp,
    updated_at: new Date().toISOString(),
  }, { dirty: USE_BATCH_WRITES });

  if (USE_BATCH_WRITES) {
    // Batch mode: mark dirty and return a saved-like object (API contract preserved).
    markBusStateDirty(gps.busId);
    saved = {
      bus_id: gps.busId,
      latitude: smoothedCoords.lat,
      longitude: smoothedCoords.lng,
      speed: smoothedSpeed,
      updated_at: new Date().toISOString(),
    };
  } else if (shouldWriteDb) {
    saved = await upsertLiveLocation(pool, {
      busId: gps.busId,
      latitude: smoothedCoords.lat,
      longitude: smoothedCoords.lng,
      speed: smoothedSpeed,
      accuracy: gps.accuracy,
      deviceTimestamp: gps.deviceTimestamp,
    });
  } else {
    // Throttled write: preserve API response shape without DB write.
    saved = {
      bus_id: gps.busId,
      latitude: smoothedCoords.lat,
      longitude: smoothedCoords.lng,
      speed: smoothedSpeed,
      updated_at: new Date().toISOString(),
    };
  }

  const routeStops = ownership.route_id
    ? await getRouteStopsCached(ownership.route_id, () => getRouteStops(pool, Number(ownership.route_id)))
    : [];
  const activeTrip = await getActiveTripCached(gps.busId, () => findActiveTripByBus(pool, Number(gps.busId)));

  let reachedStopIds = [];
  let nextStop = null;
  let etaToRouteEndMinutes = null;
  let stopStateChanged = false;

  if (activeTrip) {
    const stateMachine = await processStopStateMachine(pool, activeTrip.id, smoothedCoords.lat, smoothedCoords.lng, {
      onTransition: ({ tripId, stopId, stopOrder, fromState, toState, skippedCount, distanceM }) => {
        incCounter("trip_stop_transitions_total");
        log("info", "trip_stop_transition", {
          trip_id: tripId,
          stop_id: stopId,
          stop_order: stopOrder,
          from_state: fromState,
          to_state: toState,
          skipped_count: skippedCount,
          distance_m: distanceM,
        });
      },
    });

    reachedStopIds = stateMachine.reachedStopIds;
  stopStateChanged = Boolean(stateMachine.transitioned);
    if (stateMachine.nextStop) {
      const routeEta = buildRouteEta(routeStops, stateMachine.nextStop, smoothedCoords.lat, smoothedCoords.lng, smoothedSpeed);
      const distanceKm = calculateRouteDistanceToOrder(
        routeStops,
        smoothedCoords.lat,
        smoothedCoords.lng,
        Number(stateMachine.nextStop.stop_order)
      );
      etaToRouteEndMinutes = routeEta.etaToRouteEndMinutes;
      nextStop = {
        id: stateMachine.nextStop.stop_id,
        name: stateMachine.nextStop.stop_name,
        stop_order: stateMachine.nextStop.stop_order,
        eta_minutes: routeEta.etaToNextMinutes,
        distance_km: distanceKm == null ? null : Math.round(distanceKm * 1000) / 1000,
      };
    }
  }

  emitBusLocation({
    bus_id: gps.busId,
    latitude: smoothedCoords.lat,
    longitude: smoothedCoords.lng,
    speed: smoothedSpeed,
    updated_at: saved.updated_at,
    reached_stop_ids: reachedStopIds,
    next_stop: nextStop,
    eta_to_route_end_minutes: etaToRouteEndMinutes,
    route_stops: routeStops.map((s) => ({
      id: s.stop_id,
      stop_name: s.stop_name,
      stop_order: s.stop_order,
      latitude: s.latitude,
      longitude: s.longitude,
    })),
  });

  incCounter("gps_updates_accepted_total");
  log("info", "gps_update_processed", {
    bus_id: gps.busId,
    route_id: ownership.route_id ? Number(ownership.route_id) : null,
    speed_kmh: Math.round(smoothedSpeed * 100) / 100,
    latitude: smoothedCoords.lat,
    longitude: smoothedCoords.lng,
    accuracy_m: gps.accuracy,
  });

  return {
    saved,
    busId: gps.busId,
    latitude: smoothedCoords.lat,
    longitude: smoothedCoords.lng,
    speed: smoothedSpeed,
    reachedStopIds,
    nextStop,
    etaToRouteEndMinutes,
    stopStateChanged,
  };
}
