import { deriveFlightMetadata } from "../data/aircraftCatalog.ts";
import {
  createAirportById,
  runwayPoint,
} from "../data/asteriaAirport.ts";
import type {
  Aircraft,
  AircraftPhaseLabel,
  AirportId,
  AirportLayout,
  ControllerRole,
  FlightKind,
  PlayerRoleMode,
  RunwayId,
  ScenarioId,
  SimulationConfig,
  SimulationState,
} from "../types/atc.ts";
import { updateAircraftStates } from "./aircraftEngine.ts";
import { runAutonomousControllers } from "./autonomousControllers.ts";
import { nextId } from "./clearanceEngine.ts";
import { addRadioMessage, processPilotReadbacks } from "./decisionEngine.ts";
import { updateAircraftMovement } from "./movementEngine.ts";

const AIRLINES: Array<{ code: string; spoken: string; name: string; types: string[] }> = [
  { code: "UAL", spoken: "United", name: "United Airlines", types: ["B738", "B752", "A320"] },
  { code: "DAL", spoken: "Delta", name: "Delta Air Lines", types: ["A321", "B739", "B763"] },
  { code: "AAL", spoken: "American", name: "American Airlines", types: ["B738", "A319", "B772"] },
  { code: "SWA", spoken: "Southwest", name: "Southwest Airlines", types: ["B737", "B38M"] },
  { code: "JBU", spoken: "JetBlue", name: "JetBlue Airways", types: ["A320", "A220"] },
  { code: "FDX", spoken: "FedEx", name: "FedEx Express", types: ["B763", "MD11"] },
];

const INDIA_AND_INTL_AIRLINES: Array<{ code: string; spoken: string; name: string; types: string[] }> = [
  { code: "IGO", spoken: "iFly", name: "IndiGo Airlines", types: ["A320", "A321"] },
  { code: "AIC", spoken: "Air India", name: "Air India", types: ["A320", "B772", "B738"] },
  { code: "VTI", spoken: "Vistara", name: "Vistara", types: ["A320", "A321", "B739"] },
  { code: "SEJ", spoken: "SpiceJet", name: "SpiceJet", types: ["B737", "B38M"] },
  { code: "UAE", spoken: "Emirates", name: "Emirates", types: ["B772", "B763"] },
  { code: "BAW", spoken: "Speedbird", name: "British Airways", types: ["A320", "B772"] },
];

const DEPARTURE_FIXES = ["ASTER1", "DELTA", "ECHO"];

function createDefaultConfig(activeStation: PlayerRoleMode = "ALL"): SimulationConfig {
  return {
    activePlayerStation: activeStation,
    autoManageOtherStations: true,
    stationControl: {
      GROUND: activeStation === "GROUND" ? "PLAYER" : "AUTONOMOUS",
      TOWER: activeStation === "TOWER" ? "PLAYER" : "AUTONOMOUS",
      DEPARTURE: activeStation === "DEPARTURE" ? "PLAYER" : "AUTONOMOUS",
    },
    readbackDelaySeconds: 1.2,
    readbackErrorProbability: 0.05,
    nordoMode: "LIGHT_GUN_SIGNALS",
    autoSpawnTraffic: true,
    autoMinimumsGoAround: true,
    autonomousReactionInterval: 1.0,
  };
}

export function getAircraftPhaseLabel(ac: Aircraft): AircraftPhaseLabel {
  if (ac.operationMode === "EMERGENCY_OPERATION" && ac.flightKind === "ARRIVAL") {
    if (ac.state === "GO_AROUND" || ac.state === "MISSED_APPROACH") return "Go-around";
    if (ac.state === "CRUISE_OUTBOUND") return "Diversion";
  }
  switch (ac.state) {
    case "AT_GATE":
      return "Parked";
    case "PUSHBACK_APPROVED":
    case "PUSHING_BACK":
    case "PUSHBACK_COMPLETE":
      return "Pushback";
    case "TAXIING":
    case "CROSSING_RUNWAY":
      return ac.flightKind === "ARRIVAL" ? "Taxi-in" : "Taxi-out";
    case "HOLDING_SHORT":
    case "HOLD_POSITION":
    case "TAKEOFF_CANCELLED":
      return ac.flightKind === "ARRIVAL" ? "Parking" : "Holding short";
    case "LINE_UP_WAIT":
    case "TAKEOFF_CLEARED":
      return "Line-up";
    case "TAKEOFF_ROLL":
    case "REJECTED_TAKEOFF":
    case "BRAKING":
    case "STOPPED_ON_RUNWAY":
    case "ROTATE":
      return "Takeoff";
    case "CLIMB":
      return ac.altitude < 3500 ? "Initial climb" : "Departure";
    case "CRUISE_OUTBOUND":
      return "Cruise";
    case "APPROACH":
      return ac.verticalSpeed < -200 ? "Descent" : "Approach";
    case "FINAL":
    case "CLEARED_TO_LAND":
      return "Approach";
    case "LANDING":
    case "TOUCHDOWN":
    case "ROLLOUT":
      return "Landing";
    case "VACATING_RUNWAY":
    case "COMPLETED_ARRIVAL":
      return ac.state === "COMPLETED_ARRIVAL" ? "Parking" : "Taxi-in";
    case "GO_AROUND":
    case "MISSED_APPROACH":
      return "Go-around";
    case "COMPLETED_DEPARTURE":
      return "Cruise";
    case "CRASHED":
      return "Crashed";
  }
}

