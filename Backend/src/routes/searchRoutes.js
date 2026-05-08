import express from "express";
import { searchBusesByStops } from "../controllers/searchController.js";

const router = express.Router();

// Public search (new endpoint)
router.get("/search-buses", searchBusesByStops);

// Legacy endpoint kept for compatibility
router.get("/search/buses", searchBusesByStops);

export default router;
