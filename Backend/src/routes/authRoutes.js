import express from "express";
import { register, login, logout } from "../controllers/authController.js";
import { authRateLimiter } from "../middlewares/authRateLimit.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/register", authRateLimiter, register);
router.post("/login", authRateLimiter, login);
router.post("/logout", protect, logout);

export default router;
