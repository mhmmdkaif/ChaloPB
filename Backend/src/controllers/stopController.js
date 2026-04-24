import pool from "../config/db.js";
import { normalizePagination } from "../constants/pagination.js";
import { logError } from "../utils/observability.js";

export const addStop = async (req, res) => {
  const stop_name = req.body.stop_name?.trim();
  const latitude = req.body.latitude;
  const longitude = req.body.longitude;

  if (!stop_name || latitude == null || longitude == null) {
    return res.status(400).json({ message: "All fields are required" });
  }
  if (isNaN(latitude) || isNaN(longitude)) {
    return res.status(400).json({ message: "Latitude and longitude must be numbers" });
  }
  if (latitude < -90 || latitude > 90) {
    return res.status(400).json({ message: "Latitude must be between -90 and 90" });
  }
  if (longitude < -180 || longitude > 180) {
    return res.status(400).json({ message: "Longitude must be between -180 and 180" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO stops (stop_name, latitude, longitude)
       VALUES ($1,$2,$3)
       RETURNING id, stop_name, latitude, longitude`,
      [stop_name, latitude, longitude]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logError("stop_operation_failed", err);
    if (err.code === "23505") {
      return res.status(409).json({ message: "Stop already exists" });
    }
    res.status(500).json({ message: "Failed to add stop" });
  }
};

export const getStops = async (req, res) => {
  const { page, limit, offset } = normalizePagination(req.query);

  try {
    const result = await pool.query(`
      SELECT id, stop_name, latitude, longitude
      FROM stops
      ORDER BY stop_name ASC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const total = await pool.query("SELECT COUNT(*) FROM stops");

    res.status(200).json({
      page,
      limit,
      total: parseInt(total.rows[0].count),
      data: result.rows
    });
  } catch (err) {
    logError("stop_operation_failed", err);
    res.status(500).json({ message: "Failed to fetch stops" });
  }
};

export const getStopById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "SELECT id, stop_name, latitude, longitude FROM stops WHERE id=$1",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Stop not found" });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    logError("stop_operation_failed", err);
    res.status(500).json({ message: "Failed to fetch stop" });
  }
};

export const deleteStop = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM stops WHERE id=$1 RETURNING id, stop_name",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Stop not found" });
    }
    res.status(200).json({ message: "Stop deleted successfully", stop: result.rows[0] });
  } catch (err) {
    logError("stop_operation_failed", err);
    if (err.code === "23503") {
      return res.status(409).json({ message: "Cannot delete stop — it is used in one or more routes" });
    }
    res.status(500).json({ message: "Failed to delete stop" });
  }
};
