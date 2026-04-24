import pool from "../config/db.js";
import { getOsrmRouteGeometry } from "./osrmService.js";
import { logError } from "../utils/observability.js";

export async function fetchOrderedRouteStops(routeId, dbClient = pool) {
  const result = await dbClient.query(
    `
    SELECT
      rs.stop_order,
      s.id AS stop_id,
      s.stop_name,
      s.latitude,
      s.longitude
    FROM route_stops rs
    JOIN stops s ON s.id = rs.stop_id
    WHERE rs.route_id = $1
    ORDER BY rs.stop_order ASC
    `,
    [routeId]
  );

  return result.rows;
}

export async function regenerateAndStoreRouteGeometry(routeId) {
  if (!routeId || Number.isNaN(Number(routeId))) {
    throw new Error("Invalid routeId");
  }

  const orderedStops = await fetchOrderedRouteStops(routeId);
  if (orderedStops.length < 2) {
    throw new Error("Route must contain at least 2 stops");
  }

  const osrmResult = await getOsrmRouteGeometry(orderedStops);

  const updateResult = await pool.query(
    `
    UPDATE routes
    SET route_geometry_json = $2::jsonb,
        route_geometry_distance_m = $3,
        route_geometry_duration_s = $4,
        route_geometry_updated_at = NOW()
    WHERE id = $1
    RETURNING id, route_geometry_distance_m, route_geometry_duration_s, route_geometry_json
    `,
    [routeId, JSON.stringify(osrmResult.geometry), osrmResult.distance, osrmResult.duration]
  );

  if (updateResult.rows.length === 0) {
    throw new Error("Route not found");
  }

  return {
    route_id: Number(updateResult.rows[0].id),
    distance_m: updateResult.rows[0].route_geometry_distance_m,
    duration_s: updateResult.rows[0].route_geometry_duration_s,
    geometry: updateResult.rows[0].route_geometry_json,
  };
}

export async function getStoredRouteGeometry(routeId) {
  const result = await pool.query(
    `
    SELECT
      id,
      route_geometry_json,
      route_geometry_distance_m,
      route_geometry_duration_s,
      route_geometry_updated_at
    FROM routes
    WHERE id = $1
    LIMIT 1
    `,
    [routeId]
  );

  return result.rows[0] || null;
}

export function triggerRouteGeometryRebuild(routeId) {
  setTimeout(async () => {
    try {
      await regenerateAndStoreRouteGeometry(Number(routeId));
    } catch (err) {
      logError("route_geometry_rebuild_failed", err, { route_id: routeId });
    }
  }, 0);
}
