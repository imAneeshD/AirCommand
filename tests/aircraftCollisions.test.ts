import test from "node:test";
import assert from "node:assert/strict";
import { createBaseSimulation, createArrivalAircraft, stepSimulation } from "../src/engine/simulation.ts";
import { runwayPoint } from "../src/data/asteriaAirport.ts";

test("Aircraft Collision: Mid-air collision when two planes are at the same altitude and position in air", () => {
  const sim = createBaseSimulation("NORMAL_OPS", "ALL", "KAST");
  const kast = sim.airport;

  // Plane 1: Flying north at 3000 ft, pos (0.5, 0.5)
  const ac1 = createArrivalAircraft(sim, {
    callsign: "UAE101",
    spokenCallsign: "Emirates 101",
    airline: "Emirates",
    aircraftType: "B77W",
    x: 0.5,
    y: 0.5,
    heading: 360,
    altitude: kast.elevationFt + 2500,
    speed: 210,
    targetRunway: "09R",
    state: "APPROACH",
    controller: "DEPARTURE",
  });

  // Plane 2: Flying east at 3050 ft (altDiff 50 ft <= 120 ft), pos (0.52, 0.51) (dist ~0.022 NM <= 0.045 NM)
  const ac2 = createArrivalAircraft(sim, {
    callsign: "QTR202",
    spokenCallsign: "Qatari 202",
    airline: "Qatar Airways",
    aircraftType: "A359",
    x: 0.52,
    y: 0.51,
    heading: 90,
    altitude: kast.elevationFt + 2550,
    speed: 190,
    targetRunway: "09L",
    state: "APPROACH",
    controller: "DEPARTURE",
  });

  stepSimulation(sim, 0.5);

  assert.equal(ac1.state, "CRASHED", "Plane 1 must be marked CRASHED after mid-air collision");
  assert.equal(ac2.state, "CRASHED", "Plane 2 must be marked CRASHED after mid-air collision");
  assert.equal(ac1.speed, 0, "Plane 1 speed must drop to 0 after crash");
  assert.equal(ac2.speed, 0, "Plane 2 speed must drop to 0 after crash");
  assert.equal(ac1.emergencyType, "CRASH", "Emergency type must be CRASH");
  assert.equal(ac2.emergencyType, "CRASH", "Emergency type must be CRASH");

  const midairIncident = sim.incidents.find((inc) => inc.code === "CRASH_MID_AIR_COLLISION");
  assert.ok(midairIncident, "Must log CRASH_MID_AIR_COLLISION incident in sim");
  assert.ok(midairIncident.aircraftIds.includes(ac1.id) && midairIncident.aircraftIds.includes(ac2.id));
});

test("Aircraft Collision: Runway collision when two planes collide on runway surface", () => {
  const sim = createBaseSimulation("NORMAL_OPS", "ALL", "KAST");
  const kast = sim.airport;
  const rwy09R = kast.runways["09R"];

  // Plane 1: Taking off on 09R
  const pt = runwayPoint(rwy09R, 0.4, 0);
  const dep = createArrivalAircraft(sim, {
    callsign: "DAL500",
    spokenCallsign: "Delta 500",
    airline: "Delta",
    aircraftType: "A321",
    x: pt.x,
    y: pt.y,
    heading: rwy09R.heading,
    altitude: kast.elevationFt,
    speed: 80,
    targetRunway: "09R",
    state: "TAKEOFF_ROLL",
    controller: "TOWER",
  });

  // Plane 2: Stopped on runway at same point
  const pt2 = runwayPoint(rwy09R, 0.41, 0);
  const arr = createArrivalAircraft(sim, {
    callsign: "SWA888",
    spokenCallsign: "Southwest 888",
    airline: "Southwest",
    aircraftType: "B738",
    x: pt2.x,
    y: pt2.y,
    heading: rwy09R.heading,
    altitude: kast.elevationFt,
    speed: 0,
    targetRunway: "09R",
    state: "STOPPED_ON_RUNWAY",
    controller: "TOWER",
  });

  stepSimulation(sim, 0.5);

  assert.equal(dep.state, "CRASHED", "Departure plane must crash on runway impact");
  assert.equal(arr.state, "CRASHED", "Stopped plane must crash on runway impact");
  assert.ok(dep.crashDetails?.runwayHalted, "Runway operations must be halted following runway collision");

  const rwyIncident = sim.incidents.find((inc) => inc.code === "CRASH_RUNWAY_COLLISION");
  assert.ok(rwyIncident, "Must log CRASH_RUNWAY_COLLISION incident");
});

test("Aircraft Collision: Ground taxiway collision when two planes collide on taxiway surface", () => {
  const sim = createBaseSimulation("NORMAL_OPS", "ALL", "KAST");
  const kast = sim.airport;

  const node = kast.nodes["T_A_MID"] ?? Object.values(kast.nodes).find((n) => n.kind === "TAXIWAY")!;
  assert.ok(node);

  // Plane 1: Taxiing at node
  const ac1 = createArrivalAircraft(sim, {
    callsign: "BAW123",
    spokenCallsign: "Speedbird 123",
    airline: "British Airways",
    aircraftType: "A359",
    x: node.x,
    y: node.y,
    heading: 90,
    altitude: kast.elevationFt,
    speed: 12,
    targetRunway: "09R",
    state: "TAXIING",
    controller: "GROUND",
  });

  // Plane 2: Taxiing directly into same point (dist 0.014 NM <= 0.024 NM)
  const ac2 = createArrivalAircraft(sim, {
    callsign: "AFR456",
    spokenCallsign: "Air France 456",
    airline: "Air France",
    aircraftType: "B772",
    x: node.x + 0.01,
    y: node.y + 0.01,
    heading: 270,
    altitude: kast.elevationFt,
    speed: 10,
    targetRunway: "09R",
    state: "TAXIING",
    controller: "GROUND",
  });

  stepSimulation(sim, 0.5);

  assert.equal(ac1.state, "CRASHED", "Taxiing aircraft 1 must crash on ground collision");
  assert.equal(ac2.state, "CRASHED", "Taxiing aircraft 2 must crash on ground collision");

  const gndIncident = sim.incidents.find((inc) => inc.code === "CRASH_GROUND_COLLISION");
  assert.ok(gndIncident, "Must log CRASH_GROUND_COLLISION incident");
});

