// PHASE7-FIX: Repository layer for location-domain SQL access.

export async function findBusOwnership(pool, busId, userId) {
  const result = await pool.query(
    `SELECT b.id AS bus_id, b.route_id, b.driver_id
     FROM buses b
     JOIN drivers d ON d.id = b.driver_id
     WHERE b.id = $1
       AND d.user_id = $2`,
    [busId, userId]
  );
  return result.rows[0] || null;
}

export async function getLastLocationByBusId(pool, busId) {
  const result = await pool.query(
    `SELECT latitude, longitude, updated_at FROM live_locations WHERE bus_id=$1`,
    [busId]
  );
  return result.rows[0] || null;
}

export async function upsertLiveLocation(pool, params) {
  const { busId, latitude, longitude, speed, accuracy, deviceTimestamp } = params;
  const result = await pool.query(
    `INSERT INTO live_locations (bus_id, latitude, longitude, speed, accuracy, device_timestamp)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (bus_id)
     DO UPDATE SET latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude,
       speed=EXCLUDED.speed, accuracy=EXCLUDED.accuracy, device_timestamp=EXCLUDED.device_timestamp,
       updated_at=NOW()
     RETURNING bus_id, latitude, longitude, speed, updated_at`,
    [busId, latitude, longitude, speed, accuracy, deviceTimestamp]
  );
  return result.rows[0];
}

export async function findActiveTripByBus(pool, busId) {
  const result = await pool.query(
    `SELECT id, bus_id, route_id
     FROM trips
     WHERE bus_id = $1 AND status = 'active'
     ORDER BY COALESCE(started_at, created_at) DESC
     LIMIT 1`,
    [busId]
  );
  return result.rows[0] || null;
}

export async function getRouteStops(pool, routeId) {
  const result = await pool.query(
    `SELECT rs.stop_order, rs.stop_id, s.stop_name, s.latitude, s.longitude
     FROM route_stops rs
     JOIN stops s ON rs.stop_id = s.id
     WHERE rs.route_id = $1
     ORDER BY rs.stop_order ASC`,
    [routeId]
  );
  return result.rows;
}

export async function getTripStopsWithCoordinates(pool, tripId) {
  const result = await pool.query(
    `SELECT
       ts.id,
       ts.trip_id,
       ts.stop_id,
       ts.stop_order,
       ts.state,
       s.latitude,
       s.longitude,
       s.stop_name
     FROM trip_stops ts
     JOIN stops s ON ts.stop_id = s.id
     WHERE ts.trip_id = $1
     ORDER BY ts.stop_order ASC`,
    [tripId]
  );
  return result.rows;
}

export async function batchDepartTripStops(client, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  await client.query(
    `UPDATE trip_stops
     SET state = 'departed',
         departed_at = COALESCE(departed_at, NOW()),
         updated_at = NOW()
     WHERE id = ANY($1::int[])`,
    [ids]
  );
}

export async function updateTripStopState(client, id, state) {
  await client.query(
    `UPDATE trip_stops
     SET state = $1, status = $1,
         updated_at = NOW(),
         arrived_at = CASE WHEN $1 = 'arrived' THEN COALESCE(arrived_at, NOW()) ELSE arrived_at END,
         departed_at = CASE WHEN $1 = 'departed' THEN COALESCE(departed_at, NOW()) ELSE departed_at END
     WHERE id = $2`,
    [state, id]
  );
}

export async function getBusLocation(pool, busId) {
  const result = await pool.query(
    `SELECT ll.bus_id, ll.latitude, ll.longitude, ll.speed, ll.updated_at,
            b.route_id, b.bus_number
     FROM live_locations ll
     JOIN buses b ON ll.bus_id = b.id
     WHERE ll.bus_id=$1`,
    [busId]
  );
  return result.rows[0] || null;
}

export async function getStopById(pool, stopId) {
  const result = await pool.query(
    "SELECT id, stop_name, latitude, longitude FROM stops WHERE id=$1",
    [stopId]
  );
  return result.rows[0] || null;
}

export async function getAllLiveLocations(pool) {
  const result = await pool.query(
    `SELECT ll.bus_id, ll.latitude, ll.longitude, ll.speed, ll.updated_at,
            b.bus_number, b.route_id, r.route_name,
            u.name AS driver_name
     FROM live_locations ll
     JOIN buses b ON ll.bus_id = b.id
     LEFT JOIN routes r ON b.route_id = r.id
     LEFT JOIN drivers d ON b.driver_id = d.id
     LEFT JOIN users u ON d.user_id = u.id
     ORDER BY ll.updated_at DESC`
  );
  return result.rows;
}
