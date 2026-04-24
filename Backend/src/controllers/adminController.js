import pool from "../config/db.js";
import bcrypt from "bcryptjs";
import { normalizePagination } from "../constants/pagination.js";
import { logError } from "../utils/observability.js";

// PHASE7-FIX: Get all active buses with their current status and locations
export const getActiveBuses = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        b.id,
        b.bus_number,
        r.route_name,
        r.id AS route_id,
        u.name AS driver_name,
        t.id AS trip_id,
        t.status AS trip_status,
        t.started_at,
        ll.latitude,
        ll.longitude,
        ll.speed,
        ll.updated_at AS location_updated_at,
        EXTRACT(EPOCH FROM (NOW() - ll.updated_at)) AS location_age_seconds
      FROM trips t
      JOIN buses b ON b.id = t.bus_id
      JOIN routes r ON r.id = t.route_id
      JOIN drivers d ON d.id = t.driver_id
      JOIN users u ON u.id = d.user_id
      LEFT JOIN live_locations ll ON ll.bus_id = b.id
      WHERE t.status = 'active'
      ORDER BY t.started_at DESC, b.bus_number ASC
      `
    );

    const activeBuses = result.rows.map((row) => ({
      bus_id: row.id,
      bus_number: row.bus_number,
      route_name: row.route_name,
      route_id: row.route_id,
      driver_name: row.driver_name,
      trip_id: row.trip_id,
      trip_status: row.trip_status,
      started_at: row.started_at,
      latitude: row.latitude ? Number(row.latitude) : null,
      longitude: row.longitude ? Number(row.longitude) : null,
      speed: row.speed ? Number(row.speed) : 0,
      location_updated_at: row.location_updated_at,
      location_age_seconds: row.location_age_seconds ? Math.round(Number(row.location_age_seconds)) : null,
      is_stale: row.location_age_seconds ? Number(row.location_age_seconds) > 30 : true,
    }));

    res.status(200).json({
      active_count: activeBuses.length,
      buses: activeBuses,
    });
  } catch (err) {
    logError("get_active_buses_failed", err);
    res.status(500).json({ message: "Failed to fetch active buses" });
  }
};

export const createDriver = async (req, res) => {
  // 1️⃣ Sanitize & extract
  const name = req.body.name?.trim();
  const email = (req.body.email?.trim() || "").toLowerCase();
  const password = req.body.password;
  const license_number = req.body.license_number?.trim();
  const phone = req.body.phone?.trim();

  // 2️⃣ Validate
  if (!name || !email || !password || !license_number || !phone) {
    return res.status(400).json({ message: "All fields are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 3️⃣ Email check
    const exists = await client.query(
      "SELECT id FROM users WHERE email=$1",
      [email]
    );

    if (exists.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Email already exists" });
    }

    // 4️⃣ Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // 5️⃣ Create user
    const newUser = await client.query(
      `INSERT INTO users(name,email,password,role)
       VALUES($1,$2,$3,'driver')
       RETURNING id`,
      [name, email, hashedPassword]
    );

    // 6️⃣ Create driver profile
    await client.query(
      `INSERT INTO drivers(user_id, license_number, phone)
       VALUES($1,$2,$3)`,
      [newUser.rows[0].id, license_number, phone]
    );

    await client.query("COMMIT");

    res.status(201).json({ message: "Driver created successfully" });

  } catch (err) {
    await client.query("ROLLBACK");
    logError("admin_operation_failed", err);

    if (err.code === "23505") {
      return res.status(409).json({ message: "Duplicate entry detected" });
    }

    res.status(500).json({ message: "Failed to create driver" });

  } finally {
    client.release();
  }
};

export const getDrivers = async (req, res) => {
  const { page, limit, offset } = normalizePagination(req.query);

  try {
    const result = await pool.query(`
      SELECT 
        drivers.id,
        users.name,
        users.email,
        drivers.license_number,
        drivers.phone
      FROM drivers
      JOIN users ON drivers.user_id = users.id
      WHERE users.role = 'driver'
      ORDER BY users.name ASC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const total = await pool.query(`
      SELECT COUNT(*) 
      FROM drivers 
      JOIN users ON drivers.user_id = users.id 
      WHERE users.role = 'driver'
    `);

    res.status(200).json({
      page,
      limit,
      total: parseInt(total.rows[0].count),
      data: result.rows
    });

  } catch (err) {
    logError("admin_operation_failed", err);
    res.status(500).json({ message: "Failed to fetch drivers" });
  }
};