export function createBaseSimulation(
  scenarioId: ScenarioId = "NORMAL_OPS",
  activeStation: PlayerRoleMode = "ALL",
  airportId: AirportId = "KAST",
  customAirport?: AirportLayout
): SimulationState {
  const airport = customAirport ?? createAirportById(airportId);
  const config = createDefaultConfig(activeStation);
  if (scenarioId === "CROSSINGS_AND_READBACK") {
    config.readbackErrorProbability = 0.2;
  } else if (scenarioId === "SANDBOX") {
    config.autoSpawnTraffic = false;
    config.readbackErrorProbability = 0;
  } else if (scenarioId === "HEAVY" || scenarioId === "RUSH_HOUR") {
    config.readbackErrorProbability = 0.08;
  } else if (scenarioId === "LOW_TRAFFIC") {
    config.readbackErrorProbability = 0.01;
  } else if (scenarioId === "LIGHT") {
    config.readbackErrorProbability = 0.02;
  }

  return {
    scenarioId,
    time: 0,
    paused: false,
    timeScale: 1,
    airport,
    aircraft: {},
    aircraftOrder: [],
    selectedAircraftId: null,
    radioLog: [],
    handoffs: [],
    incidents: [],
    closedRunways: {},
    config,
    metrics: {
      departuresCompleted: 0,
      arrivalsCompleted: 0,
      clearancesIssued: 0,
      readbackErrorsCaught: 0,
      goAroundsExecuted: 0,
      safetyScore: 100,
      conflictsDetected: 0,
    },
    nextIdCounter: 0,
    lastAutonomousRunAt: -10,
    lastTrafficSpawnAt: 0,
  };
}

export function createDepartureAircraft(
  state: SimulationState,
  opts: {
    id?: string;
    callsign: string;
    spokenCallsign: string;
    airline?: string;
    aircraftType?: string;
    gateId: string;
    targetRunway: RunwayId;
    requiresPushback?: boolean;
    departureFix?: string;
    controller?: ControllerRole;
  }
): Aircraft {
  const gateNodeId = `GATE_${opts.gateId}`;
  const gateNode = state.airport.nodes[gateNodeId];
  const id = opts.id ?? opts.callsign;
  const acType = opts.aircraftType ?? "B738";
  const meta = deriveFlightMetadata(opts.callsign, "DEPARTURE", state.airport, acType);
  const pbNode = state.airport.nodes[`PB_${opts.gateId}`];
  const gateFacingHeading = pbNode
    ? (() => {
        const deg =
          ((Math.atan2(gateNode.x - pbNode.x, gateNode.y - pbNode.y) * 180) / Math.PI + 360) % 360;
        return deg === 0 ? 360 : Math.round(deg);
      })()
    : gateNode.isNorthSide
    ? 0
    : 180;

  const ac: Aircraft = {
    id,
    callsign: opts.callsign,
    spokenCallsign: opts.spokenCallsign,
    airline: opts.airline ?? "Airline",
    aircraftType: acType,
    wakeCategory: acType === "B772" || acType === "B763" || acType === "MD11" ? "HEAVY" : "MEDIUM",
    flightKind: "DEPARTURE",
    squawk: String(2100 + (state.nextIdCounter % 600)).padStart(4, "0"),
    ...meta,
    state: "AT_GATE",
    controller: opts.controller ?? "GROUND",
    operationMode: "NORMAL_OPERATION",
    emergencyType: "NONE",
    commStatus: "NORMAL",
    nordoMode: state.config.nordoMode,
    x: gateNode.x,
    y: gateNode.y,
    heading: gateFacingHeading,
    altitude: state.airport.elevationFt,
    speed: 0,
    verticalSpeed: 0,
    gateId: opts.gateId,
    pushbackSpotId: `PB_${opts.gateId}`,
    targetRunway: opts.targetRunway,
    assignedDepartureFix:
      opts.departureFix ??
      state.airport.departureFixIds[state.nextIdCounter % state.airport.departureFixIds.length] ??
      DEPARTURE_FIXES[0],
    currentNodeId: gateNodeId,
    assignedRouteNodeIds: [],
    assignedRouteTaxiways: [],
    routeStepIndex: 0,
    crossRunwayCleared: Object.fromEntries(state.airport.runwayIds.map((r) => [r, false])),
    requiresPushback: opts.requiresPushback ?? true,
    assignedHeading: null,
    assignedTurnDirection: "NEAREST",
    assignedAltitude: null,
    assignedSpeed: null,
    assignedApproach: null,
    assignedDirectFix: null,
    clearances: [],
    pendingRequest: null,
    hasReadbackError: false,
    armNextReadbackError: false,
    spawnedAt: state.time,
    stateEnteredAt: state.time,
    lastTransmissionAt: -10,
    trail: [],
  };
  state.aircraft[ac.id] = ac;
  if (!state.aircraftOrder.includes(ac.id)) {
    state.aircraftOrder.push(ac.id);
  }
  return ac;
}

