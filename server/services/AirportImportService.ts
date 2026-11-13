import fs from "node:fs";
import path from "node:path";
import type {
  AirportCategory,
  AirportDataQuality,
  AirportFrequency,
  AirportGeoJsonCollection,
  AirportGeoJsonFeature,
  AirportNavaid,
  AirportRecord,
  RawRunwayMetadata,
} from "../../src/types/atc.ts";
import { DatabaseService } from "../db/DatabaseService.ts";
import { parseCsvLine } from "./csvParser.ts";

const RAW_DIR = path.resolve("server/data/raw");
const PUBLIC_OSM_DIR = path.resolve("public/data/osm");
const PUBLIC_SEED_FILE = path.resolve("public/data/worldAirportsSeed.json");
const SEED_FILE = path.resolve("src/data/worldAirportsSeed.json");

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  members?: Array<{ type: string; ref: number; role: string }>;
  tags?: Record<string, string>;
}

const VALID_POINT_AEROWAYS = new Set([
  "gate",
  "parking_position",
  "holding_position",
  "tower",
  "helipad",
  "navigationaid",
]);

function osmElementsToGeoJson(elements: OsmElement[]): AirportGeoJsonCollection | null {
  const nodeMap = new Map<number, [number, number]>();
  const wayNodeMap = new Map<number, number[]>();

  for (const el of elements) {
    if (el.type === "node" && el.lon !== undefined && el.lat !== undefined) {
      nodeMap.set(el.id, [el.lon, el.lat]);
    } else if (el.type === "way" && el.nodes && el.nodes.length >= 2) {
      wayNodeMap.set(el.id, el.nodes);
    }
  }

  const features: AirportGeoJsonFeature[] = [];
  const seenIds = new Set<string>();

  for (const el of elements) {
    const aeroway = el.tags?.aeroway;
    if (!aeroway) continue;

    if (el.type === "node" && el.lon !== undefined && el.lat !== undefined) {
      if (!VALID_POINT_AEROWAYS.has(aeroway)) continue;
      const fid = `osm_n_${el.id}`;
      if (seenIds.has(fid)) continue;
      seenIds.add(fid);
      features.push({
        type: "Feature",
        id: fid,
        properties: {
          aeroway,
          ref: el.tags?.ref ?? el.tags?.name ?? undefined,
          name: el.tags?.name ?? undefined,
          source: "OpenStreetMap",
        },
        geometry: {
          type: "Point",
          coordinates: [el.lon, el.lat],
        },
      });
      continue;
    }

    if (el.type === "way" && el.nodes && el.nodes.length >= 2) {
      const fid = `osm_w_${el.id}`;
      if (seenIds.has(fid)) continue;
      const ring: Array<[number, number]> = [];
      for (const nid of el.nodes) {
        const pt = nodeMap.get(nid);
        if (pt) ring.push(pt);
      }
      if (ring.length < 2) continue;

      const first = ring[0];
      const last = ring[ring.length - 1];
      const isClosed = ring.length >= 4 && first[0] === last[0] && first[1] === last[1];
      const isArea =
        isClosed &&
        (aeroway === "apron" ||
          aeroway === "terminal" ||
          aeroway === "hangar" ||
          aeroway === "aerodrome" ||
          aeroway === "tower" ||
          el.tags?.area === "yes");

      seenIds.add(fid);
      features.push({
        type: "Feature",
        id: fid,
        properties: {
          aeroway,
          ref: el.tags?.ref ?? undefined,
          name: el.tags?.name ?? undefined,
          surface: el.tags?.surface ?? undefined,
          width: el.tags?.width ?? undefined,
          source: "OpenStreetMap",
        },
        geometry: isArea
          ? { type: "Polygon", coordinates: [ring] }
          : { type: "LineString", coordinates: ring },
      });
      continue;
    }

    if (el.type === "relation" && el.members && el.members.length > 0) {
      const fid = `osm_r_${el.id}`;
      if (seenIds.has(fid)) continue;
      const ringCoords: Array<[number, number]> = [];
      for (const m of el.members) {
        if (m.type !== "way" || (m.role && m.role !== "outer")) continue;
        const wNodes = wayNodeMap.get(m.ref);
        if (!wNodes) continue;
        for (const nid of wNodes) {
          const pt = nodeMap.get(nid);
          if (pt) ringCoords.push(pt);
        }
      }
      if (ringCoords.length >= 4) {
        if (
          ringCoords[0][0] !== ringCoords[ringCoords.length - 1][0] ||
          ringCoords[0][1] !== ringCoords[ringCoords.length - 1][1]
        ) {
          ringCoords.push(ringCoords[0]);
        }
        seenIds.add(fid);
        features.push({
          type: "Feature",
          id: fid,
          properties: {
            aeroway,
            ref: el.tags?.ref ?? undefined,
            name: el.tags?.name ?? undefined,
            source: "OpenStreetMap",
          },
          geometry: { type: "Polygon", coordinates: [ringCoords] },
        });
      }
    }
  }

  return features.length > 0 ? { type: "FeatureCollection", features } : null;
}

