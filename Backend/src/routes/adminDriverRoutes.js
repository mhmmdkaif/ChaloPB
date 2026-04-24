import express from "express";
import { createDriver, getDrivers } from "../controllers/adminController.js";
import { protect, adminOnly } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/create-driver", protect, adminOnly, createDriver);
router.get("/drivers", protect, adminOnly, getDrivers);

export default router;
