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

export const AIRLINES: Array<{ code: string; spoken: string; name: string; types: string[] }> = [
  { code: "UAL", spoken: "United", name: "United Airlines", types: ["B789", "B772", "B739", "B752", "A320"] },
  { code: "DAL", spoken: "Delta", name: "Delta Air Lines", types: ["A359", "A339", "A321", "B739", "B738"] },
  { code: "AAL", spoken: "American", name: "American Airlines", types: ["B77W", "B788", "B738", "A321", "A319"] },
  { code: "SWA", spoken: "Southwest", name: "Southwest Airlines", types: ["B737", "B38M"] },
  { code: "JBU", spoken: "JetBlue", name: "JetBlue Airways", types: ["A321", "A320", "A220"] },
  { code: "FDX", spoken: "FedEx", name: "FedEx Express", types: ["B77F", "MD11", "B763"] },
  { code: "UPS", spoken: "UPS", name: "UPS Airlines", types: ["B748", "B763", "MD11"] },
  { code: "RCH", spoken: "Reach", name: "USAF Air Mobility Command", types: ["C17", "C130", "K35R"] },
];

export const INDIA_AND_INTL_AIRLINES: Array<{ code: string; spoken: string; name: string; types: string[] }> = [
  { code: "IGO", spoken: "iFly", name: "IndiGo Airlines", types: ["A20N", "A321", "A320", "AT76"] },
  { code: "AIC", spoken: "Air India", name: "Air India", types: ["A359", "B77W", "B788", "A320"] },
  { code: "VTI", spoken: "Vistara", name: "Vistara", types: ["B789", "A321", "A320"] },
  { code: "SEJ", spoken: "SpiceJet", name: "SpiceJet", types: ["B737", "B38M", "AT76"] },
  { code: "AKJ", spoken: "Akasa", name: "Akasa Air", types: ["B38M"] },
  { code: "UAE", spoken: "Emirates", name: "Emirates", types: ["A388", "B77W", "A359"] },
  { code: "QTR", spoken: "Qatari", name: "Qatar Airways", types: ["A35K", "B77W", "B789"] },
  { code: "SIA", spoken: "Singapore", name: "Singapore Airlines", types: ["A388", "A359", "B789"] },
  { code: "BAW", spoken: "Speedbird", name: "British Airways", types: ["A35K", "B789", "B77W", "A320"] },
  { code: "DLH", spoken: "Lufthansa", name: "Lufthansa", types: ["B748", "A359", "A321"] },
  { code: "BZP", spoken: "Blue Dart", name: "Blue Dart Aviation", types: ["B763", "B752", "B738"] },
  { code: "DHL", spoken: "DHL", name: "DHL Aviation", types: ["B77F", "A332", "B763"] },
  { code: "IAF", spoken: "Indian Air Force", name: "Indian Air Force", types: ["C17", "C130", "P8", "SU30"] },
  { code: "NAVY", spoken: "Navy", name: "Indian Naval Air Arm", types: ["P8"] },
];

export function resolveWakeCategory(acType: string): "MEDIUM" | "HEAVY" | "SUPER" {
  const t = acType.toUpperCase();
  if (t === "A388" || t === "AN25") return "SUPER";
  if (
    t === "B772" ||
    t === "B77W" ||
    t === "B77F" ||
    t === "B788" ||
    t === "B789" ||
    t === "B763" ||
    t === "B744" ||
    t === "B748" ||
    t === "A332" ||
    t === "A333" ||
    t === "A339" ||
    t === "A359" ||
    t === "A35K" ||
    t === "MD11" ||
    t === "C17" ||
    t === "K35R" ||
    t === "A400"
  ) {
    return "HEAVY";
  }
  return "MEDIUM";
}

export function isCargoAircraft(callsign: string, acType: string): boolean {
  const cs = callsign.toUpperCase();
  const p = cs.slice(0, 3);
  const t = acType.toUpperCase();
  return (
    p === "FDX" ||
    p === "UPS" ||
    p === "DHL" ||
    p === "BZP" ||
    p === "ATN" ||
    t === "MD11" ||
    t === "B77F" ||
    t === "B748" ||
    (t === "B763" && (p === "FDX" || p === "UPS" || p === "BZP" || p === "ATN"))
  );
}

export function isMilitaryAircraft(callsign: string, acType: string): boolean {
  const cs = callsign.toUpperCase();
  const p = cs.slice(0, 3);
  const t = acType.toUpperCase();
  return (
    p === "IAF" ||
    p === "RCH" ||
    p === "RRR" ||
    p === "IAM" ||
    p === "GAF" ||
    cs.startsWith("NAVY") ||
    t === "C17" ||
    t === "C130" ||
    t === "A400" ||
    t === "K35R" ||
    t === "P8" ||
    t === "F16" ||
    t === "SU30"
  );
}

/**
 * Assigns respective parking stand:
 * - Cargo aircraft -> Cargo logistics apron / stands (C, S1, S2, CARGO_*)
 * - Military / tactical transport -> Military / remote apron (MIL_*, S3, M1, REMOTE_*)
 * - Heavy widebody passenger -> Heavy terminal gates (H*, B14, T1, T2)
 * - Regional turboprop / jet -> Regional / commuter stands
 * - Standard passenger -> Passenger terminal concourses
 */
