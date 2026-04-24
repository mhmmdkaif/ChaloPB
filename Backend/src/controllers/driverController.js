import pool from "../config/db.js";
import { debugLog } from "../utils/debugLog.js";
import { log, logError } from "../utils/observability.js";
import { getBusState } from '../services/cacheService.js';
import { invalidateActiveTripCache } from "../services/locationTrackingService.js";
import { invalidateTripStopsCache } from "../services/stopStateMachineService.js";

const staleWarningCache = new Map(); // In-memory tracking of when we warned about stale trips

export const assignDriver = async (req, res) => {
  const driver_id = req.body.driver_id != null ? parseInt(req.body.driver_id, 10) : null;
  const bus_id = req.body.bus_id != null ? parseInt(req.body.bus_id, 10) : null;

  if (!driver_id || !bus_id || Number.isNaN(driver_id) || Number.isNaN(bus_id)) {
    return res.status(400).json({ message: "driver_id and bus_id required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const driver = await client.query("SELECT id FROM drivers WHERE id=$1", [driver_id]);
    if (driver.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Driver not found" });
    }

    const alreadyAssigned = await client.query(
      "SELECT id, bus_number FROM buses WHERE driver_id=$1",
      [driver_id]
    );
    if (alreadyAssigned.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: `Driver is already assigned to bus ${alreadyAssigned.rows[0].bus_number}`
      });
    }

    const bus = await client.query("SELECT id, driver_id FROM buses WHERE id=$1", [bus_id]);
    if (bus.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Bus not found" });
    }
    if (bus.rows[0].driver_id) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Bus already has a driver" });
    }

    const activeTrip = await client.query(
      "SELECT id FROM trips WHERE bus_id = $1 AND status = $2",
      [bus_id, "active"]
    );
    if (activeTrip.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Cannot reassign driver during active trip" });
    }

    await client.query("UPDATE buses SET driver_id=$1 WHERE id=$2", [driver_id, bus_id]);
    await client.query("COMMIT");
    res.json({ message: "Driver assigned successfully" });

  } catch (err) {
    await client.query("ROLLBACK");
    logError("assign_driver_failed", err);
    res.status(500).json({ message: "Assignment failed" });
  } finally {
    client.release();
  }
};

