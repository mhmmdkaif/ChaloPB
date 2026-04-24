import express from "express";
import { addStop, getStops, getStopById, deleteStop } from "../controllers/stopController.js";
import { protect, adminOnly } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", protect, adminOnly, addStop);
router.get("/", getStops);
router.get("/:id", getStopById);
router.delete("/:id", protect, adminOnly, deleteStop);

export default router;
