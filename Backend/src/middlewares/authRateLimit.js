import rateLimit from "express-rate-limit";
import { appConfig } from "../config/appConfig.js";

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: appConfig.limits.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many auth attempts. Please try again later." },
});