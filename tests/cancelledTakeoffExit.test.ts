import test from "node:test";
import assert from "node:assert/strict";
import { createAirportById, runwayPoint } from "../src/data/asteriaAirport.ts";
import { createBaseSimulation, createDepartureAircraft, stepSimulation } from "../src/engine/simulation.ts";
import { submitClearanceDecision, acknowledgeSyncClearance, clearStoppedRunwayEmergency } from "../src/engine/decisionEngine.ts";
import { canAircraftExecuteAction } from "../src/engine/validationEngine.ts";

test("Cancelled/Aborted takeoff: departure aircraft stopped on runway can vacate cleanly via exit taxiway", () => {
  const airport = createAirportById("VOBL");
  const sim = createBaseSimulation("NORMAL_OPS", "TOWER", "VOBL", airport);
  const gateId = airport.gateIds[0];

  const ac = createDepartureAircraft(sim, {
    callsign: "SEJ879",
    spokenCallsign: "SpiceJet 879",
    gateId,
    targetRunway: "09R",
    aircraftType: "B738",
  });

  const rwy = sim.airport.runways["09R"];
  assert.ok(rwy, "09R runway should exist");

  // Place aircraft 0.3 NM down runway on centerline rolling
  const rollPt = runwayPoint(rwy, 0.3, 0);
  ac.x = rollPt.x;
  ac.y = rollPt.y;
  ac.heading = rwy.heading;
  ac.speed = 65;
  ac.state = "TAKEOFF_ROLL";
  ac.holdingAtRunway = "09R"; // Simulate any leftover hold-short property
  ac.holdingShortReason = "DEPARTURE_RUNWAY";

  // Controller issues REJECT_TAKEOFF for rolling aircraft
  const cancelRes = submitClearanceDecision(sim, {
    aircraftId: ac.id,
    controller: "TOWER",
    type: "REJECT_TAKEOFF",
  }, "PLAYER");
  assert.equal(cancelRes.ok, true, `REJECT_TAKEOFF failed: ${cancelRes.reason}`);
  if (cancelRes.clearance) {
    acknowledgeSyncClearance(sim, cancelRes.clearance.id);
  }

  // Step simulation until braking comes to full stop
  for (let i = 0; i < 30 && (ac.state as string) !== "STOPPED_ON_RUNWAY"; i++) {
    stepSimulation(sim, 0.5);
  }

  assert.equal(ac.state, "STOPPED_ON_RUNWAY");
  assert.equal(ac.speed, 0);
  assert.equal(ac.holdingAtRunway, undefined, "holdingAtRunway must be cleared when stopped on runway");
  assert.equal(ac.holdingShortReason, undefined, "holdingShortReason must be cleared when stopped on runway");

  // Departure on runway must be allowed to execute VACATE_RUNWAY
  const vacateVal = canAircraftExecuteAction(ac, "VACATE_RUNWAY", sim);
  assert.equal(vacateVal.allowed, true, `VACATE_RUNWAY should be allowed for departure stopped on runway: ${vacateVal.reason}`);

  // Ground or Tower issues VACATE_RUNWAY via exit
  const vacateRes = submitClearanceDecision(sim, {
    aircraftId: ac.id,
    controller: "GROUND",
    type: "VACATE_RUNWAY",
    parameters: { runway: "09R" },
  }, "PLAYER");
  assert.equal(vacateRes.ok, true, `VACATE_RUNWAY failed: ${vacateRes.reason}`);
  if (vacateRes.clearance) {
    acknowledgeSyncClearance(sim, vacateRes.clearance.id);
  }

  // Advance simulation to let plane vacate off runway
  for (let i = 0; i < 80 && (ac.state as string) !== "HOLDING_SHORT"; i++) {
    stepSimulation(sim, 1.0);
  }

  assert.equal(ac.state, "HOLDING_SHORT", `Expected aircraft to vacate runway to HOLDING_SHORT, got ${ac.state}`);
  assert.notEqual(ac.currentNodeId, undefined, "Aircraft should have reached an exit hold short node");
});

test("Emergency ARFF & Tug clears disabled aircraft safely off runway to hold short point", () => {
  const airport = createAirportById("VOBL");
  const sim = createBaseSimulation("NORMAL_OPS", "GROUND", "VOBL", airport);
  const gateId = airport.gateIds[0];

  const ac = createDepartureAircraft(sim, {
    callsign: "AIC401",
    spokenCallsign: "Air India 401",
    gateId,
    targetRunway: "09R",
    aircraftType: "A320",
  });

  const rwy = sim.airport.runways["09R"];
  const pt = runwayPoint(rwy, 0.5, 0);
  ac.x = pt.x;
  ac.y = pt.y;
  ac.state = "STOPPED_ON_RUNWAY";
  ac.speed = 0;
  ac.operationMode = "EMERGENCY_OPERATION";
  ac.emergencyType = "REJECTED_TAKEOFF_ABORT";
  ac.squawk = "7700";

  const cleared = clearStoppedRunwayEmergency(sim, ac.id);
  assert.equal(cleared, true, "Emergency tug clearance should succeed");
  assert.equal(ac.state, "HOLD_POSITION");
  assert.equal(ac.controller, "GROUND");
  assert.equal(ac.emergencyType, "NONE");
  assert.notEqual(ac.currentNodeId, undefined);
});
