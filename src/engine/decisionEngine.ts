import {
  alongRunwayNm,
  findRouteAlongTaxiways,
  getRunwayExitOptions,
  runwaySpokenName,
  taxiwayFullName,
} from "../data/asteriaAirport.ts";
import { formatFixIcao, formatGateIcao } from "../utils/natoPhonetics.ts";
import type {
  ATCClearance,
  Aircraft,
  ClearanceCommandInput,
  ControllerRole,
  DecisionResponse,
  LightGunSignal,
  RadioMessage,
  RunwayId,
  SimulationState,
  TaxiwayName,
} from "../types/atc.ts";
import {
  createClearanceObject,
  nextId,
  supersedeClearancesForNewInstruction,
  transitionClearanceLifecycle,
} from "./clearanceEngine.ts";

export function addRadioMessage(
  state: SimulationState,
  msg: Omit<RadioMessage, "id" | "timestamp">
): void {
  state.radioLog.push({
    ...msg,
    id: nextId(state, "rad"),
    timestamp: state.time,
  });
  if (state.radioLog.length > 250) {
    state.radioLog.splice(0, state.radioLog.length - 250);
  }
}

export function controllerCallsign(role: ControllerRole, airport?: SimulationState["airport"]): string {
  const prefix = airport?.controllerPrefix ?? "Asteria";
  switch (role) {
    case "GROUND":
      return `${prefix} Ground`;
    case "TOWER":
      return `${prefix} Tower`;
    case "DEPARTURE":
      return `${prefix} Departure`;
  }
}

function formatRunwayOrAltitudeError(
  clearance: ATCClearance,
  state: SimulationState
): { errorText: string } {
  const pickWrongRunway = (rwy: RunwayId): RunwayId => {
    const other = state.airport.runwayIds.find((id) => id !== rwy);
    return other ?? state.airport.runways[rwy]?.oppositeId ?? rwy;
  };
  switch (clearance.type) {
    case "ALTITUDE": {
      const target = Number(clearance.parameters.altitude ?? 5000);
      const wrong = target >= 5000 ? target - 2000 : target + 2000;
      return {
        errorText: `Climb and maintain ${wrong}, ${clearance.parameters.spokenCallsign ?? ""}`.trim(),
      };
    }
    case "HEADING": {
      const hdg = Number(clearance.parameters.heading ?? 90);
      const wrong = ((hdg + 30) % 360).toString().padStart(3, "0");
      return {
        errorText: `Fly heading ${wrong}, ${clearance.parameters.spokenCallsign ?? ""}`.trim(),
      };
    }
    case "SPEED": {
      const spd = Number(clearance.parameters.speed ?? 180);
      const wrong = spd === 180 ? 210 : 180;
      return {
        errorText: `Maintain ${wrong} knots, ${clearance.parameters.spokenCallsign ?? ""}`.trim(),
      };
    }
    case "TAXI": {
      const rwy = (clearance.parameters.runway as RunwayId | undefined) ?? state.airport.primaryDepartureRunway;
      const wrongRwy = pickWrongRunway(rwy);
      return {
        errorText: `Taxi runway ${runwaySpokenName(wrongRwy)} via Charlie, ${clearance.parameters.spokenCallsign ?? ""}`.trim(),
      };
    }
    case "CROSS_RUNWAY": {
      const rwy = (clearance.parameters.runway as RunwayId | undefined) ?? state.airport.primaryDepartureRunway;
      const wrongRwy = pickWrongRunway(rwy);
      return {
        errorText: `Cross runway ${runwaySpokenName(wrongRwy)}, ${clearance.parameters.spokenCallsign ?? ""}`.trim(),
      };
    }
    case "TAKEOFF": {
      const rwy = (clearance.parameters.runway as RunwayId | undefined) ?? state.airport.primaryDepartureRunway;
      const wrongRwy = pickWrongRunway(rwy);
      return {
        errorText: `Cleared for takeoff runway ${runwaySpokenName(wrongRwy)}, ${clearance.parameters.spokenCallsign ?? ""}`.trim(),
      };
    }
    case "LAND": {
      const rwy = (clearance.parameters.runway as RunwayId | undefined) ?? state.airport.primaryArrivalRunway;
      const wrongRwy = pickWrongRunway(rwy);
      return {
        errorText: `Cleared to land runway ${runwaySpokenName(wrongRwy)}, ${clearance.parameters.spokenCallsign ?? ""}`.trim(),
      };
    }
    default:
      return {
        errorText: `Say again clearance, ${clearance.parameters.spokenCallsign ?? ""}`.trim(),
      };
  }
}

function getCurrentSurfaceNodeId(
  state: SimulationState,
  aircraft: Aircraft
): string | null {
  if (aircraft.currentNodeId && state.airport.nodes[aircraft.currentNodeId]) {
    return aircraft.currentNodeId;
  }
  let bestId: string | null = null;
  let bestDist = Infinity;
  for (const node of Object.values(state.airport.nodes)) {
    const d = Math.hypot(node.x - aircraft.x, node.y - aircraft.y);
    if (d < bestDist) {
      bestDist = d;
      bestId = node.id;
    }
  }
  return bestDist < 0.08 ? bestId : null;
}

/**
 * Single authoritative Decision Engine gateway used by BOTH Player UI and Autonomous Controllers.
 * Creates structured ATCClearance objects, validates preconditions, and records radio transmissions.
 * Never teleports or moves aircraft directly.
 */
