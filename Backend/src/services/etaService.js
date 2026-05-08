import { haversine } from "../utils/eta.js";
import { ETA_CONSTANTS } from "../config/constants.js";

// PHASE7-FIX: ETA service isolates prediction logic from controllers.
export function calculateETA(distanceKm, speedKmh, dwellStops = 0) {
  const safeDistanceKm = Math.max(0, Number(distanceKm) || 0);
  const safeSpeedKmh = Math.max(ETA_CONSTANTS.MIN_SPEED_KMH, Number(speedKmh) || 0);
  const travelMinutes = (safeDistanceKm / safeSpeedKmh) * 60;
  const dwellMinutes = (Math.max(0, Number(dwellStops) || 0) * ETA_CONSTANTS.DWELL_SECONDS_PER_STOP) / 60;
  return Math.max(1, Math.round(travelMinutes + dwellMinutes));
}

export function calculateRouteDistanceToOrder(routeStops, currentLat, currentLng, targetOrder) {
  // Find only the target stop
  const targetStop = (routeStops || []).find(
    (s) => Number(s.stop_order) === Number(targetOrder)
  );
  if (!targetStop) return null;

  // Straight-line distance from current position to target stop
  // (route-following distance is not needed here — buildRouteEta handles full path)
  return haversine(
    Number(currentLat),
    Number(currentLng),
    Number(targetStop.latitude),
    Number(targetStop.longitude)
  );
}

export function buildRouteEta(routeStops, nextStop, currentLat, currentLng, speedKmh) {
  if (!nextStop || !Array.isArray(routeStops) || routeStops.length === 0) {
    return { etaToNextMinutes: null, etaToRouteEndMinutes: null };
  }

  const nextOrder = Number(nextStop.stop_order);
  const toNextDistanceKm = calculateRouteDistanceToOrder(routeStops, currentLat, currentLng, nextOrder);
  const remainingStops = routeStops
    .filter((s) => Number(s.stop_order) > nextOrder)
    .sort((a, b) => Number(a.stop_order) - Number(b.stop_order));

  let toEndDistanceKm = toNextDistanceKm || 0;
  if (remainingStops.length > 0) {
    let prevLat = Number(nextStop.latitude);
    let prevLng = Number(nextStop.longitude);
    for (const stop of remainingStops) {
      const stopLat = Number(stop.latitude);
      const stopLng = Number(stop.longitude);
      toEndDistanceKm += haversine(prevLat, prevLng, stopLat, stopLng);
      prevLat = stopLat;
      prevLng = stopLng;
    }
  }

  return {
    etaToNextMinutes: toNextDistanceKm == null ? null : calculateETA(toNextDistanceKm, speedKmh, 0),
    etaToRouteEndMinutes: toEndDistanceKm > 0 ? calculateETA(toEndDistanceKm, speedKmh, remainingStops.length) : null,
  };
}
