import { listDirtyBusStates, clearBusStateDirty, getBusState } from "./cacheService.js";
import { upsertLiveLocation } from "../repositories/locationRepository.js";
import { incCounter, log, logError, setGauge } from "../utils/observability.js";
import { batchWriterConfig, featureFlags } from "../config/appConfig.js";

const USE_BATCH_WRITES = featureFlags.useBatchWrites;
const BATCH_INTERVAL_MS = batchWriterConfig.intervalMs;
const MAX_BATCH_PER_TICK = batchWriterConfig.maxPerTick;

let timer = null;
let batchWriterRunning = false;

export function startBatchLocationWriter(pool) {
  if (!USE_BATCH_WRITES) {
    log("debug", "batch_writer_disabled", { interval_ms: BATCH_INTERVAL_MS });
    return { started: false };
  }
  if (timer) return { started: true };

  log("info", "batch_writer_started", { interval_ms: BATCH_INTERVAL_MS, max_per_tick: MAX_BATCH_PER_TICK });

  timer = setInterval(async () => {
    if (batchWriterRunning) return;
    batchWriterRunning = true;
    try {
      const dirty = await listDirtyBusStates();
      setGauge("batch_dirty_bus_states", dirty.length);
      if (dirty.length === 0) return;

      let processed = 0;
      for (const [busId] of dirty) {
        if (processed >= MAX_BATCH_PER_TICK) break;
        const entry = getBusState(busId);
        const payload = entry?.payload;
        if (!payload) {
          clearBusStateDirty(busId);
          continue;
        }

        try {
          await upsertLiveLocation(pool, {
            busId: Number(payload.bus_id),
            latitude: Number(payload.latitude),
            longitude: Number(payload.longitude),
            speed: Number(payload.speed ?? 0),
            accuracy: payload.accuracy ?? null,
            deviceTimestamp: payload.device_timestamp ?? null,
          });
          clearBusStateDirty(busId);
          processed += 1;
          incCounter("batch_location_writes_total");
        } catch (err) {
          // Keep dirty so it retries next tick.
          incCounter("batch_location_write_errors_total");
          logError("batch_location_write_failed", err, { bus_id: Number(busId) });
        }
      }

      const remainingDirty = Math.max(0, dirty.length - processed);
      log("debug", "batch_writer_tick", { processed, remaining_dirty: remainingDirty });
    } finally {
      batchWriterRunning = false;
    }
  }, BATCH_INTERVAL_MS);

  return { started: true };
}

export function stopBatchLocationWriter() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  batchWriterRunning = false;
  log("info", "batch_writer_stopped", {});
}

export function isBatchWriterRunning() {
  return Boolean(timer) || batchWriterRunning;
}

