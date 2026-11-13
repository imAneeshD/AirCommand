import test from "node:test";
import assert from "node:assert/strict";
import {
  createBaseSimulation,
  createArrivalAircraft,
  stepSimulation,
} from "../src/engine/simulation.ts";
import {
  clearCrashSite,
  dispatchCrashRescue,
  haltRunwayOperations,
  requestMedicalEvacuation,
  submitClearanceDecision,
} from "../src/engine/decisionEngine.ts";
import { declareAircraftCrash } from "../src/engine/aircraftEngine.ts";

test("Descent profile accurately tracks 3-degree glide slope and speed targets", () => {
  const sim = createBaseSimulation("SANDBOX", "ALL", "KAST");
  const rwy = sim.airport.runways["09L"];
  assert.ok(rwy);

  // Spawn arrival aligned on final 09L at 5.0 NM out
  const elev = sim.airport.elevationFt;
  const initDist = 5.0;
  const startX = rwy.thresholdX - initDist * rwy.ux;
  const startY = rwy.thresholdY - initDist * rwy.uy;

  const ac = createArrivalAircraft(sim, {
    callsign: "DAL814",
    spokenCallsign: "Delta eight fourteen",
    targetRunway: "09L",
    assignedApproach: "09L",
    gateId: "GATE1",
    state: "FINAL",
    x: startX,
    y: startY,
    heading: rwy.heading,
    altitude: elev + initDist * 318,
    speed: 155,
  });

  // Give landing clearance
  submitClearanceDecision(
    sim,
    {
      aircraftId: ac.id,
      controller: "TOWER",
      type: "LAND",
      parameters: { runway: "09L" },
    },
    "PLAYER"
  );

  // Step simulation for 10 seconds and verify altitude descends along glide slope
  const initialAlt = ac.altitude;
  for (let i = 0; i < 20; i++) {
    stepSimulation(sim, 0.5);
  }

  assert.ok(
    ac.altitude < initialAlt,
    `Aircraft should descend on final glideslope (initial=${initialAlt}, current=${ac.altitude})`
  );
  assert.ok(
    ac.verticalSpeed < -500 && ac.verticalSpeed > -1200,
    `Vertical speed should realistically match ~700-900 fpm 3-degree descent (was ${ac.verticalSpeed})`
  );
  assert.ok(
    ac.speed >= 130 && ac.speed <= 180,
    `Speed should stay within safe approach range (was ${ac.speed})`
  );
});

test("Go-Around immediately commands positive climb and never drops to 0ft terrain", () => {
  const sim = createBaseSimulation("SANDBOX", "ALL", "KAST");
  const rwy = sim.airport.runways["09R"];
  assert.ok(rwy);
  const elev = sim.airport.elevationFt;

  const ac = createArrivalAircraft(sim, {
    callsign: "DAL814",
    spokenCallsign: "Delta eight fourteen",
    targetRunway: "09R",
    assignedApproach: "09R",
    gateId: "GATE2",
    state: "FINAL",
    x: rwy.thresholdX - 0.4 * rwy.ux,
    y: rwy.thresholdY - 0.4 * rwy.uy,
    heading: rwy.heading,
    altitude: elev + 280,
    speed: 140,
  });

  // Command Go-Around
  submitClearanceDecision(
    sim,
    {
      aircraftId: ac.id,
      controller: "TOWER",
      type: "GO_AROUND",
      parameters: {},
    },
    "PLAYER"
  );

  assert.equal(ac.state, "GO_AROUND");
  assert.ok(
    ac.verticalSpeed >= 1200,
    `Go-around should have immediate positive TOGA climb rate (was ${ac.verticalSpeed})`
  );

  const initialAlt = ac.altitude;
  for (let i = 0; i < 15; i++) {
    stepSimulation(sim, 0.5);
    assert.ok(
      ac.altitude >= initialAlt - 5,
      `Altitude should strictly increase on go-around and never drop to ground (altitude=${ac.altitude})`
    );
  }
  assert.ok(
    ac.altitude > initialAlt + 150,
    `Aircraft should climb substantially after 7.5 seconds of go-around (current=${ac.altitude})`
  );
});

