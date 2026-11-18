import test from "node:test";
import assert from "node:assert/strict";
import {
  createBaseSimulation,
  stepSimulation,
  createArrivalAircraft,
} from "../src/engine/simulation.ts";
import { runwayPoint } from "../src/data/asteriaAirport.ts";
import { computeDepAppGuidance } from "../src/utils/depAppGuidance.ts";
import { submitClearanceDecision } from "../src/engine/decisionEngine.ts";

test("Flight Levels: Consecutive arrivals on approach corridor receive stepped conflict-free altitude guidance", () => {
  const sim = createBaseSimulation("LIGHT", "ALL", "KAST");
  const rwyId = sim.airport.primaryArrivalRunway;
  const rwySpec = sim.airport.runways[rwyId];
  const elev = sim.airport.elevationFt;
  const baseAlt = Math.round(elev / 500) * 500;

  // Clear existing aircraft to focus purely on approach queue
  sim.aircraft = {};
  sim.aircraftOrder = [];

  // Plane 1: Lead arrival on final approach (4 NM out)
  const pt1 = runwayPoint(rwySpec, -4.0, 0);
  const ac1 = createArrivalAircraft(sim, {
    callsign: "AIC101",
    spokenCallsign: "Air India 101",
    x: pt1.x,
    y: pt1.y,
    altitude: baseAlt + 2500,
    targetRunway: rwyId,
    state: "APPROACH",
    controller: "DEPARTURE",
  });

  // Plane 2: In-trail arrival behind Plane 1 (8 NM out)
  const pt2 = runwayPoint(rwySpec, -8.0, 0);
  const ac2 = createArrivalAircraft(sim, {
    callsign: "QTR202",
    spokenCallsign: "Qatar 202",
    x: pt2.x,
    y: pt2.y,
    altitude: baseAlt + 3500,
    targetRunway: rwyId,
    state: "APPROACH",
    controller: "DEPARTURE",
  });

  // Plane 3: In-trail arrival behind Plane 2 (12 NM out)
  const pt3 = runwayPoint(rwySpec, -12.0, 0);
  const ac3 = createArrivalAircraft(sim, {
    callsign: "SIA303",
    spokenCallsign: "Singapore 303",
    x: pt3.x,
    y: pt3.y,
    altitude: baseAlt + 4500,
    targetRunway: rwyId,
    state: "APPROACH",
    controller: "DEPARTURE",
  });

  const allAc = [ac1, ac2, ac3];

  const g1 = computeDepAppGuidance(sim.airport, ac1, rwyId, allAc);
  const g2 = computeDepAppGuidance(sim.airport, ac2, rwyId, allAc);
  const g3 = computeDepAppGuidance(sim.airport, ac3, rwyId, allAc);

  // Plane 1 is lead -> lowest intercept altitude
  assert.equal(g1.recommendedAltitude, baseAlt + 2500);

  // Plane 2 is #2 in trail -> stepped +1,000 ft higher
  assert.equal(g2.recommendedAltitude, baseAlt + 3500);

  // Plane 3 is #3 in trail -> stepped +2,000 ft higher
  assert.equal(g3.recommendedAltitude, baseAlt + 4500);

  // Vertical clearance between consecutive planes is guaranteed >= 1,000 ft
  assert.ok(g2.recommendedAltitude - g1.recommendedAltitude >= 1000);
  assert.ok(g3.recommendedAltitude - g2.recommendedAltitude >= 1000);
});

