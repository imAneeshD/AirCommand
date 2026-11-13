import test from "node:test";
import assert from "node:assert/strict";
import { createScenarioSimulation, stepSimulation } from "../src/engine/simulation.ts";
import { submitClearanceDecision, controllerCallsign, controllerFrequency } from "../src/engine/decisionEngine.ts";
import { getAglAltitudeFt, isSurfaceAircraft } from "../src/utils/telemetry.ts";

function stepUntilCondition(sim: ReturnType<typeof createScenarioSimulation>, pred: () => boolean, maxSteps = 30): void {
  for (let i = 0; i < maxSteps; i++) {
    if (pred()) return;
    stepSimulation(sim, 0.5);
  }
}

test("Arrival Traffic Flow: Area -> Approach ('Asteria Approach') -> Tower -> Ground -> Gate", () => {
  const sim = createScenarioSimulation("LIGHT");
  const arrival = Object.values(sim.aircraft).find((a) => a.flightKind === "ARRIVAL")!;
  assert.ok(arrival, "Must have an arrival aircraft in LIGHT scenario");

  // Inbound arrival begins under Approach Control
  arrival.controller = "DEPARTURE";

  // Approach control station check
  const appCallsign = controllerCallsign("DEPARTURE", sim.airport, arrival.flightKind);
  assert.match(appCallsign, /Approach$/, `Arrival radar controller must be 'Approach', got ${appCallsign}`);
  const appFreq = controllerFrequency("DEPARTURE", sim.airport, arrival.flightKind);
  assert.ok(appFreq.length > 0, "Must return valid approach frequency");

  // Approach hands off arrival to Tower
  const hoTwr = submitClearanceDecision(
    sim,
    {
      aircraftId: arrival.id,
      controller: "DEPARTURE",
      type: "HANDOFF",
      parameters: { targetController: "TOWER", bypassPending: true },
    },
    "PLAYER"
  );
  assert.ok(hoTwr.ok, `Handoff to Tower failed: ${hoTwr.reason}`);
  stepUntilCondition(sim, () => arrival.controller === "TOWER");
  assert.equal(arrival.controller, "TOWER");
  assert.equal(arrival.pendingRequest?.type, "LANDING");
  assert.match(arrival.pendingRequest?.message ?? "", /Tower/);

  // Tower clears to land
  const clrLand = submitClearanceDecision(
    sim,
    {
      aircraftId: arrival.id,
      controller: "TOWER",
      type: "LAND",
      parameters: { runway: arrival.targetRunway },
    },
    "PLAYER"
  );
  assert.ok(clrLand.ok, `Landing clearance failed: ${clrLand.reason}`);

  // Once landed on surface, handoff to Ground
  arrival.state = "VACATING_RUNWAY";
  arrival.altitude = sim.airport.elevationFt;
  const hoGnd = submitClearanceDecision(
    sim,
    {
      aircraftId: arrival.id,
      controller: "TOWER",
      type: "HANDOFF",
      parameters: { targetController: "GROUND", bypassPending: true },
    },
    "PLAYER"
  );
  assert.ok(hoGnd.ok, `Handoff to Ground failed: ${hoGnd.reason}`);
  stepUntilCondition(sim, () => arrival.controller === "GROUND");
  assert.equal(arrival.controller, "GROUND");
  assert.equal(arrival.pendingRequest?.type, "GATE_TAXI");
  assert.match(arrival.pendingRequest?.message ?? "", /Ground/);
});

test("Go-Around Flow: Tower issues GO_AROUND -> climbs safely above field elevation -> hands off to Approach ('Asteria Approach')", () => {
  const sim = createScenarioSimulation("LIGHT");
  const elev = sim.airport.elevationFt;
  const expectedGaAlt = Math.round((elev + 3000) / 500) * 500;

  const arrival = Object.values(sim.aircraft).find((a) => a.flightKind === "ARRIVAL")!;
  arrival.controller = "TOWER";
  arrival.state = "FINAL";
  arrival.altitude = elev + 280;

  const gaRes = submitClearanceDecision(
    sim,
    {
      aircraftId: arrival.id,
      controller: "TOWER",
      type: "GO_AROUND",
      parameters: { altitude: expectedGaAlt, heading: 90 },
    },
    "PLAYER"
  );
  assert.ok(gaRes.ok, `GO_AROUND failed: ${gaRes.reason}`);
  assert.equal(arrival.state, "GO_AROUND");
  assert.equal(arrival.assignedAltitude, expectedGaAlt);
  assert.ok(arrival.verticalSpeed >= 1200, "Must immediately pitch up with positive climb rate");

  // Must not be tagged as surface or 0ft AGL
  assert.equal(isSurfaceAircraft(arrival, elev), false);
  const agl = getAglAltitudeFt(arrival, elev);
  assert.ok(agl > 100, `AGL altitude during go-around must be positive, got ${agl}`);

  // Advance simulation to climb
  stepSimulation(sim, 3.0);
  assert.ok(arrival.altitude > elev + 300, "Aircraft must climb above field elevation");

  // Handoff to Approach Control (NOT Departure!)
  const hoApp = submitClearanceDecision(
    sim,
    {
      aircraftId: arrival.id,
      controller: "TOWER",
      type: "HANDOFF",
      parameters: { targetController: "DEPARTURE", bypassPending: true },
    },
    "PLAYER"
  );
  assert.ok(hoApp.ok, `Handoff to Approach failed: ${hoApp.reason}`);
  stepUntilCondition(sim, () => arrival.controller === "DEPARTURE");
  assert.equal(arrival.controller, "DEPARTURE");
  assert.equal(arrival.pendingRequest?.type, "APPROACH_VECTORS");
  assert.match(arrival.pendingRequest?.message ?? "", /Approach/);
  assert.match(arrival.pendingRequest?.message ?? "", /missed approach/);
});

