import fs from "node:fs";
import path from "node:path";
import type {
  AirportCategory,
  AirportFrequency,
  AirportNavaid,
  AirportRecord,
  RawRunwayMetadata,
} from "../../src/types/atc.ts";
import { parseCsvLine } from "../services/csvParser.ts";

const RAW_DIR = path.resolve("server/data/raw");
const PUBLIC_SEED_OUT = path.resolve("public/data/worldAirportsSeed.json");
const SEED_OUT = path.resolve("src/data/worldAirportsSeed.json");

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
};

const PRIORITY_INDIA_ICAOS = new Set([
  "VIDP",
  "VABB",
  "VOBL",
  "VOMM",
  "VOHS",
  "VECC",
  "VOCI",
  "VAGO",
  "VOGA",
  "VAAH",
  "VOTV",
  "VIAR",
  "VILK",
  "VEPT",
  "VAJJ",
  "VAPO",
  "VERP",
  "VIDN",
  "VIGR",
  "VISR",
  "VOBZ",
  "VOMD",
  "VANP",
  "VEGT",
  "VABP",
  "VABV",
  "VARK",
  "VOHB",
  "VOML",
  "VOTR",
  "VOCL",
  "VOKN",
  "VAID",
  "VIJP",
  "VEBN",
  "VEBS",
  "VEIM",
  "VEAT",
  "VAUD",
  "VAAU",
  "VASU",
]);

const GLOBAL_HUB_ICAOS = new Set([
  "KJFK", "KLAX", "KORD", "KATL", "KDEN", "KSFO", "KDFW", "KMIA", "KSEA", "KBOS", "KSDF", "KMEM",
  "EGLL", "EGKK", "LFPG", "EDDF", "EHAM", "LEMD", "LIRF", "LSZH", "LTFM",
  "OMDB", "OTHH", "OERK", "OMAA",
  "WSSS", "VTBS", "WMKK", "VHHH", "RCTP", "RJTT", "RJAA", "RKSI", "ZBAA", "ZSPD", "ZGGG",
  "YSSY", "YMML", "NZAA", "CYYZ", "CYVR", "SBGR", "MMMX", "FAOR", "HECA", "VCBI", "VNKT", "VGHS", "VRMM",
]);

function classifyAirportCategory(
  row: Record<string, string>,
  runways: RawRunwayMetadata[]
): AirportCategory {
  const nameLower = (row.name ?? "").toLowerCase();
  const kwLower = (row.keywords ?? "").toLowerCase();
  const type = row.type ?? "";
  const longest = runways.reduce((m, r) => Math.max(m, r.lengthFt || 0), 0);

  if (
    nameLower.includes("air base") ||
    nameLower.includes("air force") ||
    nameLower.includes("naval air") ||
    kwLower.includes("military")
  ) {
    return "MILITARY";
  }
  if (nameLower.includes("cargo") || row.ident === "KSDF" || row.ident === "KMEM") {
    return "CARGO";
  }
  if (
    nameLower.includes("international") ||
    type === "large_airport" ||
    (row.scheduled_service === "yes" && longest >= 9500)
  ) {
    return "INTERNATIONAL";
  }
  if (type === "medium_airport" && row.scheduled_service === "yes") {
    return "DOMESTIC";
  }
  if (type === "medium_airport") {
    return "REGIONAL";
  }
  return "GA";
}

function estimateTimezone(lon: number, isoCountry: string): string {
  if (isoCountry === "IN") return "Asia/Kolkata";
  const offset = Math.round(lon / 15);
  return offset === 0 ? "UTC" : `UTC${offset > 0 ? `+${offset}` : offset}`;
}