export const unassignDriver = async (req, res) => {
  const bus_id = req.body.bus_id != null ? parseInt(req.body.bus_id, 10) : null;
  if (!bus_id || Number.isNaN(bus_id)) {
    return res.status(400).json({ message: 'bus_id required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bus = await client.query(
      'SELECT id, driver_id, bus_number FROM buses WHERE id=$1 FOR UPDATE',
      [bus_id]
    );
    if (bus.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Bus not found' });
    }
    if (!bus.rows[0].driver_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Bus has no driver assigned' });
    }
    const activeTrip = await client.query(
      "SELECT id FROM trips WHERE bus_id=$1 AND status='active' LIMIT 1",
      [bus_id]
    );
    if (activeTrip.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Cannot unassign driver during active trip' });
    }
    await client.query('UPDATE buses SET driver_id=NULL WHERE id=$1', [bus_id]);
    await client.query('COMMIT');
    res.json({ message: 'Driver unassigned successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    logError('unassign_driver_failed', err);
    res.status(500).json({ message: 'Unassignment failed' });
  } finally {
    client.release();
  }
};

export const getMyDriverProfile = async (req, res) => {
  if (req.user.role !== "driver") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const result = await pool.query(`
      SELECT
        drivers.id,
        drivers.license_number,
        drivers.phone,
        users.name,
        users.email
      FROM drivers
      JOIN users ON drivers.user_id = users.id
      WHERE drivers.user_id=$1
    `, [req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Driver profile not found" });
    }
    res.status(200).json(result.rows[0]);

  } catch (err) {
    logError("get_driver_profile_failed", err);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
};

export const getMyAssignedBus = async (req, res) => {
  if (req.user.role !== "driver") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        b.id,
        b.bus_number,
        b.route_id,
        b.driver_id,
        r.route_name
      FROM drivers d
      JOIN buses b ON b.driver_id = d.id
      LEFT JOIN routes r ON r.id = b.route_id
      WHERE d.user_id = $1
      ORDER BY b.id ASC
      LIMIT 1
      `,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({ bus: null });
    }

    return res.status(200).json({ bus: result.rows[0] });
  } catch (err) {
    logError("get_assigned_bus_failed", err);
    return res.status(500).json({ message: "Failed to fetch assigned bus" });
  }
};

export const getMyDashboard = async (req, res) => {
  if (req.user.role !== "driver") {
    return res.status(403).json({ message: "Forbidden" });
  }
  try {
    const result = await pool.query(
      `
        WITH driver AS (
          SELECT id FROM drivers WHERE user_id = $1 LIMIT 1
        ),
        bus AS (
          SELECT b.id, b.bus_number, b.route_id, b.driver_id,
                 r.route_name, r.route_geometry_json
          FROM buses b
          LEFT JOIN routes r ON r.id = b.route_id
          WHERE b.driver_id = (SELECT id FROM driver)
          LIMIT 1
        ),
        active_trip AS (
          SELECT id, bus_id, route_id, driver_id, status, started_at
          FROM trips
          WHERE driver_id = (SELECT id FROM driver)
            AND status = 'active'
          ORDER BY COALESCE(started_at, created_at) DESC
          LIMIT 1
        ),
        stops AS (
          SELECT rs.stop_order, s.id, s.stop_name, s.latitude, s.longitude
          FROM route_stops rs
          JOIN stops s ON s.id = rs.stop_id
          WHERE rs.route_id = (SELECT route_id FROM bus)
          ORDER BY rs.stop_order ASC
        )
        SELECT
          (SELECT row_to_json(bus) FROM bus)               AS bus,
          (SELECT row_to_json(active_trip) FROM active_trip) AS active_trip,
          (SELECT json_agg(stops ORDER BY stop_order) FROM stops) AS route_stops
      `,
      [req.user.id]
    );

    const row = result.rows[0];
    return res.status(200).json({
      bus: row.bus || null,
      active_trip: row.active_trip || null,
      route_stops: row.route_stops || [],
    });
  } catch (err) {
    logError("get_dashboard_failed", err);
    return res.status(500).json({ message: "Failed to load dashboard" });
  }
};

export const startMyTrip = async (req, res) => {
  if (req.user.role !== "driver") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const parseInitialCoords = () => {
    const rawLat = req.body?.latitude;
    const rawLng = req.body?.longitude;
    if (rawLat == null || rawLng == null) return null;

    const latitude = Number(rawLat);
    const longitude = Number(rawLng);
    if (
      Number.isNaN(latitude) ||
      Number.isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null;
    }

    return { latitude, longitude };
  };

  const initialCoords = parseInitialCoords();

  // Optional (non-breaking) enforcement: require a first location fix to start trips.
  const REQUIRE_LOCATION_ON_TRIP_START =
    (process.env.REQUIRE_LOCATION_ON_TRIP_START ?? "false") === "true";

  if (REQUIRE_LOCATION_ON_TRIP_START) {
    if (!initialCoords) {
      log("warn", "trip_start_missing_location", { user_id: req.user?.id });
      return res.status(400).json({ message: "Location is required to start trip" });
    }
  }

  const client = await pool.connect();

  try {
    debugLog({
      runId: "tripLifecycle",
      hypothesisId: "H1",
      location: "driverController.js:startMyTrip:entry",
      message: "startMyTrip called",
      data: { userId: req.user?.id, role: req.user?.role },
    });
    await client.query("BEGIN");

    const result = await client.query(
      `
      WITH driver AS (
        SELECT id
        FROM drivers
        WHERE user_id = $1
        LIMIT 1
      ),
      bus AS (
        SELECT b.id, b.route_id, b.bus_number
        FROM buses b
        WHERE b.driver_id = (SELECT id FROM driver)
        LIMIT 1
        FOR UPDATE
      ),
      existing_driver_trip AS (
        SELECT t.id, t.bus_id, t.route_id, t.driver_id, t.status, t.started_at
        FROM trips t
        WHERE t.driver_id = (SELECT id FROM driver)
          AND t.status = 'active'
        ORDER BY COALESCE(t.started_at, t.created_at) DESC
        LIMIT 1
      ),
      existing_bus_trip AS (
        SELECT t.id, t.bus_id, t.route_id, t.driver_id, t.status, t.started_at
        FROM trips t
        WHERE t.bus_id = (SELECT id FROM bus)
          AND t.status = 'active'
        ORDER BY COALESCE(t.started_at, t.created_at) DESC
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO trips (bus_id, route_id, driver_id, status, date, started_at)
        SELECT b.id, b.route_id, d.id, 'active', CURRENT_DATE, NOW()
        FROM bus b
        JOIN driver d ON true
        WHERE b.route_id IS NOT NULL
          AND (SELECT id FROM existing_driver_trip) IS NULL
          AND (SELECT id FROM existing_bus_trip) IS NULL
        ON CONFLICT DO NOTHING
        RETURNING id, bus_id, route_id, driver_id, status, started_at
      ),
      chosen_driver_trip AS (
        SELECT id, bus_id, route_id, driver_id, status, started_at
        FROM trips
        WHERE driver_id = (SELECT id FROM driver)
          AND status = 'active'
        ORDER BY COALESCE(started_at, created_at) DESC
        LIMIT 1
      ),
      chosen_bus_trip AS (
        SELECT id, bus_id, route_id, driver_id, status, started_at
        FROM trips
        WHERE bus_id = (SELECT id FROM bus)
          AND status = 'active'
        ORDER BY COALESCE(started_at, created_at) DESC
        LIMIT 1
      )
      SELECT
        (SELECT id FROM driver) AS driver_id,
        (SELECT id FROM bus) AS bus_id,
        (SELECT route_id FROM bus) AS route_id,
        (SELECT bus_number FROM bus) AS bus_number,
        (SELECT row_to_json(existing_driver_trip) FROM existing_driver_trip) AS existing_driver_trip,
        (SELECT row_to_json(existing_bus_trip) FROM existing_bus_trip) AS existing_bus_trip,
        (SELECT row_to_json(inserted) FROM inserted) AS inserted_trip,
        (SELECT row_to_json(chosen_driver_trip) FROM chosen_driver_trip) AS chosen_driver_trip,
        (SELECT row_to_json(chosen_bus_trip) FROM chosen_bus_trip) AS chosen_bus_trip
      `,
      [req.user.id]
    );

    const row = result.rows[0] || {};
    const driverId = row.driver_id != null ? Number(row.driver_id) : null;
    const busId = row.bus_id != null ? Number(row.bus_id) : null;
    const routeId = row.route_id != null ? Number(row.route_id) : null;
    const busNumber = row.bus_number ?? null;

    if (!driverId) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Driver profile not found" });
    }
    debugLog({
      runId: "tripLifecycle",
      hypothesisId: "H1",
      location: "driverController.js:startMyTrip:driver",
      message: "driver loaded",
      data: { driverId },
    });

    if (!busId) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "No bus assigned to this driver" });
    }
    debugLog({
      runId: "tripLifecycle",
      hypothesisId: "H1",
      location: "driverController.js:startMyTrip:bus",
      message: "bus loaded",
      data: { busId, routeId },
    });

    if (!routeId) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Assigned bus has no route" });
    }

    if (row.existing_driver_trip) {
      await client.query("COMMIT");
      return res.status(400).json({
        message: "Trip already active for this driver",
        trip: row.existing_driver_trip,
      });
    }

    if (row.existing_bus_trip) {
      debugLog({
        runId: "tripLifecycle",
        hypothesisId: "H2",
        location: "driverController.js:startMyTrip:existingTrip",
        message: "existing active trip found",
        data: { busId, tripId: row.existing_bus_trip?.id != null ? Number(row.existing_bus_trip.id) : null },
      });
      await client.query("COMMIT");
      return res.status(400).json({
        message: "Trip already active for this bus",
        trip: row.existing_bus_trip,
      });
    }

    if (row.inserted_trip) {
      const tripId = Number(row.inserted_trip.id);
      debugLog({
        runId: "tripLifecycle",
        hypothesisId: "H3",
        location: "driverController.js:startMyTrip:inserted",
        message: "trip inserted",
        data: { busId, tripId },
      });

      // FIX-1: Create trip_stops rows for every stop on this route.
      await client.query(
        `INSERT INTO trip_stops (trip_id, stop_id, stop_order, state)
         SELECT $1, rs.stop_id, rs.stop_order, 'pending'
         FROM route_stops rs
         WHERE rs.route_id = $2
         ORDER BY rs.stop_order`,
        [tripId, routeId]
      );

      // Seed first location immediately so admin live map can show marker
      // even before movement-based GPS updates start streaming.
      if (initialCoords) {
        await client.query(
          `INSERT INTO live_locations (bus_id, latitude, longitude, speed, accuracy, device_timestamp)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (bus_id)
           DO UPDATE SET
             latitude = EXCLUDED.latitude,
             longitude = EXCLUDED.longitude,
             speed = EXCLUDED.speed,
             accuracy = EXCLUDED.accuracy,
             device_timestamp = EXCLUDED.device_timestamp,
             updated_at = NOW()`,
          [
            busId,
            initialCoords.latitude,
            initialCoords.longitude,
            0,
            null,
            new Date().toISOString(),
          ]
        );
      }

      await client.query("COMMIT");
      invalidateActiveTripCache(busId);
      invalidateTripStopsCache(tripId);
      // Log trip start event
      const { logTripEvent } = await import("../controllers/tripController.js");
      await logTripEvent(tripId, null, 'started', {
        bus_id: busId,
        route_id: routeId,
        driver_id: driverId
      });
      return res.status(201).json({
        message: "Trip started",
        trip: row.inserted_trip,
        bus: {
          id: busId,
          bus_number: busNumber,
        },
      });
    }

    // Race fallback: ON CONFLICT DO NOTHING (or concurrent insert) but no pre-existing CTE match.
    // Preserve current behavior by returning the active-trip message for either driver or bus.
    if (row.chosen_driver_trip) {
      await client.query("COMMIT");
      return res.status(400).json({
        message: "Trip already active for this driver",
        trip: row.chosen_driver_trip,
      });
    }
    if (row.chosen_bus_trip) {
      await client.query("COMMIT");
      invalidateActiveTripCache(busId);
      return res.status(400).json({
        message: "Trip already active for this bus",
        trip: row.chosen_bus_trip,
      });
    }

    await client.query("ROLLBACK");
    throw new Error("startMyTrip insert did not return a trip");
  } catch (err) {
    await client.query("ROLLBACK");
    logError("start_trip_failed", err);
    debugLog({
      runId: "tripLifecycle",
      hypothesisId: "H5",
      location: "driverController.js:startMyTrip:catch",
      message: "startMyTrip failed",
      data: { errorMessage: err.message, errorCode: err.code },
    });
    return res.status(500).json({ message: "Failed to start trip" });
  } finally {
    client.release();
  }
};

export const stopMyTrip = async (req, res) => {
  if (req.user.role !== "driver") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const client = await pool.connect();

  try {
    debugLog({
      runId: "tripLifecycle",
      hypothesisId: "H6",
      location: "driverController.js:stopMyTrip:entry",
      message: "stopMyTrip called",
      data: { userId: req.user?.id, role: req.user?.role },
    });
    await client.query("BEGIN");

    const driverResult = await client.query(
      "SELECT id FROM drivers WHERE user_id = $1 LIMIT 1",
      [req.user.id]
    );

    if (driverResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Driver profile not found" });
    }

    const driverId = Number(driverResult.rows[0].id);
    debugLog({
      runId: "tripLifecycle",
      hypothesisId: "H6",
      location: "driverController.js:stopMyTrip:driver",
      message: "driver loaded",
      data: { driverId },
    });

    const doneTrip = await client.query(
      `
      WITH target AS (
        SELECT id
        FROM trips
        WHERE driver_id = $1
          AND status = 'active'
        ORDER BY COALESCE(started_at, created_at) DESC
        LIMIT 1
        FOR UPDATE
      )
      UPDATE trips
      SET status = 'completed',
          ended_at = NOW()
      WHERE id IN (SELECT id FROM target)
      RETURNING id, bus_id, route_id, driver_id, status, started_at, ended_at
      `,
      [driverId]
    );

    if (doneTrip.rows.length === 0) {
      await client.query("COMMIT");
      debugLog({
        runId: "tripLifecycle",
        hypothesisId: "H7",
        location: "driverController.js:stopMyTrip:noActive",
        message: "no active trip found",
        data: { driverId },
      });
      return res.status(404).json({ message: "No active trip found" });
    }

    // PHASE0-FIX: Close all open trip_stops when trip ends.
    // Any stop not yet departed is force-departed with server time.
    // This prevents dangling pending rows that corrupt timeline queries.
    await client.query(
      `UPDATE trip_stops
       SET state = 'departed',
           status = 'departed',
           departed_at = COALESCE(departed_at, NOW()),
           updated_at = NOW()
       WHERE trip_id = $1
         AND state <> 'departed'`,
      [doneTrip.rows[0].id]
    );

    // FIX-4: Delete stale live_locations for this bus.
    await client.query(
      "DELETE FROM live_locations WHERE bus_id = $1",
      [doneTrip.rows[0].bus_id]
    );

    await client.query("COMMIT");
    const stoppedTrip = doneTrip.rows[0];
    invalidateActiveTripCache(Number(stoppedTrip.bus_id));
    invalidateTripStopsCache(Number(stoppedTrip.id));
    // Log trip end event
    const { logTripEvent } = await import("../controllers/tripController.js");
    const durationMinutes = Math.round((Date.now() - new Date(stoppedTrip.started_at).getTime()) / 60000);
    await logTripEvent(stoppedTrip.id, null, 'ended', {
      bus_id: stoppedTrip.bus_id,
      duration_minutes: durationMinutes
    });

    debugLog({
      runId: "tripLifecycle",
      hypothesisId: "H8",
      location: "driverController.js:stopMyTrip:completed",
      message: "trip marked completed",
      data: { tripId: doneTrip.rows[0]?.id ?? null, busId: doneTrip.rows[0]?.bus_id ?? null },
    });

    // Emit socket event so all connected clients know this trip ended
    if (global.io && doneTrip.rows[0]) {
      const stopped = doneTrip.rows[0];
      global.io.to(`bus_${Number(stopped.bus_id)}`).emit("trip_stop_update", {
        trip_id: Number(stopped.id),
        bus_id: Number(stopped.bus_id),
        status: "completed",
        stops: undefined,
      });
      global.io.to(`bus_${Number(stopped.bus_id)}`).emit("trip_completed", {
        trip_id: Number(stopped.id),
        bus_id: Number(stopped.bus_id),
        status: "completed",
      });
    }

    return res.status(200).json({
      message: "Trip stopped",
      trip: doneTrip.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("stop_trip_failed", err);
    debugLog({
      runId: "tripLifecycle",
      hypothesisId: "H9",
      location: "driverController.js:stopMyTrip:catch",
      message: "stopMyTrip failed",
      data: { errorMessage: err.message, errorCode: err.code },
    });
    return res.status(500).json({ message: "Failed to stop trip" });
  } finally {
    client.release();
  }
};

export const getMyActiveTrip = async (req, res) => {
  if (req.user.role !== "driver") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const TRIP_STALE_MINUTES = Math.max(
    1,
    parseInt(process.env.TRIP_STALE_MINUTES ?? "2", 10) || 2
  );

  const isLocationStale = (updatedAt, thresholdMinutes = TRIP_STALE_MINUTES) => {
    const t = new Date(updatedAt).getTime();
    if (!Number.isFinite(t)) return true;
    return Date.now() - t > thresholdMinutes * 60 * 1000;
  };

  try {
    const result = await pool.query(
      `
      WITH driver AS (
        SELECT id FROM drivers WHERE user_id = $1 LIMIT 1
      ),
      trip AS (
        SELECT t.id, t.bus_id, t.route_id, t.driver_id, t.status, t.started_at
        FROM trips t
        JOIN drivers d ON d.id = t.driver_id
        WHERE d.user_id = $1
          AND t.status = 'active'
        ORDER BY COALESCE(t.started_at, t.created_at) DESC
        LIMIT 1
      )
      SELECT
        (SELECT id FROM driver) AS driver_id,
        (SELECT row_to_json(trip) FROM trip) AS trip
      `,
      [req.user.id]
    );

    const driverId = result.rows[0]?.driver_id != null ? Number(result.rows[0].driver_id) : null;
    const trip = result.rows[0]?.trip ?? null;

    if (!driverId) {
      return res.status(404).json({ message: "Driver profile not found" });
    }

    if (!trip) {
      debugLog({
        runId: "ghostTrip",
        hypothesisId: "B1",
        location: "driverController.js:getMyActiveTrip:empty",
        message: "No active trip for driver",
        data: { driverId },
      });
      return res.status(200).json({ trip: null });
    }
    const busId = Number(trip.bus_id);

    // Fetch last known location to detect "ghost"/stale trips.
    const memState = getBusState(busId);
    const lastLoc = await pool.query(
      `SELECT updated_at FROM live_locations WHERE bus_id=$1 LIMIT 1`,
      [busId]
    );

    const lastUpdatedAt =
      memState?.payload?.updated_at ??
      lastLoc.rows[0]?.updated_at ??
      null;
    const stale = !lastUpdatedAt || isLocationStale(lastUpdatedAt, TRIP_STALE_MINUTES);

    debugLog({
      runId: "ghostTrip",
      hypothesisId: "B2",
      location: "driverController.js:getMyActiveTrip:check",
      message: "Active trip freshness check",
      data: {
        driverId,
        tripId: Number(trip.id),
        busId,
        lastUpdatedAt,
        stale,
        thresholdMin: TRIP_STALE_MINUTES,
        startedAt: trip.started_at,
      },
    });

    if (stale) {
      // Check if we already warned this trip
      const lastWarningKey = `trip_${trip.id}_stale_warning_at`;
      const lastWarningTime = staleWarningCache.get(lastWarningKey);
      const timeSinceWarning = lastWarningTime ? Date.now() - lastWarningTime : Infinity;

      if (timeSinceWarning > 300000) {
        // 5+ minutes since warning → auto-complete
        await pool.query(
          `UPDATE trips SET status='completed', ended_at=NOW() WHERE id=$1`,
          [trip.id]
        );
        await pool.query(`DELETE FROM live_locations WHERE bus_id=$1`, [busId]);

        invalidateActiveTripCache(busId);
        invalidateTripStopsCache(Number(trip.id));

        // Log auto-completion event
        const { logTripEvent } = await import("../controllers/tripController.js");
        await logTripEvent(trip.id, null, 'ended', {
          bus_id: busId,
          reason: 'auto_completed_stale_no_confirmation'
        });

        // Emit socket event
        if (global.io) {
          global.io.to(`bus_${busId}`).emit("trip_completed", {
            trip_id: Number(trip.id),
            bus_id: busId,
            status: "completed",
            reason: "stale_no_confirmation"
          });
        }

        debugLog({
          runId: "ghostTrip",
          hypothesisId: "B3",
          location: "driverController.js:getMyActiveTrip:invalidate",
          message: "Ghost trip detected and completed",
          data: { driverId, tripId: Number(trip.id), busId, lastUpdatedAt },
        });

        return res.status(200).json({ trip: null, invalidated: true, reason: "auto_completed_after_warning" });
      } else {
        // First warning → emit event, don't complete
        if (global.io) {
          global.io.to(`bus_${busId}`).emit("trip_stale_warning", {
            trip_id: Number(trip.id),
            bus_id: busId,
            message: "Trip inactive for 15 minutes. Still running?",
            auto_complete_in_seconds: 300
          });
        }
        staleWarningCache.set(lastWarningKey, Date.now());

        return res.status(200).json({
          trip,
          warning: "trip_inactive",
          auto_complete_seconds: 300
        });
      }
    }

    debugLog({
      runId: "ghostTrip",
      hypothesisId: "B4",
      location: "driverController.js:getMyActiveTrip:return",
      message: "Returning active trip",
      data: {
        driverId,
        tripId: Number(trip.id),
        busId,
        startedAt: trip.started_at,
        lastUpdatedAt,
      },
    });

    return res.status(200).json({ trip });
  } catch (err) {
    logError("get_active_trip_failed", err);
    debugLog({
      runId: "ghostTrip",
      hypothesisId: "B5",
      location: "driverController.js:getMyActiveTrip:catch",
      message: "getMyActiveTrip failed",
      data: { errorMessage: err.message, errorCode: err.code },
    });
    return res.status(500).json({ message: "Failed to fetch active trip" });
  }
};