test("Departure Traffic Flow: Ground -> Tower -> Departure ('Asteria Departure') -> Area / Center (ACC)", () => {
  const sim = createScenarioSimulation("LIGHT");
  const dep = Object.values(sim.aircraft).find((a) => a.flightKind === "DEPARTURE")!;
  assert.ok(dep, "Must have a departure aircraft");

  // Callsign verification for departure
  const depCallsign = controllerCallsign("DEPARTURE", sim.airport, dep.flightKind);
  assert.match(depCallsign, /Departure$/, `Departure controller must be 'Departure', got ${depCallsign}`);

  // Ground hands off to Tower at runway
  dep.controller = "GROUND";
  dep.state = "HOLDING_SHORT";
  const hoTwr = submitClearanceDecision(
    sim,
    {
      aircraftId: dep.id,
      controller: "GROUND",
      type: "HANDOFF",
      parameters: { targetController: "TOWER", bypassPending: true },
    },
    "PLAYER"
  );
  assert.ok(hoTwr.ok, `Handoff to Tower failed: ${hoTwr.reason}`);
  stepUntilCondition(sim, () => dep.controller === "TOWER");
  assert.equal(dep.controller, "TOWER");
  assert.equal(dep.pendingRequest?.type, "TAKEOFF");

  // Airborne climb -> Tower hands off to Departure
  dep.state = "CLIMB";
  dep.altitude = sim.airport.elevationFt + 1200;
  const hoDep = submitClearanceDecision(
    sim,
    {
      aircraftId: dep.id,
      controller: "TOWER",
      type: "HANDOFF",
      parameters: { targetController: "DEPARTURE", bypassPending: true },
    },
    "PLAYER"
  );
  assert.ok(hoDep.ok, `Handoff to Departure failed: ${hoDep.reason}`);
  stepUntilCondition(sim, () => dep.controller === "DEPARTURE");
  assert.equal(dep.controller, "DEPARTURE");
  assert.equal(dep.pendingRequest?.type, "CLIMB_HIGHER");

  // Departure hands off to Area Control (ACC)
  const hoAcc = submitClearanceDecision(
    sim,
    {
      aircraftId: dep.id,
      controller: "DEPARTURE",
      type: "HANDOFF",
      parameters: { targetController: "ACC", bypassPending: true },
    },
    "PLAYER"
  );
  assert.ok(hoAcc.ok, `Handoff to Area Control failed: ${hoAcc.reason}`);
  stepUntilCondition(sim, () => dep.state === "COMPLETED_DEPARTURE");
  assert.equal(dep.state, "COMPLETED_DEPARTURE");
  assert.ok(sim.metrics.departuresCompleted >= 1);
});