function readCsvFile(filePath: string, onRow: (rec: Record<string, string>) => void): void {
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

export function buildCuratedSeedAndReport(): AirportRecord[] {
  const candidates = new Map<string, Record<string, string>>();

  readCsvFile(path.join(RAW_DIR, "airports.csv"), (rec) => {
    const icao = (rec.icao_code || rec.ident || "").toUpperCase();
    if (!icao || icao.length !== 4) return;
    const type = rec.type;
    if (type === "heliport" || type === "seaplane_base" || type === "balloonport" || type === "closed") {
      return;
    }

    const isIndiaScheduledOrLarge =
      rec.iso_country === "IN" &&
      (type === "large_airport" || type === "medium_airport" || PRIORITY_INDIA_ICAOS.has(icao));
    const isPriorityHub = PRIORITY_INDIA_ICAOS.has(icao) || GLOBAL_HUB_ICAOS.has(icao);
    const isMajorIntl = type === "large_airport" && Boolean(rec.iata_code);

    if (isIndiaScheduledOrLarge || isPriorityHub || isMajorIntl) {
      candidates.set(rec.ident, rec);
    }
  });

  const runwaysByIdent = new Map<string, RawRunwayMetadata[]>();
  readCsvFile(path.join(RAW_DIR, "runways.csv"), (rec) => {
    const ident = rec.airport_ident;
    if (!candidates.has(ident)) return;
    if (rec.closed === "1") return;
    const le = rec.le_ident || "";
    const he = rec.he_ident || "";
    if (!le && !he) return;
    const list = runwaysByIdent.get(ident) ?? [];
    list.push({
      id: `${ident}_${le}_${he}`,
      leIdent: le,
      heIdent: he,
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
    runwaysByIdent.set(ident, list);
  });

  const freqsByIdent = new Map<string, AirportFrequency[]>();
  readCsvFile(path.join(RAW_DIR, "airport-frequencies.csv"), (rec) => {
    const ident = rec.airport_ident;
    if (!candidates.has(ident)) return;
    const mhz = Number(rec.frequency_mhz);
    if (!Number.isFinite(mhz) || mhz <= 0) return;
    const list = freqsByIdent.get(ident) ?? [];
    list.push({
      id: rec.id,
      type: rec.type || "TWR",
      description: rec.description || rec.type || "ATC",
      frequencyMhz: mhz,
    });
    freqsByIdent.set(ident, list);
  });

  const navaidsByIdent = new Map<string, AirportNavaid[]>();
  readCsvFile(path.join(RAW_DIR, "navaids.csv"), (rec) => {
    const assoc = rec.associated_airport;
    if (!assoc || !candidates.has(assoc)) return;
    const lat = Number(rec.latitude_deg);
    const lon = Number(rec.longitude_deg);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const list = navaidsByIdent.get(assoc) ?? [];
    list.push({
      ident: rec.ident,
      name: rec.name,
      type: rec.type,
      frequencyKhz: Number(rec.frequency_khz) || 0,
      lat,
      lon,
    });
    navaidsByIdent.set(assoc, list);
  });

  const seedList: AirportRecord[] = [];
  for (const [ident, rec] of candidates.entries()) {
    const runways = runwaysByIdent.get(ident) ?? [];
    // Keep only airports with real runway data, or explicit priority Indian airports (clearly flagged Incomplete if missing)
    const icao = (rec.icao_code || rec.ident).toUpperCase();
    if (runways.length === 0 && !PRIORITY_INDIA_ICAOS.has(icao)) continue;

    const lat = Number(rec.latitude_deg);
    const lon = Number(rec.longitude_deg);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const hasThresholdCoords = runways.some(
      (r) => r.leLat !== undefined && r.leLon !== undefined && r.heLat !== undefined && r.heLon !== undefined
    );

    const dataQuality =
      runways.length > 0 && hasThresholdCoords
        ? "Verified"
        : runways.length > 0
        ? "Imported"
        : "Incomplete";

    const isoCountry = rec.iso_country || "ZZ";
    seedList.push({
      icao,
      iata: rec.iata_code || null,
      name: rec.name,
      city: rec.municipality || COUNTRY_NAMES[isoCountry] || isoCountry,
      country: COUNTRY_NAMES[isoCountry] || isoCountry,
      isoCountry,
      category: classifyAirportCategory(rec, runways),
      lat,
      lon,
      elevationFt: Number(rec.elevation_ft) || 0,
      timezone: estimateTimezone(lon, isoCountry),
      dataQuality,
      source: "OurAirports",
      hasOsmGeometry: false,
      runwayCount: runways.length,
      runways,
      frequencies: (freqsByIdent.get(ident) ?? []).slice(0, 8),
      navaids: (navaidsByIdent.get(ident) ?? []).slice(0, 6),
    });
  }

  // Put India airports first, then sort alphabetically by ICAO
  seedList.sort((a, b) => {
    if (a.isoCountry === "IN" && b.isoCountry !== "IN") return -1;
    if (a.isoCountry !== "IN" && b.isoCountry === "IN") return 1;
    return a.icao.localeCompare(b.icao);
  });

  fs.mkdirSync(path.dirname(PUBLIC_SEED_OUT), { recursive: true });
  fs.writeFileSync(PUBLIC_SEED_OUT, JSON.stringify(seedList));

  const compactOfflineSeed = seedList.filter(
    (a) =>
      a.isoCountry === "IN" ||
      PRIORITY_INDIA_ICAOS.has(a.icao) ||
      GLOBAL_HUB_ICAOS.has(a.icao)
  );
  fs.writeFileSync(SEED_OUT, JSON.stringify(compactOfflineSeed, null, 2));
  console.log(
    `Generated ${seedList.length} verified airports into public/data/worldAirportsSeed.json and ${compactOfflineSeed.length} compact offline hubs into src/data/worldAirportsSeed.json`
  );
  const goa = seedList.filter((a) => a.icao === "VAGO" || a.icao === "VOGA" || a.icao === "VOGO");
  console.log("Goa records in OurAirports:", goa.map((g) => ({ icao: g.icao, iata: g.iata, name: g.name, runways: g.runways.length })));
  return seedList;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  buildCuratedSeedAndReport();
}
