-- ============================================================
--  ChaloPB — Supabase Database Schema
--  Project: ChaloPB (wzjtikjkinjikihmszlz)
--  Region:  ap-southeast-2 (Sydney)
--
--  How to use:
--  1. Create a new Supabase project at https://supabase.com
--  2. Go to SQL Editor and paste + run this entire file
--  3. All tables, constraints, and RLS will be set up
-- ============================================================


-- ------------------------------------------------------------
-- 1. USERS
-- ------------------------------------------------------------
CREATE TABLE public.users (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR,
    email       VARCHAR NOT NULL UNIQUE,
    password    TEXT NOT NULL,
    role        VARCHAR NOT NULL DEFAULT 'user'
                    CHECK (role IN ('user', 'driver', 'admin')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 2. DRIVERS
-- ------------------------------------------------------------
CREATE TABLE public.drivers (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES public.users(id),
    license_number VARCHAR,
    phone          VARCHAR
);

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 3. ROUTES
-- ------------------------------------------------------------
CREATE TABLE public.routes (
    id                           SERIAL PRIMARY KEY,
    route_name                   VARCHAR UNIQUE,
    start_point                  VARCHAR,
    end_point                    VARCHAR,
    route_geometry_json          JSONB,
    route_geometry_distance_m    INTEGER,
    route_geometry_duration_s    INTEGER,
    route_geometry_updated_at    TIMESTAMPTZ
);

ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 4. STOPS
-- ------------------------------------------------------------
CREATE TABLE public.stops (
    id         SERIAL PRIMARY KEY,
    stop_name  VARCHAR UNIQUE,
    latitude   NUMERIC,
    longitude  NUMERIC
);

ALTER TABLE public.stops ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 5. BUSES
-- ------------------------------------------------------------
CREATE TABLE public.buses (
    id          SERIAL PRIMARY KEY,
    bus_number  VARCHAR NOT NULL UNIQUE,
    route_id    INTEGER NOT NULL REFERENCES public.routes(id),
    driver_id   INTEGER REFERENCES public.drivers(id)
);

ALTER TABLE public.buses ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 6. LIVE LOCATIONS
-- ------------------------------------------------------------
CREATE TABLE public.live_locations (
    id               SERIAL PRIMARY KEY,
    bus_id           INTEGER NOT NULL UNIQUE REFERENCES public.buses(id),
    latitude         NUMERIC NOT NULL,
    longitude        NUMERIC NOT NULL,
    speed            NUMERIC,
    accuracy         NUMERIC,
    device_timestamp TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.live_locations ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 7. ROUTE STOPS  (ordered stops for each route)
-- ------------------------------------------------------------
CREATE TABLE public.route_stops (
    id          SERIAL PRIMARY KEY,
    route_id    INTEGER NOT NULL REFERENCES public.routes(id),
    stop_id     INTEGER NOT NULL REFERENCES public.stops(id),
    stop_order  INTEGER NOT NULL
);

ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 8. TRIPS
-- ------------------------------------------------------------
CREATE TABLE public.trips (
    id          SERIAL PRIMARY KEY,
    bus_id      INTEGER NOT NULL REFERENCES public.buses(id),
    route_id    INTEGER NOT NULL REFERENCES public.routes(id),
    driver_id   INTEGER NOT NULL REFERENCES public.drivers(id),
    status      VARCHAR NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'active', 'completed')),
    date        DATE NOT NULL,
    started_at  TIMESTAMPTZ,
    ended_at    TIMESTAMPTZ,
    is_dev_data BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 9. TRIP STOPS  (real-time state of each stop within a trip)
-- ------------------------------------------------------------
CREATE TABLE public.trip_stops (
    id          SERIAL PRIMARY KEY,
    trip_id     INTEGER NOT NULL REFERENCES public.trips(id),
    stop_id     INTEGER NOT NULL REFERENCES public.stops(id),
    stop_order  INTEGER NOT NULL,
    state       TEXT NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending', 'approaching', 'arrived', 'departed')),
    arrived_at  TIMESTAMPTZ,
    departed_at TIMESTAMPTZ,
    entered_at  TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_stops ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 10. TRIP EVENTS  (audit log of events during a trip)
-- ------------------------------------------------------------
CREATE TABLE public.trip_events (
    id          BIGSERIAL PRIMARY KEY,
    trip_id     INTEGER NOT NULL REFERENCES public.trips(id),
    stop_id     INTEGER REFERENCES public.stops(id),
    event_type  VARCHAR NOT NULL
                    CHECK (event_type IN ('started', 'approaching', 'arrived', 'departed', 'ended', 'stalled', 'resumed')),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_events ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 11. TOKEN BLOCKLIST  (invalidated JWT tokens)
-- ------------------------------------------------------------
CREATE TABLE public.token_blocklist (
    id          BIGSERIAL PRIMARY KEY,
    jti         TEXT NOT NULL UNIQUE,
    user_id     INTEGER NOT NULL REFERENCES public.users(id),
    blocked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.token_blocklist ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 12. SCHEMA MIGRATIONS  (internal migration tracking)
-- ------------------------------------------------------------
CREATE TABLE public.schema_migrations (
    version     TEXT PRIMARY KEY,
    filename    TEXT NOT NULL,
    checksum    TEXT,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NOTE: RLS is intentionally left disabled on schema_migrations
-- as it is an internal table not accessed by client apps.
-- If you want to lock it down anyway, run:
--   ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;


-- ============================================================
--  END OF SCHEMA
-- ============================================================