test("Tower controller receives and accepts incoming handoff from Approach for aircraft on final", () => {
  const sim = createScenarioSimulation("LIGHT");
  sim.config.activePlayerStation = "TOWER";

  const arrival = Object.values(sim.aircraft).find((a) => a.flightKind === "ARRIVAL")!;
  arrival.controller = "DEPARTURE";
  arrival.state = "FINAL";

  // AI Approach issues handoff to Tower
  const hoReq = submitClearanceDecision(
    sim,
    {
      aircraftId: arrival.id,
      controller: "DEPARTURE",
      type: "HANDOFF",
      parameters: { targetController: "TOWER" },
    },
    "AUTONOMOUS"
  );
  assert.ok(hoReq.ok, `Handoff request failed: ${hoReq.reason}`);

  // Pending handoff should be created in sim.handoffs
  const pending = sim.handoffs.find(
    (h) => h.aircraftId === arrival.id && h.status === "PENDING" && h.toController === "TOWER"
  );
  assert.ok(pending, "Must find pending handoff to TOWER in simulation state");

  // Player accepts the handoff
  const hoAccept = submitClearanceDecision(
    sim,
    {
      aircraftId: pending.aircraftId,
      controller: pending.fromController,
      type: "HANDOFF",
      parameters: { targetController: pending.toController, bypassPending: true },
    },
    "PLAYER"
  );
  assert.ok(hoAccept.ok, `Accept handoff failed: ${hoAccept.reason}`);

  stepUntilCondition(sim, () => arrival.controller === "TOWER");
  assert.equal(arrival.controller, "TOWER");
  assert.equal(arrival.pendingRequest?.type, "LANDING");
  assert.match(arrival.pendingRequest?.message ?? "", /Tower/);
});

test("Holding short runway: Ground request is HANDOFF to Tower, next required option is Tower handoff", () => {
  const sim = createScenarioSimulation("LIGHT");
  const dep = Object.values(sim.aircraft).find((a) => a.flightKind === "DEPARTURE")!;
  assert.ok(dep, "Must have a departure aircraft");

  // Aircraft taxied to holding point and is holding short for departure runway
  dep.state = "HOLDING_SHORT";
  dep.holdingAtRunway = "09L";
  dep.holdingShortReason = "DEPARTURE_RUNWAY";
  dep.controller = "GROUND";

  // Stepping simulation: pilot should request Tower frequency from Ground (not takeoff from Ground)
  stepSimulation(sim, 0.5);
  assert.equal(dep.pendingRequest?.type, "HANDOFF");
  assert.equal(dep.pendingRequest?.controller, "GROUND");
  assert.match(dep.pendingRequest?.message ?? "", /request Tower frequency/);

  // Ground issues handoff to Tower
  const ho = submitClearanceDecision(
    sim,
    {
      aircraftId: dep.id,
      controller: "GROUND",
      type: "HANDOFF",
      parameters: { targetController: "TOWER", bypassPending: true },
    },
    "PLAYER"
  );
  assert.ok(ho.ok);

  stepUntilCondition(sim, () => dep.controller === "TOWER");
  assert.equal(dep.controller, "TOWER");
});

test("Single active role with other roles autonomous: auto controllers progress aircraft without getting stuck", () => {
  const sim = createScenarioSimulation("LIGHT");
  sim.config.activePlayerStation = "TOWER";
  sim.config.autoManageOtherStations = true;
  sim.config.stationControl = {
    GROUND: "AUTONOMOUS",
    TOWER: "PLAYER",
    DEPARTURE: "AUTONOMOUS",
  };

  // 1. Inbound arrival under auto DEPARTURE should be handed off to Tower proactively when in approach range
  const arrival = Object.values(sim.aircraft).find((a) => a.flightKind === "ARRIVAL")!;
  arrival.controller = "DEPARTURE";
  arrival.state = "APPROACH";
  arrival.x = -6.0;
  arrival.y = 0;
  arrival.heading = 90;

  // Run autonomous controllers
  stepSimulation(sim, 2.0);

  // Auto Departure should have issued handoff to TOWER
  const pendingHandoff = sim.handoffs.find(
    (h) => h.aircraftId === arrival.id && h.status === "PENDING" && h.toController === "TOWER"
  );
  assert.ok(pendingHandoff, "Auto Departure must issue handoff to Tower for approaching arrival");

  // 2. Test holding short departure with auto Tower
  sim.config.activePlayerStation = "GROUND";
  sim.config.stationControl = {
    GROUND: "PLAYER",
    TOWER: "AUTONOMOUS",
    DEPARTURE: "AUTONOMOUS",
  };

  const dep = Object.values(sim.aircraft).find((a) => a.flightKind === "DEPARTURE")!;
  dep.controller = "TOWER";
  dep.state = "HOLDING_SHORT";
  dep.holdingShortReason = "DEPARTURE_RUNWAY";
  dep.targetRunway = "09L";
  dep.x = 0;
  dep.y = 0;

  // Step simulation - auto Tower should line up or clear takeoff
  stepSimulation(sim, 2.0);
  assert.ok(
    dep.state === "LINE_UP_WAIT" ||
      dep.state === "TAKEOFF_CLEARED" ||
      dep.state === "TAKEOFF_ROLL" ||
      dep.clearances.some((c) => c.type === "TAKEOFF" || c.type === "LINE_UP"),
    `Auto Tower must issue LINE_UP or TAKEOFF, current state: ${dep.state}`
  );
});
