// PHASE7-FIX: Dedicated socket service to isolate emit calls from controllers.

export function emitBusLocation(payload) {
  if (global.emitBusLocationUpdate) {
    global.emitBusLocationUpdate(payload);
  }
}