test("Off-runway touchdown / ground excursion at speed triggers immediate crash declaration", () => {
  const sim = createBaseSimulation("SANDBOX", "ALL", "KAST");
  const rwy = sim.airport.runways["09R"];
  assert.ok(rwy);
  const elev = sim.airport.elevationFt;

  // Position aircraft past runway end in dirt (runway overrun like in user screenshot)
  const pastEndX = rwy.endX + 0.15 * rwy.ux;
  const pastEndY = rwy.endY + 0.15 * rwy.uy;

  const ac = createArrivalAircraft(sim, {
    callsign: "DAL814",
    spokenCallsign: "Delta eight fourteen",
    targetRunway: "09R",
    gateId: "GATE3",
    state: "LANDING",
    x: pastEndX,
    y: pastEndY,
    heading: rwy.heading,
    altitude: elev,
    speed: 110,
  });

  // Step simulation - should detect high-speed off-runway excursion and declare crash
  stepSimulation(sim, 0.5);

  assert.equal(ac.state, "CRASHED", "Aircraft should transition to CRASHED state");
  assert.equal(ac.speed, 0, "Crashed aircraft speed must be 0");
  assert.equal(ac.squawk, "7700", "Squawk must be set to 7700 emergency");
  assert.equal(ac.operationMode, "EMERGENCY_OPERATION");
  assert.ok(ac.crashDetails, "Aircraft should have crash details populated");
  assert.equal(ac.crashDetails?.runwayId, "09R");

  // Check critical safety incident was created
  const incident = sim.incidents.find((i) => i.code === "CRASH_EXCURSION");
  assert.ok(incident, "Critical crash incident should be recorded in sim.incidents");
  assert.equal(incident?.severity, "CRITICAL");

  // Check emergency radio message broadcast
  const radio = sim.radioLog.find(
    (m) => m.category === "EMERGENCY" && m.text.includes("CRASH ALARM")
  );
  assert.ok(radio, "Tower crash alarm radio transmission should be broadcast");
});

test("Tower Emergency Response facility controls: ARFF dispatch, Runway halt, Medical evac, and Site clearance", () => {
  const sim = createBaseSimulation("SANDBOX", "TOWER", "KAST");
  const rwy = sim.airport.runways["09L"];
  assert.ok(rwy);

  const ac = createArrivalAircraft(sim, {
    callsign: "AIC973",
    spokenCallsign: "Air India nine seven three",
    targetRunway: "09L",
    gateId: "GATE4",
    state: "FINAL",
    x: rwy.thresholdX,
    y: rwy.thresholdY,
    altitude: sim.airport.elevationFt,
  });

  // Declare crash
  declareAircraftCrash(sim, ac, rwy, "Severe lateral excursion off runway");
  assert.equal(ac.state, "CRASHED");
  assert.equal(ac.crashDetails?.arffDispatched, false);
  assert.equal(ac.crashDetails?.runwayHalted, false);
  assert.equal(ac.crashDetails?.medicalRequested, false);

  // 1. Dispatch ARFF
  const arffRes = dispatchCrashRescue(sim, ac.id);
  assert.equal(arffRes, true);
  assert.equal(ac.crashDetails?.arffDispatched, true);
  const arffRadio = sim.radioLog.filter((m) => m.text.includes("ARFF") || m.text.includes("foam"));
  assert.ok(arffRadio.length >= 2, "Should log ARFF call and ARFF responder unit acknowledgement");

  // 2. Halt Runway Operations
  const haltRes = haltRunwayOperations(sim, "09L", ac.id);
  assert.equal(haltRes, true);
  assert.equal(ac.crashDetails?.runwayHalted, true);
  assert.equal(sim.closedRunways?.["09L"], true, "Runway 09L should be recorded as closed in sim");
  const haltRadio = sim.radioLog.find((m) => m.text.includes("officially CLOSED"));
  assert.ok(haltRadio, "Should broadcast runway closure to all stations");

  // 3. Request Medical Evacuation
  const medRes = requestMedicalEvacuation(sim, ac.id);
  assert.equal(medRes, true);
  assert.equal(ac.crashDetails?.medicalRequested, true);
  const medRadio = sim.radioLog.find((m) => m.text.includes("ambulances"));
  assert.ok(medRadio, "Should log medical triage and ambulance dispatch");

  // 4. Clear Crash Site & Reopen Runway
  const clearRes = clearCrashSite(sim, ac.id);
  assert.equal(clearRes, true);
  assert.equal(ac.state, "COMPLETED_ARRIVAL");
  assert.equal(sim.closedRunways?.["09L"], false, "Runway 09L should be reopened after clearance");
  const reopenRadio = sim.radioLog.find((m) => m.text.includes("reopened"));
  assert.ok(reopenRadio, "Should log wreckage cleared and runway reopened");
});
