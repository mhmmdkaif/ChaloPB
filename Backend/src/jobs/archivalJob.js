import pool from "../config/db.js";
import { log } from "../utils/observability.js";
import { tripConfig } from "../config/appConfig.js";

const RETENTION_DAYS = tripConfig.eventsRetentionDays;
const ARCHIVAL_HOUR = 3;

function msUntilNextRun() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(ARCHIVAL_HOUR, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function runArchival() {
  try {
    log("info", "trip_events_archival_started", { retention_days: RETENTION_DAYS });

    const result = await pool.query(
      "SELECT * FROM archive_old_trip_events($1)",
      [RETENTION_DAYS]
    );

    const row = result.rows[0] || {};
    log("info", "trip_events_archival_completed", {
      deleted_count: Number(row.deleted_count || 0),
      oldest_kept: row.oldest_kept || null,
    });
  } catch (err) {
    log("error", "trip_events_archival_failed", { message: err?.message || String(err) });
  }
}

export function startArchivalJob() {
  const delayMs = msUntilNextRun();
  const nextRunInHours = Math.round((delayMs / 3600000) * 10) / 10;

  log("debug", "archival_job_scheduled", {
    nextRunInHours,
    retentionDays: RETENTION_DAYS,
    runHour: ARCHIVAL_HOUR,
  });

  setTimeout(() => {
    void runArchival();
    setInterval(() => {
      void runArchival();
    }, 24 * 60 * 60 * 1000);
  }, delayMs);
}