export function submitClearanceDecision(
  state: SimulationState,
  command: ClearanceCommandInput,
  issuedBy: "PLAYER" | "AUTONOMOUS"
): DecisionResponse {
  const aircraft = state.aircraft[command.aircraftId];
  if (!aircraft) {
    return { ok: false, reason: `Unknown aircraft ${command.aircraftId}.` };
  }

  // Enforce RADIO_FAILURE (NORDO 7600) — normal radio commands cannot control a NORDO aircraft!
  if (aircraft.commStatus === "RADIO_FAILURE" && command.type !== "LIGHT_GUN") {
    return {
      ok: false,
      reason: `${aircraft.callsign} has RADIO_FAILURE (NORDO 7600) — normal radio commands disabled.`,
    };
  }

  const params: Record<string, unknown> = {
    ...(command.parameters ?? {}),
    spokenCallsign: aircraft.spokenCallsign,
  };
  let phraseology = "";
  let expectedReadback = "";
  let immediate = false;

  switch (command.type) {
    case "LIGHT_GUN": {
      if (command.controller !== "TOWER") {
        return {
          ok: false,
          reason: "ATC light gun signals may only be issued by Tower.",
        };
      }
      if (state.config.nordoMode !== "LIGHT_GUN_SIGNALS") {
        return {
          ok: false,
          reason: "Simulation is configured for predefined lost-comm behavior rather than light gun signals.",
        };
      }
      const signal = (params.signal as LightGunSignal) ?? "STEADY_GREEN";
      params.signal = signal;
      phraseology = `[TOWER LIGHT GUN → ${aircraft.callsign}] ${signal.replace("_", " ")}`;
      expectedReadback = `[WING ROCK / VISUAL ACK] ${aircraft.callsign}`;
      immediate = true;
      aircraft.lightGunAuthorized = signal;
      if (signal === "STEADY_RED") {
        aircraft.state = "HOLD_POSITION";
      }
      break;
    }

    case "PUSHBACK": {
      if (aircraft.state !== "AT_GATE" && aircraft.state !== "HOLD_POSITION") {
        return {
          ok: false,
          reason: `${aircraft.callsign} is not at a gate for pushback (state: ${aircraft.state}).`,
        };
      }
      phraseology = `${aircraft.spokenCallsign}, ${controllerCallsign(command.controller, state.airport)}, pushback approved.`;
      expectedReadback = `Pushback approved, ${aircraft.spokenCallsign}.`;
      break;
    }

    case "TAXI": {
      if (aircraft.state === "AT_GATE" && aircraft.requiresPushback) {
        return {
          ok: false,
          reason: `${aircraft.callsign} is parked nose-in at gate ${aircraft.gateId ?? ""}; issue PUSHBACK first.`,
        };
      }
      if (aircraft.altitude > state.airport.elevationFt + 50) {
        return {
          ok: false,
          reason: `${aircraft.callsign} is airborne and cannot accept taxi clearance.`,
        };
      }
      const startNodeId = getCurrentSurfaceNodeId(state, aircraft);
      if (!startNodeId) {
        return {
          ok: false,
          reason: `${aircraft.callsign} is not positioned on a valid airport node.`,
        };
      }

      const routeTaxiways = (params.routeTaxiways as TaxiwayName[] | undefined) ?? ["A", "B"];
      const targetRunway = (params.runway as RunwayId | undefined) ?? aircraft.targetRunway;
      let destinationNodeId = params.destinationNodeId as string | undefined;

      if (!destinationNodeId) {
        if (aircraft.flightKind === "ARRIVAL" && aircraft.gateId) {
          destinationNodeId = `GATE_${aircraft.gateId}`;
        } else {
          const lastTw = routeTaxiways[routeTaxiways.length - 1];
          const connector =
            lastTw === "B" || lastTw === "C" || lastTw === "D" || lastTw === "E" || lastTw === "H" || lastTw === "J"
              ? lastTw
              : "B";
          const isNorth = state.airport.nodes[startNodeId]?.isNorthSide !== false;
          const northId = `HS_${targetRunway}_${connector}_N`;
          const southId = `HS_${targetRunway}_${connector}_S`;
          destinationNodeId =
            isNorth && state.airport.nodes[northId]
              ? northId
              : state.airport.nodes[southId]
              ? southId
              : state.airport.nodes[northId]
              ? northId
              : state.airport.runways[targetRunway]?.holdShortNodeIds[0];
        }
      }

      let routeNodeIds: string[] | null = null;
      const providedNodeIds = params.routeNodeIds as string[] | undefined;
      if (
        Array.isArray(providedNodeIds) &&
        providedNodeIds.length >= 2 &&
        providedNodeIds[0] === startNodeId &&
        providedNodeIds[providedNodeIds.length - 1] === destinationNodeId
      ) {
        const edgePairs = new Set(state.airport.edges.map((e) => `${e.from}|${e.to}`));
        let validChain = true;
        for (let i = 0; i < providedNodeIds.length - 1; i++) {
          if (!edgePairs.has(`${providedNodeIds[i]}|${providedNodeIds[i + 1]}`)) {
            validChain = false;
            break;
          }
        }
        if (validChain) {
          routeNodeIds = [...providedNodeIds];
        }
      }

      if (!routeNodeIds) {
        routeNodeIds = findRouteAlongTaxiways(
          state.airport,
          startNodeId,
          destinationNodeId,
          routeTaxiways
        );
      }

      if (!routeNodeIds || routeNodeIds.length === 0) {
        return {
          ok: false,
          reason: `No valid taxi route from ${startNodeId} to ${destinationNodeId} via ${routeTaxiways.join(", ")}.`,
        };
      }

      params.runway = targetRunway;
      params.routeTaxiways = routeTaxiways;
      params.destinationNodeId = destinationNodeId;
      params.routeNodeIds = routeNodeIds;

      const spokenTw = routeTaxiways.map((tw) => taxiwayFullName(tw)).join(", ");
      const destLabel =
        aircraft.flightKind === "ARRIVAL" && aircraft.gateId
          ? `gate ${formatGateIcao(aircraft.gateId)}`
          : `runway ${runwaySpokenName(targetRunway)}`;
      phraseology = `${aircraft.spokenCallsign}, ${controllerCallsign(command.controller, state.airport)}, taxi to ${destLabel} via taxiway ${spokenTw}.`;
      expectedReadback = `Taxi ${destLabel} via taxiway ${spokenTw}, ${aircraft.spokenCallsign}.`;
      break;
    }

    case "HOLD_SHORT": {
      const runway = (params.runway as RunwayId | undefined) ?? aircraft.targetRunway;
      params.runway = runway;
      phraseology = `${aircraft.spokenCallsign}, hold short of runway ${runwaySpokenName(runway)}.`;
      expectedReadback = `Hold short runway ${runwaySpokenName(runway)}, ${aircraft.spokenCallsign}.`;
      immediate = true;
      break;
    }

    case "CROSS_RUNWAY": {
      const runway = (params.runway as RunwayId | undefined) ?? state.airport.primaryDepartureRunway;
      params.runway = runway;
      phraseology = `${aircraft.spokenCallsign}, ${controllerCallsign(command.controller, state.airport)}, cross runway ${runwaySpokenName(runway)}.`;
      expectedReadback = `Cross runway ${runwaySpokenName(runway)}, ${aircraft.spokenCallsign}.`;
      break;
    }

    case "LINE_UP": {
      if (
        aircraft.state !== "HOLDING_SHORT" &&
        aircraft.state !== "HOLD_POSITION" &&
        aircraft.state !== "TAKEOFF_CANCELLED"
      ) {
        return {
          ok: false,
          reason: `${aircraft.callsign} must be holding short of runway to line up and wait.`,
        };
      }
      const runway = (params.runway as RunwayId | undefined) ?? aircraft.targetRunway;
      params.runway = runway;
      phraseology = `${aircraft.spokenCallsign}, ${controllerCallsign(command.controller, state.airport)}, runway ${runwaySpokenName(runway)}, line up and wait.`;
      expectedReadback = `Line up and wait runway ${runwaySpokenName(runway)}, ${aircraft.spokenCallsign}.`;
      break;
    }

    case "TAKEOFF": {
      if (
        aircraft.state !== "LINE_UP_WAIT" &&
        aircraft.state !== "HOLDING_SHORT" &&
        aircraft.state !== "HOLD_POSITION" &&
        aircraft.state !== "TAKEOFF_CANCELLED"
      ) {
        return {
          ok: false,
          reason: `${aircraft.callsign} is not in position for takeoff (state: ${aircraft.state}).`,
        };
      }
      const runway = (params.runway as RunwayId | undefined) ?? aircraft.targetRunway;
      const baseAlt = Math.round(state.airport.elevationFt / 500) * 500;
      const initialAlt = Number(params.initialAltitude ?? baseAlt + 3000);
      params.runway = runway;
      params.initialAltitude = initialAlt;
      phraseology = `${aircraft.spokenCallsign}, wind ${state.airport.windText}, runway ${runwaySpokenName(runway)}, cleared for takeoff.`;
      expectedReadback = `Cleared for takeoff runway ${runwaySpokenName(runway)}, ${aircraft.spokenCallsign}.`;
      break;
    }

    case "CANCEL_TAKEOFF": {
      if (aircraft.state === "TAKEOFF_ROLL" || aircraft.state === "ROTATE") {
        return {
          ok: false,
          reason: `${aircraft.callsign} has already started takeoff roll! Use REJECT_TAKEOFF (Abort Takeoff) instead of Cancel Takeoff.`,
        };
      }
      const hasTakeoffClr = aircraft.clearances.some(
        (c) => c.type === "TAKEOFF" && !c.cancelled && (c.active || c.lifecycle === "READBACK_PENDING")
      );
      if (
        aircraft.state !== "TAKEOFF_CLEARED" &&
        aircraft.state !== "LINE_UP_WAIT" &&
        !(aircraft.state === "HOLDING_SHORT" && hasTakeoffClr)
      ) {
        return {
          ok: false,
          reason: `${aircraft.callsign} has no pre-roll takeoff clearance to cancel.`,
        };
      }
      phraseology = `${aircraft.spokenCallsign}, cancel takeoff clearance, hold position!`;
      expectedReadback = `Cancelling takeoff, holding position, ${aircraft.spokenCallsign}.`;
      immediate = true;
      break;
    }

    case "REJECT_TAKEOFF": {
      if (aircraft.state !== "TAKEOFF_ROLL") {
        return {
          ok: false,
          reason: `Rejected takeoff only applies during active TAKEOFF_ROLL (current: ${aircraft.state}).`,
        };
      }
      phraseology = `${aircraft.spokenCallsign}, STOP IMMEDIATELY, reject takeoff, runway emergency!`;
      expectedReadback = `Rejecting takeoff, stopping on runway, ${aircraft.spokenCallsign}!`;
      immediate = true;
      break;
    }

    case "HOLD_POSITION": {
      if (aircraft.altitude > state.airport.elevationFt + 50) {
        return {
          ok: false,
          reason: `HOLD_POSITION is a ground surface instruction.`,
        };
      }
      phraseology = `${aircraft.spokenCallsign}, hold position.`;
      expectedReadback = `Holding position, ${aircraft.spokenCallsign}.`;
      immediate = true;
      break;
    }

    case "UNABLE": {
      phraseology = `${aircraft.spokenCallsign}, unable at this time, standby.`;
      expectedReadback = `Standing by, ${aircraft.spokenCallsign}.`;
      immediate = true;
      break;
    }

    case "LAND": {
      if (
        aircraft.state !== "APPROACH" &&
        aircraft.state !== "FINAL" &&
        aircraft.state !== "CLEARED_TO_LAND"
      ) {
        return {
          ok: false,
          reason: `${aircraft.callsign} must be on approach or final for landing clearance.`,
        };
      }
      const runway =
        (params.runway as RunwayId | undefined) ??
        aircraft.assignedApproach ??
        aircraft.targetRunway;
      params.runway = runway;
      phraseology = `${aircraft.spokenCallsign}, ${controllerCallsign(command.controller, state.airport)}, wind ${state.airport.windText}, runway ${runwaySpokenName(runway)}, cleared to land.`;
      expectedReadback = `Cleared to land runway ${runwaySpokenName(runway)}, ${aircraft.spokenCallsign}.`;
      break;
    }

    case "VACATE_RUNWAY": {
      if (command.controller !== "TOWER") {
        return {
          ok: false,
          reason: `Vacate runway clearances must be issued by Tower Control (selected: ${command.controller}).`,
        };
      }
      const onSurface = aircraft.altitude <= state.airport.elevationFt + 50;
      const canVacateState =
        aircraft.state === "TOUCHDOWN" ||
        aircraft.state === "ROLLOUT" ||
        aircraft.state === "VACATING_RUNWAY" ||
        (aircraft.state === "HOLD_POSITION" && onSurface) ||
        aircraft.state === "STOPPED_ON_RUNWAY";
      if (!canVacateState) {
        return {
          ok: false,
          reason: `${aircraft.callsign} must be landed on the runway to vacate (current: ${aircraft.state}).`,
        };
      }
      const runway =
        (params.runway as RunwayId | undefined) ??
        aircraft.assignedApproach ??
        aircraft.targetRunway;
      const options = getRunwayExitOptions(state.airport, aircraft, runway);
      const reqRwyNode = params.exitRwyNodeId as string | undefined;
      const reqTw = (params.taxiway as TaxiwayName | undefined)?.trim().toUpperCase();
      const chosen =
        (reqRwyNode ? options.find((o) => o.exitRwyNodeId === reqRwyNode) : undefined) ??
        (reqTw ? options.find((o) => o.taxiway.toUpperCase() === reqTw) : undefined) ??
        options[0];
      if (!chosen) {
        return {
          ok: false,
          reason: `No runway exit taxiway found ahead on runway ${runway}.`,
        };
      }
      const expedite = Boolean(params.expedite);
      params.runway = runway;
      params.exitRwyNodeId = chosen.exitRwyNodeId;
      params.holdShortNodeId = chosen.holdShortNodeId;
      params.taxiway = chosen.taxiway;
      params.expedite = expedite;

      const rwySpoken = runwaySpokenName(runway);
      const twSpoken = chosen.spokenName;
      phraseology = expedite
        ? `${aircraft.spokenCallsign}, ${controllerCallsign(command.controller, state.airport)}, expedite vacating runway ${rwySpoken} via taxiway ${twSpoken}, traffic on final.`
        : `${aircraft.spokenCallsign}, ${controllerCallsign(command.controller, state.airport)}, vacate runway ${rwySpoken} via taxiway ${twSpoken}.`;
      expectedReadback = expedite
        ? `Expediting off runway ${rwySpoken} via taxiway ${twSpoken}, ${aircraft.spokenCallsign}.`
        : `Vacating runway ${rwySpoken} via taxiway ${twSpoken}, ${aircraft.spokenCallsign}.`;
      immediate = true;
      break;
    }

    case "GO_AROUND": {
      if (
        aircraft.state !== "APPROACH" &&
        aircraft.state !== "FINAL" &&
        aircraft.state !== "CLEARED_TO_LAND" &&
        aircraft.state !== "LANDING"
      ) {
        return {
          ok: false,
          reason: `${aircraft.callsign} is not on approach/landing for a go-around.`,
        };
      }
      const baseAlt = Math.round(state.airport.elevationFt / 500) * 500;
      const rwySpec = state.airport.runways[aircraft.assignedApproach ?? aircraft.targetRunway];
      const climbAlt = Number(params.altitude ?? baseAlt + 3000);
      const heading = Number(params.heading ?? rwySpec?.heading ?? 90);
      params.altitude = climbAlt;
      params.heading = heading;
      phraseology = `${aircraft.spokenCallsign}, go around, climb and maintain ${climbAlt}, fly runway heading.`;
      expectedReadback = `Going around, climbing ${climbAlt}, ${aircraft.spokenCallsign}.`;
      immediate = true;
      break;
    }

    case "APPROACH": {
      const runway = (params.runway as RunwayId | undefined) ?? aircraft.targetRunway;
      params.runway = runway;
      phraseology = `${aircraft.spokenCallsign}, cleared ILS runway ${runwaySpokenName(runway)} approach.`;
      expectedReadback = `Cleared ILS runway ${runwaySpokenName(runway)} approach, ${aircraft.spokenCallsign}.`;
      break;
    }

    case "HEADING": {
      const hdg = ((Number(params.heading ?? 90) % 360) + 360) % 360;
      const normalizedHdg = hdg === 0 ? 360 : hdg;
      const turnDir = (params.turnDirection as "LEFT" | "RIGHT" | "NEAREST" | undefined) ?? "NEAREST";
      params.heading = normalizedHdg;
      params.turnDirection = turnDir;
      const turnText =
        turnDir === "LEFT"
          ? "turn left heading"
          : turnDir === "RIGHT"
          ? "turn right heading"
          : "fly heading";
      const hdgStr = String(Math.round(normalizedHdg)).padStart(3, "0");
      phraseology = `${aircraft.spokenCallsign}, ${turnText} ${hdgStr}.`;
      expectedReadback = `${turnText === "fly heading" ? "Heading" : turnText} ${hdgStr}, ${aircraft.spokenCallsign}.`;
      break;
    }

    case "ALTITUDE": {
      const alt = Math.max(1500, Math.min(18000, Math.round(Number(params.altitude ?? 5000))));
      params.altitude = alt;
      const verb =
        alt >= aircraft.altitude ? "climb and maintain" : "descend and maintain";
      phraseology = `${aircraft.spokenCallsign}, ${verb} ${alt}.`;
      expectedReadback = `${verb} ${alt}, ${aircraft.spokenCallsign}.`;
      break;
    }

    case "SPEED": {
      const spd = Math.max(130, Math.min(300, Math.round(Number(params.speed ?? 180))));
      params.speed = spd;
      const verb =
        spd > aircraft.speed
          ? "increase speed to"
          : spd < aircraft.speed
          ? "reduce speed to"
          : "maintain";
      phraseology = `${aircraft.spokenCallsign}, ${verb} ${spd} knots.`;
      expectedReadback = `Speed ${spd} knots, ${aircraft.spokenCallsign}.`;
      break;
    }

    case "DIRECT": {
      const fixId = String(params.fixId ?? "");
      const fix = state.airport.fixes[fixId];
      if (!fix) {
        return { ok: false, reason: `Unknown navigation fix "${fixId}".` };
      }
      params.fixId = fixId;
      const spokenFix = formatFixIcao(fixId);
      phraseology = `${aircraft.spokenCallsign}, cleared direct ${spokenFix}.`;
      expectedReadback = `Direct ${spokenFix}, ${aircraft.spokenCallsign}.`;
      break;
    }

    case "HANDOFF": {
      const targetController = params.targetController as ControllerRole;
      if (!targetController || targetController === aircraft.controller) {
        return { ok: false, reason: `Invalid handoff target controller.` };
      }
      params.targetController = targetController;
      phraseology = `${aircraft.spokenCallsign}, contact ${controllerCallsign(targetController, state.airport)}.`;
      expectedReadback = `Over to ${controllerCallsign(targetController, state.airport)}, ${aircraft.spokenCallsign}.`;
      break;
    }
  }

  // Supersede conflicting prior clearances
  supersedeClearancesForNewInstruction(aircraft, command.type, params);

  const clearance = createClearanceObject(state, {
    aircraft,
    controller: command.controller,
    issuedBy,
    type: command.type,
    parameters: params,
    phraseology,
    expectedReadbackText: expectedReadback,
    immediate,
  });

  aircraft.clearances.push(clearance);
  state.metrics.clearancesIssued += 1;

  // Log ATC radio transmission
  addRadioMessage(state, {
    sender: `${controllerCallsign(command.controller, state.airport)} (${issuedBy === "PLAYER" ? "YOU" : "AI"})`,
    recipient: aircraft.callsign,
    controller: command.controller,
    aircraftId: aircraft.id,
    category: "ATC_CLEARANCE",
    text: phraseology,
  });

  // Immediate safety/cancellation actions apply right away without waiting for readback delay
  if (immediate) {
    applyClearanceImmediateEffects(state, aircraft, clearance);
    if (command.type !== "LIGHT_GUN") {
      addRadioMessage(state, {
        sender: aircraft.callsign,
        recipient: controllerCallsign(command.controller, state.airport),
        controller: command.controller,
        aircraftId: aircraft.id,
        category: command.type === "REJECT_TAKEOFF" ? "EMERGENCY" : "PILOT_READBACK",
        text: expectedReadback,
      });
    }
  }

  return {
    ok: true,
    reason: `Clearance ${clearance.id} (${command.type}) issued.`,
    clearance,
  };
}

