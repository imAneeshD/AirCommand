import test from "node:test";
import assert from "node:assert/strict";
import {
  triggerAircraftEmergency,
  stepSpontaneousEmergencies,
  EMERGENCY_DEFINITIONS,
} from "../src/engine/emergencyEventsEngine.ts";
import { createScenarioSimulation, stepSimulation } from "../src/engine/simulation.ts";
import { getResolvedAircraftDetails } from "../src/data/aircraftCatalog.ts";

test("Emergency definitions cover Low Fuel, Turbulence, Single Engine, Dual Engine, Bird Strike, Hydraulic, Cabin Pressure, and Medical", () => {
  const types = [
    "LOW_FUEL",
    "TURBULENCE_WINDSHEAR",
    "ENGINE_FAILURE",
    "DUAL_ENGINE_FAILURE",
    "BIRD_STRIKE",
    "HYDRAULIC_FAILURE",
    "CABIN_PRESSURE",
    "MEDICAL",
  ] as const;

  for (const t of types) {
    const def = EMERGENCY_DEFINITIONS[t];
    assert.ok(def, `Definition must exist for emergency type ${t}`);
    assert.ok(def.title.length > 5, `Must have title for ${t}`);
  }
});

test("LOW_FUEL emergency: sets Squawk 7700, MAYDAY message, and emergency operation mode", () => {
  const sim = createScenarioSimulation("NORMAL_OPS", "ALL", "KAST");
  const acId = sim.aircraftOrder.find((id) => sim.aircraft[id]?.flightKind === "ARRIVAL")!;
  const ac = sim.aircraft[acId]!;

  const ok = triggerAircraftEmergency(sim, ac.id, "LOW_FUEL");
  assert.equal(ok, true);
  assert.equal(ac.operationMode, "EMERGENCY_OPERATION");
  assert.equal(ac.emergencyType, "LOW_FUEL");
  assert.equal(ac.squawk, "7700");
  assert.ok(ac.pendingRequest);
  assert.match(ac.pendingRequest.message, /emergency fuel|fuel emergency/i);
  assert.ok(
    ac.fuelRemainingPct !== undefined && ac.fuelRemainingPct <= 10,
    `Low fuel emergency must set critical fuel <= 10%, got ${ac.fuelRemainingPct}%`
  );

  const details = getResolvedAircraftDetails(ac, sim.airport);
  assert.ok(
    details.fuelRemainingPct <= 10,
    `Resolved aircraft details must reflect critical fuel <= 10%, got ${details.fuelRemainingPct}%`
  );
});

test("TURBULENCE_WINDSHEAR emergency on final: triggers immediate go-around and climbs out", () => {
  const sim = createScenarioSimulation("NORMAL_OPS", "ALL", "KAST");
  const acId = sim.aircraftOrder.find((id) => sim.aircraft[id]?.flightKind === "ARRIVAL")!;
  const ac = sim.aircraft[acId]!;
  ac.state = "FINAL";

  const ok = triggerAircraftEmergency(sim, ac.id, "TURBULENCE_WINDSHEAR");
  assert.equal(ok, true);
  assert.equal(ac.operationMode, "EMERGENCY_OPERATION");
  assert.equal(ac.emergencyType, "TURBULENCE_WINDSHEAR");
  assert.equal(ac.state, "GO_AROUND");
  assert.ok(ac.verticalSpeed > 0, "Must be climbing out after windshear go-around");
});

test("DUAL_ENGINE_FAILURE: aircraft becomes a glider with negative vertical descent rate", () => {
  const sim = createScenarioSimulation("NORMAL_OPS", "ALL", "KAST");
  const acId = sim.aircraftOrder.find((id) => sim.aircraft[id]?.flightKind === "ARRIVAL")!;
  const ac = sim.aircraft[acId]!;
  ac.altitude = sim.airport.elevationFt + 5000;

  const ok = triggerAircraftEmergency(sim, ac.id, "DUAL_ENGINE_FAILURE");
  assert.equal(ok, true);
  assert.equal(ac.operationMode, "EMERGENCY_OPERATION");
  assert.equal(ac.emergencyType, "DUAL_ENGINE_FAILURE");
  assert.match(ac.pendingRequest!.message, /all engines flamed out/i);

  // Advance simulation and verify unpowered glider descent
  const initialAlt = ac.altitude;
  for (let i = 0; i < 15; i++) {
    stepSimulation(sim, 1.0);
  }
  assert.ok(ac.altitude < initialAlt, "Unpowered glider must steadily lose altitude");
});

test("CABIN_PRESSURE emergency: commences rapid emergency descent down to safe altitude", () => {
  const sim = createScenarioSimulation("NORMAL_OPS", "ALL", "KAST");
  const acId = sim.aircraftOrder.find((id) => sim.aircraft[id]?.flightKind === "ARRIVAL")!;
  const ac = sim.aircraft[acId]!;
  ac.altitude = sim.airport.elevationFt + 14000;

  const ok = triggerAircraftEmergency(sim, ac.id, "CABIN_PRESSURE");
  assert.equal(ok, true);
  assert.equal(ac.operationMode, "EMERGENCY_OPERATION");
  assert.equal(ac.emergencyType, "CABIN_PRESSURE");

  const initialAlt = ac.altitude;
  for (let i = 0; i < 20; i++) {
    stepSimulation(sim, 1.0);
  }
  assert.ok(ac.altitude < initialAlt - 300, "Must rapidly descend after decompression");
});

test("stepSpontaneousEmergencies: automatically triggers an emergency when cooldown elapses", () => {
  const sim = createScenarioSimulation("NORMAL_OPS", "ALL", "KAST");
  sim.lastEmergencyEventAt = 0;
  sim.time = 500;

  stepSpontaneousEmergencies(sim, 1.0);

  const emergencyAc = sim.aircraftOrder.map((id) => sim.aircraft[id]).find((a) => a?.operationMode === "EMERGENCY_OPERATION");
  assert.ok(emergencyAc, "Should have triggered a spontaneous emergency on an active aircraft");
  assert.notEqual(emergencyAc?.emergencyType, "NONE");
});