export function createArrivalAircraft(
  state: SimulationState,
  opts: {
    id?: string;
    callsign: string;
    spokenCallsign: string;
    airline?: string;
    aircraftType?: string;
    x: number;
    y: number;
    heading?: number;
    altitude?: number;
    speed?: number;
    targetRunway: RunwayId;
    gateId: string;
    state?: "APPROACH" | "FINAL";
    controller?: ControllerRole;
    assignedApproach?: RunwayId | null;
  }
): Aircraft {
  const id = opts.id ?? opts.callsign;
  const acType = opts.aircraftType ?? "A320";
  const meta = deriveFlightMetadata(opts.callsign, "ARRIVAL", state.airport, acType);
  const ac: Aircraft = {
    id,
    callsign: opts.callsign,
    spokenCallsign: opts.spokenCallsign,
    airline: opts.airline ?? "Airline",
    aircraftType: acType,
    wakeCategory: acType === "MD11" || acType === "B772" || acType === "B763" ? "HEAVY" : "MEDIUM",
    flightKind: "ARRIVAL",
    squawk: String(3100 + (state.nextIdCounter % 600)).padStart(4, "0"),
    ...meta,
    state: opts.state ?? "APPROACH",
    controller: opts.controller ?? "DEPARTURE",
    operationMode: "NORMAL_OPERATION",
    emergencyType: "NONE",
    commStatus: "NORMAL",
    nordoMode: state.config.nordoMode,
    x: opts.x,
    y: opts.y,
    heading: opts.heading ?? 90,
    altitude: opts.altitude ?? 3500,
    speed: opts.speed ?? 180,
    verticalSpeed: 0,
    gateId: opts.gateId,
    targetRunway: opts.targetRunway,
    assignedRouteNodeIds: [],
    assignedRouteTaxiways: [],
    routeStepIndex: 0,
    crossRunwayCleared: Object.fromEntries(state.airport.runwayIds.map((r) => [r, false])),
    requiresPushback: false,
    assignedHeading: opts.heading ?? 90,
    assignedTurnDirection: "NEAREST",
    assignedAltitude: opts.altitude ?? 3500,
    assignedSpeed: opts.speed ?? 180,
    assignedApproach: opts.assignedApproach ?? null,
    assignedDirectFix: null,
    clearances: [],
    pendingRequest: null,
    hasReadbackError: false,
    armNextReadbackError: false,
    spawnedAt: state.time,
    stateEnteredAt: state.time,
    lastTransmissionAt: -10,
    trail: [{ x: opts.x, y: opts.y }],
  };
  state.aircraft[ac.id] = ac;
  if (!state.aircraftOrder.includes(ac.id)) {
    state.aircraftOrder.push(ac.id);
  }
  return ac;
}