test("Aircraft Collision: Parked planes at distinct gates do NOT crash", () => {
  const sim = createBaseSimulation("NORMAL_OPS", "ALL", "KAST");
  const kast = sim.airport;

  const gate1 = kast.nodes["GATE_B10"] ?? Object.values(kast.nodes).find((n) => n.kind === "GATE")!;
  const gate2 = kast.nodes["GATE_B11"] ?? Object.values(kast.nodes).find((n) => n.kind === "GATE" && n.id !== gate1.id)!;
  assert.ok(gate1 && gate2);

  const ac1 = createArrivalAircraft(sim, {
    callsign: "AIC101",
    spokenCallsign: "Air India 101",
    airline: "Air India",
    aircraftType: "B788",
    x: gate1.x,
    y: gate1.y,
    heading: 0,
    altitude: kast.elevationFt,
    speed: 0,
    targetRunway: "09R",
    gateId: gate1.gateId ?? "B10",
    state: "AT_GATE",
    controller: "DELIVERY",
  });

  const ac2 = createArrivalAircraft(sim, {
    callsign: "AIC102",
    spokenCallsign: "Air India 102",
    airline: "Air India",
    aircraftType: "A320",
    x: gate2.x,
    y: gate2.y,
    heading: 0,
    altitude: kast.elevationFt,
    speed: 0,
    targetRunway: "09R",
    gateId: gate2.gateId ?? "B11",
    state: "AT_GATE",
    controller: "DELIVERY",
  });

  stepSimulation(sim, 1.0);

  assert.equal(ac1.state, "AT_GATE", "Parked aircraft 1 must remain AT_GATE");
  assert.equal(ac2.state, "AT_GATE", "Parked aircraft 2 must remain AT_GATE");
  const crashIncident = sim.incidents.find((inc) => inc.code.includes("COLLISION"));
  assert.equal(crashIncident, undefined, "Legitimately parked planes must not trigger collisions");
});

test("Aircraft Collision: Apron / Parking stand crash isolates apron sector and does NOT close runway", async () => {
  const sim = createBaseSimulation("NORMAL_OPS", "ALL", "KAST");
  const kast = sim.airport;

  const gate = kast.nodes["GATE_B10"] ?? Object.values(kast.nodes).find((n) => n.kind === "GATE")!;
  assert.ok(gate);

  // Plane 1: pushing back from gate
  const ac1 = createArrivalAircraft(sim, {
    callsign: "JBU698",
    spokenCallsign: "JetBlue 698",
    airline: "JetBlue",
    aircraftType: "A320",
    x: gate.x,
    y: gate.y,
    heading: 180,
    altitude: kast.elevationFt,
    speed: 5,
    targetRunway: "09R",
    gateId: gate.gateId ?? "B10",
    state: "TAXIING",
    controller: "GROUND",
  });

  // Plane 2: taxiing into the same apron parking spot
  const ac2 = createArrivalAircraft(sim, {
    callsign: "FDX539",
    spokenCallsign: "FedEx 539",
    airline: "FedEx",
    aircraftType: "B772",
    x: gate.x + 0.005,
    y: gate.y + 0.005,
    heading: 0,
    altitude: kast.elevationFt,
    speed: 8,
    targetRunway: "09R",
    state: "TAXIING",
    controller: "GROUND",
  });

  stepSimulation(sim, 0.5);

  assert.equal(ac1.state, "CRASHED");
  assert.equal(ac2.state, "CRASHED");
  assert.equal(ac1.crashDetails?.locationKind, "APRON", "Must identify locationKind as APRON");
  assert.equal(ac1.crashDetails?.runwayId, undefined, "Apron crash must not assign a runwayId");
  assert.ok(ac1.crashDetails?.locationLabel?.includes("Apron"), "Location label must designate Apron");

  // Also check that an approaching aircraft on runway 09R is NOT forced to go around when apron operations are halted
  const approachAc = createArrivalAircraft(sim, {
    callsign: "SIA400",
    spokenCallsign: "Singapore 400",
    airline: "Singapore",
    aircraftType: "A359",
    x: 5.0,
    y: 0.0,
    heading: 270,
    altitude: kast.elevationFt + 1500,
    speed: 150,
    targetRunway: "09R",
    assignedApproach: "09R",
    state: "FINAL",
    controller: "TOWER",
  });

  const { haltRunwayOperations } = await import("../src/engine/decisionEngine.ts");
  haltRunwayOperations(sim, undefined, ac1.id);

  assert.equal(ac1.crashDetails?.runwayHalted, true, "Apron crash area must be marked halted");
  assert.equal(sim.closedRunways?.["09R"], undefined, "Runway 09R must remain OPEN despite apron crash");
  assert.equal(approachAc.state, "FINAL", "Approach aircraft must NOT be forced to go around for an apron crash");
});
