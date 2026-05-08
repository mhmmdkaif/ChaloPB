import pool from "../config/db.js";
import {
  triggerRouteGeometryRebuild,
  getStoredRouteGeometry,
} from "../services/routeGeometryService.js";
import { invalidateRouteCache } from "../services/cacheService.js";
import { logError } from "../utils/observability.js";

/* ======================================================
   ADD SINGLE STOP TO ROUTE
====================================================== */

export const addStopToRoute = async (req, res) => {
  const { route_id, stop_id, stop_order } = req.body;

  if (!route_id || !stop_id || !stop_order) {
    return res.status(400).json({
      message: "route_id, stop_id, stop_order are required",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const route = await client.query(
      "SELECT id FROM routes WHERE id=$1",
      [route_id]
    );

    if (route.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Route not found" });
    }

    const stop = await client.query(
      "SELECT id FROM stops WHERE id=$1",
      [stop_id]
    );

    if (stop.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Stop not found" });
    }

    const result = await client.query(
      `
      INSERT INTO route_stops (route_id, stop_id, stop_order)
      VALUES ($1,$2,$3)
      RETURNING *
      `,
      [route_id, stop_id, stop_order]
    );

    await client.query("COMMIT");
    triggerRouteGeometryRebuild(route_id);
    invalidateRouteCache(route_id);

    res.status(201).json(result.rows[0]);

  } catch (err) {
    await client.query("ROLLBACK");
    logError("route_stop_operation_failed", err);

    if (err.code === "23505") {
      return res.status(409).json({
        message: "Stop already exists or order already used",
      });
    }

    res.status(500).json({ message: "Failed to add stop to route" });

  } finally {
    client.release();
  }
};

/* ======================================================
   SAVE ROUTE STOPS (OVERWRITE FULL TIMELINE)
====================================================== */

export const addMultipleStopsToRoute = async (req, res) => {
  const { id } = req.params;
  const { stops } = req.body;

  if (!Array.isArray(stops) || stops.length < 2) {
    return res.status(400).json({
      message: "Stops must be an array with at least 2 stops",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Check route exists
    const route = await client.query(
      "SELECT id FROM routes WHERE id=$1",
      [id]
    );

    if (route.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Route not found" });
    }

    // ✅ Pre-validate ALL stop IDs before touching anything
    const stopIds = stops.map(s => s.stop_id);

    const validStops = await client.query(
      "SELECT id FROM stops WHERE id = ANY($1::int[])",
      [stopIds]
    );

    // ✅ Check if any stop IDs are missing
    if (validStops.rows.length !== stopIds.length) {
      const validIds = validStops.rows.map(r => r.id);
      const invalidIds = stopIds.filter(id => !validIds.includes(id));

      await client.query("ROLLBACK");
      return res.status(404).json({
        message: `Invalid stop IDs: ${invalidIds.join(", ")}`
      });
    }

    // ✅ Check for duplicate stop_orders in the request itself
    const orders = stops.map(s => s.stop_order);
    const uniqueOrders = new Set(orders);
    if (uniqueOrders.size !== orders.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Duplicate stop_order values found"
      });
    }

    // Clear existing timeline
    await client.query(
      "DELETE FROM route_stops WHERE route_id=$1",
      [id]
    );

    // ✅ Bulk INSERT instead of loop
    const values = stops.map(
      (s, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`
    ).join(", ");

    const params = [id, ...stops.flatMap(s => [s.stop_id, s.stop_order])];

    await client.query(
      `INSERT INTO route_stops (route_id, stop_id, stop_order) VALUES ${values}`,
      params
    );

    // Derive start_point and end_point from the first and last stop names
    const endpointResult = await client.query(
      `SELECT s.stop_name, rs.stop_order
       FROM route_stops rs
       JOIN stops s ON s.id = rs.stop_id
       WHERE rs.route_id = $1
       ORDER BY rs.stop_order ASC`,
      [id]
    );

    if (endpointResult.rows.length >= 2) {
      const startName = endpointResult.rows[0].stop_name;
      const endName = endpointResult.rows[endpointResult.rows.length - 1].stop_name;
      await client.query(
        `UPDATE routes SET start_point = $1, end_point = $2 WHERE id = $3`,
        [startName, endName, id]
      );
    }

    await client.query("COMMIT");
    triggerRouteGeometryRebuild(id);
    invalidateRouteCache(id);

    res.status(201).json({
      message: "Route stops saved successfully",
    });

  } catch (err) {
    await client.query("ROLLBACK");
    logError("route_stop_operation_failed", err);
    res.status(500).json({ message: "Failed to save route stops" });

  } finally {
    client.release();
  }
};

/* ======================================================
   GET STOPS FOR ROUTE (ORDERED)
====================================================== */

export const getRouteStops = async (req, res) => {
  const { routeId } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT
        rs.stop_order,
        s.id,
        s.stop_name,
        s.latitude,
        s.longitude
      FROM route_stops rs
      JOIN stops s ON rs.stop_id = s.id
      WHERE rs.route_id = $1
      ORDER BY rs.stop_order ASC
      `,
      [routeId]
    );

    res.status(200).json(result.rows);

  } catch (err) {
    logError("route_stop_operation_failed", err);
    res.status(500).json({ message: "Failed to fetch route stops" });
  }
};

export const getRouteGeometry = async (req, res) => {
  const { routeId } = req.params;
  const parsedRouteId = Number(routeId);

  if (!routeId || Number.isNaN(parsedRouteId)) {
    return res.status(400).json({ message: "Invalid routeId" });
  }

  try {
    const route = await getStoredRouteGeometry(parsedRouteId);
    if (!route) {
      return res.status(404).json({ message: "Route not found" });
    }

    return res.status(200).json({
      route_id: Number(route.id),
      distance_m: route.route_geometry_distance_m,
      duration_s: route.route_geometry_duration_s,
      geometry: route.route_geometry_json,
      updated_at: route.route_geometry_updated_at,
    });
  } catch (err) {
    logError("route_stop_operation_failed", err);
    return res.status(500).json({ message: "Failed to fetch route geometry" });
  }
};