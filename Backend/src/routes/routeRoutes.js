import express from "express";
import { createRouteWithStops, getRoutes } from "../controllers/routeController.js";
import { protect, adminOnly } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", protect, adminOnly, createRouteWithStops);  // replaces old addRoute
router.get("/", getRoutes);

export default router;