export function createScenarioSimulation(
  scenarioId: ScenarioId = "NORMAL_OPS",
  activeStation: PlayerRoleMode = "ALL",
  airportId: AirportId = "KAST",
  customAirport?: AirportLayout
): SimulationState {
  const state = createBaseSimulation(scenarioId, activeStation, airportId, customAirport);
  const ap = state.airport;
  const elev = ap.elevationFt;
  const baseAlt = Math.round(elev / 500) * 500;
  const rwyDep = ap.primaryDepartureRunway;
  const rwyArr = ap.primaryArrivalRunway;
  const depSpec = ap.runways[rwyDep];
  const arrSpec = ap.runways[rwyArr];
  const g0 = ap.gateIds[2] ?? ap.gateIds[0];
  const g1 = ap.gateIds[5] ?? ap.gateIds[1] ?? ap.gateIds[0];
  const g2 = ap.gateIds[ap.gateIds.length - 1] ?? ap.gateIds[0];
  const g3 = ap.gateIds[0];
  const g4 = ap.gateIds[1] ?? ap.gateIds[0];

  if (scenarioId === "LOW_TRAFFIC") {
    const ual = createDepartureAircraft(state, {
      callsign: "UAL452",
      spokenCallsign: "United 452",
      airline: "United Airlines",
      aircraftType: "B738",
      gateId: g0,
      targetRunway: rwyDep,
      requiresPushback: true,
      departureFix: ap.departureFixIds[0],
    });
    const finPt = runwayPoint(arrSpec, -6.5, 0);
    createArrivalAircraft(state, {
      callsign: "DAL814",
      spokenCallsign: "Delta 814",
      airline: "Delta Air Lines",
      aircraftType: "B739",
      x: finPt.x,
      y: finPt.y,
      heading: arrSpec.heading,
      altitude: elev + 2100,
      speed: 165,
      targetRunway: rwyArr,
      gateId: g3,
      state: "APPROACH",
      controller: "TOWER",
      assignedApproach: rwyArr,
    });
    state.selectedAircraftId = ual.id;
  } else if (scenarioId === "NORMAL_OPS" || scenarioId === "MEDIUM" || scenarioId === "MIXED" || scenarioId === "LIGHT") {
    const ual = createDepartureAircraft(state, {
      callsign: "UAL452",
      spokenCallsign: "United 452",
      airline: "United Airlines",
      aircraftType: "B738",
      gateId: g0,
      targetRunway: rwyDep,
      requiresPushback: true,
      departureFix: ap.departureFixIds[0],
    });
    createDepartureAircraft(state, {
      callsign: "AAL127",
      spokenCallsign: "American 127",
      airline: "American Airlines",
      aircraftType: "A321",
      gateId: g1,
      targetRunway: rwyArr,
      requiresPushback: true,
      departureFix: ap.departureFixIds[ap.departureFixIds.length - 1],
    });
    if (g2 !== g0 && g2 !== g1) {
      createDepartureAircraft(state, {
        callsign: "SWA309",
        spokenCallsign: "Southwest 309",
        airline: "Southwest Airlines",
        aircraftType: "B737",
        gateId: g2,
        targetRunway: rwyArr,
        requiresPushback: false,
        departureFix: ap.departureFixIds[1] ?? ap.departureFixIds[0],
      });
    }
    const finPt = runwayPoint(depSpec, -4.6, 0);
    createArrivalAircraft(state, {
      callsign: "DAL814",
      spokenCallsign: "Delta 814",
      airline: "Delta Air Lines",
      aircraftType: "B739",
      x: finPt.x,
      y: finPt.y,
      heading: depSpec.heading,
      altitude: elev + 1600,
      speed: 155,
      targetRunway: rwyDep,
      gateId: g3,
      state: "FINAL",
      controller: "TOWER",
      assignedApproach: rwyDep,
    });
    const appPt = runwayPoint(arrSpec, -10.5, -3.2);
    createArrivalAircraft(state, {
      callsign: "JBU618",
      spokenCallsign: "JetBlue 618",
      airline: "JetBlue Airways",
      aircraftType: "A320",
      x: appPt.x,
      y: appPt.y,
      heading: ((arrSpec.heading - 15 + 360) % 360) || 360,
      altitude: baseAlt + 4000,
      speed: 200,
      targetRunway: rwyArr,
      gateId: g4,
      state: "APPROACH",
      controller: "DEPARTURE",
    });
    state.selectedAircraftId = ual.id;
  } else if (scenarioId === "CROSSINGS_AND_READBACK") {
    const ual = createDepartureAircraft(state, {
      callsign: "UAL452",
      spokenCallsign: "United 452",
      airline: "United Airlines",
      aircraftType: "B738",
      gateId: g0,
      targetRunway: rwyArr,
      requiresPushback: false,
      departureFix: ap.departureFixIds[1] ?? ap.departureFixIds[0],
    });
    ual.armNextReadbackError = true;
    createDepartureAircraft(state, {
      callsign: "FDX901",
      spokenCallsign: "FedEx 901",
      airline: "FedEx Express",
      aircraftType: "B763",
      gateId: g2,
      targetRunway: rwyDep,
      requiresPushback: false,
      departureFix: ap.departureFixIds[0],
    });
    const finPt = runwayPoint(depSpec, -5.2, 0);
    createArrivalAircraft(state, {
      callsign: "DAL814",
      spokenCallsign: "Delta 814",
      airline: "Delta Air Lines",
      aircraftType: "A321",
      x: finPt.x,
      y: finPt.y,
      heading: depSpec.heading,
      altitude: elev + 1850,
      speed: 155,
      targetRunway: rwyDep,
      gateId: g3,
      state: "FINAL",
      controller: "TOWER",
      assignedApproach: rwyDep,
    });
    state.selectedAircraftId = ual.id;
  } else if (scenarioId === "EMERGENCY_AND_NORDO" || scenarioId === "EMERGENCY") {
    const ual = createDepartureAircraft(state, {
      callsign: "UAL452",
      spokenCallsign: "United 452",
      airline: "United Airlines",
      aircraftType: "B738",
      gateId: g0,
      targetRunway: rwyDep,
      requiresPushback: true,
    });
    const nordoPt = runwayPoint(arrSpec, -4.4, 0);
    const swa = createArrivalAircraft(state, {
      callsign: "SWA712",
      spokenCallsign: "Southwest 712",
      airline: "Southwest Airlines",
      aircraftType: "B737",
      x: nordoPt.x,
      y: nordoPt.y,
      heading: arrSpec.heading,
      altitude: elev + 1500,
      speed: 150,
      targetRunway: rwyArr,
      gateId: g2,
      state: "FINAL",
      controller: "TOWER",
      assignedApproach: rwyArr,
    });
    swa.commStatus = "RADIO_FAILURE";
    swa.squawk = "7600";

    const emergPt = runwayPoint(depSpec, -8.8, 2.0);
    const fdx = createArrivalAircraft(state, {
      callsign: "FDX901",
      spokenCallsign: "FedEx 901",
      airline: "FedEx Express",
      aircraftType: "MD11",
      x: emergPt.x,
      y: emergPt.y,
      heading: ((depSpec.heading + 15) % 360) || 360,
      altitude: baseAlt + 3400,
      speed: 190,
      targetRunway: rwyDep,
      gateId: g1,
      state: "APPROACH",
      controller: "DEPARTURE",
    });
    fdx.operationMode = "EMERGENCY_OPERATION";
    fdx.emergencyType = "ENGINE_FAILURE";
    fdx.squawk = "7700";

    state.selectedAircraftId = activeStation === "TOWER" ? swa.id : ual.id;
    addRadioMessage(state, {
      sender: "SYSTEM",
      recipient: "ALL",
      controller: "TOWER",
      category: "EMERGENCY",
      text: "INCIDENT BRIEF: SWA712 is NORDO (Squawk 7600 — use Tower Light Gun). FDX901 declared Engine Failure (Squawk 7700).",
    });
  } else if (
    scenarioId === "RUSH_HOUR" ||
    scenarioId === "HEAVY" ||
    scenarioId === "DEPARTURE_HEAVY"
  ) {
    const rushGates = ap.gateIds.slice(0, Math.min(5, ap.gateIds.length));
    rushGates.forEach((g, idx) => {
      const al = AIRLINES[idx % AIRLINES.length];
      const num = 400 + idx * 37;
      createDepartureAircraft(state, {
        callsign: `${al.code}${num}`,
        spokenCallsign: `${al.spoken} ${num}`,
        airline: al.name,
        aircraftType: al.types[0],
        gateId: g,
        targetRunway: ap.runwayIds[idx % ap.runwayIds.length],
        requiresPushback: !g.startsWith("S"),
      });
    });
    const finPt = runwayPoint(depSpec, -4.8, 0);
    createArrivalAircraft(state, {
      callsign: "DAL814",
      spokenCallsign: "Delta 814",
      x: finPt.x,
      y: finPt.y,
      heading: depSpec.heading,
      altitude: elev + 1650,
      speed: 155,
      targetRunway: rwyDep,
      gateId: g3,
      state: "FINAL",
      controller: "TOWER",
      assignedApproach: rwyDep,
    });
    const appPt = runwayPoint(arrSpec, -9.2, 0);
    createArrivalAircraft(state, {
      callsign: "JBU215",
      spokenCallsign: "JetBlue 215",
      x: appPt.x,
      y: appPt.y,
      heading: arrSpec.heading,
      altitude: baseAlt + 3000,
      speed: 185,
      targetRunway: rwyArr,
      gateId: g4,
      state: "APPROACH",
      controller: "DEPARTURE",
      assignedApproach: rwyArr,
    });
    state.selectedAircraftId = state.aircraftOrder[0] ?? null;
  } else if (scenarioId === "ARRIVAL_HEAVY") {
    const ual = createDepartureAircraft(state, {
      callsign: "AIC502",
      spokenCallsign: "Air India 502",
      airline: "Air India",
      aircraftType: "A320",
      gateId: g0,
      targetRunway: rwyDep,
      requiresPushback: true,
    });
    const finOffsets = [-4.2, -7.8, -11.5];
    finOffsets.forEach((offset, idx) => {
      const rwyId = idx % 2 === 0 ? rwyDep : rwyArr;
      const spec = ap.runways[rwyId];
      const pt = runwayPoint(spec, offset, idx === 2 ? 1.8 : 0);
      const num = 310 + idx * 45;
      createArrivalAircraft(state, {
        callsign: `IGO${num}`,
        spokenCallsign: `iFly ${num}`,
        airline: "IndiGo Airlines",
        aircraftType: idx === 1 ? "A321" : "A320",
        x: pt.x,
        y: pt.y,
        heading: spec.heading,
        altitude: elev + 1400 + idx * 1100,
        speed: 155 + idx * 18,
        targetRunway: rwyId,
        gateId: ap.gateIds[idx % ap.gateIds.length],
        state: idx === 0 ? "FINAL" : "APPROACH",
        controller: idx === 0 ? "TOWER" : "DEPARTURE",
        assignedApproach: idx === 0 ? rwyId : null,
      });
    });
    state.selectedAircraftId = state.aircraftOrder[1] ?? ual.id;
  } else {
    // SANDBOX
    const ual = createDepartureAircraft(state, {
      callsign: "UAL452",
      spokenCallsign: "United 452",
      airline: "United Airlines",
      aircraftType: "B738",
      gateId: g0,
      targetRunway: rwyDep,
      requiresPushback: true,
    });
    const finPt = runwayPoint(depSpec, -5.8, 0);
    createArrivalAircraft(state, {
      callsign: "DAL814",
      spokenCallsign: "Delta 814",
      airline: "Delta Air Lines",
      aircraftType: "B739",
      x: finPt.x,
      y: finPt.y,
      heading: depSpec.heading,
      altitude: elev + 2000,
      speed: 160,
      targetRunway: rwyDep,
      gateId: g3,
      state: "FINAL",
      controller: "TOWER",
      assignedApproach: rwyDep,
    });
    state.selectedAircraftId = ual.id;
  }

  // Trigger initial pilot requests right at t=0
  updateAircraftStates(state);
  return state;
}

