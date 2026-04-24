import pool from "../config/db.js";
import { normalizePagination } from "../constants/pagination.js";
import { logError } from "../utils/observability.js";

const BUS_NUMBER_MAX_LENGTH = 32;

export const addBus = async (req, res) => {
  const bus_number = (req.body.bus_number ?? "").trim().slice(0, BUS_NUMBER_MAX_LENGTH);
  const route_id = req.body.route_id != null ? parseInt(req.body.route_id, 10) : null;
  if (Number.isNaN(route_id)) {
    return res.status(400).json({ message: "Invalid route" });
  }

  if (!bus_number) {
    return res.status(400).json({ message: "Bus number required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO buses (bus_number, route_id)
       VALUES ($1,$2)
       RETURNING id,bus_number,route_id`,
      [bus_number, route_id || null]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    logError("add_bus_failed", err);

    if (err.code === "23505") {
      return res.status(409).json({ message: "Bus already exists" });
    }

    res.status(500).json({ message: "Failed to add bus" });
  }
};

export const getBuses = async (req, res) => {
  const { page, limit, offset } = normalizePagination(req.query);

  try {
    const result = await pool.query(`
      SELECT 
        buses.id,
        buses.bus_number,
        routes.route_name,
        buses.route_id,
        buses.driver_id
      FROM buses
      LEFT JOIN routes ON buses.route_id = routes.id
      ORDER BY buses.bus_number ASC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const total = await pool.query("SELECT COUNT(*) FROM buses");

    res.status(200).json({
      page,
      limit,
      total: parseInt(total.rows[0].count),
      data: result.rows
    });

  } catch (err) {
    logError("get_buses_failed", err);
    res.status(500).json({ message: "Failed to fetch buses" });
  }
};
export const getBusById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
      SELECT
        buses.id,
        buses.bus_number,
        buses.route_id,
        buses.driver_id,
        routes.route_name,
        users.name AS driver_name
      FROM buses
      LEFT JOIN routes ON buses.route_id = routes.id
      LEFT JOIN drivers ON buses.driver_id = drivers.id
      LEFT JOIN users ON drivers.user_id = users.id
      WHERE buses.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Bus not found" });
    }

    res.status(200).json(result.rows[0]);

  } catch (err) {
    logError("get_bus_by_id_failed", err);
    res.status(500).json({ message: "Failed to fetch bus" });
  }
};

export const deleteBus = async (req, res) => {
  const { id } = req.params;

  try {
    // FIX-5: Prevent deletion of bus with active trip.
    const activeTrip = await pool.query(
      "SELECT id FROM trips WHERE bus_id = $1 AND status = $2",
      [id, "active"]
    );
    if (activeTrip.rows.length > 0) {
      return res.status(409).json({ message: "Cannot delete bus with an active trip" });
    }

    const result = await pool.query(
      "DELETE FROM buses WHERE id=$1 RETURNING id, bus_number",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Bus not found" });
    }

    res.status(200).json({ message: "Bus deleted successfully", bus: result.rows[0] });

  } catch (err) {
    logError("delete_bus_failed", err);
    res.status(500).json({ message: "Failed to delete bus" });
  }
};