function applyClearanceImmediateEffects(
  state: SimulationState,
  aircraft: Aircraft,
  clearance: ATCClearance
): void {
  switch (clearance.type) {
    case "HOLD_SHORT": {
      const rwy = clearance.parameters.runway as RunwayId;
      aircraft.crossRunwayCleared[rwy] = false;
      break;
    }
    case "HOLD_POSITION": {
      aircraft.state = "HOLD_POSITION";
      aircraft.stateEnteredAt = state.time;
      break;
    }
    case "CANCEL_TAKEOFF": {
      aircraft.state = "TAKEOFF_CANCELLED";
      aircraft.stateEnteredAt = state.time;
      aircraft.speed = 0;
      break;
    }
    case "REJECT_TAKEOFF": {
      aircraft.state = "REJECTED_TAKEOFF";
      aircraft.operationMode = "EMERGENCY_OPERATION";
      aircraft.emergencyType = "REJECTED_TAKEOFF_ABORT";
      aircraft.stateEnteredAt = state.time;
      state.incidents.push({
        id: nextId(state, "inc"),
        timestamp: state.time,
        severity: "WARNING",
        code: "REJECTED_TAKEOFF",
        message: `${aircraft.callsign} initiated REJECTED TAKEOFF on RWY ${aircraft.targetRunway}.`,
        aircraftIds: [aircraft.id],
      });
      break;
    }
    case "GO_AROUND": {
      aircraft.state = "GO_AROUND";
      aircraft.stateEnteredAt = state.time;
      aircraft.assignedAltitude = Number(clearance.parameters.altitude ?? 3000);
      aircraft.assignedHeading = Number(clearance.parameters.heading ?? 90);
      aircraft.assignedSpeed = 190;
      aircraft.assignedApproach = null;
      aircraft.minimumsGoAroundTriggered = false;
      state.metrics.goAroundsExecuted += 1;
      if (aircraft.pendingRequest?.type === "LANDING") {
        aircraft.pendingRequest.resolved = true;
      }
      break;
    }
    case "VACATE_RUNWAY": {
      const rwyId = (clearance.parameters.runway as RunwayId | undefined) ?? aircraft.assignedApproach ?? aircraft.targetRunway;
      const exitRwyNodeId = clearance.parameters.exitRwyNodeId as string | undefined;
      const holdShortNodeId = clearance.parameters.holdShortNodeId as string | undefined;
      const taxiway = clearance.parameters.taxiway as TaxiwayName | undefined;
      aircraft.vacateAssignedRwyNodeId = exitRwyNodeId;
      aircraft.vacateAssignedHoldShortId = holdShortNodeId;
      aircraft.vacateAssignedTaxiway = taxiway;
      aircraft.expediteVacate = Boolean(clearance.parameters.expedite);

      if (aircraft.state === "VACATING_RUNWAY") {
        if (holdShortNodeId && state.airport.nodes[holdShortNodeId]) {
          aircraft.vacatingExitNodeId = holdShortNodeId;
        }
      } else if (
        aircraft.state === "TOUCHDOWN" ||
        aircraft.state === "HOLD_POSITION" ||
        aircraft.state === "STOPPED_ON_RUNWAY"
      ) {
        const rwy = state.airport.runways[rwyId];
        const rwyNode = exitRwyNodeId ? state.airport.nodes[exitRwyNodeId] : undefined;
        const along = rwy ? alongRunwayNm(rwy, aircraft.x, aircraft.y) : 0;
        const exitAlong = rwy && rwyNode ? alongRunwayNm(rwy, rwyNode.x, rwyNode.y) : 0;
        if (holdShortNodeId && rwy && rwyNode && along >= exitAlong - 0.04) {
          aircraft.vacatingExitNodeId = holdShortNodeId;
          aircraft.state = "VACATING_RUNWAY";
        } else {
          aircraft.state = "ROLLOUT";
        }
        aircraft.stateEnteredAt = state.time;
      }
      break;
    }
    case "UNABLE": {
      if (aircraft.pendingRequest) {
        aircraft.pendingRequest.resolved = true;
      }
      break;
    }
    default:
      break;
  }
}

