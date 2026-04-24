import pool from "../config/db.js";
import { haversine } from "../utils/eta.js";
import { debugLog } from "../utils/debugLog.js";
import { logError } from "../utils/observability.js";

/* ============================
   SEARCH BUSES BY STOPS
============================ */

export const searchBusesByStops = async (req, res) => {
  const sourceStopId = req.query.source_stop_id ?? req.query.sourceStopId;
  const destinationStopId = req.query.destination_stop_id ?? req.query.destinationStopId;

  debugLog({
    runId: "userSearch",
    hypothesisId: "S1",
    location: "searchController.js:searchBusesByStops:entry",
    message: "search called",
    data: { sourceStopId, destinationStopId, limit: req.query.limit ?? null },
  });

  if (!sourceStopId || !destinationStopId) {
    return res.status(400).json({
      message: "source_stop_id and destination_stop_id are required",
    });
  }

  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

  try {
    const routesResult = await pool.query(
      `
      SELECT DISTINCT
        r.id AS route_id,
        r.route_name
      FROM route_stops rs_source
      JOIN route_stops rs_dest
        ON rs_source.route_id = rs_dest.route_id
      JOIN routes r
        ON r.id = rs_source.route_id
      WHERE rs_source.stop_id = $1
        AND rs_dest.stop_id = $2
        AND rs_source.stop_order < rs_dest.stop_order
      ORDER BY r.route_name ASC
      `,
      [sourceStopId, destinationStopId]
    );

    if (routesResult.rows.length === 0) {
      return res.status(200).json({ routes: [] });
    }

    const sourceStopResult = await pool.query(
      `
      SELECT id, stop_name, latitude, longitude
      FROM stops
      WHERE id = $1
      LIMIT 1
      `,
      [sourceStopId]
    );

    if (sourceStopResult.rows.length === 0) {
      return res.status(404).json({ message: "Source stop not found" });
    }

    const sourceStop = sourceStopResult.rows[0];
    const routeIds = routesResult.rows.map((r) => Number(r.route_id));
    debugLog({
      runId: "userSearch",
      hypothesisId: "S2",
      location: "searchController.js:searchBusesByStops:routes",
      message: "routes matching stops",
      data: { routeCount: routesResult.rows.length, routeIds: routeIds.slice(0, 20) },
    });

    const tripsResult = await pool.query(
      `
      SELECT
        t.id AS trip_id,
        t.bus_id,
        t.route_id,
        t.started_at,
        b.bus_number,
        ll.latitude,
        ll.longitude,
        ll.speed,
        ll.updated_at
      FROM trips t
      JOIN buses b ON b.id = t.bus_id
      LEFT JOIN live_locations ll ON ll.bus_id = t.bus_id
      WHERE t.status = 'active'
        AND t.route_id = ANY($1::int[])
      `,
      [routeIds]
    );
    debugLog({
      runId: "userSearch",
      hypothesisId: "S3",
      location: "searchController.js:searchBusesByStops:trips",
      message: "active trips for routes",
      data: { activeTripRows: tripsResult.rows.length },
    });

    // FIX-8: Fetch destination stop coordinates for ETA-to-destination.
    const destStopResult = await pool.query(
      `SELECT id, stop_name, latitude, longitude FROM stops WHERE id = $1 LIMIT 1`,
      [destinationStopId]
    );
    const destStop = destStopResult.rows[0] || null;

    // FIX-8: Fetch trip_stops for all active trips to compute stops_away.
    const activeTripIds = tripsResult.rows.map((r) => Number(r.trip_id));
    let tripStopsMap = new Map();
    if (activeTripIds.length > 0) {
      const tsResult = await pool.query(
        `SELECT ts.trip_id, ts.stop_id, ts.stop_order, ts.state
         FROM trip_stops ts
         WHERE ts.trip_id = ANY($1::int[])
         ORDER BY ts.stop_order`,
        [activeTripIds]
      );
      for (const r of tsResult.rows) {
        const tid = Number(r.trip_id);
        if (!tripStopsMap.has(tid)) tripStopsMap.set(tid, []);
        tripStopsMap.get(tid).push(r);
      }
    }

    // FIX-8: Build route_stops map for stop-order lookups.
    const routeStopsResult = await pool.query(
      `SELECT rs.route_id, rs.stop_id, rs.stop_order
       FROM route_stops rs
       WHERE rs.route_id = ANY($1::int[])
       ORDER BY rs.stop_order`,
      [routeIds]
    );
    const routeStopsMap = new Map();
    for (const rs of routeStopsResult.rows) {
      const rid = Number(rs.route_id);
      if (!routeStopsMap.has(rid)) routeStopsMap.set(rid, []);
      routeStopsMap.get(rid).push(rs);
    }

    const routeMap = new Map(
      routesResult.rows.map((route) => [
        Number(route.route_id),
        {
          route_id: Number(route.route_id),
          route: route.route_name,
          buses: [],
        },
      ])
    );

    for (const row of tripsResult.rows) {
      const latitude = row.latitude != null ? Number(row.latitude) : null;
      const longitude = row.longitude != null ? Number(row.longitude) : null;
      const speed = row.speed != null ? Number(row.speed) : 0;

      let etaMinutes = null;
      let etaToDest = null;
      if (latitude != null && longitude != null && speed > 0) {
        const distToSource = haversine(
          latitude,
          longitude,
          Number(sourceStop.latitude),
          Number(sourceStop.longitude)
        );
        etaMinutes = Math.max(0, Math.round((distToSource / speed) * 60));

        if (destStop) {
          const distToDest = haversine(
            latitude,
            longitude,
            Number(destStop.latitude),
            Number(destStop.longitude)
          );
          const destMin = Math.max(0, Math.round((distToDest / speed) * 60));
          etaToDest = `${destMin} min`;
        }
      }

      // FIX-8: Compute stops_away from trip_stops state.
      let stopsAway = null;
      const tripId = Number(row.trip_id);
      const routeId = Number(row.route_id);
      const thisRouteStops = routeStopsMap.get(routeId) || [];
      const sourceOrder = thisRouteStops.find((s) => Number(s.stop_id) === Number(sourceStopId));
      const tStops = tripStopsMap.get(tripId) || [];
      if (sourceOrder && tStops.length > 0) {
        const currentStop = tStops.find((s) => s.state !== "departed");
        if (currentStop) {
          stopsAway = Math.max(0, Number(sourceOrder.stop_order) - Number(currentStop.stop_order));
        }
      }

      const bucket = routeMap.get(routeId);
      if (!bucket) continue;

      bucket.buses.push({
        trip_id: tripId,
        bus_id: Number(row.bus_id),
        bus_number: row.bus_number,
        eta_minutes: etaMinutes,
        eta_to_source: etaMinutes == null ? "ETA unavailable" : `${etaMinutes} min`,
        eta_to_destination: etaToDest || "ETA unavailable",
        stops_away: stopsAway,
        started_at: row.started_at,
        location_updated_at: row.updated_at,
      });
    }

    const routes = Array.from(routeMap.values())
      .map((route) => ({
        ...route,
        buses: route.buses
          .sort((a, b) => {
            const aEta = a.eta_minutes == null ? Number.POSITIVE_INFINITY : a.eta_minutes;
            const bEta = b.eta_minutes == null ? Number.POSITIVE_INFINITY : b.eta_minutes;
            if (aEta !== bEta) return aEta - bEta;
            return String(a.bus_number).localeCompare(String(b.bus_number));
          })
          .slice(0, limit),
      }))
      .filter((route) => route.buses.length > 0);

    if (routes.length === 1) {
      return res.status(200).json({
        route: routes[0].route,
        buses: routes[0].buses,
        routes,
      });
    }

    return res.status(200).json({ routes });

  } catch (err) {
    logError("search_buses_failed", err);
    debugLog({
      runId: "userSearch",
      hypothesisId: "S4",
      location: "searchController.js:searchBusesByStops:catch",
      message: "search failed",
      data: { errorMessage: err.message, errorCode: err.code },
    });
    res.status(500).json({ message: "Failed to search buses" });
  }
};
