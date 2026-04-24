import pool from "../config/db.js";
import { buildTimelineStops } from "../utils/timeline.js";
import { incCounter, log, logError } from "../utils/observability.js";

export const logTripEvent = async (tripId, stopId, eventType, metadata = {}) => {
  try {
    await pool.query(
      `INSERT INTO trip_events (trip_id, stop_id, event_type, metadata, occurred_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [tripId, stopId, eventType, JSON.stringify(metadata)]
    );
  } catch (err) {
    logError("log_trip_event_failed", err, { trip_id: tripId, event_type: eventType });
    // Don't throw — event logging should never break the main flow
  }
};

const fetchTripHeader = async (tripId) => {
  const result = await pool.query(
    `
    SELECT
      t.id AS trip_id,
      t.bus_id,
      t.route_id,
      t.status,
      b.bus_number,
      r.route_name,
      r.start_point,
      r.end_point,
      u.name AS driver_name
    FROM trips t
    JOIN buses b ON b.id = t.bus_id
    JOIN routes r ON r.id = t.route_id
    LEFT JOIN drivers d ON d.id = t.driver_id
    LEFT JOIN users u ON u.id = d.user_id
    WHERE t.id = $1
    LIMIT 1
    `,
    [tripId]
  );

  return result.rows[0] || null;
};

const fetchStopsForRoute = async (tripId, routeId) => {
  const result = await pool.query(
    `
    SELECT
      rs.stop_order,
      s.id AS stop_id,
      s.stop_name,
      s.latitude,
      s.longitude,
      ts.*
    FROM route_stops rs
    JOIN stops s ON s.id = rs.stop_id
    LEFT JOIN trip_stops ts
      ON ts.trip_id = $1
     AND ts.stop_id = rs.stop_id
    WHERE rs.route_id = $2
    ORDER BY rs.stop_order ASC
    `,
    [tripId, routeId]
  );

  return result.rows;
};

const fetchLiveLocationByBusId = async (busId) => {
  const result = await pool.query(
    `
    SELECT bus_id, latitude, longitude, speed, updated_at
    FROM live_locations
    WHERE bus_id = $1
    LIMIT 1
    `,
    [busId]
  );

  return result.rows[0] || null;
};

const routeLabel = (trip) => trip.route_name || `${trip.start_point} -> ${trip.end_point}`;

export const getTripTimeline = async (req, res) => {
  const { tripId } = req.params;

  if (!tripId || Number.isNaN(Number(tripId))) {
    return res.status(400).json({ message: "Invalid tripId" });
  }

  try {
    const trip = await fetchTripHeader(tripId);
    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const [stopRows, liveLocation] = await Promise.all([
      fetchStopsForRoute(trip.trip_id, trip.route_id),
      fetchLiveLocationByBusId(trip.bus_id),
    ]);

    const stops = buildTimelineStops({
      stopRows,
      liveLocation,
      tripStatus: trip.status,
    });

    return res.status(200).json({
      trip_id: Number(trip.trip_id),
      bus_id: Number(trip.bus_id),
      route_id: Number(trip.route_id),
      bus_number: trip.bus_number,
      route: routeLabel(trip),
      driver: trip.driver_name || "Unknown",
      status: trip.status,
      stops,
    });
  } catch (err) {
    // PHASE6-FIX: Structured error logging for timeline query failures.
    logError("get_trip_timeline_failed", err, { trip_id: Number(tripId) });
    return res.status(500).json({ message: "Failed to fetch trip timeline" });
  }
};

export const emitTripStopUpdateForBus = async (busId, liveLocationOverride = null) => {
  if (!global.io || !busId) return;

  const result = await pool.query(
    `
    SELECT
      t.id AS trip_id,
      t.bus_id,
      t.route_id,
      t.status,
      b.bus_number,
      r.route_name,
      r.start_point,
      r.end_point,
      u.name AS driver_name
    FROM trips t
    JOIN buses b ON b.id = t.bus_id
    JOIN routes r ON r.id = t.route_id
    LEFT JOIN drivers d ON d.id = t.driver_id
    LEFT JOIN users u ON u.id = d.user_id
    WHERE t.bus_id = $1
      AND t.status = 'active'
    ORDER BY COALESCE(t.started_at, t.created_at) DESC
    LIMIT 1
    `,
    [busId]
  );

  const trip = result.rows[0];
  if (!trip) return;

  const stopRows = await fetchStopsForRoute(trip.trip_id, trip.route_id);
  const liveLocation =
    liveLocationOverride || (await fetchLiveLocationByBusId(trip.bus_id));

  const stops = buildTimelineStops({
    stopRows,
    liveLocation,
    tripStatus: trip.status,
  });

  // PHASE3-FIX: Emit trip stop updates to the bus room to keep event ordering local
  const payload = {
    trip_id: Number(trip.trip_id),
    bus_id: Number(trip.bus_id),
    route_id: Number(trip.route_id),
    bus_number: trip.bus_number,
    route: routeLabel(trip),
    driver: trip.driver_name || "Unknown",
    status: trip.status,
    stops,
  };

  // Check if all stops are departed -> trip is complete
  const allDeparted = Array.isArray(stops) && stops.length > 0 &&
    stops.every((s) => s.status === "departed");

  if (allDeparted && trip.status === "active") {
    // Mark trip complete in DB
    await pool.query(
      `UPDATE trips SET status = 'completed', ended_at = NOW() WHERE id = $1`,
      [trip.trip_id]
    );

    incCounter("socket_trip_completed_emitted_total");
    log("info", "socket_trip_completed_emit", {
      bus_id: payload.bus_id,
      trip_id: payload.trip_id,
    });

    // Emit completion event to bus room
    global.io.to(`bus_${Number(trip.bus_id)}`).emit("trip_completed", {
      trip_id: Number(trip.trip_id),
      bus_id: Number(trip.bus_id),
      status: "completed",
    });

    return; // Don't emit trip_stop_update after completion
  }

  // PHASE6-FIX: Track realtime trip stop events for observability.
  incCounter("socket_trip_stop_updates_emitted_total");
  log("info", "socket_trip_stop_emit", {
    bus_id: payload.bus_id,
    trip_id: payload.trip_id,
    stops_count: Array.isArray(stops) ? stops.length : 0,
  });

  global.io.to(`bus_${Number(trip.bus_id)}`).emit("trip_stop_update", payload);
};