function applyAcknowledgedClearance(
  state: SimulationState,
  aircraft: Aircraft,
  clearance: ATCClearance
): void {
  transitionClearanceLifecycle(clearance, "ACTIVE");
  aircraft.hasReadbackError = false;
  aircraft.readbackErrorClearanceId = undefined;

  switch (clearance.type) {
    case "PUSHBACK": {
      if (aircraft.pendingRequest?.type === "PUSHBACK") {
        aircraft.pendingRequest.resolved = true;
      }
      aircraft.state = "PUSHBACK_APPROVED";
      aircraft.stateEnteredAt = state.time;
      break;
    }

    case "TAXI": {
      if (
        aircraft.pendingRequest?.type === "TAXI" ||
        aircraft.pendingRequest?.type === "GATE_TAXI"
      ) {
        aircraft.pendingRequest.resolved = true;
      }
      const routeNodeIds = (clearance.parameters.routeNodeIds as string[]) ?? [];
      const routeTaxiways = (clearance.parameters.routeTaxiways as TaxiwayName[]) ?? [];
      const targetRunway = (clearance.parameters.runway as RunwayId | undefined) ?? aircraft.targetRunway;

      aircraft.targetRunway = targetRunway;
      aircraft.assignedRouteNodeIds = [...routeNodeIds];
      aircraft.assignedRouteTaxiways = [...routeTaxiways];
      aircraft.routeStepIndex = 0;
      aircraft.holdingAtRunway = undefined;
      aircraft.holdingShortReason = undefined;
      aircraft.state = "TAXIING";
      aircraft.stateEnteredAt = state.time;
      break;
    }

    case "CROSS_RUNWAY": {
      const rwy = clearance.parameters.runway as RunwayId;
      aircraft.crossRunwayCleared[rwy] = true;
      if (aircraft.pendingRequest?.type === "CROSS_RUNWAY") {
        aircraft.pendingRequest.resolved = true;
      }
      if (
        aircraft.state === "HOLDING_SHORT" &&
        aircraft.holdingAtRunway === rwy &&
        aircraft.holdingShortReason === "CROSSING_REQUIRED"
      ) {
        aircraft.holdingAtRunway = undefined;
        aircraft.holdingShortReason = undefined;
        aircraft.state = "CROSSING_RUNWAY";
        aircraft.stateEnteredAt = state.time;
      }
      break;
    }

    case "LINE_UP": {
      const rwy = clearance.parameters.runway as RunwayId;
      aircraft.targetRunway = rwy;
      aircraft.holdingAtRunway = undefined;
      aircraft.holdingShortReason = undefined;
      aircraft.state = "LINE_UP_WAIT";
      aircraft.stateEnteredAt = state.time;
      break;
    }

    case "TAKEOFF": {
      const rwy = clearance.parameters.runway as RunwayId;
      const rwySpec = state.airport.runways[rwy];
      const baseAlt = Math.round(state.airport.elevationFt / 500) * 500;
      const initialAlt = Number(clearance.parameters.initialAltitude ?? baseAlt + 3000);
      aircraft.targetRunway = rwy;
      aircraft.assignedAltitude = aircraft.assignedAltitude ?? initialAlt;
      aircraft.assignedHeading = aircraft.assignedHeading ?? rwySpec?.heading ?? 90;
      aircraft.assignedSpeed = aircraft.assignedSpeed ?? 210;
      if (aircraft.pendingRequest?.type === "TAKEOFF") {
        aircraft.pendingRequest.resolved = true;
      }
      aircraft.state = "TAKEOFF_CLEARED";
      aircraft.stateEnteredAt = state.time;
      break;
    }

    case "LAND": {
      const rwy = clearance.parameters.runway as RunwayId;
      aircraft.assignedApproach = rwy;
      aircraft.targetRunway = rwy;
      if (aircraft.pendingRequest?.type === "LANDING") {
        aircraft.pendingRequest.resolved = true;
      }
      aircraft.state = "CLEARED_TO_LAND";
      aircraft.stateEnteredAt = state.time;
      break;
    }

    case "APPROACH": {
      const rwy = clearance.parameters.runway as RunwayId;
      aircraft.assignedApproach = rwy;
      aircraft.targetRunway = rwy;
      aircraft.assignedDirectFix = state.airport.iafByRunway[rwy] ?? null;
      if (aircraft.pendingRequest?.type === "APPROACH_CLEARANCE") {
        aircraft.pendingRequest.resolved = true;
      }
      break;
    }

    case "HEADING": {
      aircraft.assignedHeading = Number(clearance.parameters.heading);
      aircraft.assignedTurnDirection =
        (clearance.parameters.turnDirection as "LEFT" | "RIGHT" | "NEAREST") ?? "NEAREST";
      aircraft.assignedDirectFix = null;
      break;
    }

    case "ALTITUDE": {
      aircraft.assignedAltitude = Number(clearance.parameters.altitude);
      if (aircraft.pendingRequest?.type === "CLIMB_HIGHER") {
        aircraft.pendingRequest.resolved = true;
      }
      break;
    }

    case "SPEED": {
      aircraft.assignedSpeed = Number(clearance.parameters.speed);
      break;
    }

    case "DIRECT": {
      aircraft.assignedDirectFix = String(clearance.parameters.fixId);
      break;
    }

    case "HANDOFF": {
      const target = clearance.parameters.targetController as ControllerRole;
      aircraft.controller = target;
      aircraft.lastTransmissionAt = state.time;
      const targetName = controllerCallsign(target, state.airport);

      if (target === "TOWER" && aircraft.flightKind === "DEPARTURE") {
        const msgText = `${targetName}, ${aircraft.spokenCallsign}, holding short runway ${runwaySpokenName(aircraft.targetRunway)}, ready for departure.`;
        aircraft.pendingRequest = {
          id: nextId(state, "req"),
          type: "TAKEOFF",
          controller: "TOWER",
          message: msgText,
          requestedAt: state.time,
          runway: aircraft.targetRunway,
          resolved: false,
        };
        addRadioMessage(state, {
          sender: aircraft.callsign,
          recipient: targetName,
          controller: target,
          aircraftId: aircraft.id,
          category: "PILOT_REQUEST",
          text: msgText,
        });
      } else if (target === "TOWER" && aircraft.flightKind === "ARRIVAL") {
        const rwy = aircraft.assignedApproach ?? aircraft.targetRunway;
        const msgText = `${targetName}, ${aircraft.spokenCallsign}, inbound ILS runway ${runwaySpokenName(rwy)}, request landing clearance.`;
        aircraft.pendingRequest = {
          id: nextId(state, "req"),
          type: "LANDING",
          controller: "TOWER",
          message: msgText,
          requestedAt: state.time,
          runway: rwy,
          resolved: false,
        };
        addRadioMessage(state, {
          sender: aircraft.callsign,
          recipient: targetName,
          controller: target,
          aircraftId: aircraft.id,
          category: "PILOT_REQUEST",
          text: msgText,
        });
      } else if (target === "GROUND" && aircraft.flightKind === "ARRIVAL") {
        const spokenGate = aircraft.gateId ? formatGateIcao(aircraft.gateId) : "";
        const msgText = `${targetName}, ${aircraft.spokenCallsign}, clear of runway, request taxi to gate ${spokenGate}.`;
        aircraft.pendingRequest = {
          id: nextId(state, "req"),
          type: "GATE_TAXI",
          controller: "GROUND",
          message: msgText,
          requestedAt: state.time,
          gate: aircraft.gateId,
          resolved: false,
        };
        addRadioMessage(state, {
          sender: aircraft.callsign,
          recipient: targetName,
          controller: target,
          aircraftId: aircraft.id,
          category: "PILOT_REQUEST",
          text: msgText,
        });
      } else if (target === "DEPARTURE" && aircraft.flightKind === "DEPARTURE") {
        const altRounded = Math.max(500, Math.round(aircraft.altitude / 100) * 100);
        const msgText = `${targetName}, ${aircraft.spokenCallsign}, passing ${altRounded} feet, climbing ${aircraft.assignedAltitude ?? 3000}.`;
        aircraft.pendingRequest = {
          id: nextId(state, "req"),
          type: "CLIMB_HIGHER",
          controller: "DEPARTURE",
          message: msgText,
          requestedAt: state.time,
          runway: aircraft.targetRunway,
          resolved: false,
        };
        addRadioMessage(state, {
          sender: aircraft.callsign,
          recipient: targetName,
          controller: target,
          aircraftId: aircraft.id,
          category: "PILOT_REQUEST",
          text: msgText,
        });
      } else {
        if (aircraft.pendingRequest && aircraft.pendingRequest.controller !== target) {
          aircraft.pendingRequest.resolved = true;
        }
        addRadioMessage(state, {
          sender: aircraft.callsign,
          recipient: targetName,
          controller: target,
          aircraftId: aircraft.id,
          category: "PILOT_REQUEST",
          text: `${targetName}, ${aircraft.spokenCallsign} checking in.`,
        });
      }
      break;
    }

    default:
      break;
  }
}

