import express from "express";
import {
	assignDriver,
	unassignDriver,
	getMyDriverProfile,
	getMyAssignedBus,
	getMyDashboard,
	startMyTrip,
	stopMyTrip,
	getMyActiveTrip,
} from "../controllers/driverController.js";
import { protect, adminOnly, driverOnly } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/assign", protect, adminOnly, assignDriver);
router.post("/unassign", protect, adminOnly, unassignDriver);
router.get("/me", protect, driverOnly, getMyDriverProfile);
router.get("/me/dashboard", protect, driverOnly, getMyDashboard);
router.get("/me/bus", protect, driverOnly, getMyAssignedBus);
router.get("/me/trips/active", protect, driverOnly, getMyActiveTrip);
router.post("/me/trips/start", protect, driverOnly, startMyTrip);
router.post("/me/trips/stop", protect, driverOnly, stopMyTrip);

export default router;
