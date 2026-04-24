import { listDirtyBusStates, clearBusStateDirty, getBusState } from "./cacheService.js";
import { upsertLiveLocation } from "../repositories/locationRepository.js";
import { incCounter, log, logError, setGauge } from "../utils/observability.js";

const USE_BATCH_WRITES = (process.env.USE_BATCH_WRITES ?? "false") === "true";
const BATCH_INTERVAL_MS = Math.max(1000, parseInt(process.env.BATCH_WRITE_INTERVAL_MS ?? "5000", 10) || 5000);
const MAX_BATCH_PER_TICK = Math.max(1, parseInt(process.env.BATCH_WRITE_MAX_PER_TICK ?? "500", 10) || 500);

let timer = null;
let running = false;

export function startBatchLocationWriter(pool) {
  if (!USE_BATCH_WRITES) {
    log("info", "batch_writer_disabled", { interval_ms: BATCH_INTERVAL_MS });
    return { started: false };
  }
  if (timer) return { started: true };

  log("info", "batch_writer_started", { interval_ms: BATCH_INTERVAL_MS, max_per_tick: MAX_BATCH_PER_TICK });
  global.batchWriterRunning = true;

  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const dirty = listDirtyBusStates();
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

      log("info", "batch_writer_tick", { processed, remaining_dirty: listDirtyBusStates().length });
    } finally {
      running = false;
    }
  }, BATCH_INTERVAL_MS);

  return { started: true };
}

export function stopBatchLocationWriter() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  running = false;
  global.batchWriterRunning = false;
  log("info", "batch_writer_stopped", {});
}

