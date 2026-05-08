import { haversine } from "./eta.js";

const ARRIVAL_RADIUS_KM = 0.05;

function normalizeState(value) {
  if (!value) return null;
  const raw = String(value).trim().toLowerCase();
  if (["departed", "completed", "passed"].includes(raw)) return "departed";
  if (["arrived", "reached"].includes(raw)) return "arrived";
  if (["approaching", "next"].includes(raw)) return "approaching";
  if (["pending", "upcoming", "scheduled"].includes(raw)) return "pending";
  return null;
}

const findNearestStopMeta = (rows, liveLocation) => {
  if (!liveLocation || liveLocation.latitude == null || liveLocation.longitude == null) {
    return { nearestOrder: null, nearestDistanceKm: null };
  }

  const lat = Number(liveLocation.latitude);
  const lng = Number(liveLocation.longitude);

  let nearest = null;

  for (const row of rows) {
    const stopLat = Number(row.latitude);
    const stopLng = Number(row.longitude);
    const distance = haversine(lat, lng, stopLat, stopLng);

    if (!nearest || distance < nearest.distance) {
      nearest = { order: Number(row.stop_order), distance };
    }
  }

  if (!nearest) return { nearestOrder: null, nearestDistanceKm: null };

  return { nearestOrder: nearest.order, nearestDistanceKm: nearest.distance };
};

function toTimelineStop(row, state) {
  const stopLat = Number(row.stop_lat ?? row.latitude);
  const stopLng = Number(row.stop_lng ?? row.longitude);
  return {
    trip_stop_id: row.trip_stop_id ?? row.id ?? null,
    stop_id: Number(row.stop_id),
    stop_name: row.stop_name,
    stop_order: Number(row.stop_order),
    state,
    status: state,
    stop_lat: Number.isFinite(stopLat) ? stopLat : null,
    stop_lng: Number.isFinite(stopLng) ? stopLng : null,
    latitude: Number.isFinite(stopLat) ? stopLat : null,
    longitude: Number.isFinite(stopLng) ? stopLng : null,
    arrived_at: row.arrived_at ?? null,
    departed_at: row.departed_at ?? null,
    isNext: state === "approaching",
    isPast: state === "departed",
    isCurrent: state === "arrived",
  };
}

export const buildTimelineStopsLegacy = (stops, busLat, busLng, tripStatus = null) => {
  const stopRows = Array.isArray(stops) ? stops : [];
  const liveLocation = Number.isFinite(Number(busLat)) && Number.isFinite(Number(busLng))
    ? { latitude: Number(busLat), longitude: Number(busLng) }
    : null;
  const { nearestOrder, nearestDistanceKm } = findNearestStopMeta(stopRows, liveLocation);
  const isCompletedTrip = String(tripStatus || "").toLowerCase() === "completed";

  return stopRows.map((row) => {
    const explicitState = normalizeState(row.state);
    let state = explicitState;

    if (!state) {
      if (isCompletedTrip) {
        state = "departed";
      } else if (nearestOrder == null) {
        state = "pending";
      } else if (Number(row.stop_order) < nearestOrder) {
        state = "departed";
      } else if (Number(row.stop_order) === nearestOrder) {
        state = nearestDistanceKm != null && nearestDistanceKm <= ARRIVAL_RADIUS_KM ? "arrived" : "approaching";
      } else {
        state = "pending";
      }
    }

    return toTimelineStop(row, state);
  });
};

export const buildTimelineStops = (stops, busLat, busLng, tripStatus = null) => {
  const rows = Array.isArray(stops) ? stops : [];
  if (rows.length === 0) return [];

  const allHaveState = rows.every((row) => normalizeState(row.state) != null);
  if (allHaveState) {
    return rows.map((row) => toTimelineStop(row, normalizeState(row.state)));
  }

  return buildTimelineStopsLegacy(rows, busLat, busLng, tripStatus);
};
