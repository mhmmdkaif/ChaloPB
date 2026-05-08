import pool from "../config/db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { log } from "../utils/observability.js";

function getJwtSecretOrNull() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    log("error", "auth_jwt_secret_missing", {
      hint: "Generate one with: openssl rand -hex 32",
    });
    return null;
  }
  return secret;
}

export const register = async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const userExists = await pool.query(
      "SELECT id FROM users WHERE email=$1",  // ✅ only id needed here
      [email]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await pool.query(
      `INSERT INTO users(name,email,password,role) 
       VALUES($1,$2,$3,$4) 
       RETURNING id, name, email, role, created_at`,  // ✅ no password hash
      [name, email, hashedPassword, "user"]
    );

    res.status(201).json(newUser.rows[0]);

  } catch (err) {
    res.status(500).json({ message: "Registration failed" });  // ✅ don't expose err.message
  }
};

export const login = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await pool.query(
      "SELECT id, name, email, password, role FROM users WHERE email=$1",  // ✅ explicit columns
      [email]
    );

    if (user.rows.length === 0) {
      log("warn", "login_unknown_email");
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.rows[0].password
    );

    if (!validPassword) {
      log("warn", "login_wrong_password");
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const secret = getJwtSecretOrNull();
    if (!secret) {
      return res.status(500).json({ message: "Server auth misconfigured" });
    }
    // SESSION-FIX: Default to long-lived session (20 days) for better UX
    const expiresIn = process.env.JWT_EXPIRES_IN || "20d";
    const token = jwt.sign(
      {
        id: user.rows[0].id,
        role: user.rows[0].role,
        name: user.rows[0].name,
        email: user.rows[0].email,
        jti: randomUUID(),
      },
      secret,
      { expiresIn }
    );

    log("info", "auth_login_success", { email, role: user.rows[0].role });
    // SESSION-FIX: Return expiry for frontend awareness
    res.json({ token, expires_in: expiresIn });

  } catch (err) {
    log("error", "auth_login_failed", { message: err?.message || String(err) });
    res.status(500).json({ message: "Login failed" });  // ✅ don't expose err.message
  }
};

export const logout = async (req, res) => {
  try {
    const jti = req.user?.jti;
    const userId = Number(req.user?.id);
    const exp = Number(req.user?.exp);

    if (!jti || !Number.isFinite(userId) || !Number.isFinite(exp)) {
      // Backward compatibility for old tokens without jti/exp payload.
      return res.status(200).json({ message: "Logged out" });
    }

    try {
      await pool.query(
        `INSERT INTO token_blocklist (jti, user_id, expires_at)
         VALUES ($1, $2, to_timestamp($3))
         ON CONFLICT (jti) DO NOTHING`,
        [String(jti), userId, exp]
      );
    } catch (err) {
      // Backward compatibility for environments where migration has not run yet.
      log("warn", "auth_logout_blocklist_unavailable", { message: err?.message });
    }

    return res.status(200).json({ message: "Logged out" });
  } catch (err) {
    log("error", "auth_logout_failed", { message: err?.message || String(err) });
    return res.status(500).json({ message: "Logout failed" });
  }
};