export function shouldHearControllerAudio(
  activeStation: PlayerRoleMode,
  msgController: ControllerRole
): boolean {
  if (activeStation === "ALL") return true;
  return msgController === activeStation;
}

export function switchPlayerStation(
  state: SimulationState,
  newStation: PlayerRoleMode
): void {
  state.config.activePlayerStation = newStation;
  if (newStation === "ALL") {
    state.config.stationControl = {
      GROUND: "AUTONOMOUS",
      TOWER: "AUTONOMOUS",
      DEPARTURE: "AUTONOMOUS",
    };
    addRadioMessage(state, {
      sender: "CONSOLE",
      recipient: "ATC",
      controller: "TOWER",
      category: "SYSTEM",
      text: "Switched to ALL NEUTRAL (Auto-All) — Ground, Tower, and Departure all automated; monitoring all frequencies.",
    });
    return;
  }

  if (state.config.autoManageOtherStations) {
    state.config.stationControl = {
      GROUND: newStation === "GROUND" ? "PLAYER" : "AUTONOMOUS",
      TOWER: newStation === "TOWER" ? "PLAYER" : "AUTONOMOUS",
      DEPARTURE: newStation === "DEPARTURE" ? "PLAYER" : "AUTONOMOUS",
    };
  }

  // Focus selection onto an active aircraft owned by the newly assumed station if needed
  const currentSelected = state.selectedAircraftId ? state.aircraft[state.selectedAircraftId] : null;
  if (
    !currentSelected ||
    currentSelected.controller !== newStation ||
    currentSelected.state === "COMPLETED_ARRIVAL" ||
    currentSelected.state === "COMPLETED_DEPARTURE"
  ) {
    const matchId = state.aircraftOrder.find((id) => {
      const ac = state.aircraft[id];
      return (
        ac &&
        ac.controller === newStation &&
        ac.state !== "COMPLETED_ARRIVAL" &&
        ac.state !== "COMPLETED_DEPARTURE"
      );
    });
    if (matchId) {
      state.selectedAircraftId = matchId;
    }
  }

  addRadioMessage(state, {
    sender: "CONSOLE",
    recipient: "ATC",
    controller: newStation,
    category: "SYSTEM",
    text: `Player assumed ${newStation} role. Other roles ${state.config.autoManageOtherStations ? "running automatically" : "manual"}; audio tuned to ${newStation} only.`,
  });
}