export function findBestGateForAircraft(
  airport: AirportLayout,
  ac: {
    aircraftType?: string;
    callsign?: string;
    isCargo?: boolean;
    isMilitary?: boolean;
    wakeCategory?: string;
  },
  occupiedGateIds: Set<string>,
  randomize = false
): string | null {
  const allGates = airport.gateIds;
  if (!allGates || allGates.length === 0) return null;

  const acType = (ac.aircraftType ?? "").toUpperCase();
  const cs = (ac.callsign ?? "").toUpperCase();
  const isCargo = ac.isCargo ?? isCargoAircraft(cs, acType);
  const isMilitary = ac.isMilitary ?? isMilitaryAircraft(cs, acType);
  const wakeCat = ac.wakeCategory ?? resolveWakeCategory(acType);
  const isHeavy = wakeCat === "HEAVY" || wakeCat === "SUPER";

  const scoreGate = (gid: string): number => {
    const node = airport.nodes[`GATE_${gid}`];
    const upper = gid.toUpperCase();
    const label = (node?.label ?? "").toUpperCase();

    const isCargoStand =
      upper.includes("CARGO") ||
      upper.startsWith("C") ||
      upper === "S1" ||
      upper === "S2" ||
      upper === "N1" ||
      upper === "K1" ||
      label.includes("CARGO");

    const isMilStand =
      upper.includes("MIL") ||
      upper.startsWith("M") ||
      upper === "S3" ||
      upper === "N2" ||
      upper === "K2" ||
      upper.includes("REMOTE") ||
      upper.startsWith("R") ||
      label.includes("MIL") ||
      label.includes("REMOTE");

    const isHeavyCapable =
      upper.includes("HEAVY") ||
      upper.startsWith("H") ||
      upper === "B14" ||
      upper === "T1" ||
      upper === "T2" ||
      upper === "A1" ||
      upper === "G1" ||
      upper === "G2" ||
      label.includes("HEAVY");

    if (isCargo) {
      if (isCargoStand) return 100;
      if (isMilStand) return 40;
      return 10;
    }

    if (isMilitary) {
      if (isMilStand) return 100;
      if (isCargoStand) return 50;
      return 10;
    }

    if (isHeavy) {
      if (isCargoStand || isMilStand) return 5;
      if (isHeavyCapable) return 100;
      return 50;
    }

    // Standard passenger flight
    if (isCargoStand || isMilStand) return 5;
    if (isHeavyCapable) return 60;
    return 90;
  };

  const freeGates = allGates.filter((g) => !occupiedGateIds.has(g));
  if (freeGates.length === 0) {
    if (randomize) {
      return allGates[Math.floor(Math.random() * allGates.length)] ?? null;
    }
    return allGates[0] ?? null;
  }

  const scored = freeGates.map((g) => ({ gate: g, score: scoreGate(g) }));
  const maxScore = Math.max(...scored.map((s) => s.score));
  // Pick from all free candidate gates in the highest scoring tier
  const topTier = scored.filter((s) => s.score >= maxScore - 10).map((s) => s.gate);

  if (randomize && topTier.length > 0) {
    return topTier[Math.floor(Math.random() * topTier.length)];
  }

  const sorted = [...freeGates].sort((a, b) => scoreGate(b) - scoreGate(a));
  return sorted[0] ?? freeGates[0];
}

