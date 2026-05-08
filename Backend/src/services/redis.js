import { incCounter, log } from "../utils/observability.js";
import { redisConfig, redisAdapterConfig } from "../config/appConfig.js";

const REDIS_TIMEOUT_MS = Math.max(1000, parseInt(process.env.REDIS_TIMEOUT_MS ?? "3000", 10) || 3000);
const REDIS_MAX_RECONNECT_DELAY_MS = Math.max(1000, parseInt(process.env.REDIS_MAX_RECONNECT_DELAY_MS ?? "30000", 10) || 30000);

let client = null;
let initPromise = null;
let reconnectAttempt = 0;
let reconnectTimer = null;
let redisReady = false;

function normalizeEnvValue(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function getRedisConfig() {
  const url = normalizeEnvValue(redisConfig.url);
  const token = normalizeEnvValue(redisConfig.token);
  return { url, token };
}

function isConfigured() {
  const { url, token } = getRedisConfig();
  return Boolean(url && token);
}

function backoffDelayMs(attempt) {
  const exponential = Math.min(REDIS_MAX_RECONNECT_DELAY_MS, 250 * 2 ** Math.max(0, attempt));
  const jitter = Math.floor(Math.random() * 250);
  return exponential + jitter;
}

function clearReconnectTimer() {
  if (!reconnectTimer) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

class UpstashRestRedisClient {
  constructor(url, token) {
    this.url = url;
    this.token = token;
  }

  async command(command, ...args) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify([command, ...args]),
        signal: controller.signal,
      });

      const payload = await response.json();
      if (!response.ok || payload?.error) {
        throw new Error(payload?.error || `Redis command failed: ${command}`);
      }
      return payload?.result;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function scheduleReconnect() {
  if (!isConfigured() || reconnectTimer) return;
  const delayMs = backoffDelayMs(reconnectAttempt);
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    await initRedis();
  }, delayMs);

  log("warn", "redis_reconnect_scheduled", {
    attempt: reconnectAttempt,
    delay_ms: delayMs,
  });
}

async function pingRedis() {
  if (!client) throw new Error("Redis client unavailable");
  return await client.command("PING");
}

export async function initRedis() {
  const { url, token } = getRedisConfig();

  if (!isConfigured()) {
    redisReady = false;
    client = null;
    log("debug", "redis_disabled", { reason: "missing_upstash_env" });
    return { ready: false, configured: false };
  }

  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!client) {
      client = new UpstashRestRedisClient(url, token);
    }

    try {
      await pingRedis();
      redisReady = true;
      reconnectAttempt = 0;
      clearReconnectTimer();
      log("info", "redis_ready", {});
      return { ready: true, configured: true };
    } catch (err) {
      redisReady = false;
      incCounter("redis_connect_errors_total");
      log("warn", "redis_connect_failed", { message: err?.message });
      scheduleReconnect();
      return { ready: false, configured: true };
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export function getRedisClient() {
  return client;
}

export function isRedisReady() {
  return redisReady;
}

export async function runRedisCommand(command, ...args) {
  if (!client || !isConfigured()) {
    throw new Error("Redis client not initialized");
  }

  try {
    const result = await client.command(command, ...args);
    if (!redisReady) {
      redisReady = true;
      reconnectAttempt = 0;
      clearReconnectTimer();
      log("info", "redis_recovered", {});
    }
    return result;
  } catch (err) {
    redisReady = false;
    incCounter("redis_command_errors_total");
    log("warn", "redis_command_failed", { command, message: err?.message });
    scheduleReconnect();
    throw err;
  }
}

export async function closeRedis() {
  clearReconnectTimer();
  initPromise = null;
  client = null;
  redisReady = false;
  reconnectAttempt = 0;
  log("info", "redis_closed", {});
}