/**
 * Processes pending pilot readbacks once readbackDueAt is reached.
 * Enforces Section 22 (readback before execution) and Section 23 (readback errors prevent execution!).
 */
export function processPilotReadbacks(state: SimulationState): void {
  for (const id of state.aircraftOrder) {
    const aircraft = state.aircraft[id];
    if (!aircraft || aircraft.commStatus === "RADIO_FAILURE") continue;

    for (const clearance of aircraft.clearances) {
      if (clearance.cancelled || clearance.lifecycle !== "READBACK_PENDING") {
        continue;
      }
      if (state.time < clearance.readbackDueAt) {
        continue;
      }

      // Check if this clearance triggers a readback error (armed or probabilistic for key instructions)
      const errorEligible =
        clearance.type === "ALTITUDE" ||
        clearance.type === "HEADING" ||
        clearance.type === "SPEED" ||
        clearance.type === "TAXI" ||
        clearance.type === "CROSS_RUNWAY" ||
        clearance.type === "TAKEOFF" ||
        clearance.type === "LAND";

      const shouldError =
        errorEligible &&
        (aircraft.armNextReadbackError ||
          (state.config.readbackErrorProbability > 0 &&
            pseudoDeterministicRoll(state.time, aircraft.id, clearance.id) <
              state.config.readbackErrorProbability));

      if (shouldError) {
        aircraft.armNextReadbackError = false;
        const { errorText } = formatRunwayOrAltitudeError(clearance, state);
        clearance.actualReadbackText = errorText;
        transitionClearanceLifecycle(clearance, "READBACK_ERROR");
        aircraft.hasReadbackError = true;
        aircraft.readbackErrorClearanceId = clearance.id;

        addRadioMessage(state, {
          sender: aircraft.callsign,
          recipient: controllerCallsign(clearance.controller, state.airport),
          controller: clearance.controller,
          aircraftId: aircraft.id,
          category: "READBACK_ERROR",
          text: `${errorText} [READBACK ERROR — EXPECTED: "${clearance.expectedReadbackText}"]`,
        });

        state.incidents.push({
          id: nextId(state, "inc"),
          timestamp: state.time,
          severity: "WARNING",
          code: "READBACK_ERROR",
          message: `Readback error by ${aircraft.callsign}: read back "${errorText}" instead of "${clearance.expectedReadbackText}". Holding pending correction.`,
          aircraftIds: [aircraft.id],
        });
        continue;
      }

      // Valid readback!
      clearance.actualReadbackText = clearance.expectedReadbackText;
      if (aircraft.hasReadbackError) {
        state.metrics.readbackErrorsCaught += 1;
      }
      applyAcknowledgedClearance(state, aircraft, clearance);

      addRadioMessage(state, {
        sender: aircraft.callsign,
        recipient: controllerCallsign(clearance.controller, state.airport),
        controller: clearance.controller,
        aircraftId: aircraft.id,
        category: "PILOT_READBACK",
        text: clearance.expectedReadbackText,
      });
    }
  }
}