export function setStationAutoAssist(
  state: SimulationState,
  enabled: boolean
): void {
  state.config.autoManageOtherStations = enabled;
  if (state.config.activePlayerStation === "ALL") {
    state.config.stationControl = {
      GROUND: "AUTONOMOUS",
      TOWER: "AUTONOMOUS",
      DEPARTURE: "AUTONOMOUS",
    };
    return;
  }
  if (enabled) {
    switchPlayerStation(state, state.config.activePlayerStation);
  } else {
    state.config.stationControl = {
      GROUND: "PLAYER",
      TOWER: "PLAYER",
      DEPARTURE: "PLAYER",
    };
  }
}

export function spawnRandomTraffic(
  state: SimulationState,
  kind?: FlightKind
): Aircraft | null {
  const activeCount = state.aircraftOrder.filter((id) => {
    const a = state.aircraft[id];
    return a && a.state !== "COMPLETED_ARRIVAL" && a.state !== "COMPLETED_DEPARTURE";
  }).length;
  const maxTraffic =
    state.scenarioId === "LOW_TRAFFIC"
      ? 3
      : state.scenarioId === "LIGHT"
      ? 5
      : state.scenarioId === "HEAVY" || state.scenarioId === "RUSH_HOUR"
      ? 13
      : 11;
  if (activeCount >= maxTraffic) return null;

  const chooseKind: FlightKind =
    kind ??
    (state.scenarioId === "ARRIVAL_HEAVY"
      ? state.nextIdCounter % 4 === 0
        ? "DEPARTURE"
        : "ARRIVAL"
      : state.scenarioId === "DEPARTURE_HEAVY"
      ? state.nextIdCounter % 4 === 0
        ? "ARRIVAL"
        : "DEPARTURE"
      : state.nextIdCounter % 2 === 0
      ? "DEPARTURE"
      : "ARRIVAL");

  const useIndiaFleet = state.airport.icao.startsWith("V") || state.airport.country === "India";
  const pool = useIndiaFleet ? [...INDIA_AND_INTL_AIRLINES, ...AIRLINES.slice(0, 2)] : AIRLINES;
  const airline = pool[state.nextIdCounter % pool.length];
  const flightNum = 100 + ((state.nextIdCounter * 43) % 890);
  const callsign = `${airline.code}${flightNum}`;
  if (state.aircraft[callsign]) return null;
  const spokenCallsign = `${airline.spoken} ${flightNum}`;
  const acType = airline.types[state.nextIdCounter % airline.types.length];

  if (chooseKind === "DEPARTURE") {
    const candidateGates = state.airport.gateIds;
    const freeGate = candidateGates.find((g) => {
      const gn = state.airport.nodes[`GATE_${g}`];
      if (!gn) return false;
      return !state.aircraftOrder.some((id) => {
        const a = state.aircraft[id];
        if (!a || a.state === "COMPLETED_ARRIVAL" || a.state === "COMPLETED_DEPARTURE") return false;
        return Math.hypot(a.x - gn.x, a.y - gn.y) < 0.12;
      });
    });
    if (!freeGate) return null;
    const rwy = state.airport.runwayIds[state.nextIdCounter % state.airport.runwayIds.length];
    const ac = createDepartureAircraft(state, {
      callsign,
      spokenCallsign,
      airline: airline.name,
      aircraftType: acType,
      gateId: freeGate,
      targetRunway: rwy,
      requiresPushback: !freeGate.startsWith("S"),
    });
    updateAircraftStates(state);
    return ac;
  }

  const fromLeft = state.nextIdCounter % 2 === 0;
  const rwy: RunwayId =
    state.airport.runwayIds[state.nextIdCounter % state.airport.runwayIds.length];
  const rwySpec = state.airport.runways[rwy];
  const gates = state.airport.gateIds;
  const gateId = gates[state.nextIdCounter % gates.length];
  const spawnPt = runwayPoint(rwySpec, -11.5, fromLeft ? 3.8 : -3.8);
  const baseAlt = Math.round(state.airport.elevationFt / 500) * 500;
  const ac = createArrivalAircraft(state, {
    callsign,
    spokenCallsign,
    airline: airline.name,
    aircraftType: acType,
    x: spawnPt.x,
    y: spawnPt.y,
    heading: ((rwySpec.heading + (fromLeft ? 25 : -25) + 360) % 360) || 360,
    altitude: baseAlt + 4200,
    speed: 205,
    targetRunway: rwy,
    gateId,
    state: "APPROACH",
    controller: "DEPARTURE",
  });
  updateAircraftStates(state);
  return ac;
}

