import type {
  Aircraft,
  ControllerRole,
  EmergencyType,
  SimulationState,
} from "../types/atc.ts";
import { runwaySpokenName } from "../data/asteriaAirport.ts";
import { hashCallsign } from "../data/aircraftCatalog.ts";
import { addRadioMessage, controllerCallsign } from "./decisionEngine.ts";
import { nextId } from "./clearanceEngine.ts";

/**
 * Real-world Aviation Emergencies & Dynamic In-Flight Events Engine.
 * Handles Low Fuel, Severe Turbulence / Windshear on Landing,
 * Single & Dual/All Engine Failures, Bird Strikes, Hydraulic Failures,
 * Cabin Decompression, and Medical Emergencies.
 */

export interface EmergencyDefinition {
  type: EmergencyType;
  title: string;
  distressLevel: "MAYDAY" | "PAN_PAN";
  suitablePhase: "APPROACH_FINAL" | "DEPARTURE_CLIMB" | "CRUISE_ENROUTE" | "ANY_AIRBORNE";
  generateDistressCall: (ac: Aircraft, state: SimulationState) => string;
}

export const EMERGENCY_DEFINITIONS: Record<Exclude<EmergencyType, "NONE" | "RUNWAY_EXCURSION" | "CRASH">, EmergencyDefinition> = {
  LOW_FUEL: {
    type: "LOW_FUEL",
    title: "Low Fuel / Emergency Fuel State",
    distressLevel: "MAYDAY",
    suitablePhase: "APPROACH_FINAL",
    generateDistressCall: (ac, state) => {
      const ctrl = controllerCallsign(ac.controller, state.airport, ac.flightKind);
      const rwy = runwaySpokenName(ac.targetRunway);
      const fuel = ac.fuelRemainingPct ?? 6;
      const mins = Math.max(5, Math.round(fuel * 1.5));
      return `MAYDAY MAYDAY MAYDAY, ${ac.spokenCallsign}, declaring emergency fuel, ${fuel}% (${mins} minutes reserves) remaining! Requesting priority vectors direct for runway ${rwy}!`;
    },
  },
  TURBULENCE_WINDSHEAR: {
    type: "TURBULENCE_WINDSHEAR",
    title: "Severe Windshear & Microburst on Final",
    distressLevel: "PAN_PAN",
    suitablePhase: "APPROACH_FINAL",
    generateDistressCall: (ac, state) => {
      const ctrl = controllerCallsign(ac.controller, state.airport, ac.flightKind);
      return `${ctrl}, ${ac.spokenCallsign}, encountering severe windshear and violent turbulence on short final! Airspeed loss 25 knots! Going around!`;
    },
  },
  ENGINE_FAILURE: {
    type: "ENGINE_FAILURE",
    title: "Single Engine Failure (Engine 1 Flameout)",
    distressLevel: "PAN_PAN",
    suitablePhase: "ANY_AIRBORNE",
    generateDistressCall: (ac, state) => {
      const rwy = runwaySpokenName(ac.targetRunway);
      return `PAN-PAN, PAN-PAN, PAN-PAN, ${ac.spokenCallsign}, Engine Number 1 has flamed out. Operating single engine, requesting priority vectors return to runway ${rwy} and ARFF standby.`;
    },
  },
  DUAL_ENGINE_FAILURE: {
    type: "DUAL_ENGINE_FAILURE",
    title: "Dual Engine Flameout (All Engines Failed / Gliding)",
    distressLevel: "MAYDAY",
    suitablePhase: "CRUISE_ENROUTE",
    generateDistressCall: (ac, state) => {
      const rwy = runwaySpokenName(ac.targetRunway);
      return `MAYDAY MAYDAY MAYDAY! ${ac.spokenCallsign}, total engine failure, all engines flamed out! We are a glider passing ${Math.round(ac.altitude)} feet! Requesting immediate straight-in landing runway ${rwy}!`;
    },
  },
  BIRD_STRIKE: {
    type: "BIRD_STRIKE",
    title: "Bird Strike & Engine Ingestion on Climbout",
    distressLevel: "MAYDAY",
    suitablePhase: "DEPARTURE_CLIMB",
    generateDistressCall: (ac, state) => {
      const rwy = runwaySpokenName(ac.targetRunway);
      return `MAYDAY MAYDAY, ${ac.spokenCallsign}, heavy bird strike on climbout passing ${Math.round(ac.altitude)} feet! Engine vibrations and compressor surges, terminating departure, requesting immediate return to field!`;
    },
  },
  HYDRAULIC_FAILURE: {
    type: "HYDRAULIC_FAILURE",
    title: "Hydraulic System Loss & Alternate Gear Extension",
    distressLevel: "PAN_PAN",
    suitablePhase: "APPROACH_FINAL",
    generateDistressCall: (ac, state) => {
      const rwy = runwaySpokenName(ac.targetRunway);
      return `PAN-PAN, PAN-PAN, ${ac.spokenCallsign}, hydraulic system loss. Alternate gravity gear extension required, flaps inoperative. Requesting straight-in approach runway ${rwy} with extended rollout.`;
    },
  },
  CABIN_PRESSURE: {
    type: "CABIN_PRESSURE",
    title: "Rapid Cabin Depressurization & Emergency Descent",
    distressLevel: "MAYDAY",
    suitablePhase: "CRUISE_ENROUTE",
    generateDistressCall: (ac, state) => {
      return `MAYDAY MAYDAY MAYDAY, ${ac.spokenCallsign}, rapid cabin depressurization! Passenger oxygen masks deployed, commencing emergency rapid descent to 10,000 feet!`;
    },
  },
  MEDICAL: {
    type: "MEDICAL",
    title: "Passenger Medical Emergency (Cardiac Arrest)",
    distressLevel: "PAN_PAN",
    suitablePhase: "ANY_AIRBORNE",
    generateDistressCall: (ac, state) => {
      return `PAN-PAN, PAN-PAN, ${ac.spokenCallsign}, passenger in cardiac distress in cabin, doctor performing CPR. Requesting priority descent and emergency paramedics on standby at gate!`;
    },
  },
  REJECTED_TAKEOFF_ABORT: {
    type: "REJECTED_TAKEOFF_ABORT",
    title: "High-Speed Rejected Takeoff",
    distressLevel: "PAN_PAN",
    suitablePhase: "DEPARTURE_CLIMB",
    generateDistressCall: (ac, state) => {
      const twr = controllerCallsign("TOWER", state.airport, ac.flightKind);
      return `${twr}, ${ac.spokenCallsign}, aborting takeoff roll runway ${ac.targetRunway}! Maximum braking applied, stopping on runway!`;
    },
  },
};

