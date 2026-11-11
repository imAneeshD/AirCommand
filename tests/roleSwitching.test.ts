import test from "node:test";
import assert from "node:assert/strict";
import {
  createBaseSimulation,
  createDepartureAircraft,
  createArrivalAircraft,
  shouldHearControllerAudio,
  stepSimulation,
  switchPlayerStation,
} from "../src/engine/simulation.ts";

function advance(state: ReturnType<typeof createBaseSimulation>, seconds: number): void {
  const step = 0.2;
  const count = Math.round(seconds / step);
  for (let i = 0; i < count; i++) {
    stepSimulation(state, step);
  }
}

test("Role switching sets single active player role while other roles automate, and ALL mode automates everything", () => {
  const s = createBaseSimulation("NORMAL_OPS", "GROUND");
  assert.deepEqual(s.config.stationControl, {
    GROUND: "PLAYER",
    TOWER: "AUTONOMOUS",
    DEPARTURE: "AUTONOMOUS",
  });

  switchPlayerStation(s, "TOWER");
  assert.equal(s.config.activePlayerStation, "TOWER");
  assert.deepEqual(s.config.stationControl, {
    GROUND: "AUTONOMOUS",
    TOWER: "PLAYER",
    DEPARTURE: "AUTONOMOUS",
  });

  switchPlayerStation(s, "DEPARTURE");
  assert.equal(s.config.activePlayerStation, "DEPARTURE");
  assert.deepEqual(s.config.stationControl, {
    GROUND: "AUTONOMOUS",
    TOWER: "AUTONOMOUS",
    DEPARTURE: "PLAYER",
  });

  switchPlayerStation(s, "ALL");
  assert.equal(s.config.activePlayerStation, "ALL");
  assert.deepEqual(s.config.stationControl, {
    GROUND: "AUTONOMOUS",
    TOWER: "AUTONOMOUS",
    DEPARTURE: "AUTONOMOUS",
  });
});

test("Audio isolation hears ONLY the active role frequency, while ALL hears all roles", () => {
  assert.equal(shouldHearControllerAudio("GROUND", "GROUND"), true);
  assert.equal(shouldHearControllerAudio("GROUND", "TOWER"), false);
  assert.equal(shouldHearControllerAudio("GROUND", "DEPARTURE"), false);

  assert.equal(shouldHearControllerAudio("TOWER", "GROUND"), false);
  assert.equal(shouldHearControllerAudio("TOWER", "TOWER"), true);
  assert.equal(shouldHearControllerAudio("TOWER", "DEPARTURE"), false);

  assert.equal(shouldHearControllerAudio("DEPARTURE", "GROUND"), false);
  assert.equal(shouldHearControllerAudio("DEPARTURE", "TOWER"), false);
  assert.equal(shouldHearControllerAudio("DEPARTURE", "DEPARTURE"), true);

  assert.equal(shouldHearControllerAudio("ALL", "GROUND"), true);
  assert.equal(shouldHearControllerAudio("ALL", "TOWER"), true);
  assert.equal(shouldHearControllerAudio("ALL", "DEPARTURE"), true);
});

test("ALL neutral mode operates Ground, Tower, and Departure automatically end-to-end", () => {
  const s = createBaseSimulation("SANDBOX", "ALL");
  s.config.autoSpawnTraffic = false;
  s.config.readbackErrorProbability = 0;

  const ual = createDepartureAircraft(s, {
    callsign: "UAL452",
    spokenCallsign: "United 452",
    gateId: "B12",
    targetRunway: "09L",
    requiresPushback: true,
  });
  const dal = createArrivalAircraft(s, {
    callsign: "DAL814",
    spokenCallsign: "Delta 814",
    x: -8.5,
    y: s.airport.runways["09R"].thresholdY,
    heading: 90,
    altitude: 2600,
    speed: 170,
    targetRunway: "09R",
    gateId: "S1",
    state: "APPROACH",
    controller: "DEPARTURE",
  });

  advance(s, 320);

  assert.ok(ual.clearances.some((c) => c.type === "PUSHBACK" && c.issuedBy === "AUTONOMOUS"));
  assert.ok(ual.clearances.some((c) => c.type === "TAXI" && c.issuedBy === "AUTONOMOUS"));
  assert.ok(ual.clearances.some((c) => c.type === "TAKEOFF" && c.issuedBy === "AUTONOMOUS"));
  assert.ok(
    ual.state === "CLIMB" ||
      ual.state === "CRUISE_OUTBOUND" ||
      ual.state === "COMPLETED_DEPARTURE",
    `Expected UAL452 airborne/departed in ALL mode, got ${ual.state}`
  );

  assert.ok(dal.clearances.some((c) => c.type === "LAND" && c.issuedBy === "AUTONOMOUS"));
  assert.ok(
    dal.state === "TAXIING" ||
      dal.state === "CROSSING_RUNWAY" ||
      dal.state === "HOLDING_SHORT" ||
      dal.state === "COMPLETED_ARRIVAL",
    `Expected DAL814 landed/vacating/taxiing in ALL mode, got ${dal.state}`
  );
});
