import { haversine } from "../utils/eta.js";
import { LOCATION_CONSTANTS } from "../config/constants.js";
import { AppError } from "../utils/AppError.js";

// PHASE7-FIX: GPS service encapsulates validation, smoothing, and teleport checks.
const speedBuffers = new Map();  // busId -> last speed (for EMA)
const coordBuffers = new Map();  // busId -> { lat, lng } (for EMA)

const SPEED_ALPHA = 0.5;   // higher = more responsive, lower = smoother
const COORD_ALPHA = 0.4;   // 0.4 gives mild smoothing without lag

export function validateAndNormalizeGpsPayload(body) {
  const { bus_id, latitude, longitude, speed, accuracy, device_timestamp } = body;

  if (!bus_id || latitude == null || longitude == null) {
    throw new AppError("Invalid location data", 400, "INVALID_LOCATION_DATA");
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  if (
    Number.isNaN(lat) || Number.isNaN(lng) ||
    lat < -90 || lat > 90 ||
    lng < -180 || lng > 180
  ) {
    throw new AppError("Invalid coordinates", 400, "INVALID_COORDINATES");
  }

  const acc = accuracy != null ? Number(accuracy) : null;
  if (acc !== null && (Number.isNaN(acc) || acc < 0 || acc > 50000)) {
    throw new AppError("Invalid accuracy", 400, "INVALID_ACCURACY");
  }

  let deviceTs = null;
  if (device_timestamp) {
    const d = new Date(device_timestamp);
    if (Number.isNaN(d.getTime())) {
      throw new AppError("Invalid device_timestamp", 400, "INVALID_DEVICE_TIMESTAMP");
    }
    if (d.getTime() > Date.now() + 60000) {
      throw new AppError("Future timestamp rejected", 400, "FUTURE_TIMESTAMP_REJECTED");
    }
    if (d.getTime() >= Date.now() - 300000) {
      deviceTs = d;
    }
  }

  return {
    busId: Number(bus_id),
    latitude: lat,
    longitude: lng,
    speed: speed != null ? Number(speed) : 0,
    accuracy: acc,
    deviceTimestamp: deviceTs,
  };
}

export function shouldDropLowAccuracy(accuracy) {
  return accuracy !== null && accuracy > LOCATION_CONSTANTS.ACCURACY_THRESHOLD_M;
}

export function isTeleport(lastLat, lastLng, lastTs, newLat, newLng, newTs) {
  const dist = haversine(lastLat, lastLng, newLat, newLng);
  const hours = Math.max((newTs - lastTs) / 3600000, 1 / 3600);
  const speed = dist / hours;
  return speed > LOCATION_CONSTANTS.MAX_SPEED_KMH;
}

export function smoothSpeed(busId, speed) {
  const prev = speedBuffers.get(busId);
  if (prev == null) {
    speedBuffers.set(busId, speed);
    return speed;
  }

  const next = prev + SPEED_ALPHA * (speed - prev);
  speedBuffers.set(busId, next);
  return next;
}

export function smoothCoords(busId, lat, lng) {
  const prev = coordBuffers.get(busId);
  if (!prev) {
    coordBuffers.set(busId, { lat, lng });
    return { lat, lng };
  }

  const next = {
    lat: prev.lat + COORD_ALPHA * (lat - prev.lat),
    lng: prev.lng + COORD_ALPHA * (lng - prev.lng),
  };
  coordBuffers.set(busId, next);
  return next;
}

// NEW: call this when a trip starts to avoid bleed from previous trip
export function resetBusSmoothing(busId) {
  speedBuffers.delete(busId);
  coordBuffers.delete(busId);
}
