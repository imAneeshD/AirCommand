import test from "node:test";
import assert from "node:assert/strict";
import { createAirportById } from "../src/data/asteriaAirport.ts";
import { createBaseSimulation, createArrivalAircraft } from "../src/engine/simulation.ts";
import { submitClearanceDecision, acknowledgeSyncClearance } from "../src/engine/decisionEngine.ts";

test("Pilot Request Approval: APPROACH_CLEARANCE is resolved upon issuing APPROACH clearance", () => {
  const airport = createAirportById("KAST");
  const state = createBaseSimulation("NORMAL_OPS", "ALL", "KAST", airport);
  const ac = createArrivalAircraft(state, {
    callsign: "SIA957",
    spokenCallsign: "Singapore 957",
    targetRunway: "09R",
    bearingDeg: 270,
    aircraftType: "B772",
  });

  ac.pendingRequest = {
    id: "req-app-1",
    type: "APPROACH_CLEARANCE",
    controller: "DEPARTURE",
    message: "Approaching initial fix, request ILS runway 09R.",
    requestedAt: state.time,
    runway: "09R",
    resolved: false,
  };

  assert.equal(ac.pendingRequest.resolved, false);

  // Submit clearance decision as issued by the APPROVE button
  const res = submitClearanceDecision(
    state,
    {
      aircraftId: ac.id,
      controller: "DEPARTURE",
      type: "APPROACH",
      parameters: { runway: "09R" },
    },
    "PLAYER"
  );

  assert.equal(res.ok, true, `Clearance must be accepted: ${res.reason}`);
  assert.equal(ac.clearances.length, 1);
  const clr = ac.clearances[0];
  assert.equal(clr.type, "APPROACH");
  assert.equal(clr.parameters.runway, "09R");

  // Acknowledge readback and execute clearance
  acknowledgeSyncClearance(state, clr.id);

  // The approach clearance execution must resolve the pending request and set assignedApproach
  assert.equal(ac.assignedApproach, "09R");
  assert.equal(ac.pendingRequest.resolved, true, "APPROACH_CLEARANCE pending request must be resolved");
});
