import test from "node:test";
import assert from "node:assert/strict";
import { makeRunway } from "../src/utils/osmToAirport.ts";
import { canAircraftMove, canAircraftExecuteAction, getNextCrossingRunway } from "../src/engine/validationEngine.ts";
import { updateAircraftMovement } from "../src/engine/movementEngine.ts";
import type { Aircraft, SimulationState } from "../src/types/atc.ts";
import { useAtcStore } from "../src/store/atcStore.ts";

function createMockCrossingSimulation(): { state: SimulationState; departureAc: Aircraft } {
  const rwy11L = makeRunway({
    id: "11L",
    oppositeId: "29R",
    heading: 110,
    thresholdX: 0,
    thresholdY: 0,
    lengthNm: 2.0,
    widthNm: 0.035,
    elevationFt: 777,
  });
  const rwy11R = makeRunway({
    id: "11R",
    oppositeId: "29L",
    heading: 110,
    thresholdX: 0,
    thresholdY: -0.4,
    lengthNm: 2.0,
    widthNm: 0.035,
    elevationFt: 777,
  });

  // Taxiway T6 crossing runway 11L:
  // Node 1: HS_11L_T6 (north hold short, y = 0.05)
  // Node 2: RWY_11L_T6 (centerline, y = 0.0)
  // Node 3: T6_SOUTH (south of 11L, y = -0.05)
  // Node 4: HS_11R_T6 (north hold short for 11R, y = -0.35)
  const nodes = {
    HS_11L_T6: {
      id: "HS_11L_T6",
      x: 0.5,
      y: 0.05,
      kind: "HOLD_SHORT" as const,
      label: "HS 11L",
      holdShortForRunway: "11L",
      isNorthSide: true,
    },
    RWY_11L_T6: {
      id: "RWY_11L_T6",
      x: 0.5,
      y: 0.0,
      kind: "RUNWAY_ENTRY" as const,
      label: "11L/T6",
      runwayId: "11L",
    },
    T6_SOUTH: {
      id: "T6_SOUTH",
      x: 0.5,
      y: -0.05,
      kind: "TAXIWAY" as const,
      label: "T6",
    },
    HS_11R_T6: {
      id: "HS_11R_T6",
      x: 0.5,
      y: -0.35,
      kind: "HOLD_SHORT" as const,
      label: "HS 11R",
      holdShortForRunway: "11R",
      isNorthSide: true,
    },
  };

  const edges = [
    { id: "e1", from: "HS_11L_T6", to: "RWY_11L_T6", taxiway: "T6", runwayCrossing: "11L" },
    { id: "e2", from: "RWY_11L_T6", to: "T6_SOUTH", taxiway: "T6", runwayCrossing: "11L" },
    { id: "e3", from: "T6_SOUTH", to: "HS_11R_T6", taxiway: "T6" },
  ];

  const departureAc: Aircraft = {
    id: "DAL389",
    callsign: "DAL389",
    spokenCallsign: "Delta 389",
    flightKind: "DEPARTURE",
    aircraftType: "B738",
    wakeCategory: "MEDIUM",
    state: "CROSSING_RUNWAY",
    x: 0.5,
    y: 0.0, // physically on runway 11L!
    altitude: 777,
    heading: 180,
    speed: 26,
    verticalSpeed: 0,
    targetRunway: "11R",
    controller: "GROUND",
    commStatus: "NORMAL",
    clearances: [
      {
        id: "clr_taxi",
        aircraftId: "DAL389",
        issuedAt: 10,
        controller: "GROUND",
        type: "TAXI",
        acknowledged: true,
        parameters: { taxiway: "T6", runway: "11R" },
      } as unknown as Aircraft["clearances"][number],
      {
        id: "clr_cross",
        aircraftId: "DAL389",
        issuedAt: 20,
        controller: "GROUND",
        type: "CROSS_RUNWAY",
        acknowledged: true,
        parameters: { runway: "11L" },
      } as unknown as Aircraft["clearances"][number],
    ],
    crossRunwayCleared: { "11L": true },
    holdingAtRunway: "11L",
    assignedRouteNodeIds: ["HS_11L_T6", "RWY_11L_T6", "T6_SOUTH", "HS_11R_T6"],
    routeStepIndex: 1, // At RWY_11L_T6, moving to T6_SOUTH
    currentNodeId: "RWY_11L_T6",
    gateId: "20",
    stateEnteredAt: 20,
    trail: [],
  } as unknown as Aircraft;

  // Another aircraft holding short of 11L outside the runway on taxiway Romeo (e.g. VT1722)
  const waitingAc: Aircraft = {
    id: "VT1722",
    callsign: "VT1722",
    spokenCallsign: "Vistara 1722",
    flightKind: "DEPARTURE",
    aircraftType: "A320",
    wakeCategory: "MEDIUM",
    state: "HOLDING_SHORT",
    x: 0.52,
    y: 0.06,
    altitude: 777,
    heading: 180,
    speed: 0,
    verticalSpeed: 0,
    targetRunway: "11L",
    controller: "GROUND",
    commStatus: "NORMAL",
    clearances: [],
    crossRunwayCleared: {},
    holdingAtRunway: "11L",
    holdingShortReason: "CROSSING_REQUIRED",
    assignedRouteNodeIds: [],
    routeStepIndex: 0,
    stateEnteredAt: 15,
    trail: [],
  } as unknown as Aircraft;

  const state: SimulationState = {
    time: 25,
    scenarioId: "NORMAL_OPS",
    airport: {
      id: "VIDP",
      icao: "VIDP",
      name: "Indira Gandhi International",
      elevationFt: 777,
      runways: { "11L": rwy11L, "11R": rwy11R },
      runwayIds: ["11L", "11R"],
      nodes,
      edges,
      transitionAltitudeFt: 5000,
      airspaceCeilingFt: 14000,
      radarRadiusNm: 35,
    },
    aircraft: { DAL389: departureAc, VT1722: waitingAc },
    aircraftOrder: ["DAL389", "VT1722"],
    selectedAircraftId: "DAL389",
    radioLog: [],
    score: 100,
    strikes: 0,
    metrics: {
      departuresCompleted: 0,
      arrivalsCompleted: 0,
      scoreEvents: [],
    },
    wind: { heading: 110, speedKts: 8 },
    config: {
      separationDistNm: 3,
      separationAltFt: 1000,
      minimumsCeilingFt: 200,
      minimumsVisibilitySm: 0.5,
      activePlayerStation: "ALL",
      nordoMode: "OFF",
    },
  } as unknown as SimulationState;

  return { state, departureAc };
}

