import test from "node:test";
import assert from "node:assert/strict";
import { createScenarioSimulation, stepSimulation, transitionScenarioSimulation } from "../src/engine/simulation.ts";

test("Scenario transition: changing traffic model does NOT restart the simulation, but continues from current state", () => {
  const sim = createScenarioSimulation("LOW_TRAFFIC", "ALL", "KAST");
  
  // Step simulation forward to advance clock and aircraft movement
  for (let i = 0; i < 40; i++) {
    stepSimulation(sim, 1.0);
  }
  
  const originalTime = sim.time;
  assert.ok(originalTime >= 40, "Simulation time advanced past 40 seconds");
  
  const initialPlanesCount = sim.aircraftOrder.length;
  assert.ok(initialPlanesCount > 0, "Simulation has active aircraft");
  
  const firstPlaneId = sim.aircraftOrder[0];
  const originalPlanePos = { x: sim.aircraft[firstPlaneId].x, y: sim.aircraft[firstPlaneId].y };
  
  // Transition model to RUSH_HOUR
  transitionScenarioSimulation(sim, "RUSH_HOUR");
  
  // Verify state is NOT restarted
  assert.equal(sim.time, originalTime, "sim.time MUST NOT reset to 0 upon scenario change");
  assert.equal(sim.scenarioId, "RUSH_HOUR", "scenarioId updated to RUSH_HOUR");
  assert.ok(sim.aircraft[firstPlaneId], "Existing aircraft preserved");
  assert.equal(sim.aircraft[firstPlaneId].x, originalPlanePos.x, "Existing aircraft position preserved");
  assert.equal(sim.aircraft[firstPlaneId].y, originalPlanePos.y, "Existing aircraft position preserved");
  
  // Further step simulation should continue smoothly from current time
  stepSimulation(sim, 2.0);
  assert.ok(
    Math.abs(sim.time - (originalTime + 2.0)) < 0.001,
    "Time seamlessly continues incrementing from where we were"
  );
});

test("Scenario transition: transitioning to EMERGENCY activates emergency without wiping planes or resetting clock", () => {
  const sim = createScenarioSimulation("NORMAL_OPS", "ALL", "KAST");
  
  for (let i = 0; i < 20; i++) {
    stepSimulation(sim, 1.0);
  }
  
  const simTimeBefore = sim.time;
  transitionScenarioSimulation(sim, "EMERGENCY");
  
  assert.equal(sim.time, simTimeBefore, "Clock preserved on emergency scenario transition");
  assert.equal(sim.scenarioId, "EMERGENCY");
  
  const hasEmergency = sim.aircraftOrder.some(
    (id) => sim.aircraft[id]?.operationMode === "EMERGENCY_OPERATION"
  );
  assert.ok(hasEmergency, "Active aircraft transitioned to emergency operation mode");
});
