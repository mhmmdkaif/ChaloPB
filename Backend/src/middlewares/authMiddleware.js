import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import { log } from "../utils/observability.js";

export const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const parts = authHeader.split(" ");
  const token = parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : null;

  if (!token) {
    return res.status(401).json({ message: "No token" });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: "Server auth misconfigured" });
    }

    const decoded = jwt.verify(token, secret);

    // Support revocation for newly-issued tokens that include jti.
    if (decoded?.jti) {
      try {
        const blocked = await pool.query(
          `SELECT 1
           FROM token_blocklist
           WHERE jti = $1
             AND expires_at > NOW()
           LIMIT 1`,
          [String(decoded.jti)]
        );

        if (blocked.rows.length > 0) {
          return res.status(401).json({ message: "Token revoked" });
        }
      } catch (err) {
        // Backward compatibility: older DBs may not have token_blocklist yet.
        log("warn", "token_blocklist_check_failed", { message: err?.message });
      }
    }

    req.token = token;
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

export const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access only" });
  }
  next();
};

export const driverOnly = (req, res, next) => {
  if (req.user.role !== "driver") {
    return res.status(403).json({ message: "Driver access only" });
  }
  next();
};
