import pool from "../config/db.js";
import { normalizePagination } from "../constants/pagination.js";
import { triggerRouteGeometryRebuild } from "../services/routeGeometryService.js";
import { invalidateRouteCache } from "../services/cacheService.js";
import { logError } from "../utils/observability.js";

/* ============================
   CREATE ROUTE WITH STOPS
============================ */

export const createRouteWithStops = async (req, res) => {
  const route_name = (req.body.route_name ?? "").trim().slice(0, 128);
  const rawStops = req.body.stops;

  if (!route_name || !Array.isArray(rawStops) || rawStops.length < 2) {
    return res.status(400).json({
      message: "route_name and minimum 2 stops required"
    });
  }
  if (rawStops.length > 500) {
    return res.status(400).json({ message: "Maximum 500 stops per route" });
  }
  const stops = rawStops.map((id) => parseInt(id, 10)).filter((id) => Number.isInteger(id) && id > 0);
  if (stops.length !== rawStops.length) {
    return res.status(400).json({ message: "All stop IDs must be positive integers" });
  }
  const uniqueStops = new Set(stops);
  if (uniqueStops.size !== stops.length) {
    return res.status(400).json({ message: "Duplicate stop IDs found in request" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Validate ALL stop IDs in one query
    const validStops = await client.query(
      "SELECT id, stop_name FROM stops WHERE id = ANY($1::int[])",
      [stops]
    );

    if (validStops.rows.length !== stops.length) {
      const validIds = validStops.rows.map(r => r.id);
      const invalidIds = stops.filter(id => !validIds.includes(id));

      await client.query("ROLLBACK");
      return res.status(404).json({
        message: `Invalid stop IDs: ${invalidIds.join(", ")}`
      });
    }

    // Get first and last stop names from validated results
    const stopMap = Object.fromEntries(
      validStops.rows.map(r => [r.id, r.stop_name])
    );
    const start_point = stopMap[stops[0]];
    const end_point = stopMap[stops[stops.length - 1]];

    // Insert route
    const routeResult = await client.query(
      `
      INSERT INTO routes (route_name, start_point, end_point)
      VALUES ($1,$2,$3)
      RETURNING id
      `,
      [route_name, start_point, end_point]
    );

    const route_id = routeResult.rows[0].id;

    // Bulk INSERT stops
    const values = stops.map(
      (_, i) => `($1, $${i + 2}, ${i + 1})`
    ).join(", ");

    const params = [route_id, ...stops];

    await client.query(
      `INSERT INTO route_stops (route_id, stop_id, stop_order) VALUES ${values}`,
      params
    );

    await client.query("COMMIT");
    triggerRouteGeometryRebuild(route_id);
    invalidateRouteCache(route_id);

    res.status(201).json({
      message: "Route created successfully",
      route_id
    });

  } catch (err) {
    await client.query("ROLLBACK");
    logError("route_operation_failed", err);

    if (err.code === "23505") {
      return res.status(409).json({ message: "Route name already exists" });
    }

    res.status(500).json({ message: "Failed to create route" });

  } finally {
    client.release();
  }
};

/* ============================
   GET ROUTES
============================ */

export const getRoutes = async (req, res) => {
  const { page, limit, offset } = normalizePagination(req.query);

  try {
    const result = await pool.query(`
      SELECT id, route_name, start_point, end_point
      FROM routes
      ORDER BY route_name ASC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const total = await pool.query("SELECT COUNT(*) FROM routes");

    res.status(200).json({
      page,
      limit,
      total: parseInt(total.rows[0].count),
      data: result.rows
    });

  } catch (err) {
    logError("route_operation_failed", err);
    res.status(500).json({ message: "Failed to fetch routes" });
  }
};