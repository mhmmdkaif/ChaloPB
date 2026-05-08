import express from "express";
import { protect, adminOnly } from "../middlewares/authMiddleware.js";
import { getActiveBuses } from "../controllers/adminController.js";

const router = express.Router();

router.get("/dashboard", protect, adminOnly, (req, res) => {
  res.json({ message: "Welcome Admin" });
});

// PHASE7-FIX: Get all active buses for admin fleet monitoring
router.get("/buses/active", protect, adminOnly, getActiveBuses);

export default router;
