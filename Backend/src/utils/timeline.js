import { haversine } from "./eta.js";

const ARRIVAL_RADIUS_KM = 0.05;

const normalizeStatus = (value) => {
  if (!value) return null;
  const raw = String(value).trim().toLowerCase();

  if (["departed", "completed", "passed"].includes(raw)) return "departed";
  if (["arrived", "reached"].includes(raw)) return "arrived";
  if (["approaching", "next"].includes(raw)) return "approaching";
  if (["pending", "upcoming", "scheduled"].includes(raw)) return "pending";

  return null;
};

const extractTripStopStatus = (row) => {
  const candidates = [
    row.state,
    row.status,
    row.stop_status,
    row.trip_stop_status,
    row.progress_status,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeStatus(candidate);
    if (normalized) return normalized;
  }

  return null;
};

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

export const buildTimelineStops = ({ stopRows, liveLocation, tripStatus }) => {
  const { nearestOrder, nearestDistanceKm } = findNearestStopMeta(stopRows, liveLocation);
  const isCompletedTrip = String(tripStatus || "").toLowerCase() === "completed";

  return stopRows.map((row) => {
    const explicitStatus = extractTripStopStatus(row);
    let status = explicitStatus;

    if (!status) {
      if (isCompletedTrip) {
        status = "departed";
      } else if (nearestOrder == null) {
        status = "pending";
      } else if (Number(row.stop_order) < nearestOrder) {
        status = "departed";
      } else if (Number(row.stop_order) === nearestOrder) {
        status = nearestDistanceKm != null && nearestDistanceKm <= ARRIVAL_RADIUS_KM ? "arrived" : "approaching";
      } else {
        status = "pending";
      }
    }

    return {
      stop_id: Number(row.stop_id),
      stop_name: row.stop_name,
      stop_order: Number(row.stop_order),
      status,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
    };
  });
};
