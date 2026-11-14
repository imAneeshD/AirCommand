import test from "node:test";
import assert from "node:assert/strict";
import {
  AIRPORT_CATALOG,
  createAirportById,
  getSuggestedTaxiRoutes,
} from "../src/data/asteriaAirport.ts";
import {
  createBaseSimulation,
  createScenarioSimulation,
  stepSimulation,
} from "../src/engine/simulation.ts";
import type { AirportId } from "../src/types/atc.ts";
import {
  clearSavedAirportId,
  loadSavedAirportId,
  saveSelectedAirportId,
} from "../src/utils/storage.ts";

function advance(state: ReturnType<typeof createScenarioSimulation>, seconds: number): void {
  const step = 0.2;
  const count = Math.round(seconds / step);
  for (let i = 0; i < count; i++) {
    stepSimulation(state, step);
  }
}

test("Default role in simulation is ALL (ALL AUTO)", () => {
  const base = createBaseSimulation();
  assert.equal(base.config.activePlayerStation, "ALL");
  assert.deepEqual(base.config.stationControl, {
    DELIVERY: "AUTONOMOUS",
    GROUND: "AUTONOMOUS",
    TOWER: "AUTONOMOUS",
    DEPARTURE: "AUTONOMOUS",
    CENTER: "AUTONOMOUS",
  });

  const scen = createScenarioSimulation();
  assert.equal(scen.config.activePlayerStation, "ALL");
});

test("All 4 airports have valid connected taxiway routes between every gate and every runway", () => {
  assert.equal(AIRPORT_CATALOG.length, 4);

  for (const summary of AIRPORT_CATALOG) {
    const ap = createAirportById(summary.id);
    assert.ok(ap.runwayIds.length >= 1);
    assert.ok(ap.gateIds.length >= 7);

    // Every gate can route to every runway
    for (const gateId of ap.gateIds) {
      for (const rwyId of ap.runwayIds) {
        const depRoutes = getSuggestedTaxiRoutes(ap, `GATE_${gateId}`, rwyId, gateId, false);
        assert.ok(
          depRoutes.length > 0,
          `${ap.icao}: No departure taxi route from GATE_${gateId} to RWY ${rwyId}`
        );
      }
    }

    // Every runway exit hold-short can route back to every gate
    for (const rwyId of ap.runwayIds) {
      const rwy = ap.runways[rwyId];
      const exitHs = rwy.holdShortNodeIds.find((id) =>
        id.includes("_E_") || id.includes("_D_") || id.includes("_H_")
      );
      assert.ok(exitHs, `${ap.icao}: Missing exit hold-short for ${rwyId}`);
      for (const gateId of ap.gateIds) {
        const arrRoutes = getSuggestedTaxiRoutes(ap, exitHs!, rwyId, gateId, true);
        assert.ok(
          arrRoutes.length > 0,
          `${ap.icao}: No arrival taxi route from ${exitHs} to GATE_${gateId}`
        );
      }
    }
  }
});

test("Westbound (KMRD), High-Altitude Single-Runway (KVEL), and Angled Midfield Hub (KSOL) run full ALL AUTO operations", () => {
  for (const airportId of ["KMRD", "KVEL", "KSOL"] as AirportId[]) {
    const sim = createScenarioSimulation("SANDBOX", "ALL", airportId);
    sim.config.autoSpawnTraffic = false;
    sim.config.readbackErrorProbability = 0;

    const ual = sim.aircraft["UAL452"];
    const dal = sim.aircraft["DAL814"];
    assert.ok(ual && dal, `${airportId}: Missing UAL452 or DAL814`);

    advance(sim, 400);

    assert.ok(
      ual.state === "CLIMB" ||
        ual.state === "CRUISE_OUTBOUND" ||
        ual.state === "COMPLETED_DEPARTURE",
      `${airportId}: Expected UAL452 airborne/departed, got ${ual.state}`
    );

    assert.ok(
      dal.state === "TAXIING" ||
        dal.state === "CROSSING_RUNWAY" ||
        dal.state === "HOLDING_SHORT" ||
        dal.state === "COMPLETED_ARRIVAL",
      `${airportId}: Expected DAL814 landed/vacating/taxiing, got ${dal.state}`
    );
  }
});

test("localStorage persistence saves, reads, and clears selected airport cleanly", () => {
  const store = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const prevWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { localStorage: mockLocalStorage };

  try {
    assert.equal(loadSavedAirportId(), null);
    saveSelectedAirportId("KSOL");
    assert.equal(loadSavedAirportId(), "KSOL");
    saveSelectedAirportId("KMRD");
    assert.equal(loadSavedAirportId(), "KMRD");
    clearSavedAirportId();
    assert.equal(loadSavedAirportId(), null);
  } finally {
    (globalThis as { window?: unknown }).window = prevWindow;
  }
});
