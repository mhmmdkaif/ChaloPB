import { randomUUID } from "crypto";
import { incCounter, log } from "../utils/observability.js";

/**
 * Assigns a request id and logs method, path, status, duration.
 * Attach before routes; status is set in res.on("finish").
 */
export function requestLogger(req, res, next) {
  const logId = randomUUID().slice(0, 8);
  req.logId = logId;
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    // PHASE6-FIX: Structured request logs + request counters.
    incCounter("http_requests_total");
    log(level, "http_request", {
      log_id: logId,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      duration_ms: duration,
    });
  });

  next();
}
