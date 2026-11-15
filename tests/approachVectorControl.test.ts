import test from "node:test";
import assert from "node:assert/strict";
import { createBaseSimulation, createArrivalAircraft, stepSimulation } from "../src/engine/simulation.ts";
import { submitClearanceDecision, acknowledgeSyncClearance } from "../src/engine/decisionEngine.ts";
import { computeDepAppGuidance } from "../src/utils/depAppGuidance.ts";
import { runwayPoint } from "../src/data/asteriaAirport.ts";

test("Approach Vector Control: Aircraft on short final (< 4 NM out) tracks runway forward, never backwards", () => {
  const sim = createBaseSimulation("NORMAL_OPS", "ALL", "KAST");
  const kast = sim.airport;
  const rwy09R = kast.runways["09R"];

  // Position aircraft 3.0 NM out on 09R final approach at 1500 ft
  const pt = runwayPoint(rwy09R, -3.0, 0.05);
  const ac = createArrivalAircraft(sim, {
    callsign: "UAE333",
    spokenCallsign: "Emirates 333",
    airline: "Emirates",
    aircraftType: "B77W",
    x: pt.x,
    y: pt.y,
    heading: 90,
    altitude: kast.elevationFt + 1000,
    speed: 160,
    targetRunway: "09R",
    state: "APPROACH",
    controller: "DEPARTURE",
  });

  const guidance = computeDepAppGuidance(kast, ac, "09R");
  assert.equal(guidance.needsPatternTurn, false, "Inbound arrival must not trigger backwards pattern turn");
  // Recommended heading should point generally forward (roughly east ~90 deg), not backwards west (~270 deg)
  const hdgDiff = Math.abs(guidance.recommendedHeading - 90);
  assert.ok(hdgDiff < 45, `Recommended heading ${guidance.recommendedHeading} must align with runway 090, not turn around backwards`);
});

test("Approach Vector Control: ATC heading command breaks aircraft off FINAL approach immediately", () => {
  const sim = createBaseSimulation("NORMAL_OPS", "ALL", "KAST");
  const kast = sim.airport;
  const rwy09R = kast.runways["09R"];

  const pt = runwayPoint(rwy09R, -2.5, 0);
  const ac = createArrivalAircraft(sim, {
    callsign: "DLH222",
    spokenCallsign: "Lufthansa 222",
    airline: "Lufthansa",
    aircraftType: "A359",
    x: pt.x,
    y: pt.y,
    heading: 90,
    altitude: kast.elevationFt + 800,
    speed: 150,
    targetRunway: "09R",
    assignedApproach: "09R",
    state: "FINAL",
    controller: "TOWER",
  });

  // Controller issues breakout heading 180 (turn right heading 180)
  const res = submitClearanceDecision(sim, {
    aircraftId: ac.id,
    controller: "TOWER",
    type: "HEADING",
    parameters: { heading: 180, turnDirection: "RIGHT" },
  }, "PLAYER");
  assert.equal(res.ok, true, `Clearance must be accepted: ${res.reason}`);
  if (res.clearance?.id) {
    acknowledgeSyncClearance(sim, res.clearance.id);
  }

  assert.equal(ac.state, "APPROACH", "Aircraft must break off FINAL into APPROACH state upon receiving vector");
  assert.equal(ac.assignedHeading, 180, "Aircraft must register assigned heading");

  // Step simulation - heading must start turning towards 180 (increasing above 90)
  stepSimulation(sim, 1.0);
  assert.ok(ac.heading > 90, `Aircraft heading (${ac.heading}) must turn towards 180, not stay locked on runway`);
});

test("Approach Vector Control: ATC altitude climb breaks aircraft off glideslope descent", () => {
  const sim = createBaseSimulation("NORMAL_OPS", "ALL", "KAST");
  const kast = sim.airport;
  const rwy09R = kast.runways["09R"];

  const pt = runwayPoint(rwy09R, -2.0, 0);
  const ac = createArrivalAircraft(sim, {
    callsign: "QTR555",
    spokenCallsign: "Qatari 555",
    airline: "Qatar Airways",
    aircraftType: "B788",
    x: pt.x,
    y: pt.y,
    heading: 90,
    altitude: kast.elevationFt + 650,
    speed: 150,
    targetRunway: "09R",
    assignedApproach: "09R",
    state: "FINAL",
    controller: "TOWER",
  });

  // Controller issues climb to 3000 ft
  const res = submitClearanceDecision(sim, {
    aircraftId: ac.id,
    controller: "TOWER",
    type: "ALTITUDE",
    parameters: { altitude: kast.elevationFt + 3000 },
  }, "PLAYER");
  assert.equal(res.ok, true, `Clearance must be accepted: ${res.reason}`);
  if (res.clearance?.id) {
    acknowledgeSyncClearance(sim, res.clearance.id);
  }

  assert.equal(ac.state, "APPROACH", "Climb clearance must break off glideslope lock into APPROACH state");
  assert.equal(ac.assignedAltitude, kast.elevationFt + 3000);

  // Step simulation - vertical speed must be climbing (positive) instead of diving
  stepSimulation(sim, 1.0);
  assert.ok(ac.verticalSpeed > 0, `Vertical speed (${ac.verticalSpeed}) must be positive to climb to assigned altitude`);
});

test("Approach Vector Control: Go-around at small height immediately obeys heading vector", () => {
  const sim = createBaseSimulation("NORMAL_OPS", "ALL", "KAST");
  const kast = sim.airport;

  const ac = createArrivalAircraft(sim, {
    callsign: "AIC444",
    spokenCallsign: "Air India 444",
    airline: "Air India",
    aircraftType: "A320",
    x: 0,
    y: 0,
    heading: 90,
    altitude: kast.elevationFt + 400, // Small height
    speed: 180,
    targetRunway: "09R",
    state: "GO_AROUND",
    controller: "TOWER",
  });

  // Issue heading 360 vector during go-around
  const res = submitClearanceDecision(sim, {
    aircraftId: ac.id,
    controller: "TOWER",
    type: "HEADING",
    parameters: { heading: 360, turnDirection: "LEFT" },
  }, "PLAYER");
  assert.equal(res.ok, true, `Clearance must be accepted: ${res.reason}`);
  if (res.clearance?.id) {
    acknowledgeSyncClearance(sim, res.clearance.id);
  }

  assert.equal(ac.state, "APPROACH", "Vector must transition go-around aircraft to APPROACH");
  assert.equal(ac.assignedHeading, 360);

  stepSimulation(sim, 1.0);
  assert.ok(ac.heading < 90, `Heading (${ac.heading}) must turn left towards 360, obeying vector`);
});