export function pickRandomFleetPlane(
  airport: AirportLayout,
  usedCallsigns: Set<string>,
  category: "PASSENGER" | "CARGO" | "MILITARY" = "PASSENGER"
): {
  callsign: string;
  spokenCallsign: string;
  airline: string;
  aircraftType: string;
  isCargo: boolean;
  isMilitary: boolean;
  wakeCategory: "LIGHT" | "MEDIUM" | "HEAVY" | "SUPER";
} {
  const isIndia = airport.icao.startsWith("V") || airport.country === "India";

  if (category === "CARGO") {
    const cargoAirlines = isIndia
      ? [
          { code: "BZP", spoken: "Blue Dart", name: "Blue Dart Aviation", types: ["B763", "B752", "B738"] },
          { code: "DHL", spoken: "DHL", name: "DHL Express", types: ["B77F", "A332", "B763"] },
          { code: "FDX", spoken: "FedEx", name: "FedEx Express", types: ["B77F", "MD11", "B763"] },
          { code: "UPS", spoken: "UPS", name: "UPS Airlines", types: ["B748", "B763", "MD11"] },
        ]
      : [
          { code: "FDX", spoken: "FedEx", name: "FedEx Express", types: ["B77F", "MD11", "B763"] },
          { code: "UPS", spoken: "UPS", name: "UPS Airlines", types: ["B748", "B763", "MD11"] },
          { code: "BOX", spoken: "German Cargo", name: "AeroLogic", types: ["B77F"] },
        ];
    const carrier = cargoAirlines[Math.floor(Math.random() * cargoAirlines.length)];
    const acType = carrier.types[Math.floor(Math.random() * carrier.types.length)];
    let num = 100 + Math.floor(Math.random() * 890);
    while (usedCallsigns.has(`${carrier.code}${num}`)) {
      num += 1;
    }
    const cs = `${carrier.code}${num}`;
    usedCallsigns.add(cs);
    return {
      callsign: cs,
      spokenCallsign: `${carrier.spoken} ${num}`,
      airline: carrier.name,
      aircraftType: acType,
      isCargo: true,
      isMilitary: false,
      wakeCategory: resolveWakeCategory(acType),
    };
  }

  if (category === "MILITARY") {
    const milAirlines = isIndia
      ? [
          { code: "IAF", spoken: "Indian Air Force", name: "Indian Air Force", types: ["C17", "C130", "P8"] },
          { code: "NAVY", spoken: "Navy", name: "Indian Naval Air Arm", types: ["P8"] },
        ]
      : [
          { code: "RCH", spoken: "Reach", name: "USAF Air Mobility Command", types: ["C17", "C130", "K35R"] },
          { code: "RRR", spoken: "Ascot", name: "Royal Air Force", types: ["A332", "C130"] },
        ];
    const carrier = milAirlines[Math.floor(Math.random() * milAirlines.length)];
    const acType = carrier.types[Math.floor(Math.random() * carrier.types.length)];
    let num = 100 + Math.floor(Math.random() * 890);
    while (usedCallsigns.has(`${carrier.code}${num}`)) {
      num += 1;
    }
    const cs = `${carrier.code}${num}`;
    usedCallsigns.add(cs);
    return {
      callsign: cs,
      spokenCallsign: `${carrier.spoken} ${num}`,
      airline: carrier.name,
      aircraftType: acType,
      isCargo: false,
      isMilitary: true,
      wakeCategory: resolveWakeCategory(acType),
    };
  }

  // PASSENGER
  const passengerAirlines = isIndia
    ? [
        { code: "IGO", spoken: "iFly", name: "IndiGo Airlines", types: ["A20N", "A321", "A320"] },
        { code: "AIC", spoken: "Air India", name: "Air India", types: ["A359", "B77W", "B788", "A320"] },
        { code: "VTI", spoken: "Vistara", name: "Vistara", types: ["B789", "A321", "A320"] },
        { code: "AKJ", spoken: "Akasa", name: "Akasa Air", types: ["B38M"] },
        { code: "SEJ", spoken: "SpiceJet", name: "SpiceJet", types: ["B737", "B38M", "AT76"] },
        { code: "UAE", spoken: "Emirates", name: "Emirates", types: ["A388", "B77W", "A359"] },
        { code: "SIA", spoken: "Singapore", name: "Singapore Airlines", types: ["A388", "A359", "B789"] },
        { code: "BAW", spoken: "Speedbird", name: "British Airways", types: ["A35K", "B789", "B77W", "A320"] },
        { code: "DLH", spoken: "Lufthansa", name: "Lufthansa", types: ["B748", "A359", "A321"] },
        { code: "QTR", spoken: "Qatari", name: "Qatar Airways", types: ["A35K", "B77W", "B789"] },
      ]
    : [
        { code: "DAL", spoken: "Delta", name: "Delta Air Lines", types: ["A359", "A339", "A321", "B739", "B738"] },
        { code: "UAL", spoken: "United", name: "United Airlines", types: ["B789", "B772", "B739", "B752", "A320"] },
        { code: "AAL", spoken: "American", name: "American Airlines", types: ["B77W", "B788", "B738", "A321", "A319"] },
        { code: "SWA", spoken: "Southwest", name: "Southwest Airlines", types: ["B737", "B38M"] },
        { code: "JBU", spoken: "JetBlue", name: "JetBlue Airways", types: ["A321", "A320", "A220"] },
        { code: "BAW", spoken: "Speedbird", name: "British Airways", types: ["A35K", "B789", "B77W"] },
        { code: "AFR", spoken: "Air France", name: "Air France", types: ["A359", "B772"] },
      ];

  const carrier = passengerAirlines[Math.floor(Math.random() * passengerAirlines.length)];
  const acType = carrier.types[Math.floor(Math.random() * carrier.types.length)];
  let num = 100 + Math.floor(Math.random() * 890);
  while (usedCallsigns.has(`${carrier.code}${num}`)) {
    num += 1;
  }
  const cs = `${carrier.code}${num}`;
  usedCallsigns.add(cs);
  return {
    callsign: cs,
    spokenCallsign: `${carrier.spoken} ${num}`,
    airline: carrier.name,
    aircraftType: acType,
    isCargo: false,
    isMilitary: false,
    wakeCategory: resolveWakeCategory(acType),
  };
}

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
    originIcao?: string;
    originName?: string;
    destinationIcao?: string;
    destinationName?: string;
    bearingDeg?: number;
  }
): Aircraft {
  const gateNodeId = `GATE_${opts.gateId}`;
  const gateNode = state.airport.nodes[gateNodeId];
  const id = opts.id ?? opts.callsign;
  const acType = opts.aircraftType ?? "B738";
  const meta = deriveFlightMetadata(opts.callsign, "DEPARTURE", state.airport, acType, opts.bearingDeg);
  if (opts.originIcao) meta.originIcao = opts.originIcao;
  if (opts.originName) meta.originName = opts.originName;
  if (opts.destinationIcao) meta.destinationIcao = opts.destinationIcao;
  if (opts.destinationName) meta.destinationName = opts.destinationName;
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
    wakeCategory: resolveWakeCategory(acType),
    isCargo: isCargoAircraft(opts.callsign, acType),
    isMilitary: isMilitaryAircraft(opts.callsign, acType),
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
    originIcao?: string;
    originName?: string;
    destinationIcao?: string;
    destinationName?: string;
    bearingDeg?: number;
  }
): Aircraft {
  const id = opts.id ?? opts.callsign;
  const acType = opts.aircraftType ?? "A320";
  const meta = deriveFlightMetadata(opts.callsign, "ARRIVAL", state.airport, acType, opts.bearingDeg);
  if (opts.originIcao) meta.originIcao = opts.originIcao;
  if (opts.originName) meta.originName = opts.originName;
  if (opts.destinationIcao) meta.destinationIcao = opts.destinationIcao;
  if (opts.destinationName) meta.destinationName = opts.destinationName;
  const ac: Aircraft = {
    id,
    callsign: opts.callsign,
    spokenCallsign: opts.spokenCallsign,
    airline: opts.airline ?? "Airline",
    aircraftType: acType,
    wakeCategory: resolveWakeCategory(acType),
    isCargo: isCargoAircraft(opts.callsign, acType),
    isMilitary: isMilitaryAircraft(opts.callsign, acType),
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
  customAirport?: AirportLayout,
  options?: { randomize?: boolean }
): SimulationState {
  const isNodeTest =
    typeof process !== "undefined" &&
    (process.env?.NODE_ENV === "test" ||
      (Array.isArray(process.execArgv) && process.execArgv.includes("--test")) ||
      (Array.isArray(process.argv) && process.argv.some((a) => a.includes("test"))));
  const shouldRandomize = options?.randomize ?? !isNodeTest;

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

  const usedGates = new Set<string>();
  const usedCallsigns = new Set<string>();

  const assignGate = (acInfo: {
    aircraftType: string;
    callsign: string;
    isCargo?: boolean;
    isMilitary?: boolean;
    wakeCategory?: "LIGHT" | "MEDIUM" | "HEAVY" | "SUPER";
  }): string => {
    const g =
      findBestGateForAircraft(ap, acInfo, usedGates, shouldRandomize) ??
      ap.gateIds.find((id) => !usedGates.has(id)) ??
      (shouldRandomize && ap.gateIds.length > 0
        ? ap.gateIds[Math.floor(Math.random() * ap.gateIds.length)]
        : ap.gateIds[0]);
    usedGates.add(g);
    return g;
  };

  if (scenarioId === "LOW_TRAFFIC") {
    if (shouldRandomize) {
      const p1 = pickRandomFleetPlane(ap, usedCallsigns, "PASSENGER");
      const gDep = assignGate(p1);
      const depAc = createDepartureAircraft(state, {
        callsign: p1.callsign,
        spokenCallsign: p1.spokenCallsign,
        airline: p1.airline,
        aircraftType: p1.aircraftType,
        gateId: gDep,
        targetRunway: rwyDep,
        requiresPushback: !gDep.startsWith("S") && !gDep.toUpperCase().includes("REMOTE"),
        departureFix: ap.departureFixIds[0],
      });

      const pArr = pickRandomFleetPlane(ap, usedCallsigns, "PASSENGER");
      const gArr = assignGate(pArr);
      const finPt = runwayPoint(arrSpec, -6.5 - Math.random() * 2.0, 0);
      createArrivalAircraft(state, {
        callsign: pArr.callsign,
        spokenCallsign: pArr.spokenCallsign,
        airline: pArr.airline,
        aircraftType: pArr.aircraftType,
        x: finPt.x,
        y: finPt.y,
        heading: arrSpec.heading,
        altitude: elev + 2100,
        speed: 165,
        targetRunway: rwyArr,
        gateId: gArr,
        state: "APPROACH",
        controller: "TOWER",
        assignedApproach: rwyArr,
      });
      state.selectedAircraftId = depAc.id;
    } else {
      const ualGate = assignGate({ aircraftType: "B738", callsign: "UAL452", wakeCategory: "MEDIUM" });
      const dalGate = assignGate({ aircraftType: "B739", callsign: "DAL814", wakeCategory: "MEDIUM" });
      const ual = createDepartureAircraft(state, {
        callsign: "UAL452",
        spokenCallsign: "United 452",
        airline: "United Airlines",
        aircraftType: "B738",
        gateId: ualGate,
        targetRunway: rwyDep,
        requiresPushback: !ualGate.startsWith("S") && !ualGate.toUpperCase().includes("REMOTE"),
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
        gateId: dalGate,
        state: "APPROACH",
        controller: "TOWER",
        assignedApproach: rwyArr,
      });
      state.selectedAircraftId = ual.id;
    }
  } else if (
    scenarioId === "NORMAL_OPS" ||
    scenarioId === "MEDIUM" ||
    scenarioId === "MIXED" ||
    scenarioId === "LIGHT"
  ) {
    if (shouldRandomize) {
      // 1. Random Passenger Narrow-body Departure
      const p1 = pickRandomFleetPlane(ap, usedCallsigns, "PASSENGER");
      const g1 = assignGate(p1);
      const dep1 = createDepartureAircraft(state, {
        callsign: p1.callsign,
        spokenCallsign: p1.spokenCallsign,
        airline: p1.airline,
        aircraftType: p1.aircraftType,
        gateId: g1,
        targetRunway: rwyDep,
        requiresPushback: !g1.startsWith("S") && !g1.toUpperCase().includes("REMOTE"),
        departureFix: ap.departureFixIds[Math.floor(Math.random() * ap.departureFixIds.length)],
      });

      // 2. Random Passenger Wide-body / Medium Departure at another random gate
      const p2 = pickRandomFleetPlane(ap, usedCallsigns, "PASSENGER");
      const g2 = assignGate(p2);
      createDepartureAircraft(state, {
        callsign: p2.callsign,
        spokenCallsign: p2.spokenCallsign,
        airline: p2.airline,
        aircraftType: p2.aircraftType,
        gateId: g2,
        targetRunway: rwyArr,
        requiresPushback: !g2.startsWith("S") && !g2.toUpperCase().includes("REMOTE"),
        departureFix: ap.departureFixIds[Math.floor(Math.random() * ap.departureFixIds.length)],
      });

      // 3. Random Cargo Flight at random Cargo stand
      const pCargo = pickRandomFleetPlane(ap, usedCallsigns, "CARGO");
      const gCargo = assignGate(pCargo);
      createDepartureAircraft(state, {
        callsign: pCargo.callsign,
        spokenCallsign: pCargo.spokenCallsign,
        airline: pCargo.airline,
        aircraftType: pCargo.aircraftType,
        gateId: gCargo,
        targetRunway: rwyDep,
        requiresPushback: false,
        departureFix: ap.departureFixIds[Math.floor(Math.random() * ap.departureFixIds.length)],
      });

      // 4. Military transport at random military/remote stand if stands available
      if (ap.gateIds.length >= 6) {
        const pMil = pickRandomFleetPlane(ap, usedCallsigns, "MILITARY");
        const gMil = assignGate(pMil);
        createDepartureAircraft(state, {
          callsign: pMil.callsign,
          spokenCallsign: pMil.spokenCallsign,
          airline: pMil.airline,
          aircraftType: pMil.aircraftType,
          gateId: gMil,
          targetRunway: rwyDep,
          requiresPushback: false,
          departureFix: ap.departureFixIds[0],
        });
      }

      // 5. Inbound Arrival on Final (4-6nm out)
      const pArr1 = pickRandomFleetPlane(ap, usedCallsigns, "PASSENGER");
      const gArr1 = assignGate(pArr1);
      const finPt = runwayPoint(depSpec, -4.2 - Math.random() * 2.0, 0);
      createArrivalAircraft(state, {
        callsign: pArr1.callsign,
        spokenCallsign: pArr1.spokenCallsign,
        airline: pArr1.airline,
        aircraftType: pArr1.aircraftType,
        x: finPt.x,
        y: finPt.y,
        heading: depSpec.heading,
        altitude: elev + 1600,
        speed: 155,
        targetRunway: rwyDep,
        gateId: gArr1,
        state: "FINAL",
        controller: "TOWER",
        assignedApproach: rwyDep,
      });

      // 6. Inbound Arrival on Intercept / Initial Approach (9-12nm out)
      const pArr2 = pickRandomFleetPlane(ap, usedCallsigns, "PASSENGER");
      const gArr2 = assignGate(pArr2);
      const appPt = runwayPoint(
        arrSpec,
        -9.5 - Math.random() * 2.5,
        (Math.random() > 0.5 ? 1 : -1) * (2.5 + Math.random() * 1.5)
      );
      createArrivalAircraft(state, {
        callsign: pArr2.callsign,
        spokenCallsign: pArr2.spokenCallsign,
        airline: pArr2.airline,
        aircraftType: pArr2.aircraftType,
        x: appPt.x,
        y: appPt.y,
        heading: ((arrSpec.heading + (Math.random() > 0.5 ? 15 : -15) + 360) % 360) || 360,
        altitude: baseAlt + 4000,
        speed: 195,
        targetRunway: rwyArr,
        gateId: gArr2,
        state: "APPROACH",
        controller: "DEPARTURE",
      });

      state.selectedAircraftId = dep1.id;
    } else {
      const isIndia = ap.icao.startsWith("VO") || ap.icao.startsWith("VI");

      // Passenger Boeing
      const ualGate = assignGate({ aircraftType: "B738", callsign: "UAL452", wakeCategory: "MEDIUM" });
      const ual = createDepartureAircraft(state, {
        callsign: "UAL452",
        spokenCallsign: "United 452",
        airline: "United Airlines",
        aircraftType: "B738",
        gateId: ualGate,
        targetRunway: rwyDep,
        requiresPushback: !ualGate.startsWith("S") && !ualGate.toUpperCase().includes("REMOTE"),
        departureFix: ap.departureFixIds[0],
      });

      // Passenger Airbus
      const aalGate = assignGate({ aircraftType: "A321", callsign: "AAL127", wakeCategory: "MEDIUM" });
      createDepartureAircraft(state, {
        callsign: "AAL127",
        spokenCallsign: "American 127",
        airline: "American Airlines",
        aircraftType: "A321",
        gateId: aalGate,
        targetRunway: rwyArr,
        requiresPushback: !aalGate.startsWith("S") && !aalGate.toUpperCase().includes("REMOTE"),
        departureFix: ap.departureFixIds[ap.departureFixIds.length - 1],
      });

      // Cargo Aircraft at dedicated Cargo gate
      const cargoGate = assignGate({
        aircraftType: isIndia ? "B763" : "MD11",
        callsign: isIndia ? "BZP401" : "FDX902",
        isCargo: true,
        wakeCategory: "HEAVY",
      });
      createDepartureAircraft(state, {
        callsign: isIndia ? "BZP401" : "FDX902",
        spokenCallsign: isIndia ? "Blue Dart 401" : "FedEx 902",
        airline: isIndia ? "Blue Dart Aviation" : "FedEx Express",
        aircraftType: isIndia ? "B763" : "MD11",
        gateId: cargoGate,
        targetRunway: rwyDep,
        requiresPushback: false,
        departureFix: ap.departureFixIds[1] ?? ap.departureFixIds[0],
      });

      // If airport has spare stands, add Military transport at dedicated Military / Remote stand
      if (ap.gateIds.length >= 6) {
        const milGate = assignGate({
          aircraftType: isIndia ? "C17" : "C17",
          callsign: isIndia ? "IAF702" : "RCH411",
          isMilitary: true,
          wakeCategory: "HEAVY",
        });
        createDepartureAircraft(state, {
          callsign: isIndia ? "IAF702" : "RCH411",
          spokenCallsign: isIndia ? "Indian Air Force 702" : "Reach 411",
          airline: isIndia ? "Indian Air Force" : "USAF Air Mobility Command",
          aircraftType: "C17",
          gateId: milGate,
          targetRunway: rwyDep,
          requiresPushback: false,
          departureFix: ap.departureFixIds[0],
        });
      }

      const dalGate = assignGate({ aircraftType: "B739", callsign: "DAL814", wakeCategory: "MEDIUM" });
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
        gateId: dalGate,
        state: "FINAL",
        controller: "TOWER",
        assignedApproach: rwyDep,
      });

      const jbuGate = assignGate({ aircraftType: "A320", callsign: "JBU618", wakeCategory: "MEDIUM" });
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
        gateId: jbuGate,
        state: "APPROACH",
        controller: "DEPARTURE",
      });
      state.selectedAircraftId = ual.id;
    }
  } else if (scenarioId === "CROSSINGS_AND_READBACK") {
    if (shouldRandomize) {
      const p1 = pickRandomFleetPlane(ap, usedCallsigns, "PASSENGER");
      const g1 = assignGate(p1);
      const dep1 = createDepartureAircraft(state, {
        callsign: p1.callsign,
        spokenCallsign: p1.spokenCallsign,
        airline: p1.airline,
        aircraftType: p1.aircraftType,
        gateId: g1,
        targetRunway: rwyArr,
        requiresPushback: false,
        departureFix: ap.departureFixIds[1] ?? ap.departureFixIds[0],
      });
      dep1.armNextReadbackError = true;

      const p2 = pickRandomFleetPlane(ap, usedCallsigns, "CARGO");
      const g2 = assignGate(p2);
      createDepartureAircraft(state, {
        callsign: p2.callsign,
        spokenCallsign: p2.spokenCallsign,
        airline: p2.airline,
        aircraftType: p2.aircraftType,
        gateId: g2,
        targetRunway: rwyDep,
        requiresPushback: false,
        departureFix: ap.departureFixIds[0],
      });

      const pArr = pickRandomFleetPlane(ap, usedCallsigns, "PASSENGER");
      const gArr = assignGate(pArr);
      const finPt = runwayPoint(depSpec, -5.2, 0);
      createArrivalAircraft(state, {
        callsign: pArr.callsign,
        spokenCallsign: pArr.spokenCallsign,
        airline: pArr.airline,
        aircraftType: pArr.aircraftType,
        x: finPt.x,
        y: finPt.y,
        heading: depSpec.heading,
        altitude: elev + 1850,
        speed: 155,
        targetRunway: rwyDep,
        gateId: gArr,
        state: "FINAL",
        controller: "TOWER",
        assignedApproach: rwyDep,
      });
      state.selectedAircraftId = dep1.id;
    } else {
      const ualGate = assignGate({ aircraftType: "B738", callsign: "UAL452", wakeCategory: "MEDIUM" });
      const fdxGate = assignGate({ aircraftType: "B763", callsign: "FDX901", isCargo: true, wakeCategory: "HEAVY" });
      const dalGate = assignGate({ aircraftType: "A321", callsign: "DAL814", wakeCategory: "MEDIUM" });
      const ual = createDepartureAircraft(state, {
        callsign: "UAL452",
        spokenCallsign: "United 452",
        airline: "United Airlines",
        aircraftType: "B738",
        gateId: ualGate,
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
        gateId: fdxGate,
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
        gateId: dalGate,
        state: "FINAL",
        controller: "TOWER",
        assignedApproach: rwyDep,
      });
      state.selectedAircraftId = ual.id;
    }
  } else if (scenarioId === "EMERGENCY_AND_NORDO" || scenarioId === "EMERGENCY") {
    if (shouldRandomize) {
      const p1 = pickRandomFleetPlane(ap, usedCallsigns, "PASSENGER");
      const g1 = assignGate(p1);
      const dep1 = createDepartureAircraft(state, {
        callsign: p1.callsign,
        spokenCallsign: p1.spokenCallsign,
        airline: p1.airline,
        aircraftType: p1.aircraftType,
        gateId: g1,
        targetRunway: rwyDep,
        requiresPushback: true,
      });

      const pNordo = pickRandomFleetPlane(ap, usedCallsigns, "PASSENGER");
      const gNordo = assignGate(pNordo);
      const nordoPt = runwayPoint(arrSpec, -4.4, 0);
      const nordoAc = createArrivalAircraft(state, {
        callsign: pNordo.callsign,
        spokenCallsign: pNordo.spokenCallsign,
        airline: pNordo.airline,
        aircraftType: pNordo.aircraftType,
        x: nordoPt.x,
        y: nordoPt.y,
        heading: arrSpec.heading,
        altitude: elev + 1500,
        speed: 150,
        targetRunway: rwyArr,
        gateId: gNordo,
        state: "FINAL",
        controller: "TOWER",
        assignedApproach: rwyArr,
      });
      nordoAc.commStatus = "RADIO_FAILURE";
      nordoAc.squawk = "7600";

      const pEmerg = pickRandomFleetPlane(ap, usedCallsigns, "CARGO");
      const gEmerg = assignGate(pEmerg);
      const emergPt = runwayPoint(depSpec, -8.8, 2.0);
      const emergAc = createArrivalAircraft(state, {
        callsign: pEmerg.callsign,
        spokenCallsign: pEmerg.spokenCallsign,
        airline: pEmerg.airline,
        aircraftType: pEmerg.aircraftType,
        x: emergPt.x,
        y: emergPt.y,
        heading: ((depSpec.heading + 15) % 360) || 360,
        altitude: baseAlt + 3400,
        speed: 190,
        targetRunway: rwyDep,
        gateId: gEmerg,
        state: "APPROACH",
        controller: "DEPARTURE",
      });
      emergAc.operationMode = "EMERGENCY_OPERATION";
      emergAc.emergencyType = "ENGINE_FAILURE";
      emergAc.squawk = "7700";

      state.selectedAircraftId = activeStation === "TOWER" ? nordoAc.id : dep1.id;
      addRadioMessage(state, {
        sender: "SYSTEM",
        recipient: "ALL",
        controller: "TOWER",
        category: "EMERGENCY",
        text: `INCIDENT BRIEF: ${nordoAc.callsign} is NORDO (Squawk 7600 — use Tower Light Gun). ${emergAc.callsign} declared Engine Failure (Squawk 7700).`,
      });
    } else {
      const ualGate = assignGate({ aircraftType: "B738", callsign: "UAL452", wakeCategory: "MEDIUM" });
      const swaGate = assignGate({ aircraftType: "B737", callsign: "SWA712", wakeCategory: "MEDIUM" });
      const fdxGate = assignGate({ aircraftType: "MD11", callsign: "FDX901", isCargo: true, wakeCategory: "HEAVY" });
      const ual = createDepartureAircraft(state, {
        callsign: "UAL452",
        spokenCallsign: "United 452",
        airline: "United Airlines",
        aircraftType: "B738",
        gateId: ualGate,
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
        gateId: swaGate,
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
        gateId: fdxGate,
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
    }
  } else if (
    scenarioId === "RUSH_HOUR" ||
    scenarioId === "HEAVY" ||
    scenarioId === "DEPARTURE_HEAVY"
  ) {
    if (shouldRandomize) {
      const depCount = Math.min(Math.max(4, Math.floor(ap.gateIds.length * 0.4)), 6);
      for (let i = 0; i < depCount; i++) {
        const cat = i === 2 ? "CARGO" : i === 4 ? "MILITARY" : "PASSENGER";
        const pl = pickRandomFleetPlane(ap, usedCallsigns, cat);
        const g = assignGate(pl);
        createDepartureAircraft(state, {
          callsign: pl.callsign,
          spokenCallsign: pl.spokenCallsign,
          airline: pl.airline,
          aircraftType: pl.aircraftType,
          gateId: g,
          targetRunway: ap.runwayIds[i % ap.runwayIds.length],
          requiresPushback: !g.startsWith("S") && !g.toUpperCase().includes("REMOTE"),
        });
      }
      const arr1 = pickRandomFleetPlane(ap, usedCallsigns, "PASSENGER");
      const gArr1 = assignGate(arr1);
      const finPt = runwayPoint(depSpec, -4.8, 0);
      createArrivalAircraft(state, {
        callsign: arr1.callsign,
        spokenCallsign: arr1.spokenCallsign,
        airline: arr1.airline,
        aircraftType: arr1.aircraftType,
        x: finPt.x,
        y: finPt.y,
        heading: depSpec.heading,
        altitude: elev + 1650,
        speed: 155,
        targetRunway: rwyDep,
        gateId: gArr1,
        state: "FINAL",
        controller: "TOWER",
        assignedApproach: rwyDep,
      });

      const arr2 = pickRandomFleetPlane(ap, usedCallsigns, "PASSENGER");
      const gArr2 = assignGate(arr2);
      const appPt = runwayPoint(arrSpec, -9.2, 0);
      createArrivalAircraft(state, {
        callsign: arr2.callsign,
        spokenCallsign: arr2.spokenCallsign,
        airline: arr2.airline,
        aircraftType: arr2.aircraftType,
        x: appPt.x,
        y: appPt.y,
        heading: arrSpec.heading,
        altitude: baseAlt + 3000,
        speed: 185,
        targetRunway: rwyArr,
        gateId: gArr2,
        state: "APPROACH",
        controller: "DEPARTURE",
        assignedApproach: rwyArr,
      });
      state.selectedAircraftId = state.aircraftOrder[0] ?? null;
    } else {
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
    }
  } else if (scenarioId === "ARRIVAL_HEAVY") {
    if (shouldRandomize) {
      const pDep = pickRandomFleetPlane(ap, usedCallsigns, "PASSENGER");
      const gDep = assignGate(pDep);
      const depAc = createDepartureAircraft(state, {
        callsign: pDep.callsign,
        spokenCallsign: pDep.spokenCallsign,
        airline: pDep.airline,
        aircraftType: pDep.aircraftType,
        gateId: gDep,
        targetRunway: rwyDep,
        requiresPushback: true,
      });

      const finOffsets = [-4.2, -7.8, -11.5];
      finOffsets.forEach((offset, idx) => {
        const rwyId = idx % 2 === 0 ? rwyDep : rwyArr;
        const spec = ap.runways[rwyId];
        const pt = runwayPoint(spec, offset, idx === 2 ? 1.8 : 0);
        const pArr = pickRandomFleetPlane(ap, usedCallsigns, "PASSENGER");
        const gArr = assignGate(pArr);
        createArrivalAircraft(state, {
          callsign: pArr.callsign,
          spokenCallsign: pArr.spokenCallsign,
          airline: pArr.airline,
          aircraftType: pArr.aircraftType,
          x: pt.x,
          y: pt.y,
          heading: spec.heading,
          altitude: elev + 1400 + idx * 1100,
          speed: 155 + idx * 18,
          targetRunway: rwyId,
          gateId: gArr,
          state: idx === 0 ? "FINAL" : "APPROACH",
          controller: idx === 0 ? "TOWER" : "DEPARTURE",
          assignedApproach: idx === 0 ? rwyId : null,
        });
      });
      state.selectedAircraftId = state.aircraftOrder[1] ?? depAc.id;
    } else {
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
    }
  } else {
    // SANDBOX
    if (shouldRandomize) {
      const pDep = pickRandomFleetPlane(ap, usedCallsigns, "PASSENGER");
      const gDep = assignGate(pDep);
      const depAc = createDepartureAircraft(state, {
        callsign: pDep.callsign,
        spokenCallsign: pDep.spokenCallsign,
        airline: pDep.airline,
        aircraftType: pDep.aircraftType,
        gateId: gDep,
        targetRunway: rwyDep,
        requiresPushback: true,
      });
      const pArr = pickRandomFleetPlane(ap, usedCallsigns, "PASSENGER");
      const gArr = assignGate(pArr);
      const finPt = runwayPoint(depSpec, -5.8, 0);
      createArrivalAircraft(state, {
        callsign: pArr.callsign,
        spokenCallsign: pArr.spokenCallsign,
        airline: pArr.airline,
        aircraftType: pArr.aircraftType,
        x: finPt.x,
        y: finPt.y,
        heading: depSpec.heading,
        altitude: elev + 2000,
        speed: 160,
        targetRunway: rwyDep,
        gateId: gArr,
        state: "FINAL",
        controller: "TOWER",
        assignedApproach: rwyDep,
      });
      state.selectedAircraftId = depAc.id;
    } else {
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
  const isCargo = isCargoAircraft(callsign, acType);
  const isMilitary = isMilitaryAircraft(callsign, acType);
  const wakeCat = resolveWakeCategory(acType);

  const occupiedGateIds = new Set<string>();
  for (const id of state.aircraftOrder) {
    const a = state.aircraft[id];
    if (a && a.gateId && a.state !== "COMPLETED_ARRIVAL" && a.state !== "COMPLETED_DEPARTURE") {
      occupiedGateIds.add(a.gateId);
    }
  }

  if (chooseKind === "DEPARTURE") {
    const freeGate = findBestGateForAircraft(
      state.airport,
      { aircraftType: acType, callsign, isCargo, isMilitary, wakeCategory: wakeCat },
      occupiedGateIds
    );
    if (!freeGate) return null;
    const rwy = state.airport.runwayIds[state.nextIdCounter % state.airport.runwayIds.length];
    const ac = createDepartureAircraft(state, {
      callsign,
      spokenCallsign,
      airline: airline.name,
      aircraftType: acType,
      gateId: freeGate,
      targetRunway: rwy,
      requiresPushback: !freeGate.startsWith("S") && !freeGate.toUpperCase().includes("REMOTE"),
    });
    updateAircraftStates(state);
    return ac;
  }

  const fromLeft = state.nextIdCounter % 2 === 0;
  const rwy: RunwayId =
    state.airport.runwayIds[state.nextIdCounter % state.airport.runwayIds.length];
  const rwySpec = state.airport.runways[rwy];
  const gateId =
    findBestGateForAircraft(
      state.airport,
      { aircraftType: acType, callsign, isCargo, isMilitary, wakeCategory: wakeCat },
      occupiedGateIds
    ) ?? state.airport.gateIds[state.nextIdCounter % state.airport.gateIds.length];
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
