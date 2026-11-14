import test from "node:test";
import assert from "node:assert/strict";
import { createAirportById, alongRunwayNm, crossTrackRunwayNm, runwayPoint } from "../src/data/asteriaAirport.ts";
import { createBaseSimulation, createDepartureAircraft } from "../src/engine/simulation.ts";
import { updateAircraftMovement } from "../src/engine/movementEngine.ts";
import { updateAircraftStates } from "../src/engine/aircraftEngine.ts";
import type { Aircraft } from "../src/types/atc.ts";

test("Runway Lineup: aircraft in TAKEOFF_CLEARED aligns strictly forward onto centerline and rolls straight", () => {
  const airport = createAirportById("KAST");
  const state = createBaseSimulation("NORMAL_OPS", "ALL", "KAST", airport);
  const rwy = state.airport.runways["09R"];
  assert.ok(rwy, "Runway 09R must exist");

  const ac = createDepartureAircraft(state, {
    callsign: "QTR963",
    spokenCallsign: "Qatar 963",
    gateId: "1",
    targetRunway: "09R",
    aircraftType: "B77W",
  });

  // Place aircraft at hold-short setback (cross = 0.05 NM, along = 0.10 NM)
  const hsPt = runwayPoint(rwy, 0.10, 0.05);
  ac.x = hsPt.x;
  ac.y = hsPt.y;
  ac.state = "TAKEOFF_CLEARED";
  ac.heading = (rwy.heading + 90) % 360;
  ac.speed = 0;
  ac.verticalSpeed = 0;
  ac.altitude = state.airport.elevationFt;
  ac.trail = [];
  ac.clearances = [
    {
      id: "c-tko",
      type: "TAKEOFF",
      issuedAt: state.time,
      controller: "TOWER",
      active: true,
      acknowledged: true,
      lifecycle: "ACTIVE",
      parameters: { runway: "09R" },
    } as unknown as Aircraft["clearances"][number],
  ];

  // Step physics forward while in lineup
  for (let s = 0; s < 35; s++) {
    updateAircraftMovement(state, 0.5);
    updateAircraftStates(state);
    state.time += 0.5;

    // Must never veer backward behind entry along
    const curAlong = alongRunwayNm(rwy, ac.x, ac.y);
    assert.ok(
      curAlong >= 0.08,
      `Aircraft along position (${curAlong}) must not move backward behind entry point`
    );

    // Cross track distance must remain within runway boundary and decrease
    const curCross = Math.abs(crossTrackRunwayNm(rwy, ac.x, ac.y));
    assert.ok(
      curCross <= 0.055,
      `Aircraft cross track (${curCross}) must remain within runway margin`
    );
  }

  // After 35 steps, aircraft should have reached centerline and transitioned to TAKEOFF_ROLL
  assert.strictEqual(ac.state, "TAKEOFF_ROLL");

  // Advance TAKEOFF_ROLL for 10 seconds: must stay strictly locked to runway centerline (cross = 0)
  for (let s = 0; s < 20; s++) {
    updateAircraftMovement(state, 0.5);
    state.time += 0.5;
    const rollCross = Math.abs(crossTrackRunwayNm(rwy, ac.x, ac.y));
    assert.ok(
      rollCross < 0.001,
      `During TAKEOFF_ROLL, cross track (${rollCross}) must stay locked to centerline`
    );
  }
});

test("Mid-runway entry: aircraft does not pull backward even if past mid-runway", () => {
  const airport = createAirportById("KAST");
  const state = createBaseSimulation("NORMAL_OPS", "ALL", "KAST", airport);
  const rwy = state.airport.runways["09R"];
  assert.ok(rwy);

  const ac = createDepartureAircraft(state, {
    callsign: "UAE916",
    spokenCallsign: "Emirates 916",
    gateId: "2",
    targetRunway: "09R",
    aircraftType: "A388",
  });

  // Position at 75% down runway (where old rwy.lengthNm - 0.5 pulled backwards!)
  const alongPos = rwy.lengthNm * 0.75;
  const hsPt = runwayPoint(rwy, alongPos, 0.04);
  ac.x = hsPt.x;
  ac.y = hsPt.y;
  ac.state = "TAKEOFF_CLEARED";
  ac.heading = rwy.heading;
  ac.speed = 10;
  ac.verticalSpeed = 0;
  ac.altitude = state.airport.elevationFt;
  ac.trail = [];
  ac.clearances = [
    {
      id: "c-mid",
      type: "TAKEOFF",
      issuedAt: state.time,
      controller: "TOWER",
      active: true,
      acknowledged: true,
      lifecycle: "ACTIVE",
      parameters: { runway: "09R" },
    } as unknown as Aircraft["clearances"][number],
  ];

  updateAircraftMovement(state, 0.5);
  const nextAlong = alongRunwayNm(rwy, ac.x, ac.y);
  assert.ok(
    nextAlong >= alongPos - 0.005,
    `Aircraft at mid-runway must not be pulled backward: was ${alongPos}, now ${nextAlong}`
  );
});