/**
 * Triggers an authentic aviation in-flight emergency on the specified aircraft.
 */
export function triggerAircraftEmergency(
  state: SimulationState,
  aircraftId: string,
  emergencyType: Exclude<EmergencyType, "NONE" | "CRASH">,
  customReason?: string
): boolean {
  const ac = state.aircraft[aircraftId];
  if (!ac || ac.state === "CRASHED") return false;

  if (emergencyType === "LOW_FUEL") {
    // Critical emergency fuel reserve state: 5% to 8% (under 15 minutes of fuel remaining)
    ac.fuelRemainingPct = 5 + (Math.abs(hashCallsign(ac.callsign)) % 4);
  }

  const def = EMERGENCY_DEFINITIONS[emergencyType as keyof typeof EMERGENCY_DEFINITIONS];
  const distressMsg = def ? def.generateDistressCall(ac, state) : `${ac.spokenCallsign} declaring emergency (${emergencyType})!`;

  ac.operationMode = "EMERGENCY_OPERATION";
  ac.emergencyType = emergencyType;
  ac.squawk = "7700";

  // Specific state transitions for certain emergencies
  if (emergencyType === "TURBULENCE_WINDSHEAR") {
    // Initiate missed approach / go-around immediately
    ac.state = "GO_AROUND";
    ac.stateEnteredAt = state.time;
    ac.verticalSpeed = 1800; // Positive climb
    ac.assignedHeading = null;
    ac.assignedApproach = null;
  } else if (emergencyType === "CABIN_PRESSURE") {
    // Emergency descent to safe altitude (10,000 ft MSL or airfield + 3,000 ft)
    const safeAlt = Math.max(state.airport.elevationFt + 3000, 10000);
    ac.assignedAltitude = safeAlt;
    ac.verticalSpeed = -3600;
  } else if (emergencyType === "DUAL_ENGINE_FAILURE") {
    // Total thrust loss: gliding descent rate (-1000 fpm)
    ac.verticalSpeed = -1050;
    ac.speed = Math.min(ac.speed, 175);
    ac.assignedAltitude = state.airport.elevationFt;
  } else if (emergencyType === "ENGINE_FAILURE") {
    ac.speed = Math.min(ac.speed, 195);
  } else if (emergencyType === "BIRD_STRIKE") {
    ac.flightKind = "ARRIVAL";
    ac.assignedAltitude = Math.round((state.airport.elevationFt + 3000) / 500) * 500;
  }

  // Create pending emergency priority clearance request
  ac.pendingRequest = {
    id: nextId(state, "req"),
    type: "EMERGENCY_PRIORITY",
    controller: ac.controller,
    message: distressMsg,
    requestedAt: state.time,
    runway: ac.targetRunway,
    resolved: false,
  };

  // Add high-priority radio distress message (triggers voice TTS alert)
  addRadioMessage(state, {
    sender: ac.callsign,
    recipient: controllerCallsign(ac.controller, state.airport, ac.flightKind),
    controller: ac.controller,
    aircraftId: ac.id,
    category: "EMERGENCY",
    text: distressMsg,
  });

  // Log incident
  state.incidents.push({
    id: nextId(state, "inc"),
    timestamp: state.time,
    severity: "CRITICAL",
    code: emergencyType,
    message: customReason ?? `EMERGENCY (${def?.title ?? emergencyType}) declared by ${ac.callsign} (Squawk 7700).`,
    aircraftIds: [ac.id],
  });

  state.lastEmergencyEventAt = state.time;
  return true;
}

