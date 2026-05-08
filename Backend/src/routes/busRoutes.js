import express from "express";
import { addBus, getBuses, getBusById, deleteBus } from "../controllers/busController.js";
import { protect, adminOnly } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", protect, adminOnly, addBus);
router.get("/", protect, getBuses);
router.get("/:id", protect, getBusById);
router.delete("/:id", protect, adminOnly, deleteBus);

export default router;
