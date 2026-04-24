import express from "express";
import { getTripTimeline } from "../controllers/tripController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/trips/:tripId/timeline", protect, getTripTimeline);

export default router;