function checkSeparationAndConflicts(state: SimulationState): void {
  const elev = state.airport.elevationFt;
  const active = state.aircraftOrder
    .map((id) => state.aircraft[id])
    .filter(
      (a): a is Aircraft =>
        Boolean(a) &&
        a.state !== "COMPLETED_ARRIVAL" &&
        a.state !== "COMPLETED_DEPARTURE"
    );

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const altDiff = Math.abs(a.altitude - b.altitude);

      // Airborne separation (< 1.5 NM lateral AND < 800 ft vertical above 400 ft AGL)
      if (a.altitude > elev + 400 && b.altitude > elev + 400) {
        if (dist < 1.5 && altDiff < 800) {
          const recent = state.incidents.some(
            (inc) =>
              inc.code === "LOSS_OF_SEPARATION" &&
              state.time - inc.timestamp < 15 &&
              inc.aircraftIds.includes(a.id) &&
              inc.aircraftIds.includes(b.id)
          );
          if (!recent) {
            state.metrics.conflictsDetected += 1;
            state.metrics.safetyScore = Math.max(0, state.metrics.safetyScore - 5);
            state.incidents.push({
              id: nextId(state, "inc"),
              timestamp: state.time,
              severity: "VIOLATION",
              code: "LOSS_OF_SEPARATION",
              message: `Loss of separation between ${a.callsign} and ${b.callsign} (${dist.toFixed(1)} NM, ${Math.round(altDiff)} ft).`,
              aircraftIds: [a.id, b.id],
            });
          }
        }
      }

      // Runway incursion / conflict (< 0.14 NM on same runway)
      if (
        a.altitude <= elev + 35 &&
        b.altitude <= elev + 35 &&
        dist < 0.14 &&
        Math.abs(a.y - b.y) < 0.03 &&
        (a.state === "TAKEOFF_ROLL" ||
          b.state === "TAKEOFF_ROLL" ||
          a.state === "LANDING" ||
          b.state === "LANDING" ||
          a.state === "ROLLOUT" ||
          b.state === "ROLLOUT")
      ) {
        const recent = state.incidents.some(
          (inc) =>
            inc.code === "RUNWAY_INCURSION" &&
            state.time - inc.timestamp < 12 &&
            inc.aircraftIds.includes(a.id) &&
            inc.aircraftIds.includes(b.id)
        );
        if (!recent) {
          state.metrics.conflictsDetected += 1;
          state.metrics.safetyScore = Math.max(0, state.metrics.safetyScore - 10);
          state.incidents.push({
            id: nextId(state, "inc"),
            timestamp: state.time,
            severity: "CRITICAL",
            code: "RUNWAY_INCURSION",
            message: `RUNWAY CONFLICT between ${a.callsign} (${a.state}) and ${b.callsign} (${b.state})!`,
            aircraftIds: [a.id, b.id],
          });
        }
      }
    }
  }
}

