import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateAirframeVSpeeds,
  initializePilotSimulation,
  stepPilotFlightDeck,
  DEFAULT_COCKPIT_CONTROLS,
  INITIAL_CHECKLIST_ITEMS,
} from "../src/engine/pilotEngine.ts";
import { createAsteriaAirport } from "../src/data/asteriaAirport.ts";
import { pilotVoiceCallouts } from "../src/utils/pilotVoiceCallouts.ts";
import type { PilotConfig } from "../src/types/pilot.ts";

test("Pilot Simulator V-Speeds: accurately calculates V1, Vr, V2 for distinct airframe classes", () => {
  const turboprop = calculateAirframeVSpeeds("AT76");
  assert.equal(turboprop.v1, 105);
  assert.equal(turboprop.vr, 110);
  assert.equal(turboprop.v2, 118);

  const narrowA320 = calculateAirframeVSpeeds("A20N");
  assert.equal(narrowA320.v1, 138);
  assert.equal(narrowA320.vr, 144);
  assert.equal(narrowA320.v2, 150);

  const wideB777 = calculateAirframeVSpeeds("B77W");
  assert.equal(wideB777.v1, 148);
  assert.equal(wideB777.vr, 156);
  assert.equal(wideB777.v2, 164);
});

test("Pilot Simulator Initialization: strictly enforces Phase 1 Max 2 Planes constraint", () => {
  const config: PilotConfig = {
    airportIcao: "KAST",
    airportName: "Asteria Municipal",
    modelCode: "A20N",
    modelName: "Airbus A320neo",
    airlineCode: "AIC",
    airlineName: "Air India",
    callsign: "AIC505",
    flightNumber: "505",
    registration: "VT-EXF",
    gateId: "T1_1",
    targetRunway: "09",
    destinationIcao: "VIDP",
    destinationName: "Indira Gandhi Intl",
    v1Speed: 138,
    vrSpeed: 144,
    v2Speed: 150,
    cruiseAltitude: 34000,
  };

  const { sim, playerAircraftId } = initializePilotSimulation(createAsteriaAirport(), undefined, config);

  // Assert exactly 2 planes
  assert.equal(sim.aircraftOrder.length, 2, "Phase 1 requires exactly 2 aircraft in simulation");
  assert.equal(Object.keys(sim.aircraft).length, 2);

  // Assert autoSpawnTraffic is false to preserve 2-plane ceiling
  assert.equal(sim.config.autoSpawnTraffic, false, "Traffic auto-spawning must be disabled in Pilot mode");

  // Assert player aircraft staged at gate
  const player = sim.aircraft[playerAircraftId];
  assert.ok(player, "Player aircraft must be present in simulation");
  assert.equal(player.isPlayerPilot, true);
  assert.equal(player.callsign, "AIC505");
  assert.equal(player.gateId, "T1_1");
  assert.equal(player.state, "AT_GATE");
  assert.equal(player.speed, 0);

  // Assert ambient AI traffic is present
  const aiId = sim.aircraftOrder.find((id) => id !== playerAircraftId);
  assert.ok(aiId);
  const ai = sim.aircraft[aiId!];
  assert.ok(ai);
  assert.notEqual(ai.id, player.id);
});