function pseudoDeterministicRoll(
  time: number,
  aircraftId: string,
  clearanceId: string
): number {
  const s = `${Math.floor(time * 10)}_${aircraftId}_${clearanceId}`;
  let hash = 2166136261;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

export function triggerRadioFailure(
  state: SimulationState,
  aircraftId: string
): boolean {
  const ac = state.aircraft[aircraftId];
  if (!ac) return false;
  ac.commStatus = "RADIO_FAILURE";
  ac.squawk = "7600";
  addRadioMessage(state, {
    sender: "SYSTEM",
    recipient: ac.controller,
    controller: ac.controller,
    aircraftId: ac.id,
    category: "EMERGENCY",
    text: `NORDO ALERT: ${ac.callsign} squawking 7600 (RADIO_FAILURE). Normal radio commands disabled.`,
  });
  state.incidents.push({
    id: nextId(state, "inc"),
    timestamp: state.time,
    severity: "WARNING",
    code: "RADIO_FAILURE",
    message: `${ac.callsign} lost radio communications (NORDO 7600).`,
    aircraftIds: [ac.id],
  });
  return true;
}

export function triggerEmergency(
  state: SimulationState,
  aircraftId: string,
  emergencyType: "ENGINE_FAILURE" | "REJECTED_TAKEOFF_ABORT" | "MEDICAL"
): boolean {
  const ac = state.aircraft[aircraftId];
  if (!ac) return false;

  if (emergencyType === "REJECTED_TAKEOFF_ABORT") {
    if (ac.state !== "TAKEOFF_ROLL") return false;
    const res = submitClearanceDecision(
      state,
      {
        aircraftId: ac.id,
        controller: "TOWER",
        type: "REJECT_TAKEOFF",
      },
      "PLAYER"
    );
    return res.ok;
  }

  ac.operationMode = "EMERGENCY_OPERATION";
  ac.emergencyType = emergencyType;
  ac.squawk = "7700";
  ac.pendingRequest = {
    id: nextId(state, "req"),
    type: "EMERGENCY_PRIORITY",
    controller: ac.controller,
    message: `MAYDAY MAYDAY, ${ac.spokenCallsign}, ${emergencyType.replace("_", " ").toLowerCase()}, requesting priority landing runway ${runwaySpokenName(ac.targetRunway)}!`,
    requestedAt: state.time,
    runway: ac.targetRunway,
    resolved: false,
  };
  addRadioMessage(state, {
    sender: ac.callsign,
    recipient: controllerCallsign(ac.controller, state.airport),
    controller: ac.controller,
    aircraftId: ac.id,
    category: "EMERGENCY",
    text: ac.pendingRequest.message,
  });
  state.incidents.push({
    id: nextId(state, "inc"),
    timestamp: state.time,
    severity: "CRITICAL",
    code: emergencyType,
    message: `EMERGENCY (${emergencyType}) declared by ${ac.callsign} (Squawk 7700).`,
    aircraftIds: [ac.id],
  });
  return true;
}

export function clearStoppedRunwayEmergency(
  state: SimulationState,
  aircraftId: string
): boolean {
  const ac = state.aircraft[aircraftId];
  if (!ac || ac.state !== "STOPPED_ON_RUNWAY") return false;
  const rwy = state.airport.runways[ac.targetRunway];
  let bestNode = rwy?.holdShortNodeIds
    .map((id) => state.airport.nodes[id])
    .filter((n): n is NonNullable<typeof n> => Boolean(n))
    .sort((a, b) => Math.hypot(a.x - ac.x, a.y - ac.y) - Math.hypot(b.x - ac.x, b.y - ac.y))[0];
  if (!bestNode) return false;
  ac.x = bestNode.x;
  ac.y = bestNode.y;
  ac.currentNodeId = bestNode.id;
  ac.state = "HOLD_POSITION";
  ac.operationMode = "NORMAL_OPERATION";
  ac.emergencyType = "NONE";
  ac.squawk = "1200";
  ac.controller = "GROUND";
  addRadioMessage(state, {
    sender: "OPS_TUG",
    recipient: "TOWER",
    controller: "TOWER",
    aircraftId: ac.id,
    category: "SYSTEM",
    text: `Airport Rescue & Tug cleared ${ac.callsign} off runway ${ac.targetRunway} to ${bestNode.label}. Runway clear.`,
  });
  return true;
}