/**
 * Advances the simulation by dtSeconds (subject to fixed-step sub-stepping for determinism).
 */
export function stepSimulation(
  state: SimulationState,
  dtSeconds: number
): void {
  if (state.paused || dtSeconds <= 0) return;

  const maxStep = 0.2;
  let remaining = dtSeconds;
  while (remaining > 0.0001) {
    const step = Math.min(maxStep, remaining);
    state.time += step;

    // 1. Process pilot readbacks on pending clearances
    processPilotReadbacks(state);

    // 2. Run autonomous controllers for non-player stations (strictly via DecisionEngine!)
    runAutonomousControllers(state);

    // 3. Evaluate state machine transitions & pilot requests
    updateAircraftStates(state);

    // 4. Advance physical movement (strictly guarded by canAircraftMove!)
    updateAircraftMovement(state, step);

    // 5. Check safety separation & runway conflicts
    checkSeparationAndConflicts(state);

    // 6. Auto-spawn periodic traffic if enabled
    const spawnPeriod =
      state.scenarioId === "LOW_TRAFFIC"
        ? 55
        : state.scenarioId === "RUSH_HOUR" || state.scenarioId === "HEAVY"
        ? 13
        : state.scenarioId === "LIGHT"
        ? 34
        : 22;
    if (
      state.config.autoSpawnTraffic &&
      !state.liveSnapshotMeta?.liveSyncEnabled &&
      state.time - state.lastTrafficSpawnAt >= spawnPeriod
    ) {
      state.lastTrafficSpawnAt = state.time;
      spawnRandomTraffic(state);
    }

    remaining -= step;
  }
}
