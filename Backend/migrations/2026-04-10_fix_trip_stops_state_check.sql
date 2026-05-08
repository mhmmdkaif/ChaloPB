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
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'trip_stops'
      AND column_name = 'status'
  ) THEN
    UPDATE trip_stops
    SET state = 'approaching',
        status = 'approaching',
        updated_at = NOW()
    WHERE state = 'entering';
  ELSE
    UPDATE trip_stops
    SET state = 'approaching',
        updated_at = NOW()
    WHERE state = 'entering';
  END IF;
END
$$;

ALTER TABLE trip_stops
ADD CONSTRAINT trip_stops_state_check
CHECK (state IN ('pending', 'approaching', 'arrived', 'departed'));

