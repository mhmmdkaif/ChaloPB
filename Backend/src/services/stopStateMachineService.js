import { STOP_STATE_CONSTANTS } from "../config/constants.js";
import { haversine } from "../utils/eta.js";
import {
  batchDepartTripStops,
  getTripStopsWithCoordinates,
  updateTripStopState,
} from "../repositories/locationRepository.js";

// PHASE7-FIX: State-machine service decoupled from controller for maintainability.
const validTransitions = {
  pending: ["approaching", "arrived"],
  approaching: ["arrived"],
  arrived: ["departed"],
  departed: [],
};

const tripStopsCache = new Map();
const TRIP_STOPS_CACHE_TTL_MS = 10000;

async function getTripStopsCached(pool, tripId) {
  const now = Date.now();
  const key = Number(tripId);
  const cached = tripStopsCache.get(key);
  if (cached && now - cached.ts < TRIP_STOPS_CACHE_TTL_MS) return cached.rows;
  const rows = await getTripStopsWithCoordinates(pool, tripId);
  tripStopsCache.set(key, { ts: now, rows });
  return rows;
}

export function invalidateTripStopsCache(tripId) {
  tripStopsCache.delete(Number(tripId));
}

function canTransition(current, next) {
  return validTransitions[current]?.includes(next) ?? false;
}

export async function processStopStateMachine(pool, tripId, currentLat, currentLng, hooks = {}) {
  const tripStops = await getTripStopsCached(pool, tripId);
  if (!tripStops.length) return { reachedStopIds: [], nextStop: null, transitioned: false };

  const nextStop = tripStops.find((s) => s.state !== "departed");
  if (!nextStop) {
    return {
      reachedStopIds: tripStops.filter((s) => s.state === "departed").map((s) => s.stop_id),
      nextStop: null,
      transitioned: false,
    };
  }

  const distM = haversine(
    Number(currentLat),
    Number(currentLng),
    Number(nextStop.latitude),
    Number(nextStop.longitude)
  ) * 1000;

  let targetState = null;
  const fromState = nextStop.state;
  if (distM <= STOP_STATE_CONSTANTS.ARRIVE_RADIUS_M) {
    if (nextStop.state === "pending") {
      targetState = "approaching"; // next GPS ping will push to arrived
    } else if (nextStop.state === "approaching") {
      targetState = "arrived";
    }
  } else if (distM <= STOP_STATE_CONSTANTS.APPROACH_RADIUS_M) {
    if (nextStop.state === "pending") {
      targetState = "approaching";
    }
  } else if (nextStop.state === "arrived" && distM > STOP_STATE_CONSTANTS.DEPART_RADIUS_M) {
    targetState = "departed";
  }

  // Time-based depart fallback: bus stopped inside arrive zone > 45s
  if (!targetState && nextStop.state === "arrived" && nextStop.arrived_at) {
    const dwellMs = Date.now() - new Date(nextStop.arrived_at).getTime();
    if (dwellMs > 45_000) targetState = "departed";
  }

  if (targetState === nextStop.state || !(targetState && canTransition(nextStop.state, targetState))) {
    return {
      reachedStopIds: tripStops.filter((s) => s.state === "departed").map((s) => s.stop_id),
      nextStop,
      transitioned: false,
    };
  }

  const client = await pool.connect();
  let skippedIds = [];
  try {
    await client.query("BEGIN");

    skippedIds = tripStops
      .filter((s) => Number(s.stop_order) < Number(nextStop.stop_order) && s.state !== "departed")
      .map((s) => Number(s.id));

    await batchDepartTripStops(client, skippedIds);
    await updateTripStopState(client, nextStop.id, targetState);

    await client.query("COMMIT");
    invalidateTripStopsCache(tripId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  for (const stop of tripStops) {
    if (Number(stop.stop_order) < Number(nextStop.stop_order) && stop.state !== "departed") {
      stop.state = "departed";
    }
    if (Number(stop.id) === Number(nextStop.id)) {
      stop.state = targetState;
    }
  }

  if (hooks?.onTransition) {
    hooks.onTransition({
      tripId: Number(tripId),
      stopId: Number(nextStop.stop_id),
      stopOrder: Number(nextStop.stop_order),
      fromState,
      toState: targetState,
      skippedCount: skippedIds.length,
      distanceM: Math.round(distM),
    });
    // Log state transition event
    const { logTripEvent } = await import("../controllers/tripController.js");
    const eventType =
      targetState === 'arrived' ? 'arrived' :
      targetState === 'departed' ? 'departed' :
      targetState === 'approaching' ? 'approaching' : null;
    if (eventType) {
      await logTripEvent(tripId, nextStop.stop_id, eventType, {
        distance_m: Math.round(distM),
        stop_order: nextStop.stop_order,
        state_change: `${fromState} → ${targetState}`
      });
    }
  }

  return {
    reachedStopIds: tripStops.filter((s) => s.state === "departed").map((s) => s.stop_id),
    nextStop: tripStops.find((s) => s.state !== "departed") || null,
    transitioned: true,
  };
}
