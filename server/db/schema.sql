-- AirCommand Phase 2 Spatial Database Schema
-- Target Engine: PostgreSQL 15+ with PostGIS extension
-- Embedded Development Mirror: Node 22 SQLite (`DatabaseService.ts`)

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS airports (
  icao VARCHAR(8) PRIMARY KEY,
  iata VARCHAR(4),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  iso_country CHAR(2) NOT NULL,
  category VARCHAR(24) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  elevation_ft INTEGER NOT NULL DEFAULT 0,
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  data_quality VARCHAR(32) NOT NULL DEFAULT 'Imported',
  source VARCHAR(64) NOT NULL DEFAULT 'OurAirports',
  has_osm_geometry BOOLEAN NOT NULL DEFAULT FALSE,
  runway_count INTEGER NOT NULL DEFAULT 0,
  runways_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  frequencies_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  navaids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  geom GEOMETRY(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lon, lat), 4326)) STORED,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_airports_iata ON airports (iata);
CREATE INDEX IF NOT EXISTS idx_airports_country ON airports (iso_country);
CREATE INDEX IF NOT EXISTS idx_airports_category ON airports (category);
CREATE INDEX IF NOT EXISTS idx_airports_geom ON airports USING GIST (geom);

CREATE TABLE IF NOT EXISTS airport_geometries (
  icao VARCHAR(8) PRIMARY KEY REFERENCES airports(icao) ON DELETE CASCADE,
  geojson JSONB NOT NULL,
  data_quality VARCHAR(32) NOT NULL DEFAULT 'Imported',
  edited_by_user BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1,
  boundary_geom GEOMETRY(Geometry, 4326),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_sessions (
  room_code VARCHAR(12) PRIMARY KEY,
  host_player_id VARCHAR(64) NOT NULL,
  airport_icao VARCHAR(8) NOT NULL,
  scenario_id VARCHAR(32) NOT NULL,
  difficulty VARCHAR(24) NOT NULL,
  status VARCHAR(16) NOT NULL,
  state_snapshot_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_scores (
  id SERIAL PRIMARY KEY,
  room_code VARCHAR(12) NOT NULL,
  airport_icao VARCHAR(8) NOT NULL,
  duration_sec DOUBLE PRECISION NOT NULL,
  team_score INTEGER NOT NULL,
  safety_score INTEGER NOT NULL,
  departures_completed INTEGER NOT NULL,
  arrivals_completed INTEGER NOT NULL,
  conflicts INTEGER NOT NULL,
  report_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