/**
 * Periodically steps spontaneous emergency event evaluation during gameplay.
 * Randomly fires once every 180-360 simulation seconds when active traffic is airborne.
 */
export function stepSpontaneousEmergencies(state: SimulationState, dt: number): void {
  // If an emergency is already active and unresolved, don't cascade another one
  const hasActiveEmergency = state.aircraftOrder.some((id) => {
    const a = state.aircraft[id];
    return a && a.operationMode === "EMERGENCY_OPERATION" && a.state !== "CRASHED";
  });
  if (hasActiveEmergency) return;

  const elev = state.airport.elevationFt;

  // Find airborne candidate aircraft
  const airborneAircraft = state.aircraftOrder
    .map((id) => state.aircraft[id])
    .filter(
      (a): a is Aircraft =>
        Boolean(a) &&
        a.state !== "COMPLETED_ARRIVAL" &&
        a.state !== "COMPLETED_DEPARTURE" &&
        a.state !== "CRASHED" &&
        a.operationMode === "NORMAL_OPERATION" &&
        a.altitude > elev + 100
    );

  if (airborneAircraft.length === 0) return;

  // Initialize or check cooldown
  if (state.lastEmergencyEventAt === undefined) {
    // Initial warmup delay: first emergency will happen between 120 and 240 seconds
    const initialWarmup = state.scenarioId === "EMERGENCY" || state.scenarioId === "EMERGENCY_AND_NORDO" ? 45 : 160;
    state.lastEmergencyEventAt = state.time - (240 - initialWarmup);
    return;
  }

  // Dynamic cooldown: faster in emergency scenario, realistic spacing in normal ops
  const isEmergencyScenario = state.scenarioId === "EMERGENCY" || state.scenarioId === "EMERGENCY_AND_NORDO";
  const cooldownPeriod = isEmergencyScenario ? 90 : 220;

  if (state.time - state.lastEmergencyEventAt < cooldownPeriod) {
    return;
  }

  // Select candidate aircraft and match suitable emergency
  const candidateAc = airborneAircraft[Math.floor((state.nextIdCounter * 31) % airborneAircraft.length)];
  if (!candidateAc) return;

  const agl = candidateAc.altitude - elev;
  const isLowFinal = (candidateAc.state === "FINAL" || candidateAc.state === "CLEARED_TO_LAND" || candidateAc.state === "APPROACH") && agl < 2500;
  const isClimbingDeparture = candidateAc.flightKind === "DEPARTURE" && (candidateAc.state === "CLIMB" || candidateAc.state === "ROTATE") && agl < 4500;
  const isEnrouteOrCruise = agl >= 3500;

  let emergencyChoice: Exclude<EmergencyType, "NONE" | "RUNWAY_EXCURSION" | "CRASH"> = "ENGINE_FAILURE";

  if (isLowFinal) {
    // Turbulence / windshear, low fuel, single engine, or hydraulic
    const roll = Math.abs((state.nextIdCounter * 17) % 4);
    emergencyChoice = roll === 0 ? "TURBULENCE_WINDSHEAR" : roll === 1 ? "LOW_FUEL" : roll === 2 ? "ENGINE_FAILURE" : "HYDRAULIC_FAILURE";
  } else if (isClimbingDeparture) {
    // Bird strike or engine failure on climb
    const roll = Math.abs((state.nextIdCounter * 19) % 3);
    emergencyChoice = roll === 0 ? "BIRD_STRIKE" : roll === 1 ? "ENGINE_FAILURE" : "MEDICAL";
  } else if (isEnrouteOrCruise) {
    // Dual engine failure, cabin decompression, low fuel, single engine, or medical
    const roll = Math.abs((state.nextIdCounter * 23) % 5);
    emergencyChoice =
      roll === 0
        ? "DUAL_ENGINE_FAILURE"
        : roll === 1
        ? "CABIN_PRESSURE"
        : roll === 2
        ? "LOW_FUEL"
        : roll === 3
        ? "ENGINE_FAILURE"
        : "MEDICAL";
  }

  triggerAircraftEmergency(state, candidateAc.id, emergencyChoice);
}