test("Runway Crossing: canAircraftMove is true when crossing runway", () => {
  const { state, departureAc } = createMockCrossingSimulation();

  assert.equal(departureAc.state, "CROSSING_RUNWAY");
  assert.equal(canAircraftMove(departureAc, state), true, "Crossing aircraft MUST be allowed to move");
  const crossCheck = canAircraftExecuteAction(departureAc, "CROSS_RUNWAY", state);
  assert.equal(crossCheck.allowed, true, "CROSS_RUNWAY action must be permitted for active crossing");
});

test("Runway Crossing: departure aircraft does not halt mid-runway for traffic holding short outside runway", () => {
  const { state, departureAc } = createMockCrossingSimulation();

  // Run movement engine for multiple timesteps across runway 11L
  const initialY = departureAc.y;
  for (let i = 0; i < 5; i++) {
    updateAircraftMovement(state, 0.5);
  }

  // Aircraft should keep moving south (towards T6_SOUTH) without dropping speed to 0
  assert.ok(departureAc.y < initialY, "Aircraft must move forward across the runway");
  assert.ok(departureAc.speed > 10, "Aircraft speed must remain high to vacate active runway");
});

test("Runway Crossing: transitions cleanly to TAXIING when clearing the runway towards departure runway 11R", () => {
  const { state, departureAc } = createMockCrossingSimulation();

  // Teleport aircraft close to T6_SOUTH to test clearing the runway
  departureAc.x = 0.5;
  departureAc.y = -0.048;
  departureAc.routeStepIndex = 1;

  // Next movement integrates arrival at T6_SOUTH (outside runway 11L)
  updateAircraftMovement(state, 0.5);

  assert.equal(departureAc.currentNodeId, "T6_SOUTH");
  assert.equal(departureAc.state, "TAXIING", "Aircraft must transition from CROSSING_RUNWAY to TAXIING once across");
  assert.equal(departureAc.targetRunway, "11R", "Departure target runway remains 11R");
});

test("Email Modal: useAtcStore manages showEmailModal and can open/close on demand", () => {
  const initial = useAtcStore.getState().showEmailModal;
  assert.equal(initial, false, "showEmailModal defaults to false");

  useAtcStore.getState().setShowEmailModal(true);
  assert.equal(useAtcStore.getState().showEmailModal, true, "setShowEmailModal(true) opens modal");

  useAtcStore.getState().setShowEmailModal(false);
  assert.equal(useAtcStore.getState().showEmailModal, false, "setShowEmailModal(false) closes modal");
});