const COUNTRY_NAMES: Record<string, string> = {
  IN: "India",
  US: "United States",
  GB: "United Kingdom",
  AE: "United Arab Emirates",
  SG: "Singapore",
  JP: "Japan",
  DE: "Germany",
  FR: "France",
  AU: "Australia",
  CN: "China",
  TH: "Thailand",
  QA: "Qatar",
  SA: "Saudi Arabia",
  NP: "Nepal",
  LK: "Sri Lanka",
  MV: "Maldives",
  BD: "Bangladesh",
  MY: "Malaysia",
  KR: "South Korea",
  CA: "Canada",
  NL: "Netherlands",
  CH: "Switzerland",
  IT: "Italy",
  ES: "Spain",
  TR: "Turkey",
  BR: "Brazil",
  ZA: "South Africa",
  ID: "Indonesia",
  RU: "Russia",
  VN: "Vietnam",
  PH: "Philippines",
  OM: "Oman",
  KW: "Kuwait",
  BH: "Bahrain",
  PK: "Pakistan",
  EG: "Egypt",
  KE: "Kenya",
  NG: "Nigeria",
  MX: "Mexico",
  AR: "Argentina",
  CL: "Chile",
  NZ: "New Zealand",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  AT: "Austria",
  BE: "Belgium",
  PT: "Portugal",
  GR: "Greece",
  PL: "Poland",
  IE: "Ireland",
  IL: "Israel",
  HK: "Hong Kong",
  TW: "Taiwan",
};

function streamCsv(filePath: string, onRow: (rec: Record<string, string>) => void): void {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  if (lines.length === 0) return;
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = parseCsvLine(line);
    const rec: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      rec[headers[j]] = cols[j] ?? "";
    }
    onRow(rec);
  }
}

function classifyCategory(rec: Record<string, string>, runways: RawRunwayMetadata[]): AirportCategory {
  const n = (rec.name ?? "").toLowerCase();
  const k = (rec.keywords ?? "").toLowerCase();
  const longest = runways.reduce((m, r) => Math.max(m, r.lengthFt || 0), 0);

  if (n.includes("air base") || n.includes("air force") || n.includes("naval air") || k.includes("military")) {
    return "MILITARY";
  }
  if (n.includes("cargo") || k.includes("cargo")) {
    return "CARGO";
  }
  if (n.includes("international") || rec.type === "large_airport" || (rec.scheduled_service === "yes" && longest >= 9500)) {
    return "INTERNATIONAL";
  }
  if (rec.type === "medium_airport" && rec.scheduled_service === "yes") {
    return "DOMESTIC";
  }
  if (rec.type === "medium_airport") {
    return "REGIONAL";
  }
  return "GA";
}

function estimateTimezone(lon: number, iso: string): string {
  if (iso === "IN") return "Asia/Kolkata";
  const off = Math.round(lon / 15);
  return off === 0 ? "UTC" : `UTC${off > 0 ? `+${off}` : off}`;
}

export class AirportImportService {
  private db: DatabaseService;
  private osmInflight = new Map<string, Promise<AirportGeoJsonCollection | null>>();

  constructor(db: DatabaseService) {
    this.db = db;
  }

