import type {
  Aircraft,
  AirportLayout,
  AirportRecord,
  ClearanceCommandInput,
  ControllerRole,
  RunwayId,
  SimulationState,
} from "../types/atc.ts";
import type { CockpitControls, PilotChecklistItem, PilotConfig } from "../types/pilot.ts";
import { DEFAULT_COCKPIT_CONTROLS, INITIAL_CHECKLIST_ITEMS } from "../types/pilot.ts";
import {
  createArrivalAircraft,
  createDepartureAircraft,
  createScenarioSimulation,
} from "./simulation.ts";
import { AIRCRAFT_TYPE_SPECS, AIRLINE_LIVERIES } from "../data/aircraftCatalog.ts";
import { pilotVoiceCallouts } from "../utils/pilotVoiceCallouts.ts";

export { DEFAULT_COCKPIT_CONTROLS, INITIAL_CHECKLIST_ITEMS };

/**
 * Calculates authentic V-Speeds (V1, Vr, V2) based on airframe type
 */
export function calculateAirframeVSpeeds(modelCode: string): {
  v1: number;
  vr: number;
  v2: number;
} {
  const spec = AIRCRAFT_TYPE_SPECS[modelCode];
  if (!spec) {
    return { v1: 135, vr: 142, v2: 148 };
  }

  // Weight/size based V-speeds
  if (spec.airframeStyle === "TURBOPROP_REGIONAL") {
    return { v1: 105, vr: 110, v2: 118 };
  } else if (spec.airframeStyle === "NARROW_BOEING" || spec.airframeStyle === "NARROW_AIRBUS") {
    return { v1: 138, vr: 144, v2: 150 };
  } else if (spec.airframeStyle === "WIDE_BOEING" || spec.airframeStyle === "WIDE_AIRBUS") {
    return { v1: 148, vr: 156, v2: 164 };
  } else {
    return { v1: 140, vr: 146, v2: 152 };
  }
}

/**
 * Setup pilot simulation environment strictly adhering to Phase 1:
 * MAXIMUM 2 PLANES IN SIMULATION (Player plane + 1 AI Traffic Plane)
 */
export function initializePilotSimulation(
  airportLayout: AirportLayout,
  airportRecord: AirportRecord | undefined,
  config: PilotConfig
): {
  sim: SimulationState;
  playerAircraftId: string;
} {
  // Reset audio callout state for new flight
  pilotVoiceCallouts.resetTakeoffCallouts();

  // Create clean scenario
  const icao = airportRecord?.icao || config.airportIcao;
  const sim = createScenarioSimulation("LIGHT", "ALL", icao, airportLayout, {
    randomize: false,
  });

  // Strict Phase 1 constraint: Disable periodic auto traffic spawning so aircraft count never exceeds 2
  sim.config.autoSpawnTraffic = false;

  // Clear existing scenario aircraft
  sim.aircraft = {};
  sim.aircraftOrder = [];

  // 1. Create player aircraft at the chosen gate
  const gateId = config.gateId || sim.airport.gateIds[0] || "T1_1";
  const targetRwy = config.targetRunway || Object.keys(sim.airport.runways)[0] || "09";
  const playerCallsign = config.callsign || "AIC101";

  const playerAc = createDepartureAircraft(sim, {
    id: "PLAYER_AIRCRAFT",
    callsign: playerCallsign,
    spokenCallsign: `${config.airlineName.split(" ")[0]} ${config.flightNumber || "101"}`,
    airline: config.airlineName,
    aircraftType: config.modelCode,
    gateId: gateId,
    targetRunway: targetRwy,
    requiresPushback: true,
    destinationIcao: config.destinationIcao || "VIDP",
    destinationName: config.destinationName || "Indira Gandhi Intl",
  });

  playerAc.isPlayerPilot = true;
  playerAc.registration = config.registration || "VT-EXF";

  // 2. Create 1 single AI aircraft (an arrival on final approach to provide ambient immersion)
  const rwyKeys = Object.keys(sim.airport.runways);
  const arrRwy = rwyKeys[rwyKeys.length - 1] || targetRwy;
  const rwySpec = sim.airport.runways[arrRwy];
  const elev = sim.airport.elevationFt;

  const dx = Math.sin((rwySpec.heading * Math.PI) / 180);
  const dy = -Math.cos((rwySpec.heading * Math.PI) / 180);

  const aiAc = createArrivalAircraft(sim, {
    id: "AI_TRAFFIC_1",
    callsign: "BAW142",
    spokenCallsign: "Speedbird 142",
    airline: "British Airways",
    aircraftType: "B77W",
    x: rwySpec.thresholdX - dx * 6.0,
    y: rwySpec.thresholdY - dy * 6.0,
    heading: rwySpec.heading,
    altitude: elev + 1800,
    speed: 155,
    targetRunway: arrRwy,
    state: "FINAL",
    controller: "TOWER",
    assignedApproach: arrRwy,
  });

  // Enforce exactly 2 aircraft: [player, ai]
  sim.aircraft = {
    [playerAc.id]: playerAc,
    [aiAc.id]: aiAc,
  };
  sim.aircraftOrder = [playerAc.id, aiAc.id];
  sim.selectedAircraftId = playerAc.id;

  return {
    sim,
    playerAircraftId: playerAc.id,
  };
}