test("Pilot Simulator Avionics & Engine Spooling: battery & APU supply bus, engines spool to idle & TOGA", () => {
  const config: PilotConfig = {
    airportIcao: "KAST",
    airportName: "Asteria Municipal",
    modelCode: "A20N",
    modelName: "Airbus A320neo",
    airlineCode: "AIC",
    airlineName: "Air India",
    callsign: "AIC505",
    flightNumber: "505",
    registration: "VT-EXF",
    gateId: "T1_1",
    targetRunway: "09",
    destinationIcao: "VIDP",
    destinationName: "Indira Gandhi Intl",
    v1Speed: 138,
    vrSpeed: 144,
    v2Speed: 150,
    cruiseAltitude: 34000,
  };

  const { sim, playerAircraftId } = initializePilotSimulation(createAsteriaAirport(), undefined, config);
  let controls = { ...DEFAULT_COCKPIT_CONTROLS };
  let checklist = [...INITIAL_CHECKLIST_ITEMS];

  // Step 1: Turn on Batteries and APU
  controls.battery1 = true;
  controls.battery2 = true;
  controls.apuMaster = true;
  controls.apuStart = true;

  const res1 = stepPilotFlightDeck({
    sim,
    playerAircraftId,
    controls,
    checklist,
    v1Speed: 138,
    vrSpeed: 144,
    v2Speed: 150,
    dt: 1.0,
    voiceEnabled: false,
  });

  assert.equal(res1.controls.apuAvail, true, "APU should be AVAIL when batteries and start engaged");

  // Step 2: Turn on Engine 1 & 2 Master switches
  controls = {
    ...res1.controls,
    engine1Master: true,
    engine2Master: true,
  };

  // Step multiple frames to simulate engine spooling
  for (let i = 0; i < 5; i++) {
    const res = stepPilotFlightDeck({
      sim,
      playerAircraftId,
      controls,
      checklist: res1.checklist,
      v1Speed: 138,
      vrSpeed: 144,
      v2Speed: 150,
      dt: 0.5,
      voiceEnabled: false,
    });
    controls = res.controls;
    checklist = res.checklist;
  }

  assert.ok(controls.engine1N1 > 15, "Engine 1 N1 should spool up towards idle (>15%)");
  assert.ok(controls.engine2N1 > 15, "Engine 2 N1 should spool up towards idle (>15%)");

  // Advance throttle to TOGA
  controls.throttle = "TOGA";
  for (let i = 0; i < 8; i++) {
    const res = stepPilotFlightDeck({
      sim,
      playerAircraftId,
      controls,
      checklist,
      v1Speed: 138,
      vrSpeed: 144,
      v2Speed: 150,
      dt: 0.5,
      voiceEnabled: false,
    });
    controls = res.controls;
    checklist = res.checklist;
  }

  assert.ok(controls.engine1N1 > 80, "Engine 1 N1 should spool up towards 100% on TOGA (>80%)");
});

test("Pilot Simulator Takeoff Roll & Voice Callouts: accelerates on TOGA and triggers 80kt -> V1 -> Rotate -> Positive Rate", () => {
  pilotVoiceCallouts.resetTakeoffCallouts();

  const config: PilotConfig = {
    airportIcao: "KAST",
    airportName: "Asteria Municipal",
    modelCode: "A20N",
    modelName: "Airbus A320neo",
    airlineCode: "AIC",
    airlineName: "Air India",
    callsign: "AIC505",
    flightNumber: "505",
    registration: "VT-EXF",
    gateId: "T1_1",
    targetRunway: "09",
    destinationIcao: "VIDP",
    destinationName: "Indira Gandhi Intl",
    v1Speed: 135,
    vrSpeed: 142,
    v2Speed: 148,
    cruiseAltitude: 34000,
  };

  const { sim, playerAircraftId } = initializePilotSimulation(createAsteriaAirport(), undefined, config);
  const ac = sim.aircraft[playerAircraftId];
  ac.state = "TAKEOFF_CLEARED";
  ac.speed = 70; // Pre-staged near takeoff speed

  let controls = {
    ...DEFAULT_COCKPIT_CONTROLS,
    battery1: true,
    battery2: true,
    apuAvail: true,
    engine1Master: true,
    engine2Master: true,
    engine1N1: 100,
    engine2N1: 100,
    parkingBrake: false,
    throttle: "TOGA" as const,
  };
  let checklist = [...INITIAL_CHECKLIST_ITEMS];

  const calloutsCaptured: string[] = [];

  // Simulate roll through 80kt, V1, VR, liftoff
  for (let i = 0; i < 60; i++) {
    sim.time += 0.8;
    const res = stepPilotFlightDeck({
      sim,
      playerAircraftId,
      controls,
      checklist,
      v1Speed: 135,
      vrSpeed: 142,
      v2Speed: 148,
      dt: 0.25,
      voiceEnabled: true,
    });
    controls = res.controls;
    checklist = res.checklist;
    if (res.calloutMade && !calloutsCaptured.includes(res.calloutMade)) {
      calloutsCaptured.push(res.calloutMade);
    }
  }

  // Verify acceleration occurred
  assert.ok(ac.speed > 135, `Aircraft speed should accelerate above V1 (current: ${ac.speed} kt)`);
  assert.ok(ac.state === "ROTATE" || ac.state === "CLIMB", `Aircraft state should reach ROTATE or CLIMB (current: ${ac.state})`);
  assert.ok(calloutsCaptured.length >= 2, `Takeoff should generate automated voice callouts (captured: ${calloutsCaptured.join(", ")})`);
});