  ensureGlobalCatalogLoaded(): { count: number; source: string } {
    const current = this.db.getAirportCount();
    if (current > 100) {
      return { count: current, source: "sqlite" };
    }

    const airportsCsv = path.join(RAW_DIR, "airports.csv");
    const runwaysCsv = path.join(RAW_DIR, "runways.csv");
    const freqsCsv = path.join(RAW_DIR, "airport-frequencies.csv");
    const navaidsCsv = path.join(RAW_DIR, "navaids.csv");

    if (fs.existsSync(airportsCsv) && fs.existsSync(runwaysCsv)) {
      const selected = new Map<string, Record<string, string>>();
      streamCsv(airportsCsv, (rec) => {
        const type = rec.type;
        if (type !== "large_airport" && type !== "medium_airport" && !(rec.iso_country === "IN" && type === "small_airport")) {
          return;
        }
        const icao = (rec.icao_code || rec.ident || "").toUpperCase();
        if (!/^[A-Z0-9]{4}$/.test(icao)) return;
        selected.set(rec.ident, rec);
      });

      const runwaysByIdent = new Map<string, RawRunwayMetadata[]>();
      streamCsv(runwaysCsv, (rec) => {
        if (!selected.has(rec.airport_ident) || rec.closed === "1") return;
        const list = runwaysByIdent.get(rec.airport_ident) ?? [];
        list.push({
          id: `${rec.airport_ident}_${rec.le_ident}_${rec.he_ident}`,
          leIdent: rec.le_ident || "",
          heIdent: rec.he_ident || "",
          lengthFt: Number(rec.length_ft) || 0,
          widthFt: Number(rec.width_ft) || 148,
          surface: rec.surface || "ASP",
          lighted: rec.lighted === "1",
          closed: rec.closed === "1",
          leLat: rec.le_latitude_deg ? Number(rec.le_latitude_deg) : undefined,
          leLon: rec.le_longitude_deg ? Number(rec.le_longitude_deg) : undefined,
          leHeadingDegT: rec.le_heading_degT ? Number(rec.le_heading_degT) : undefined,
          heLat: rec.he_latitude_deg ? Number(rec.he_latitude_deg) : undefined,
          heLon: rec.he_longitude_deg ? Number(rec.he_longitude_deg) : undefined,
          heHeadingDegT: rec.he_heading_degT ? Number(rec.he_heading_degT) : undefined,
        });
        runwaysByIdent.set(rec.airport_ident, list);
      });

      const freqsByIdent = new Map<string, AirportFrequency[]>();
      if (fs.existsSync(freqsCsv)) {
        streamCsv(freqsCsv, (rec) => {
          if (!selected.has(rec.airport_ident)) return;
          const mhz = Number(rec.frequency_mhz);
          if (!Number.isFinite(mhz) || mhz <= 0) return;
          const list = freqsByIdent.get(rec.airport_ident) ?? [];
          if (list.length < 10) {
            list.push({
              id: rec.id,
              type: rec.type || "TWR",
              description: rec.description || rec.type || "ATC",
              frequencyMhz: mhz,
            });
            freqsByIdent.set(rec.airport_ident, list);
          }
        });
      }

      const navaidsByIdent = new Map<string, AirportNavaid[]>();
      if (fs.existsSync(navaidsCsv)) {
        streamCsv(navaidsCsv, (rec) => {
          const assoc = rec.associated_airport;
          if (!assoc || !selected.has(assoc)) return;
          const lat = Number(rec.latitude_deg);
          const lon = Number(rec.longitude_deg);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
          const list = navaidsByIdent.get(assoc) ?? [];
          if (list.length < 8) {
            list.push({
              ident: rec.ident,
              name: rec.name,
              type: rec.type,
              frequencyKhz: Number(rec.frequency_khz) || 0,
              lat,
              lon,
            });
            navaidsByIdent.set(assoc, list);
          }
        });
      }

      const batch: AirportRecord[] = [];
      for (const [ident, rec] of selected.entries()) {
        const icao = (rec.icao_code || rec.ident).toUpperCase();
        const lat = Number(rec.latitude_deg);
        const lon = Number(rec.longitude_deg);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const runways = runwaysByIdent.get(ident) ?? [];
        if (runways.length === 0 && rec.iso_country !== "IN") continue;

        const hasThresh = runways.some(
          (r) => r.leLat !== undefined && r.leLon !== undefined && r.heLat !== undefined && r.heLon !== undefined
        );
        const dataQuality: AirportDataQuality =
          runways.length > 0 && hasThresh
            ? "Verified"
            : runways.length > 0
            ? "Imported"
            : "Incomplete";

        const iso = rec.iso_country || "ZZ";
        batch.push({
          icao,
          iata: rec.iata_code || null,
          name: rec.name,
          city: rec.municipality || COUNTRY_NAMES[iso] || iso,
          country: COUNTRY_NAMES[iso] || iso,
          isoCountry: iso,
          category: classifyCategory(rec, runways),
          lat,
          lon,
          elevationFt: Number(rec.elevation_ft) || 0,
          timezone: estimateTimezone(lon, iso),
          dataQuality,
          source: "OurAirports",
          hasOsmGeometry: false,
          runwayCount: runways.length,
          runways,
          frequencies: freqsByIdent.get(ident) ?? [],
          navaids: navaidsByIdent.get(ident) ?? [],
        });
      }

      this.db.upsertAirportsBatch(batch);
      return { count: this.db.getAirportCount(), source: "OurAirports-CSV" };
    }

    const fallbackSeed = fs.existsSync(PUBLIC_SEED_FILE)
      ? PUBLIC_SEED_FILE
      : fs.existsSync(SEED_FILE)
      ? SEED_FILE
      : null;

    if (fallbackSeed) {
      const seed = JSON.parse(fs.readFileSync(fallbackSeed, "utf8")) as AirportRecord[];
      this.db.upsertAirportsBatch(seed);
      return { count: this.db.getAirportCount(), source: path.basename(fallbackSeed) };
    }

    return { count: 0, source: "empty" };
  }

