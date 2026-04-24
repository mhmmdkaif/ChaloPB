import { haversine } from "./eta.js";

export function computeRouteProgress({ routeStops, latitude, longitude, speed, geofenceRadiusKm }) {
  if (!Array.isArray(routeStops) || routeStops.length === 0) {
    return { reachedStopIds: [], nextStop: null };
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  const spd = Number(speed ?? 0);

  const reachedStopIds = [];

  for (const stop of routeStops) {
    const dist = haversine(lat, lng, Number(stop.latitude), Number(stop.longitude));
    if (dist <= geofenceRadiusKm) {
      reachedStopIds.push(stop.stop_id);
    }
  }

  const nextStopData = routeStops.find((stop) => !reachedStopIds.includes(stop.stop_id));
  if (!nextStopData) {
    return { reachedStopIds, nextStop: null };
  }

  const distToNext = haversine(lat, lng, Number(nextStopData.latitude), Number(nextStopData.longitude));
  const etaMinutes = spd > 0 ? Math.round((distToNext / spd) * 60) : null;

  return {
    reachedStopIds,
    nextStop: {
      id: nextStopData.stop_id,
      name: nextStopData.stop_name,
      eta_minutes: etaMinutes,
      distance_km: Math.round(distToNext * 1000) / 1000,
    },
  };
}