test("Flight Levels: Autonomous controller manages stepped levels and respects PLAYER manual altitude changes", () => {
  const sim = createBaseSimulation("LIGHT", "ALL", "KAST");
  sim.config.stationControl = {
    DELIVERY: "AUTONOMOUS",
    GROUND: "AUTONOMOUS",
    TOWER: "AUTONOMOUS",
    DEPARTURE: "AUTONOMOUS",
    CENTER: "AUTONOMOUS",
  };

  const rwyId = sim.airport.primaryArrivalRunway;
  const rwySpec = sim.airport.runways[rwyId];
  const elev = sim.airport.elevationFt;
  const baseAlt = Math.round(elev / 500) * 500;

  sim.aircraft = {};
  sim.aircraftOrder = [];

  // Plane 1: Lead arrival (5 NM out)
  const pt1 = runwayPoint(rwySpec, -5.0, 0);
  const ac1 = createArrivalAircraft(sim, {
    callsign: "AIC101",
    spokenCallsign: "Air India 101",
    x: pt1.x,
    y: pt1.y,
    altitude: baseAlt + 2500,
    targetRunway: rwyId,
    state: "APPROACH",
    controller: "DEPARTURE",
  });

  // Plane 2: Trailing arrival (9 NM out)
  const pt2 = runwayPoint(rwySpec, -9.0, 0);
  const ac2 = createArrivalAircraft(sim, {
    callsign: "QTR202",
    spokenCallsign: "Qatar 202",
    x: pt2.x,
    y: pt2.y,
    altitude: baseAlt + 3500,
    targetRunway: rwyId,
    state: "APPROACH",
    controller: "DEPARTURE",
  });

  // Run autonomous controllers for a few seconds
  stepSimulation(sim, 2.0);

  // Lead plane should be at baseAlt + 2500, trailing plane should be held at baseAlt + 3500
  assert.equal(ac1.assignedAltitude, baseAlt + 2500);
  assert.equal(ac2.assignedAltitude, baseAlt + 3500);

  // Now simulate USER explicitly changing ac2 to 6,000 ft (PLAYER issued)
  submitClearanceDecision(
    sim,
    {
      aircraftId: ac2.id,
      controller: "DEPARTURE",
      type: "ALTITUDE",
      parameters: { altitude: 6000 },
    },
    "PLAYER"
  );

  // Run auto controllers again
  stepSimulation(sim, 3.0);

  // Auto controller MUST preserve user manual level (6000 ft) and NOT override it!
  assert.equal(ac2.assignedAltitude, 6000);
});

test("Realistic Collision Distance: Planes with visual gap (> 0.035 NM or > 60 ft alt diff) do NOT collide", () => {
  const sim = createBaseSimulation("LIGHT", "ALL", "KAST");
  const elev = sim.airport.elevationFt;

  sim.aircraft = {};
  sim.aircraftOrder = [];

  // Two aircraft flying side-by-side with 0.05 NM (~92m separation) at same altitude
  const ac1 = createArrivalAircraft(sim, {
    callsign: "GAP1",
    spokenCallsign: "Gap 1",
    x: 0,
    y: 0,
    altitude: elev + 4000,
    targetRunway: sim.airport.runwayIds[0],
    state: "APPROACH",
    controller: "DEPARTURE",
  });

  const ac2 = createArrivalAircraft(sim, {
    callsign: "GAP2",
    spokenCallsign: "Gap 2",
    x: 0.05, // 0.05 NM = ~92.6 meters (clear physical gap between two A320s whose wingspans are 35m)
    y: 0,
    altitude: elev + 4000,
    targetRunway: sim.airport.runwayIds[0],
    state: "APPROACH",
    controller: "DEPARTURE",
  });

  stepSimulation(sim, 1.0);

  // Neither plane should be crashed!
  assert.notEqual(ac1.state, "CRASHED");
  assert.notEqual(ac2.state, "CRASHED");
});

test("Realistic Collision Distance: Physical contact (airframe touching <= 0.024 NM and <= 55 ft) DOES trigger collision", () => {
  const sim = createBaseSimulation("LIGHT", "ALL", "KAST");
  const elev = sim.airport.elevationFt;

  sim.aircraft = {};
  sim.aircraftOrder = [];

  // Two aircraft making physical contact (distance 0.015 NM = ~27m < wingspan, same altitude)
  const ac1 = createArrivalAircraft(sim, {
    callsign: "TOUCH1",
    spokenCallsign: "Touch 1",
    x: 0,
    y: 0,
    altitude: elev + 4000,
    targetRunway: sim.airport.runwayIds[0],
    state: "APPROACH",
    controller: "DEPARTURE",
  });

  const ac2 = createArrivalAircraft(sim, {
    callsign: "TOUCH2",
    spokenCallsign: "Touch 2",
    x: 0.015,
    y: 0,
    altitude: elev + 4010, // within 10 ft vertical
    targetRunway: sim.airport.runwayIds[0],
    state: "APPROACH",
    controller: "DEPARTURE",
  });

  stepSimulation(sim, 1.0);

  // Physical touching contact detected -> both aircraft crash
  assert.equal(ac1.state, "CRASHED");
  assert.equal(ac2.state, "CRASHED");
});
