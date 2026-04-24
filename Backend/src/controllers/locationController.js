import pool from "../config/db.js";
import { haversine } from "../utils/eta.js";
import { emitTripStopUpdateForBus } from "./tripController.js";
import { AppError } from "../utils/AppError.js";
import { LOCATION_CONSTANTS } from "../config/constants.js";
import { handleLocationUpdate } from "../services/locationTrackingService.js";
import { getBusState } from "../services/cacheService.js";
import { buildRouteEta, calculateETA } from "../services/etaService.js";
import {
  getAllLiveLocations as getAllLiveLocationsRepo,
  getBusLocation as getBusLocationRepo,
  getRouteStops,
  getStopById,
} from "../repositories/locationRepository.js";
import { logError } from "../utils/observability.js";

// PHASE7-FIX: Controller reduced to orchestration; core logic moved to service/repository layers.
export const updateLocation = async (req, res) => {
  if (req.user.role !== "driver") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const result = await handleLocationUpdate(pool, req.user.id, req.body);

    if (result.discarded) {
      return res.status(200).json(result);
    }

    if (result.stopStateChanged) {
      await emitTripStopUpdateForBus(Number(result.busId), {
        bus_id: Number(result.busId),
        latitude: result.latitude,
        longitude: result.longitude,
        speed: result.speed,
        updated_at: result.saved.updated_at,
      });
    }

    return res.status(200).json({
      ...result.saved,
      reached_stop_ids: result.reachedStopIds,
      next_stop: result.nextStop,
      eta_to_route_end_minutes: result.etaToRouteEndMinutes,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ message: err.message });
    }

    logError("gps_update_failed", err, {
      bus_id: Number(req.body?.bus_id),
      user_id: req.user?.id,
    });
    return res.status(500).json({ message: "Failed to update location" });
  }
};

/* ============================
   GET BUS LOCATION + FULL ROUTE STATE
============================ */

export const getBusLocation = async (req, res) => {
  const { id } = req.params;
  const { stopId } = req.query;

  try {
    let loc = await getBusLocationRepo(pool, id);
    if (!loc) {
      const mem = getBusState(Number(id));
      const payload = mem?.payload;
      if (!payload) return res.status(404).json({ message: "No location yet" });

      const busMeta = await pool.query(
        `SELECT id AS bus_id, bus_number, route_id FROM buses WHERE id = $1 LIMIT 1`,
        [id]
      );
      const meta = busMeta.rows[0];
      if (!meta) return res.status(404).json({ message: "No location yet" });

      loc = {
        ...meta,
        latitude: payload.latitude,
        longitude: payload.longitude,
        speed: payload.speed,
        updated_at: payload.updated_at,
      };
    }

    const lat = Number(loc.latitude);
    const lng = Number(loc.longitude);
    const spd = Number(loc.speed);

    const updatedAt = new Date(loc.updated_at).getTime();
    const ageSeconds = (Date.now() - updatedAt) / 1000;
    const isStale = ageSeconds > LOCATION_CONSTANTS.STALE_THRESHOLD_SECONDS;

    let routeStops = [];
    let reachedStopIds = [];
    let nextStop = null;
    let etaToRouteEndMinutes = null;

    if (loc.route_id) {
      routeStops = await getRouteStops(pool, loc.route_id);

      // Use trip_stops.state as truth instead of geometry recalculation
      const tripStopsRes = await pool.query(
        `SELECT ts.stop_id, ts.state, ts.stop_order
         FROM trip_stops ts
         JOIN trips t ON t.id = ts.trip_id
         WHERE t.bus_id = $1 AND t.status = 'active'
         ORDER BY ts.stop_order ASC`,
        [loc.bus_id]
      );

      reachedStopIds = tripStopsRes.rows
        .filter(r => r.state === 'departed')
        .map(r => r.stop_id);

      const nextRow = tripStopsRes.rows.find(r => r.state !== 'departed');
      if (nextRow) {
        const matchedStop = routeStops.find(s => s.stop_id === nextRow.stop_id);
        if (matchedStop) {
          nextStop = {
            id: matchedStop.stop_id,
            stop_name: matchedStop.stop_name,
            stop_order: matchedStop.stop_order,
            latitude: matchedStop.latitude,
            longitude: matchedStop.longitude,
          };
          const etaSnapshot = buildRouteEta(routeStops, nextStop, lat, lng, spd);
          etaToRouteEndMinutes = etaSnapshot.etaToRouteEndMinutes;
          nextStop = { ...nextStop, eta_minutes: etaSnapshot.etaToNextMinutes };
        }
      }
    }

    let etaMinutes = null;
    let stopInfo = null;
    if (stopId) {
      const stop = await getStopById(pool, stopId);
      if (stop) {
        stopInfo = { id: stop.id, stop_name: stop.stop_name };
        const distance = haversine(lat, lng, Number(stop.latitude), Number(stop.longitude));
        etaMinutes = calculateETA(distance, spd, 0);
      }
    }

    return res.status(200).json({
      bus_id: loc.bus_id,
      bus_number: loc.bus_number,
      route_id: loc.route_id,
      latitude: lat,
      longitude: lng,
      speed: spd,
      updated_at: loc.updated_at,
      is_stale: isStale,
      location_age_seconds: Math.round(ageSeconds),
      eta_minutes: etaMinutes,
      eta_to_stop: stopInfo,
      eta_to_route_end_minutes: etaToRouteEndMinutes,
      reached_stop_ids: reachedStopIds,
      next_stop: nextStop,
      route_stops: routeStops.map((s) => ({
        id: s.stop_id,
        stop_name: s.stop_name,
        stop_order: s.stop_order,
        latitude: s.latitude,
        longitude: s.longitude,
      })),
    });
  } catch (err) {
    logError("get_bus_location_failed", err, { bus_id: Number(id) });
    return res.status(500).json({ message: "Failed to fetch location" });
  }
};

/* ============================
   GET ALL LIVE BUS LOCATIONS (Admin map)
============================ */

export const getAllLiveLocations = async (req, res) => {
  try {
    const now = Date.now();
    const rows = await getAllLiveLocationsRepo(pool);
    return res.status(200).json(
      rows.map((row) => ({
        ...row,
        is_stale:
          (now - new Date(row.updated_at).getTime()) / 1000 >
          LOCATION_CONSTANTS.STALE_THRESHOLD_SECONDS,
      }))
    );
  } catch (err) {
    logError("get_all_live_locations_failed", err, { user_id: req.user?.id });
    return res.status(500).json({ message: "Failed to fetch live locations" });
  }
};