  /**
   * Fetches OpenStreetMap aeroway infrastructure via Overpass API and normalizes
   * runways, taxiways, aprons, terminals, gates, holding positions, hangars, tower & boundary
   * into standard GeoJSON FeatureCollection without fabricating missing data.
   */
  async fetchAndCacheOsmGeometry(
    icaoInput: string,
    forceRefresh = false
  ): Promise<{
    geojson: AirportGeoJsonCollection | null;
    dataQuality: AirportDataQuality;
    error: string | null;
  }> {
    const icao = icaoInput.trim().toUpperCase();
    const record = this.db.getAirportByIcao(icao);
    if (!record) {
      return { geojson: null, dataQuality: "Incomplete", error: `Unknown airport ${icao}` };
    }

    if (!forceRefresh && record.geoJson && record.geoJson.features.length > 0) {
      return { geojson: record.geoJson, dataQuality: record.dataQuality, error: null };
    }

    // Check bundled real OSM GeoJSON pack on disk first (instant & offline-safe)
    const packFile = path.join(PUBLIC_OSM_DIR, `${icao}.geojson`);
    if (fs.existsSync(packFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(packFile, "utf8")) as AirportGeoJsonCollection;
        if (parsed && parsed.features && parsed.features.length > 0) {
          const hasTaxiways = parsed.features.some((f) => f.properties.aeroway === "taxiway");
          const hasRunways = parsed.features.some((f) => f.properties.aeroway === "runway") || record.runways.length > 0;
          const quality: AirportDataQuality = hasRunways && hasTaxiways ? "Imported" : "Incomplete";
          this.db.saveAirportGeometry(icao, parsed, quality, false);
          return { geojson: parsed, dataQuality: quality, error: null };
        }
      } catch {
        // Fall through to remote fetch if pack malformed
      }
    }

    let pending = this.osmInflight.get(icao);
    if (!pending) {
      pending = this.queryOsmAndConvert(record);
      this.osmInflight.set(icao, pending);
    }

