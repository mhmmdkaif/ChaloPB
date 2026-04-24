import pool from "../config/db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

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
      console.warn(`[AUTH] Login attempt with non-existent email: ${email}`);
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.rows[0].password
    );

    if (!validPassword) {
      console.warn(`[AUTH] Login attempt with wrong password for email: ${email}`);
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("[AUTH] JWT_SECRET not configured");
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
      },
      secret,
      { expiresIn }
    );

    console.log(`[AUTH] Successful login for user: ${email} (role: ${user.rows[0].role})`);
    // SESSION-FIX: Return expiry for frontend awareness
    res.json({ token, expires_in: expiresIn });

  } catch (err) {
    console.error("[AUTH] Login error:", err);
    res.status(500).json({ message: "Login failed" });  // ✅ don't expose err.message
  }
};