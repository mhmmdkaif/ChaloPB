import pool from "../config/db.js";
import { appConfig } from "../config/appConfig.js";

const OSRM_BASE_URL = appConfig.osrm.baseUrl;

function createRouteGeometryError(message, code, context = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, context);
  return err;
}

export function isSkippableRouteGeometryError(err) {
  return [
    "ROUTE_GEOMETRY_INCOMPLETE",
    "ROUTE_GEOMETRY_INVALID_STOPS",
  ].includes(err?.code);
}

function toCoordinatePair(stop, index) {
  const lat = Number(stop.latitude);
  const lng = Number(stop.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw createRouteGeometryError(
      `Invalid stop coordinates at position ${index + 1}`,
      "ROUTE_GEOMETRY_INVALID_STOPS",
      {
        stop_order: stop?.stop_order ?? index + 1,
        latitude: stop?.latitude ?? null,
        longitude: stop?.longitude ?? null,
      }
    );
  }

  return `${lng},${lat}`;
}

export async function getOsrmRouteGeometry(stops) {
  if (!Array.isArray(stops) || stops.length < 2) {
    throw createRouteGeometryError(
      "At least 2 ordered stops are required to build geometry",
      "ROUTE_GEOMETRY_INCOMPLETE",
      { stop_count: Array.isArray(stops) ? stops.length : 0 }
    );
  }

  const coords = stops.map((stop, index) => toCoordinatePair(stop, index)).join(";");
  const endpoint = `${OSRM_BASE_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OSRM request failed (${response.status}): ${details}`);
  }

  const payload = await response.json();
  const route = payload?.routes?.[0];

  if (!route?.geometry || route.geometry.type !== "LineString") {
    throw new Error("OSRM did not return a valid route geometry");
  }

  return {
    geometry: route.geometry,
    distance: Number.isFinite(route.distance) ? Math.round(route.distance) : null,
    duration: Number.isFinite(route.duration) ? Math.round(route.duration) : null,
  };
}

export async function fetchAndSaveRouteGeometry(routeId) {
  const normalizedRouteId = Number(routeId);
  if (!Number.isFinite(normalizedRouteId) || normalizedRouteId <= 0) {
    throw new Error("Invalid routeId");
  }

  const stopsResult = await pool.query(
    `SELECT s.latitude, s.longitude
     FROM route_stops rs
     JOIN stops s ON s.id = rs.stop_id
     WHERE rs.route_id = $1
     ORDER BY rs.stop_order ASC`,
    [normalizedRouteId]
  );

  const stops = stopsResult.rows;
  if (stops.length < 2) {
    throw createRouteGeometryError(
      `Route ${normalizedRouteId} must have at least 2 stops before geometry can be generated`,
      "ROUTE_GEOMETRY_INCOMPLETE",
      { route_id: normalizedRouteId, stop_count: stops.length }
    );
  }

  const geometry = await getOsrmRouteGeometry(stops);

  await pool.query(
    `UPDATE routes
     SET route_geometry_json = $2::jsonb,
         route_geometry_distance_m = $3,
         route_geometry_duration_s = $4,
         route_geometry_updated_at = NOW()
     WHERE id = $1`,
    [normalizedRouteId, JSON.stringify(geometry.geometry), geometry.distance, geometry.duration]
  );

  return geometry;
}