    try {
      const geojson = await pending;
      if (!geojson) {
        return {
          geojson: null,
          dataQuality: record.runways.length > 0 ? "Incomplete" : "Needs review",
          error: "OpenStreetMap infrastructure unavailable or returned empty geometry.",
        };
      }

      const hasTaxiways = geojson.features.some((f) => f.properties.aeroway === "taxiway");
      const hasRunways = geojson.features.some((f) => f.properties.aeroway === "runway") || record.runways.length > 0;
      const quality: AirportDataQuality =
        hasRunways && hasTaxiways ? "Imported" : "Incomplete";

      this.db.saveAirportGeometry(icao, geojson, quality, false);
      return { geojson, dataQuality: quality, error: null };
    } finally {
      this.osmInflight.delete(icao);
    }
  }

  private async fetchOsm06Box(
    minLon: number,
    minLat: number,
    maxLon: number,
    maxLat: number,
    depth = 0
  ): Promise<OsmElement[]> {
    const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${minLon.toFixed(5)},${minLat.toFixed(5)},${maxLon.toFixed(5)},${maxLat.toFixed(5)}`;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "AirCommand-ATC-Sim/2.0",
        },
        signal: AbortSignal.timeout(12000),
      });

      // If dense city bbox exceeds OSM 50k node cap, subdivide into 2x2 quadrants once
      if (res.status === 400 && depth < 1) {
        const midLon = (minLon + maxLon) / 2;
        const midLat = (minLat + maxLat) / 2;
        const sub = await Promise.all([
          this.fetchOsm06Box(minLon, minLat, midLon, midLat, depth + 1),
          this.fetchOsm06Box(midLon, minLat, maxLon, midLat, depth + 1),
          this.fetchOsm06Box(minLon, midLat, midLon, maxLat, depth + 1),
          this.fetchOsm06Box(midLon, midLat, maxLon, maxLat, depth + 1),
        ]);
        return sub.flat();
      }
      if (!res.ok) return [];
      const text = await res.text();
      if (!text || text.trim().length === 0) return [];
      const json = JSON.parse(text) as { elements?: OsmElement[] };
      return json.elements ?? [];
    } catch {
      return [];
    }
  }

  private async queryOsmAndConvert(record: AirportRecord): Promise<AirportGeoJsonCollection | null> {
    // Compute exact airport footprint from runway thresholds when available
    let minLat = record.lat - 0.022;
    let maxLat = record.lat + 0.022;
    let minLon = record.lon - 0.032;
    let maxLon = record.lon + 0.032;
    for (const r of record.runways) {
      if (r.leLat !== undefined && r.leLon !== undefined && r.heLat !== undefined && r.heLon !== undefined) {
        minLat = Math.min(minLat, r.leLat - 0.012, r.heLat - 0.012);
        maxLat = Math.max(maxLat, r.leLat + 0.012, r.heLat + 0.012);
        minLon = Math.min(minLon, r.leLon - 0.014, r.heLon - 0.014);
        maxLon = Math.max(maxLon, r.leLon + 0.014, r.heLon + 0.014);
      }
    }

    // 1. Try fast Overpass mirrors briefly first
    const query = `[out:json][timeout:10];
(
  node["aeroway"](around:4200,${record.lat},${record.lon});
  way["aeroway"](around:4200,${record.lat},${record.lon});
  relation["aeroway"="terminal"](around:4200,${record.lat},${record.lon});
);
out body;
>;
out skel qt;`;

    for (const ep of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]) {
      try {
        const res = await fetch(ep, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            "User-Agent": "AirCommand-ATC-Sim/2.0",
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(6500),
        });
        if (!res.ok) continue;
        const text = await res.text();
        if (!text || text.trim().length === 0) continue;
        const payload = JSON.parse(text) as { elements?: OsmElement[] };
        const converted = osmElementsToGeoJson(payload.elements ?? []);
        if (converted) return converted;
      } catch {
        // Fallback to OSM 0.6 tiled API
      }
    }

    // 2. Reliable OpenStreetMap 0.6 Vector Map API tiled cleanly over the airport bounding box
    const cols = 3;
    const rows = 2;
    const dLon = (maxLon - minLon) / cols;
    const dLat = (maxLat - minLat) / rows;
    const tilePromises: Promise<OsmElement[]>[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        tilePromises.push(
          this.fetchOsm06Box(
            minLon + c * dLon,
            minLat + r * dLat,
            minLon + (c + 1) * dLon,
            minLat + (r + 1) * dLat
          )
        );
      }
    }

    const tileArrays = await Promise.all(tilePromises);
    const merged = tileArrays.flat();
    if (merged.length === 0) return null;
    return osmElementsToGeoJson(merged);
  }
}
