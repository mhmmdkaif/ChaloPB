import express from "express";
import {
  addStopToRoute,
  getRouteStops,
  addMultipleStopsToRoute,
  getRouteGeometry,
} from "../controllers/routeStopController.js";
import { protect, adminOnly } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Legacy endpoints (if used elsewhere)
router.post("/route-stops", protect, adminOnly, addStopToRoute);
router.get("/route-stops/:routeId", protect, getRouteStops);

// Route Builder endpoints used by frontend admin UI
// GET ordered stops for a route
router.get("/routes/:routeId/stops", protect, getRouteStops);

// GET route geometry for map rendering
router.get("/routes/:routeId/geometry", getRouteGeometry);

// Overwrite full stop timeline for a route
router.post("/routes/:id/stops", protect, adminOnly, addMultipleStopsToRoute);

export default router;
