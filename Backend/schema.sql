-- ============================================================
-- ChaloPB Database Schema - Current State
-- Generated: 2026-04-25
-- DO NOT RUN THIS FILE - use migrations/ for schema changes
-- This is a reference snapshot of the current database state
-- ============================================================

-- TABLES (dependency order)
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'driver', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE drivers (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  license_number VARCHAR(64) NOT NULL UNIQUE,
  phone VARCHAR(24) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE routes (
  id BIGSERIAL PRIMARY KEY,
  route_name VARCHAR(120) NOT NULL,
  start_point VARCHAR(120) NOT NULL,
  end_point VARCHAR(120) NOT NULL,
  route_geometry_distance_m INTEGER,
  route_geometry_duration_s INTEGER,
  route_geometry_json JSONB,
  route_geometry_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stops (
  id BIGSERIAL PRIMARY KEY,
  stop_name VARCHAR(120) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE buses (
  id BIGSERIAL PRIMARY KEY,
  bus_number VARCHAR(32) NOT NULL UNIQUE,
  route_id BIGINT REFERENCES routes(id) ON DELETE SET NULL,
  driver_id BIGINT REFERENCES drivers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE route_stops (
  id BIGSERIAL PRIMARY KEY,
  route_id BIGINT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_id BIGINT NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  stop_order INTEGER NOT NULL CHECK (stop_order > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (route_id, stop_id),
  UNIQUE (route_id, stop_order)
);

CREATE TABLE trips (
  id BIGSERIAL PRIMARY KEY,
  bus_id BIGINT NOT NULL REFERENCES buses(id),
  route_id BIGINT NOT NULL REFERENCES routes(id),
  driver_id BIGINT NOT NULL REFERENCES drivers(id),
  status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'completed', 'cancelled', 'scheduled')),
  date DATE,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_dev_data BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT completed_must_have_ended_at
    CHECK (status <> 'completed' OR ended_at IS NOT NULL),
  CONSTRAINT ended_after_started
    CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE trip_stops (
  id BIGSERIAL PRIMARY KEY,
  trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  stop_id BIGINT NOT NULL REFERENCES stops(id),
  stop_order INTEGER NOT NULL CHECK (stop_order > 0),
  state VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'approaching', 'arrived', 'departed')),
  arrived_at TIMESTAMPTZ,
  departed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, stop_id)
);

CREATE TABLE trip_events (
  id BIGSERIAL PRIMARY KEY,
  trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  stop_id BIGINT REFERENCES stops(id),
  event_type VARCHAR(32) NOT NULL
    CHECK (event_type IN ('started', 'approaching', 'arrived', 'departed', 'ended', 'stale_warning')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE live_locations (
  id BIGSERIAL PRIMARY KEY,
  bus_id BIGINT NOT NULL UNIQUE REFERENCES buses(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION NOT NULL DEFAULT 0,
  accuracy DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  device_timestamp TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE token_blocklist (
  id BIGSERIAL PRIMARY KEY,
  jti TEXT NOT NULL UNIQUE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- VIEWS
-- active_trips_live
-- trip_full_timeline
-- trip_reliability_metrics

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_buses_route_id ON buses(route_id);
CREATE INDEX IF NOT EXISTS idx_buses_driver_id ON buses(driver_id);
CREATE INDEX IF NOT EXISTS idx_route_stops_route_order ON route_stops(route_id, stop_order);
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_bus ON trips(bus_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_driver ON trips(driver_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_trips_not_dev_data ON trips(created_at DESC) WHERE is_dev_data = FALSE;
CREATE INDEX IF NOT EXISTS idx_trip_stops_trip_order_state ON trip_stops(trip_id, stop_order, state);
CREATE INDEX IF NOT EXISTS idx_trip_stops_trip_not_departed ON trip_stops(trip_id, stop_order) WHERE state <> 'departed';
CREATE INDEX IF NOT EXISTS idx_trip_events_trip_id ON trip_events(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_events_occurred_trip ON trip_events(occurred_at DESC, trip_id);
CREATE INDEX IF NOT EXISTS idx_live_locations_updated_at ON live_locations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_blocklist_expires_at ON token_blocklist(expires_at);

-- CONSTRAINTS
-- trips.completed_must_have_ended_at
-- trips.ended_after_started
-- trip_stops.state CHECK (pending, approaching, arrived, departed)
-- trip_events.event_type CHECK (started, approaching, arrived, departed, ended, stale_warning)

-- FUNCTIONS
-- archive_old_trip_events(days INTEGER)
-- get_db_stats()
