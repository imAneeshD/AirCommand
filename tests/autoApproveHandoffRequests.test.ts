import test from "node:test";
import assert from "node:assert/strict";
import { createAirportById, runwayPoint } from "../src/data/asteriaAirport.ts";
import { createBaseSimulation, createDepartureAircraft, stepSimulation } from "../src/engine/simulation.ts";
import { submitClearanceDecision } from "../src/engine/decisionEngine.ts";
import { isRunwayOccupied } from "../src/engine/validationEngine.ts";

test("Queued departure on entrance taxiway does NOT falsely occupy runway for lead departure", () => {
  const airport = createAirportById("VOBL");
  // Player is on GROUND, other stations automated
  const sim = createBaseSimulation("NORMAL_OPS", "GROUND", "VOBL", airport);

  const rwy09L = sim.airport.runways["09L"];
  assert.ok(rwy09L, "Runway 09L should exist at VOBL");

  // Lead aircraft BAW728 holding short at runway 09L
  const lead = createDepartureAircraft(sim, {
    callsign: "BAW728",
    spokenCallsign: "Speedbird 728",
    gateId: sim.airport.gateIds[0],
    targetRunway: "09L",
    aircraftType: "A35K",
  });
  const hsPt = runwayPoint(rwy09L, 0.05, 0.045);
  lead.x = hsPt.x;
  lead.y = hsPt.y;
  lead.state = "HOLDING_SHORT";
  lead.holdingAtRunway = "09L";
  lead.holdingShortReason = "DEPARTURE_RUNWAY";
  lead.controller = "TOWER";

  // Second aircraft VTI358 queued directly behind lead on taxiway
  const trail = createDepartureAircraft(sim, {
    callsign: "VTI358",
    spokenCallsign: "Vistara 358",
    gateId: sim.airport.gateIds[1] ?? sim.airport.gateIds[0],
    targetRunway: "09L",
    aircraftType: "A320",
  });
  const queuePt = runwayPoint(rwy09L, 0.05, 0.065);
  trail.x = queuePt.x;
  trail.y = queuePt.y;
  trail.state = "HOLDING_SHORT";
  trail.holdingAtRunway = "09L";
  trail.controller = "GROUND";

  // isRunwayOccupied excluding lead MUST NOT report runway occupied because of the queued plane!
  const occ = isRunwayOccupied(sim, "09L", lead.id);
  assert.equal(occ.occupied, false, `Runway 09L should NOT be occupied by queued aircraft on taxiway: occupants = ${occ.occupantIds.join(", ")}`);
});

test("Autonomous Tower auto-accepts handoff and auto-approves TAKEOFF request for lead departure holding short", () => {
  const airport = createAirportById("VOBL");
  const sim = createBaseSimulation("NORMAL_OPS", "GROUND", "VOBL", airport);
  const rwy09L = sim.airport.runways["09L"];

  const ac = createDepartureAircraft(sim, {
    callsign: "BAW728",
    spokenCallsign: "Speedbird 728",
    gateId: sim.airport.gateIds[0],
    targetRunway: "09L",
    aircraftType: "A35K",
  });
  const hsPt = runwayPoint(rwy09L, 0.05, 0.045);
  ac.x = hsPt.x;
  ac.y = hsPt.y;
  ac.state = "HOLDING_SHORT";
  ac.holdingAtRunway = "09L";
  ac.holdingShortReason = "DEPARTURE_RUNWAY";
  ac.controller = "GROUND";

  // Player on Ground issues handoff to automated Tower
  const hoRes = submitClearanceDecision(sim, {
    aircraftId: ac.id,
    controller: "GROUND",
    type: "HANDOFF",
    parameters: { targetController: "TOWER" },
  }, "PLAYER");
  assert.equal(hoRes.ok, true, `HANDOFF failed: ${hoRes.reason}`);

  // Step simulation - Tower should auto-accept handoff, receive pilot request, and auto-approve TAKEOFF
  for (let i = 0; i < 20 && ac.state === "HOLDING_SHORT"; i++) {
    stepSimulation(sim, 0.5);
  }

  const finalState = ac.state as string;
  assert.notEqual(finalState, "HOLDING_SHORT", "Autonomous Tower should clear departure from holding short");
  assert.ok(
    finalState === "LINE_UP_WAIT" || finalState === "TAKEOFF_CLEARED" || finalState === "TAKEOFF_ROLL" || finalState === "CLIMB",
    `Expected moving runway state, got ${finalState}`
  );
  assert.ok(!ac.pendingRequest || ac.pendingRequest.resolved, "Pilot request should be resolved by autonomous controller");
});
