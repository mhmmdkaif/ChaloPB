-- Fix trip_stops.state CHECK constraint to match application state machine.
-- Backend/Frontend use: pending -> approaching -> arrived -> departed
-- Earlier migration used 'entering' which breaks updates.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trip_stops_state_check'
  ) THEN
    ALTER TABLE trip_stops DROP CONSTRAINT trip_stops_state_check;
  END IF;
END
$$;

-- Backfill legacy state name if present.
UPDATE trip_stops
SET state = 'approaching',
    status = 'approaching',
    updated_at = NOW()
WHERE state = 'entering';

ALTER TABLE trip_stops
ADD CONSTRAINT trip_stops_state_check
CHECK (state IN ('pending', 'approaching', 'arrived', 'departed'));

