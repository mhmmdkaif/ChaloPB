  -- Extend trip_stops for production geofencing state machine.
-- Safe to run in environments where columns may already exist.

ALTER TABLE trip_stops
ADD COLUMN IF NOT EXISTS state VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS entered_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS departed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trip_stops_state_check'
  ) THEN
    ALTER TABLE trip_stops
    ADD CONSTRAINT trip_stops_state_check
    CHECK (state IN ('pending', 'entering', 'arrived', 'departed'));
  END IF;
END
$$;

-- Keep legacy status column aligned for old consumers where missing.
UPDATE trip_stops
SET state = COALESCE(state, 'pending')
WHERE state IS NULL;

-- Backfill trip_stops rows for active trips missing timeline rows.
INSERT INTO trip_stops (trip_id, stop_id, stop_order, status, state, updated_at)
SELECT
  t.id,
  rs.stop_id,
  rs.stop_order,
  'pending',
  'pending',
  NOW()
FROM trips t
JOIN route_stops rs ON rs.route_id = t.route_id
LEFT JOIN trip_stops ts
  ON ts.trip_id = t.id
 AND ts.stop_id = rs.stop_id
WHERE t.status = 'active'
  AND ts.id IS NULL;

CREATE INDEX IF NOT EXISTS idx_trip_stops_trip_order_state
  ON trip_stops (trip_id, stop_order, state);

CREATE INDEX IF NOT EXISTS idx_trip_stops_trip_not_departed
  ON trip_stops (trip_id, stop_order)
  WHERE state <> 'departed';
