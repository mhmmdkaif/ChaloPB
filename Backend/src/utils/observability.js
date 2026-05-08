import { logLevel as configuredLogLevel } from "../config/appConfig.js";

// PHASE6-FIX: Lightweight structured logger + in-memory metrics.
const counters = new Map();
const gauges = new Map();
const gpsUpdatesByBus = new Map();
const startTimeMs = Date.now();

const LEVEL_ORDER = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function shouldLog(level) {
  const normalized = String(level || "info").toLowerCase();
  const threshold = LEVEL_ORDER[String(configuredLogLevel || "info").toLowerCase()] ?? LEVEL_ORDER.info;
  return (LEVEL_ORDER[normalized] ?? LEVEL_ORDER.info) <= threshold;
}

function stableStringify(data) {
  try {
    return JSON.stringify(data);
  } catch {
    return JSON.stringify({ serialization_error: true });
  }
}

export function log(level, event, data = {}) {
  if (!shouldLog(level)) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  const line = stableStringify(entry);
  if (level === "error") {
    process.stderr.write(`${line}\n`);
    return;
  }
  process.stdout.write(`${line}\n`);
}

export function logError(event, err, context = {}) {
  log("error", event, {
    ...context,
    message: err?.message || String(err),
    stack: err?.stack || null,
  });
}

export function incCounter(name, value = 1) {
  const current = counters.get(name) || 0;
  counters.set(name, current + value);
}

export function setGauge(name, value) {
  gauges.set(name, Number(value) || 0);
}

export function recordGpsUpdateForBus(busId) {
  const normalizedBusId = Number(busId);
  if (!Number.isFinite(normalizedBusId) || normalizedBusId <= 0) return;

  const key = String(normalizedBusId);
  const current = gpsUpdatesByBus.get(key) || 0;
  gpsUpdatesByBus.set(key, current + 1);
}

export function getGpsUpdatesByBusTop(limit = 10) {
  return Object.fromEntries(
    Array.from(gpsUpdatesByBus.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, Number(limit) || 10))
  );
}

export function getCountersSnapshot() {
  return Object.fromEntries(counters.entries());
}

export function getGaugesSnapshot() {
  return Object.fromEntries(gauges.entries());
}

export function getProcessStartTimeMs() {
  return startTimeMs;
}

export function getUptimeSec() {
  return Math.floor((Date.now() - startTimeMs) / 1000);
}

export function renderMetricsText() {
  const lines = [];
  const uptimeSec = Math.floor((Date.now() - startTimeMs) / 1000);

  lines.push(`# HELP app_uptime_seconds Process uptime in seconds`);
  lines.push(`# TYPE app_uptime_seconds gauge`);
  lines.push(`app_uptime_seconds ${uptimeSec}`);

  for (const [key, value] of counters.entries()) {
    lines.push(`# HELP ${key} Counter metric ${key}`);
    lines.push(`# TYPE ${key} counter`);
    lines.push(`${key} ${value}`);
  }

  for (const [key, value] of gauges.entries()) {
    lines.push(`# HELP ${key} Gauge metric ${key}`);
    lines.push(`# TYPE ${key} gauge`);
    lines.push(`${key} ${value}`);
  }

  return lines.join("\n") + "\n";
}