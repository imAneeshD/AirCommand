import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  createScenarioSimulation,
  spawnRandomTraffic,
  stepSimulation,
} from "../src/engine/simulation.ts";
import { convertAirportBundleToLayout } from "../src/utils/osmToAirport.ts";
import type { AirportGeoJsonCollection, AirportRecord } from "../src/types/atc.ts";

test("Traffic Replenishment: departures spawn and balance with arrivals at real international airports (VIDP)", () => {
  const osmPackPath = path.join(process.cwd(), "public", "data", "osm", "VIDP.geojson");
  assert.ok(fs.existsSync(osmPackPath), "VIDP osm geojson must exist");
  const geoJson = JSON.parse(fs.readFileSync(osmPackPath, "utf8")) as AirportGeoJsonCollection;
  const seedAirports = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "worldAirportsSeed.json"), "utf8")
  ) as AirportRecord[];
  const vidpRecord = seedAirports.find((a) => a.icao === "VIDP")!;
  assert.ok(vidpRecord, "VIDP must exist in seed airports");

  const layout = convertAirportBundleToLayout({
    ...vidpRecord,
    dataQuality: "Imported",
    hasOsmGeometry: true,
    geoJson,
  });

  const sim = createScenarioSimulation("NORMAL_OPS", "ALL", "VIDP", layout);
  assert.ok(sim.aircraftOrder.length >= 4, "Initial simulation must have flights");

  // Step simulation for 90 seconds
  for (let s = 0; s < 90; s++) {
    stepSimulation(sim, 1.0);
  }

  const departures = sim.aircraftOrder.filter(
    (id) => sim.aircraft[id]?.flightKind === "DEPARTURE" && sim.aircraft[id]?.state !== "COMPLETED_DEPARTURE"
  );
  const arrivals = sim.aircraftOrder.filter(
    (id) => sim.aircraft[id]?.flightKind === "ARRIVAL" && sim.aircraft[id]?.state !== "COMPLETED_ARRIVAL"
  );

  assert.ok(
    departures.length >= 2,
    `Expected at least 2 active departures, got ${departures.length}`
  );
  assert.ok(
    arrivals.length >= 2,
    `Expected at least 2 active arrivals, got ${arrivals.length}`
  );
});

test("Traffic Replenishment: Live ADS-B sync mode continues auto-replenishing traffic so airport never empties", () => {
  const osmPackPath = path.join(process.cwd(), "public", "data", "osm", "VIDP.geojson");
  const geoJson = JSON.parse(fs.readFileSync(osmPackPath, "utf8")) as AirportGeoJsonCollection;
  const seedAirports = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "worldAirportsSeed.json"), "utf8")
  ) as AirportRecord[];
  const vidpRecord = seedAirports.find((a) => a.icao === "VIDP")!;

  const layout = convertAirportBundleToLayout({
    ...vidpRecord,
    dataQuality: "Imported",
    hasOsmGeometry: true,
    geoJson,
  });

  const sim = createScenarioSimulation("NORMAL_OPS", "ALL", "VIDP", layout);

  // Simulate Live Sync mode active
  sim.liveSnapshotMeta = {
    airportIcao: "VIDP",
    fetchedAtMs: Date.now(),
    convertedCount: 2,
    source: "OpenSky Network (Live ADS-B)",
    lastLivePollAtMs: Date.now(),
    activeLiveCount: 2,
    liveSyncEnabled: true,
    lastSyncStatus: "SYNCED",
  };

  // Step 60 seconds
  for (let s = 0; s < 60; s++) {
    stepSimulation(sim, 1.0);
  }

  const activePlanes = sim.aircraftOrder.filter((id) => {
    const a = sim.aircraft[id];
    return a && a.state !== "COMPLETED_ARRIVAL" && a.state !== "COMPLETED_DEPARTURE";
  });

  assert.ok(
    activePlanes.length >= 6,
    `Live sync mode must continue replenishing traffic (expected >= 6, got ${activePlanes.length})`
  );
});

test("Traffic Replenishment: callsign collision loop advances counter and does not deadlock", () => {
  const sim = createScenarioSimulation("LOW_TRAFFIC", "ALL", "KAST");
  // Set aircraft to take up the next callsign intentionally
  const existingCallsign = "AIC100";
  sim.aircraft[existingCallsign] = {
    ...sim.aircraft[sim.aircraftOrder[0]],
    id: existingCallsign,
    callsign: existingCallsign,
  };
  sim.aircraftOrder.push(existingCallsign);

  // spawnRandomTraffic should not get stuck
  const ac = spawnRandomTraffic(sim, "ARRIVAL");
  if (ac) {
    assert.notEqual(ac.callsign, existingCallsign);
  }
});
