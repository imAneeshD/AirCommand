import fs from "node:fs";
import path from "node:path";
import { DatabaseService } from "../db/DatabaseService.ts";
import { AirportImportService } from "../services/AirportImportService.ts";

const PRIORITY_ICAOS = [
  "VIDP",
  "VABB",
  "VOBL",
  "VOMM",
  "VOHS",
  "VECC",
  "VOCI",
  "VOGA",
  "VOGO",
  "VAAH",
  "OMDB",
  "EGLL",
  "KJFK",
  "WSSS",
];

async function run(): Promise<void> {
  const outDir = path.resolve("public/data/osm");
  fs.mkdirSync(outDir, { recursive: true });

  const db = new DatabaseService();
  const importer = new AirportImportService(db);
  importer.ensureGlobalCatalogLoaded();

  for (const icao of PRIORITY_ICAOS) {
    const outFile = path.join(outDir, `${icao}.geojson`);
    console.log(`[OSM Pack] Fetching real OpenStreetMap aeroway layout for ${icao}...`);
    const res = await importer.fetchAndCacheOsmGeometry(icao, true);
    if (res.geojson && res.geojson.features.length > 0) {
      fs.writeFileSync(outFile, JSON.stringify(res.geojson));
      const twyCount = res.geojson.features.filter((f) => f.properties.aeroway === "taxiway").length;
      const apronCount = res.geojson.features.filter((f) => f.properties.aeroway === "apron").length;
      const gateCount = res.geojson.features.filter(
        (f) => f.properties.aeroway === "gate" || f.properties.aeroway === "parking_position"
      ).length;
      const termCount = res.geojson.features.filter((f) => f.properties.aeroway === "terminal").length;
      console.log(
        `  -> ${icao}: ${res.geojson.features.length} features (${twyCount} taxiways, ${apronCount} aprons, ${termCount} terminals, ${gateCount} stands/gates) [${res.dataQuality}]`
      );
    } else {
      console.warn(`  -> ${icao}: FAILED (${res.error})`);
    }
  }

  db.close();
}

void run();
