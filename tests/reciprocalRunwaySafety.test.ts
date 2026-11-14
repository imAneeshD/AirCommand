import test from "node:test";
import assert from "node:assert/strict";
import { createAirportById } from "../src/data/asteriaAirport.ts";
import { getActiveRunways, createArrivalAircraft, createBaseSimulation, stepSimulation } from "../src/engine/simulation.ts";
import { isRunwayOccupied } from "../src/engine/validationEngine.ts";
import { runAutonomousControllers } from "../src/engine/autonomousControllers.ts";
import { runwayPoint } from "../src/data/asteriaAirport.ts";
import { makeRunway } from "../src/utils/osmToAirport.ts";

test("getActiveRunways: strictly excludes opposing reciprocal runways", () => {
  const kast = createAirportById("KAST");
  const arrRunways = getActiveRunways(kast, "ARRIVAL");
  const depRunways = getActiveRunways(kast, "DEPARTURE");

  assert.ok(arrRunways.includes("09R") || arrRunways.includes("09L"));
  assert.ok(!arrRunways.includes("27L"), "Reciprocal 27L must not be an active arrival runway when 09 is active");
  assert.ok(!arrRunways.includes("27R"), "Reciprocal 27R must not be an active arrival runway when 09 is active");

  assert.ok(depRunways.includes("09L") || depRunways.includes("09R"));
  assert.ok(!depRunways.includes("27L"), "Reciprocal 27L must not be active departure runway when 09 is active");
  assert.ok(!depRunways.includes("27R"), "Reciprocal 27R must not be active departure runway when 09 is active");
});

test("isRunwayOccupied: detects aircraft on reciprocal opposite runway end", () => {
  const sim = createBaseSimulation("NORMAL_OPS", "ALL", "KAST");
  const kast = sim.airport;
  const rwy09L = kast.runways["09L"];
  rwy09L.oppositeId = "27R";
  kast.runways["27R"] = makeRunway({
    id: "27R",
    oppositeId: "09L",
    heading: (rwy09L.heading + 180) % 360,
    thresholdX: rwy09L.endX,
    thresholdY: rwy09L.endY,
    lengthNm: rwy09L.lengthNm,
    widthNm: rwy09L.widthNm,
    elevationFt: kast.elevationFt,
  });
  if (!kast.runwayIds.includes("27R")) kast.runwayIds.push("27R");

  // Place an aircraft landing on 09L
  const pt = runwayPoint(rwy09L, 0.5, 0);
  const arr = createArrivalAircraft(sim, {
    callsign: "QTR358",
    spokenCallsign: "Qatari 358",
    airline: "Qatar Airways",
    aircraftType: "B77W",
    x: pt.x,
    y: pt.y,
    heading: rwy09L.heading,
    altitude: kast.elevationFt + 10,
    speed: 120,
    targetRunway: "09L",
    gateId: "GATE_A1",
    state: "FINAL",
    controller: "TOWER",
    assignedApproach: "09L",
  });
  arr.state = "ROLLOUT";

  // Querying reciprocal runway 27R MUST report occupied!
  const occ27R = isRunwayOccupied(sim, "27R");
  assert.equal(occ27R.occupied, true, "27R must be occupied because QTR358 is on reciprocal 09L");
  assert.ok(occ27R.occupantIds.includes(arr.id));

  // Querying 09L must also report occupied
  const occ09L = isRunwayOccupied(sim, "09L");
  assert.equal(occ09L.occupied, true, "09L must be occupied");
  assert.ok(occ09L.occupantIds.includes(arr.id));
});