/**
 * Step cockpit engine systems, spooling physics, controls and kinematics
 */
export function stepPilotFlightDeck(params: {
  sim: SimulationState;
  playerAircraftId: string;
  controls: CockpitControls;
  checklist: PilotChecklistItem[];
  v1Speed: number;
  vrSpeed: number;
  v2Speed: number;
  dt: number;
  voiceEnabled: boolean;
}): {
  controls: CockpitControls;
  checklist: PilotChecklistItem[];
  calloutMade: string | null;
} {
  const {
    sim,
    playerAircraftId,
    v1Speed,
    vrSpeed,
    dt,
    voiceEnabled,
  } = params;

  let controls = { ...params.controls };
  let checklist = [...params.checklist];
  let calloutMade: string | null = null;

  const ac = sim.aircraft[playerAircraftId];
  if (!ac) return { controls, checklist, calloutMade };

  const elev = sim.airport.elevationFt;

  // 1. APU Power Logic
  if (controls.battery1 && controls.battery2 && controls.apuMaster && controls.apuStart) {
    controls.apuAvail = true;
  } else if (!controls.apuMaster) {
    controls.apuAvail = false;
  }

  // 2. Engine Spooling Simulation
  const electricalAvail = controls.apuAvail || (controls.battery1 && controls.battery2);

  // Engine 1
  if (controls.engine1Master && electricalAvail) {
    let targetN1 = 20.4;
    let targetN2 = 62.0;
    let targetEgt = 425;

    if (controls.throttle === "CLB") {
      targetN1 = 85.0;
      targetN2 = 89.0;
      targetEgt = 680;
    } else if (controls.throttle === "FLEX") {
      targetN1 = 92.5;
      targetN2 = 94.0;
      targetEgt = 740;
    } else if (controls.throttle === "TOGA") {
      targetN1 = 100.0;
      targetN2 = 98.5;
      targetEgt = 810;
    }

    controls.engine1N1 += (targetN1 - controls.engine1N1) * Math.min(1, dt * 1.5);
    controls.engine1N2 += (targetN2 - controls.engine1N2) * Math.min(1, dt * 1.5);
    controls.engine1Egt += (targetEgt - controls.engine1Egt) * Math.min(1, dt * 1.2);
  } else {
    controls.engine1N1 += (0 - controls.engine1N1) * Math.min(1, dt * 0.8);
    controls.engine1N2 += (0 - controls.engine1N2) * Math.min(1, dt * 0.8);
    controls.engine1Egt += (24 - controls.engine1Egt) * Math.min(1, dt * 0.5);
  }

  // Engine 2
  if (controls.engine2Master && electricalAvail) {
    let targetN1 = 20.4;
    let targetN2 = 62.0;
    let targetEgt = 425;

    if (controls.throttle === "CLB") {
      targetN1 = 85.0;
      targetN2 = 89.0;
      targetEgt = 680;
    } else if (controls.throttle === "FLEX") {
      targetN1 = 92.5;
      targetN2 = 94.0;
      targetEgt = 740;
    } else if (controls.throttle === "TOGA") {
      targetN1 = 100.0;
      targetN2 = 98.5;
      targetEgt = 810;
    }

    controls.engine2N1 += (targetN1 - controls.engine2N1) * Math.min(1, dt * 1.5);
    controls.engine2N2 += (targetN2 - controls.engine2N2) * Math.min(1, dt * 1.5);
    controls.engine2Egt += (targetEgt - controls.engine2Egt) * Math.min(1, dt * 1.2);
  } else {
    controls.engine2N1 += (0 - controls.engine2N1) * Math.min(1, dt * 0.8);
    controls.engine2N2 += (0 - controls.engine2N2) * Math.min(1, dt * 0.8);
    controls.engine2Egt += (24 - controls.engine2Egt) * Math.min(1, dt * 0.5);
  }

  // Set throttle percent
  controls.throttlePercent =
    controls.throttle === "IDLE"
      ? 0
      : controls.throttle === "CLB"
      ? 80
      : controls.throttle === "FLEX"
      ? 92
      : 100;

  // 3. Ground Taxi, Steering, and Takeoff Kinematics
  const enginesRunning = controls.engine1N1 >= 18 && controls.engine2N1 >= 18;

  // Tiller Steering Heading Update
  if (Math.abs(controls.tillerAngle) > 0.5 && ac.speed > 0.5 && ac.altitude <= elev + 10) {
    const turnRate = (controls.tillerAngle / 30) * Math.min(ac.speed, 25) * 1.2;
    ac.heading = (ac.heading + turnRate * dt + 360) % 360;
  }

  // State-specific kinematics
  if (ac.state === "PUSHING_BACK") {
    // Reverse movement away from gate
    if (!controls.parkingBrake) {
      ac.speed = 4.5;
      const revHeading = (ac.heading + 180) % 360;
      const rad = (revHeading * Math.PI) / 180;
      const speedNmS = ac.speed / 3600;
      ac.x += Math.sin(rad) * speedNmS * dt;
      ac.y -= Math.cos(rad) * speedNmS * dt;
    } else {
      ac.speed = 0;
    }
  } else if (ac.state === "TAXIING") {
    if (controls.parkingBrake) {
      ac.speed = Math.max(0, ac.speed - 8.0 * dt);
    } else if (enginesRunning) {
      let targetTaxiSpeed = 0;
      if (controls.throttle === "IDLE") {
        targetTaxiSpeed = 4.0; // low idle crawl
      } else if (controls.throttle === "CLB" || controls.throttle === "FLEX") {
        targetTaxiSpeed = 18.0; // standard taxi roll
      } else if (controls.throttle === "TOGA") {
        targetTaxiSpeed = 30.0;
      }
      ac.speed += (targetTaxiSpeed - ac.speed) * Math.min(1, dt * 1.5);
      const rad = (ac.heading * Math.PI) / 180;
      const speedNmS = ac.speed / 3600;
      ac.x += Math.sin(rad) * speedNmS * dt;
      ac.y -= Math.cos(rad) * speedNmS * dt;
    }
  } else if (
    ac.state === "TAKEOFF_CLEARED" ||
    ac.state === "TAKEOFF_ROLL" ||
    ac.state === "LINE_UP_WAIT"
  ) {
    if (controls.parkingBrake) {
      ac.speed = 0;
    } else if (controls.throttle === "TOGA" && enginesRunning) {
      // Rapid Takeoff Acceleration along runway
      ac.state = "TAKEOFF_ROLL";
      const accelKtS = 5.2; // accelerates to 80kt in ~15s, to 140kt in ~26s
      ac.speed += accelKtS * dt;

      // Align heading smoothly with runway heading
      const rwy = sim.airport.runways[ac.targetRunway];
      if (rwy) {
        const hDiff = ((rwy.heading - ac.heading + 540) % 360) - 180;
        ac.heading += hDiff * Math.min(1, dt * 2.0);
      }

      const rad = (ac.heading * Math.PI) / 180;
      const speedNmS = ac.speed / 3600;
      ac.x += Math.sin(rad) * speedNmS * dt;
      ac.y -= Math.cos(rad) * speedNmS * dt;

      // Check V-Speed Callouts
      const agl = Math.max(0, ac.altitude - elev);
      const call = pilotVoiceCallouts.checkAndTriggerCallouts({
        groundSpeedKt: ac.speed,
        altitudeAglFt: agl,
        verticalSpeedFpm: ac.verticalSpeed,
        v1Speed,
        vrSpeed,
        voiceEnabled,
        simTimeSeconds: sim.time,
      });
      if (call) calloutMade = call;

      // Rotate & Liftoff
      if (ac.speed >= vrSpeed) {
        controls.pitchAngle = Math.min(15, controls.pitchAngle + 4.0 * dt);
        ac.state = "ROTATE";

        if (controls.pitchAngle >= 8.0 && ac.speed >= vrSpeed + 4) {
          ac.state = "CLIMB";
          ac.verticalSpeed = 1900;
          ac.altitude += (ac.verticalSpeed / 60) * dt;

          const climbCall = pilotVoiceCallouts.checkAndTriggerCallouts({
            groundSpeedKt: ac.speed,
            altitudeAglFt: ac.altitude - elev,
            verticalSpeedFpm: ac.verticalSpeed,
            v1Speed,
            vrSpeed,
            voiceEnabled,
            simTimeSeconds: sim.time,
          });
          if (climbCall) calloutMade = climbCall;
        }
      }
    } else if (ac.speed > 0) {
      // Decelerate if throttle pulled back
      ac.speed = Math.max(0, ac.speed - 6.0 * dt);
      const rad = (ac.heading * Math.PI) / 180;
      const speedNmS = ac.speed / 3600;
      ac.x += Math.sin(rad) * speedNmS * dt;
      ac.y -= Math.cos(rad) * speedNmS * dt;
    }
  } else if (ac.state === "CLIMB") {
    // Airborne climbout
    ac.verticalSpeed = 2200;
    ac.altitude += (ac.verticalSpeed / 60) * dt;
    ac.speed = Math.min(250, ac.speed + 3.0 * dt);
    const rad = (ac.heading * Math.PI) / 180;
    const speedNmS = ac.speed / 3600;
    ac.x += Math.sin(rad) * speedNmS * dt;
    ac.y -= Math.cos(rad) * speedNmS * dt;
  }

  // 4. Auto-update checklist items based on physical switch states
  checklist = checklist.map((item) => {
    if (item.completed) return item;
    let completed = false;

    if (item.id === "bat" && controls.battery1 && controls.battery2) completed = true;
    if (item.id === "apu" && controls.apuAvail) completed = true;
    if (item.id === "pbrake" && controls.parkingBrake) completed = true;
    if (item.id === "ifr" && ac.flightPlan?.clearanceStatus === "CLEARED") completed = true;
    if (item.id === "beacon" && controls.beaconLights) completed = true;
    if (item.id === "pb_clear" && (ac.state === "PUSHBACK_APPROVED" || ac.state === "PUSHING_BACK" || ac.state === "PUSHBACK_COMPLETE")) completed = true;
    if (item.id === "eng_start" && enginesRunning) completed = true;
    if (item.id === "flaps_taxi" && controls.flaps >= 1) completed = true;
    if (item.id === "taxi_clear" && ac.state === "TAXIING") completed = true;
    if (item.id === "strobes" && controls.strobeLights) completed = true;
    if (item.id === "to_clear" && (ac.state === "TAKEOFF_CLEARED" || ac.state === "TAKEOFF_ROLL" || ac.state === "CLIMB")) completed = true;
    if (item.id === "thrust" && controls.throttle === "TOGA") completed = true;

    return completed ? { ...item, completed: true } : item;
  });

  return { controls, checklist, calloutMade };
}
