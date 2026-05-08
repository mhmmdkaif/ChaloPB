import { incCounter, logError } from "../utils/observability.js";

/**
 * Centralized error handler. Must be registered after all routes.
 * Does not leak stack or internal errors to client.
 */
export function errorHandler(err, req, res, next) {
  const status = err.statusCode ?? err.status ?? 500;
  const message = status >= 500 ? "Internal server error" : (err.message || "Something went wrong");

  if (status >= 500) {
    // PHASE6-FIX: Log structured error payload with stack for server faults.
    incCounter("http_errors_total");
    logError("http_error", err, {
      log_id: req.logId,
      method: req.method,
      path: req.originalUrl || req.url,
      status,
    });
  }

  res.status(status).json({ message });
}