test("Autonomous Tower: protects reciprocal runway and issues GO_AROUND to opposing arrival", () => {
  const sim = createBaseSimulation("NORMAL_OPS", "ALL", "KAST");
  const kast = sim.airport;
  const rwy09L = kast.runways["09L"];
  rwy09L.oppositeId = "27R";
  kast.runways["27R"] = makeRunway({
    id: "27R",
    oppositeId: "09L",
    heading: (rwy09L.heading + 180) % 360,
    thresholdX: rwy09L.endX,
    thresholdY: rwy09L.endY,
    lengthNm: rwy09L.lengthNm,
    widthNm: rwy09L.widthNm,
    elevationFt: kast.elevationFt,
  });
  if (!kast.runwayIds.includes("27R")) kast.runwayIds.push("27R");
  const rwy27R = kast.runways["27R"];

  // QTR358 rolling out on 09L
  const ptRoll = runwayPoint(rwy09L, 0.4, 0);
  const qtr = createArrivalAircraft(sim, {
    callsign: "QTR358",
    spokenCallsign: "Qatari 358",
    airline: "Qatar Airways",
    aircraftType: "B77W",
    x: ptRoll.x,
    y: ptRoll.y,
    heading: rwy09L.heading,
    altitude: kast.elevationFt,
    speed: 62,
    targetRunway: "09L",
    gateId: "GATE_A1",
    state: "FINAL",
    controller: "TOWER",
    assignedApproach: "09L",
  });
  qtr.state = "ROLLOUT";

  // SIA401 approaching reciprocal 27R inside short final
  const ptApp = runwayPoint(rwy27R, -1.0, 0);
  const sia = createArrivalAircraft(sim, {
    callsign: "SIA401",
    spokenCallsign: "Singapore 401",
    airline: "Singapore Airlines",
    aircraftType: "A359",
    x: ptApp.x,
    y: ptApp.y,
    heading: rwy27R.heading,
    altitude: kast.elevationFt + 300,
    speed: 140,
    targetRunway: "27R",
    gateId: "GATE_B1",
    state: "FINAL",
    controller: "TOWER",
    assignedApproach: "27R",
  });

  // Run autonomous Tower controller
  runAutonomousControllers(sim);

  // Tower must NOT clear SIA401 to land on 27R; Tower MUST issue GO_AROUND!
  assert.notEqual(sia.state, "CLEARED_TO_LAND", "SIA401 must not be cleared to land on reciprocal runway");
  const gaClearance = sia.clearances.find((c) => c.type === "GO_AROUND");
  assert.ok(gaClearance, "Tower must issue GO_AROUND to SIA401 to prevent head-on runway collision");
});

test("ROLLOUT emergency braking: prevents head-on collision if two planes are rolling on the same runway", () => {
  const sim = createBaseSimulation("NORMAL_OPS", "ALL", "KAST");
  const kast = sim.airport;
  const rwy09L = kast.runways["09L"];

  // QTR358 rolling east at 0.3 NM from 09L threshold
  const pt1 = runwayPoint(rwy09L, 0.3, 0);
  const qtr = createArrivalAircraft(sim, {
    callsign: "QTR358",
    spokenCallsign: "Qatari 358",
    airline: "Qatar Airways",
    aircraftType: "B77W",
    x: pt1.x,
    y: pt1.y,
    heading: rwy09L.heading,
    altitude: kast.elevationFt,
    speed: 62,
    targetRunway: "09L",
    gateId: "GATE_A1",
    state: "FINAL",
    controller: "TOWER",
    assignedApproach: "09L",
  });
  qtr.state = "ROLLOUT";

  // SIA401 ahead on the runway at 0.55 NM (within 0.25 NM distance)
  const pt2 = runwayPoint(rwy09L, 0.55, 0);
  const sia = createArrivalAircraft(sim, {
    callsign: "SIA401",
    spokenCallsign: "Singapore 401",
    airline: "Singapore Airlines",
    aircraftType: "A359",
    x: pt2.x,
    y: pt2.y,
    heading: (rwy09L.heading + 180) % 360,
    altitude: kast.elevationFt,
    speed: 24,
    targetRunway: "09L",
    gateId: "GATE_B1",
    state: "FINAL",
    controller: "TOWER",
    assignedApproach: "09L",
  });
  sia.state = "ROLLOUT";

  // Step simulation - QTR358 should detect the opposing traffic ahead and brake aggressively
  const initialSpeed = qtr.speed;
  stepSimulation(sim, 1.0);

  assert.ok(qtr.speed < initialSpeed, "QTR358 must immediately apply emergency braking when opposing traffic is ahead on the runway");
});
