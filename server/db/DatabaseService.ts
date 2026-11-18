import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  AirportCategory,
  AirportDataQuality,
  AirportGeoJsonCollection,
  AirportRecord,
  MultiplayerRoomState,
  SessionPerformanceReport,
} from "../../src/types/atc.ts";

const DATA_DIR = path.resolve("server/data");
const DB_PATH = process.env.AIRCOMMAND_DB_PATH
  ? path.resolve(process.env.AIRCOMMAND_DB_PATH)
  : path.join(DATA_DIR, "aircommand.db");

export interface UserSessionRecord {
  id: string;
  email: string;
  sessionId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  airportIcao: string;
  airportName: string;
  scenario: string;
  role: string;
  departuresCompleted: number;
  arrivalsCompleted: number;
  clearancesIssued: number;
  safetyScore: number;
  conflicts: number;
  clientIp?: string;
  userAgent?: string;
  payloadJson?: string;
  createdAt?: string;
}

export class DatabaseService {
  private db: DatabaseSync;

  constructor(dbFilePath = DB_PATH) {
    fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
    this.db = new DatabaseSync(dbFilePath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS airports (
        icao TEXT PRIMARY KEY,
        iata TEXT,
        name TEXT NOT NULL,
        city TEXT NOT NULL,
        country TEXT NOT NULL,
        iso_country TEXT NOT NULL,
        category TEXT NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        elevation_ft INTEGER NOT NULL DEFAULT 0,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        data_quality TEXT NOT NULL DEFAULT 'Imported',
        source TEXT NOT NULL DEFAULT 'OurAirports',
        has_osm_geometry INTEGER NOT NULL DEFAULT 0,
        runway_count INTEGER NOT NULL DEFAULT 0,
        runways_json TEXT NOT NULL DEFAULT '[]',
        frequencies_json TEXT NOT NULL DEFAULT '[]',
        navaids_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_airports_iata ON airports(iata);
      CREATE INDEX IF NOT EXISTS idx_airports_iso_country ON airports(iso_country);
      CREATE INDEX IF NOT EXISTS idx_airports_category ON airports(category);
      CREATE INDEX IF NOT EXISTS idx_airports_lat_lon ON airports(lat, lon);

      CREATE TABLE IF NOT EXISTS airport_geometries (
        icao TEXT PRIMARY KEY,
        geojson TEXT NOT NULL,
        data_quality TEXT NOT NULL DEFAULT 'Imported',
        edited_by_user INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS room_sessions (
        room_code TEXT PRIMARY KEY,
        host_player_id TEXT NOT NULL,
        airport_icao TEXT NOT NULL,
        scenario_id TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        status TEXT NOT NULL,
        state_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_code TEXT NOT NULL,
        airport_icao TEXT NOT NULL,
        duration_sec REAL NOT NULL,
        team_score INTEGER NOT NULL,
        safety_score INTEGER NOT NULL,
        departures_completed INTEGER NOT NULL,
        arrivals_completed INTEGER NOT NULL,
        conflicts INTEGER NOT NULL,
        report_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        session_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        airport_icao TEXT NOT NULL,
        airport_name TEXT NOT NULL,
        scenario TEXT NOT NULL,
        role TEXT NOT NULL,
        departures_completed INTEGER NOT NULL DEFAULT 0,
        arrivals_completed INTEGER NOT NULL DEFAULT 0,
        clearances_issued INTEGER NOT NULL DEFAULT 0,
        safety_score INTEGER NOT NULL DEFAULT 100,
        conflicts INTEGER NOT NULL DEFAULT 0,
        client_ip TEXT,
        user_agent TEXT,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_user_sessions_email ON user_sessions(email);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_created_at ON user_sessions(created_at);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_airport ON user_sessions(airport_icao);
    `);
  }

  getAirportCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS cnt FROM airports").get() as { cnt: number };
    return row?.cnt ?? 0;
  }

  upsertAirportsBatch(records: AirportRecord[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO airports (
        icao, iata, name, city, country, iso_country, category,
        lat, lon, elevation_ft, timezone, data_quality, source,
        has_osm_geometry, runway_count, runways_json, frequencies_json, navaids_json, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(icao) DO UPDATE SET
        iata = excluded.iata,
        name = excluded.name,
        city = excluded.city,
        country = excluded.country,
        iso_country = excluded.iso_country,
        category = excluded.category,
        lat = excluded.lat,
        lon = excluded.lon,
        elevation_ft = excluded.elevation_ft,
        timezone = excluded.timezone,
        runway_count = excluded.runway_count,
        runways_json = excluded.runways_json,
        frequencies_json = excluded.frequencies_json,
        navaids_json = excluded.navaids_json,
        data_quality = CASE
          WHEN airports.data_quality = 'Manually edited' THEN airports.data_quality
          ELSE excluded.data_quality
        END,
        updated_at = excluded.updated_at
    `);

    const now = new Date().toISOString();
    this.db.exec("BEGIN;");
    try {
      for (const r of records) {
        stmt.run(
          r.icao,
          r.iata ?? null,
          r.name,
          r.city,
          r.country,
          r.isoCountry,
          r.category,
          r.lat,
          r.lon,
          Math.round(r.elevationFt),
          r.timezone,
          r.dataQuality,
          r.source,
          r.hasOsmGeometry ? 1 : 0,
          r.runways.length,
          JSON.stringify(r.runways),
          JSON.stringify(r.frequencies),
          JSON.stringify(r.navaids),
          now
        );
      }
      this.db.exec("COMMIT;");
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  getAirportByIcao(icaoInput: string): AirportRecord | null {
    const icao = icaoInput.trim().toUpperCase();
    const row = this.db.prepare("SELECT * FROM airports WHERE icao = ?").get(icao) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;

    const geomRow = this.db
      .prepare("SELECT geojson, data_quality, edited_by_user, updated_at FROM airport_geometries WHERE icao = ?")
      .get(icao) as { geojson: string; data_quality: string; edited_by_user: number; updated_at: string } | undefined;

    return {
      icao: String(row.icao),
      iata: row.iata ? String(row.iata) : null,
      name: String(row.name),
      city: String(row.city),
      country: String(row.country),
      isoCountry: String(row.iso_country),
      category: String(row.category) as AirportCategory,
      lat: Number(row.lat),
      lon: Number(row.lon),
      elevationFt: Number(row.elevation_ft),
      timezone: String(row.timezone),
      dataQuality: (geomRow?.data_quality ?? row.data_quality) as AirportDataQuality,
      source: String(row.source),
      hasOsmGeometry: Boolean(geomRow) || Boolean(row.has_osm_geometry),
      runwayCount: Number(row.runway_count),
      runways: JSON.parse(String(row.runways_json || "[]")),
      frequencies: JSON.parse(String(row.frequencies_json || "[]")),
      navaids: JSON.parse(String(row.navaids_json || "[]")),
      geoJson: geomRow ? (JSON.parse(geomRow.geojson) as AirportGeoJsonCollection) : null,
      updatedAt: geomRow?.updated_at ?? String(row.updated_at),
    };
  }

  queryAirports(opts: {
    q?: string;
    country?: string;
    category?: string;
    limit?: number;
  }): AirportRecord[] {
    const clauses: string[] = [];
    const args: Array<string | number> = [];

    if (opts.country && opts.country !== "ALL") {
      clauses.push("(UPPER(iso_country) = ? OR UPPER(country) = ?)");
      args.push(opts.country.toUpperCase(), opts.country.toUpperCase());
    }
    if (opts.category && opts.category !== "ALL") {
      clauses.push("UPPER(category) = ?");
      args.push(opts.category.toUpperCase());
    }
    if (opts.q && opts.q.trim().length > 0) {
      let term = opts.q.trim().toUpperCase();
      // Support common legacy lookup VAGO -> Manohar/Goa (VOGA/VOGO)
      if (term === "VAGO") {
        clauses.push("(icao IN ('VOGA', 'VOGO') OR LOWER(name) LIKE '%goa%' OR LOWER(name) LIKE '%manohar%')");
      } else {
        const like = `%${term.toLowerCase()}%`;
        clauses.push(
          "(LOWER(icao) LIKE ? OR LOWER(COALESCE(iata, '')) LIKE ? OR LOWER(name) LIKE ? OR LOWER(city) LIKE ? OR LOWER(country) LIKE ?)"
        );
        args.push(like, like, like, like, like);
      }
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.min(2000, Math.max(1, opts.limit ?? 350));
    args.push(limit);

    const rows = this.db
      .prepare(
        `SELECT * FROM airports ${where}
         ORDER BY
           CASE WHEN iso_country = 'IN' THEN 0 ELSE 1 END ASC,
           CASE WHEN category = 'INTERNATIONAL' THEN 0 WHEN category = 'DOMESTIC' THEN 1 ELSE 2 END ASC,
           runway_count DESC,
           icao ASC
         LIMIT ?`
      )
      .all(...args) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      icao: String(row.icao),
      iata: row.iata ? String(row.iata) : null,
      name: String(row.name),
      city: String(row.city),
      country: String(row.country),
      isoCountry: String(row.iso_country),
      category: String(row.category) as AirportCategory,
      lat: Number(row.lat),
      lon: Number(row.lon),
      elevationFt: Number(row.elevation_ft),
      timezone: String(row.timezone),
      dataQuality: String(row.data_quality) as AirportDataQuality,
      source: String(row.source),
      hasOsmGeometry: Boolean(row.has_osm_geometry),
      runwayCount: Number(row.runway_count),
      runways: JSON.parse(String(row.runways_json || "[]")),
      frequencies: JSON.parse(String(row.frequencies_json || "[]")),
      navaids: JSON.parse(String(row.navaids_json || "[]")),
      updatedAt: String(row.updated_at),
    }));
  }

  saveAirportGeometry(
    icaoInput: string,
    geojson: AirportGeoJsonCollection,
    dataQuality: AirportDataQuality,
    editedByUser: boolean
  ): { version: number; updatedAt: string } {
    const icao = icaoInput.trim().toUpperCase();
    const now = new Date().toISOString();
    const existing = this.db
      .prepare("SELECT version FROM airport_geometries WHERE icao = ?")
      .get(icao) as { version: number } | undefined;
    const version = (existing?.version ?? 0) + 1;

    this.db
      .prepare(
        `INSERT INTO airport_geometries (icao, geojson, data_quality, edited_by_user, version, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(icao) DO UPDATE SET
           geojson = excluded.geojson,
           data_quality = excluded.data_quality,
           edited_by_user = excluded.edited_by_user,
           version = excluded.version,
           updated_at = excluded.updated_at`
      )
      .run(icao, JSON.stringify(geojson), dataQuality, editedByUser ? 1 : 0, version, now);

    this.db
      .prepare("UPDATE airports SET has_osm_geometry = 1, data_quality = ?, updated_at = ? WHERE icao = ?")
      .run(dataQuality, now, icao);

    return { version, updatedAt: now };
  }

  saveRoomSession(room: MultiplayerRoomState): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO room_sessions (room_code, host_player_id, airport_icao, scenario_id, difficulty, status, state_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(room_code) DO UPDATE SET
           status = excluded.status,
           scenario_id = excluded.scenario_id,
           difficulty = excluded.difficulty,
           state_json = excluded.state_json,
           updated_at = excluded.updated_at`
      )
      .run(
        room.roomCode,
        room.hostPlayerId,
        room.airportIcao,
        room.scenarioId,
        room.difficulty,
        room.status,
        JSON.stringify(room),
        new Date(room.createdAtMs).toISOString(),
        now
      );
  }

  saveSessionScore(report: SessionPerformanceReport): void {
    this.db
      .prepare(
        `INSERT INTO session_scores (
           room_code, airport_icao, duration_sec, team_score, safety_score,
           departures_completed, arrivals_completed, conflicts, report_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        report.roomCode,
        report.airportIcao,
        report.durationSeconds,
        report.teamScore,
        report.safetyScore,
        report.departuresCompleted,
        report.arrivalsCompleted,
        report.separationViolations + report.incursions,
        JSON.stringify(report),
        new Date().toISOString()
      );
  }

  saveUserSession(record: UserSessionRecord): void {
    const now = new Date().toISOString();
    const payload = record.payloadJson || JSON.stringify(record);
    this.db
      .prepare(
        `INSERT INTO user_sessions (
           id, email, session_id, started_at, ended_at, duration_seconds,
           airport_icao, airport_name, scenario, role, departures_completed,
           arrivals_completed, clearances_issued, safety_score, conflicts,
           client_ip, user_agent, payload_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           ended_at = excluded.ended_at,
           duration_seconds = excluded.duration_seconds,
           departures_completed = excluded.departures_completed,
           arrivals_completed = excluded.arrivals_completed,
           clearances_issued = excluded.clearances_issued,
           safety_score = excluded.safety_score,
           conflicts = excluded.conflicts,
           payload_json = excluded.payload_json`
      )
      .run(
        record.id,
        record.email,
        record.sessionId,
        record.startedAt,
        record.endedAt,
        record.durationSeconds,
        record.airportIcao,
        record.airportName,
        record.scenario,
        record.role,
        record.departuresCompleted,
        record.arrivalsCompleted,
        record.clearancesIssued,
        record.safetyScore,
        record.conflicts,
        record.clientIp || null,
        record.userAgent || null,
        payload,
        record.createdAt || now
      );
  }

  getAllUserSessions(limit = 2000): UserSessionRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM user_sessions ORDER BY created_at DESC LIMIT ?")
      .all(limit) as any[];
    return rows.map((r) => ({
      id: String(r.id),
      email: String(r.email),
      sessionId: String(r.session_id),
      startedAt: String(r.started_at),
      endedAt: String(r.ended_at),
      durationSeconds: Number(r.duration_seconds || 0),
      airportIcao: String(r.airport_icao),
      airportName: String(r.airport_name),
      scenario: String(r.scenario),
      role: String(r.role),
      departuresCompleted: Number(r.departures_completed || 0),
      arrivalsCompleted: Number(r.arrivals_completed || 0),
      clearancesIssued: Number(r.clearances_issued || 0),
      safetyScore: Number(r.safety_score || 100),
      conflicts: Number(r.conflicts || 0),
      clientIp: r.client_ip ? String(r.client_ip) : undefined,
      userAgent: r.user_agent ? String(r.user_agent) : undefined,
      payloadJson: r.payload_json ? String(r.payload_json) : undefined,
      createdAt: String(r.created_at),
    }));
  }

  getUserSessionStats(): { totalSessions: number; uniqueUsers: number; totalDurationSeconds: number } {
    const row = this.db
      .prepare(
        `SELECT 
           COUNT(*) as totalSessions,
           COUNT(DISTINCT email) as uniqueUsers,
           COALESCE(SUM(duration_seconds), 0) as totalDurationSeconds
         FROM user_sessions`
      )
      .get() as any;
    return {
      totalSessions: Number(row?.totalSessions || 0),
      uniqueUsers: Number(row?.uniqueUsers || 0),
      totalDurationSeconds: Number(row?.totalDurationSeconds || 0),
    };
  }

  close(): void {
    this.db.close();
  }
}
