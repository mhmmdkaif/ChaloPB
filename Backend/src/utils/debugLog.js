import fs from "fs";
import path from "path";

// Always write to workspace root so debug tooling can find it.
// If server is started from Backend/, write to ../debug-d40107.log.
const cwd = process.cwd();
const LOG_PATH =
  path.basename(cwd).toLowerCase() === "backend"
    ? path.resolve(cwd, "..", "debug-d40107.log")
    : path.resolve(cwd, "debug-d40107.log");

/**
 * Debug-mode logger.
 * - Primary: POST to debug ingest endpoint (when fetch exists).
 * - Fallback: append NDJSON to debug log file.
 * Never pass secrets/PII.
 */
export function debugLog({ runId, hypothesisId, location, message, data }) {
  const payload = {
    sessionId: "debug",
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };

  try {
    // Always write to local NDJSON log for reliability.
    fs.appendFileSync(LOG_PATH, `${JSON.stringify(payload)}\n`);
  } catch {
    // Best-effort only
  }
}

