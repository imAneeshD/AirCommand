import type { AirportDataQuality, AirportGeoJsonCollection, AirportRecord } from "../../src/types/atc.ts";
import { DatabaseService } from "../db/DatabaseService.ts";
import { AirportImportService } from "./AirportImportService.ts";

export class AirportGeometryService {
  private db: DatabaseService;
  private importer: AirportImportService;

  constructor(db: DatabaseService, importer: AirportImportService) {
    this.db = db;
    this.importer = importer;
  }

  async getOrImportGeometry(
    icao: string,
    fetchOsm = true,
    refresh = false
  ): Promise<{
    airport: AirportRecord | null;
    geojson: AirportGeoJsonCollection | null;
    error: string | null;
  }> {
    const record = this.db.getAirportByIcao(icao);
    if (!record) {
      return { airport: null, geojson: null, error: `Airport ${icao} not found.` };
    }

    if (!refresh && record.geoJson && record.geoJson.features.length > 0) {
      return { airport: record, geojson: record.geoJson, error: null };
    }

    if (!fetchOsm) {
      return { airport: record, geojson: null, error: null };
    }

    const res = await this.importer.fetchAndCacheOsmGeometry(icao, refresh);
    const updated = this.db.getAirportByIcao(icao);
    return {
      airport: updated ?? record,
      geojson: res.geojson,
      error: res.error,
    };
  }

  saveEditedGeometry(
    icao: string,
    geojson: AirportGeoJsonCollection,
    dataQuality: AirportDataQuality = "Manually edited"
  ): { ok: boolean; version?: number; updatedAt?: string; error?: string } {
    const record = this.db.getAirportByIcao(icao);
    if (!record) {
      return { ok: false, error: `Airport ${icao} not found.` };
    }
    if (!geojson || geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
      return { ok: false, error: "Invalid GeoJSON FeatureCollection." };
    }

    const saved = this.db.saveAirportGeometry(icao, geojson, dataQuality, true);
    return { ok: true, version: saved.version, updatedAt: saved.updatedAt };
  }
}
