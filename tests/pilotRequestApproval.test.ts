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
    x: 0,
    y: -10,
    gateId: "A1",
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

test("Approach All-In-One Command: Combines heading, altitude, speed, fix, and ILS approach into single clearance", () => {
  const airport = createAirportById("KAST");
  const state = createBaseSimulation("NORMAL_OPS", "ALL", "KAST", airport);
  const ac = createArrivalAircraft(state, {
    callsign: "DLH441",
    spokenCallsign: "Lufthansa 441",
    targetRunway: "09L",
    bearingDeg: 270,
    aircraftType: "A359",
    altitude: 7000,
    speed: 210,
    heading: 90,
    x: 0,
    y: -10,
    gateId: "B12",
  });

  // Issue all-in-one approach command: heading 17, descend to 5500, speed 160, direct IF09L, ILS 09L
  const res = submitClearanceDecision(
    state,
    {
      aircraftId: ac.id,
      controller: "DEPARTURE",
      type: "APPROACH",
      parameters: {
        runway: "09L",
        heading: 17,
        turnDirection: "NEAREST",
        altitude: 5500,
        speed: 160,
        fixId: "IF09L",
      },
    },
    "PLAYER"
  );

  assert.equal(res.ok, true, `Clearance must be accepted: ${res.reason}`);
  assert.equal(ac.clearances.length, 1);
  const clr = ac.clearances[0];
  assert.equal(clr.type, "APPROACH");

  // Verify all-in-one phraseology contains all 4 elements in a single transmission
  assert.ok(clr.phraseology.includes("direct"), "Phraseology must include direct fix");
  assert.ok(clr.phraseology.includes("fly heading 017"), "Phraseology must include heading");
  assert.ok(clr.phraseology.includes("descend and maintain 5500"), "Phraseology must include altitude");
  assert.ok(clr.phraseology.includes("reduce speed to 160 knots"), "Phraseology must include speed");
  assert.ok(clr.phraseology.includes("cleared ILS runway zero niner left approach"), "Phraseology must include ILS approach");

  // Verify single readback contains all elements
  assert.ok(clr.expectedReadbackText.includes("heading 017"));
  assert.ok(clr.expectedReadbackText.includes("descend and maintain 5500"));
  assert.ok(clr.expectedReadbackText.includes("speed 160 knots"));
  assert.ok(clr.expectedReadbackText.includes("cleared ILS runway zero niner left approach"));

  // Acknowledge readback
  acknowledgeSyncClearance(state, clr.id);

  // Verify all parameters updated on the aircraft in one shot
  assert.equal(ac.assignedApproach, "09L");
  assert.equal(ac.targetRunway, "09L");
  assert.equal(ac.assignedHeading, 17);
  assert.equal(ac.assignedAltitude, 5500);
  assert.equal(ac.assignedSpeed, 160);
  assert.equal(ac.assignedDirectFix, "IF09L");
});
