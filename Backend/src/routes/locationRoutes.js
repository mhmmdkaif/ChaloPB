import express from "express";
import rateLimit from "express-rate-limit";
import {
  updateLocation,
  getBusLocation,
  getAllLiveLocations,
} from "../controllers/locationController.js";
import { protect, adminOnly } from "../middlewares/authMiddleware.js";

const router = express.Router();

// ✅ FIXED: Rate limit GPS updates — stable & no IPv6 issues
const gpsRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.GPS_RATE_LIMIT_MAX ?? "30", 10) || 30,
  standardHeaders: true,
  legacyHeaders: false,

  // 🔥 KEY FIX: Use ONLY driver ID (no mixed IP logic)
  keyGenerator: (req) => `driver_${req.user.id}`,

  message: { message: "Too many location updates. Slow down." },

  // Skip rate limit in test env
  skip: (req) => process.env.NODE_ENV === "test",
});

// 🔐 Order matters: auth → rate limit → controller
router.post("/update", protect, gpsRateLimiter, updateLocation);
router.post("/", protect, gpsRateLimiter, updateLocation);

// Admin route
router.get("/all", protect, adminOnly, getAllLiveLocations);

// Public route
router.get("/bus/:id", getBusLocation);
router.get("/:id", getBusLocation);

export default router;