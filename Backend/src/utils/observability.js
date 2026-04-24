// PHASE6-FIX: Lightweight structured logger + in-memory metrics.
const counters = new Map();
const gauges = new Map();
const startTimeMs = Date.now();

function stableStringify(data) {
  try {
    return JSON.stringify(data);
  } catch {
    return JSON.stringify({ serialization_error: true });
  }
}

export function log(level, event, data = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  const line = stableStringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
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