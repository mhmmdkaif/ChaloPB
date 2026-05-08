import { realtimeBus } from "./realtimeBus.js";

// PHASE7-FIX: Dedicated socket service to isolate emit calls from controllers.

export function emitBusLocation(payload) {
  const busId = Number(payload?.bus_id ?? payload?.busId);
  if (!Number.isFinite(busId)) return;
  realtimeBus.emit("bus:location", {
    busId,
    ...payload,
    bus_id: busId,
  });
}
