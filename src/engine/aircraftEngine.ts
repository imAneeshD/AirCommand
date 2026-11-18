import {
  alongRunwayNm,
  crossTrackRunwayNm,
  getRunwayExitOptions,
  headingDiffDeg,
  runwaySpokenName,
} from "../data/asteriaAirport.ts";
import { hashCallsign } from "../data/aircraftCatalog.ts";
import type { Aircraft, RunwayId, RunwaySpec, SimulationState, TaxiNode } from "../types/atc.ts";
import { formatGateIcao } from "../utils/natoPhonetics.ts";
import { completeClearancesOfType, nextId } from "./clearanceEngine.ts";
import { addRadioMessage, controllerCallsign, formatSpokenDestination } from "./decisionEngine.ts";
import { canAircraftExecuteAction } from "./validationEngine.ts";

export function resolveCrashLocation(
  state: SimulationState,
  x: number,
  y: number,
  collisionType: "MID_AIR" | "RUNWAY" | "GROUND",
  ac?: Aircraft,
  rwy?: RunwaySpec
): {
  locationKind: "RUNWAY" | "APRON" | "TAXIWAY" | "AIR";
  locationLabel: string;
  runwayId?: RunwayId;
} {
  if (collisionType === "MID_AIR") {
    return {
      locationKind: "AIR",
      locationLabel: `Airspace at ${Math.round(ac?.altitude ?? 3000)} ft`,
    };
  }

  if (collisionType === "RUNWAY" || rwy) {
    const rwyId = (rwy?.id ?? ac?.targetRunway ?? "09R") as RunwayId;
    return {
      locationKind: "RUNWAY",
      locationLabel: `Runway ${rwyId}`,
      runwayId: rwyId,
    };
  }

  // GROUND collision: Find nearest node
  let closestNode: TaxiNode | undefined;
  let minDist = Infinity;
  if (state.airport?.nodes) {
    for (const node of Object.values(state.airport.nodes)) {
      const d = Math.hypot(node.x - x, node.y - y);
      if (d < minDist) {
        minDist = d;
        closestNode = node;
      }
    }
  }

  // Check if close to a gate or in apron area (within ~0.25 NM)
  const isGateNode =
    closestNode?.kind === "GATE" ||
    closestNode?.kind === "PUSHBACK_SPOT" ||
    closestNode?.id?.startsWith("GATE") ||
    Boolean(closestNode?.gateId) ||
    Boolean(ac?.gateId);

  if (isGateNode && minDist < 0.25) {
    const gateId = closestNode?.gateId ?? ac?.gateId ?? closestNode?.label;
    return {
      locationKind: "APRON",
      locationLabel: gateId ? `Apron Stand ${gateId}` : "Terminal Apron / Parking Stand",
    };
  }

  // Check if near runway entry/exit/crossing
  if (
    closestNode?.runwayId ||
    closestNode?.kind === "RUNWAY_CROSSING" ||
    closestNode?.kind === "RUNWAY_ENTRY" ||
    closestNode?.kind === "RUNWAY_EXIT"
  ) {
    const identifiedRwy = (closestNode.runwayId ?? ac?.targetRunway) as RunwayId | undefined;
    if (identifiedRwy) {
      return {
        locationKind: "RUNWAY",
        locationLabel: `Runway ${identifiedRwy}`,
        runwayId: identifiedRwy,
      };
    }
  }

  // Taxiway
  const edge = closestNode && state.airport?.edges
    ? state.airport.edges.find((e) => e.from === closestNode!.id || e.to === closestNode!.id)
    : undefined;
  const twName = edge?.taxiway ?? closestNode?.label;
  return {
    locationKind: "TAXIWAY",
    locationLabel: twName ? `Taxiway ${twName}` : "Ground Taxiway",
  };
}

export function declareAircraftCrash(
  state: SimulationState,
  ac: Aircraft,
  rwy: RunwaySpec | undefined,
  reason: string
): void {
  ac.state = "CRASHED";
  ac.speed = 0;
  ac.verticalSpeed = 0;
  ac.altitude = state.airport.elevationFt;
  ac.operationMode = "EMERGENCY_OPERATION";
  ac.emergencyType = "CRASH";
  ac.squawk = "7700";
  const loc = resolveCrashLocation(state, ac.x, ac.y, rwy ? "RUNWAY" : "GROUND", ac, rwy);
  ac.crashDetails = {
    time: state.time,
    locationKind: loc.locationKind,
    locationLabel: loc.locationLabel,
    runwayId: loc.runwayId,
    reason,
    arffDispatched: false,
    runwayHalted: false,
    medicalRequested: false,
  };
  state.metrics.safetyScore = Math.max(0, state.metrics.safetyScore - 40);

  state.incidents.push({
    id: nextId(state, "inc"),
    timestamp: state.time,
    severity: "CRITICAL",
    code: loc.locationKind === "RUNWAY" ? "CRASH_EXCURSION" : "CRASH_GROUND_IMPACT",
    message: `CRASH / ${loc.locationLabel.toUpperCase()}: ${ac.callsign} impacted at ${loc.locationLabel} (${reason}).`,
    aircraftIds: [ac.id],
  });

  addRadioMessage(state, {
    sender: "TOWER",
    recipient: "ALL_STATIONS",
    controller: loc.locationKind === "APRON" || loc.locationKind === "TAXIWAY" ? "GROUND" : "TOWER",
    aircraftId: ac.id,
    category: "EMERGENCY",
    text: `CRASH ALARM! ${ac.callsign} accident declared at ${loc.locationLabel}. Emergency crash rescue facilities activated.`,
  });
}

export function declareAircraftCollision(
  state: SimulationState,
  a: Aircraft,
  b: Aircraft,
  collisionType: "MID_AIR" | "RUNWAY" | "GROUND",
  reason: string,
  rwy?: RunwaySpec
): void {
  const elev = state.airport.elevationFt;
  const collisionAlt = Math.max(elev, Math.round((a.altitude + b.altitude) / 2));

  // Position wreckage at collision midpoint
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;

  const loc = resolveCrashLocation(state, midX, midY, collisionType, a, rwy);

  for (const ac of [a, b]) {
    ac.state = "CRASHED";
    ac.speed = 0;
    ac.verticalSpeed = 0;
    ac.x = midX;
    ac.y = midY;
    ac.altitude = elev;
    ac.operationMode = "EMERGENCY_OPERATION";
    ac.emergencyType = "CRASH";
    ac.squawk = "7700";
    ac.crashDetails = {
      time: state.time,
      locationKind: loc.locationKind,
      locationLabel: loc.locationLabel,
      runwayId: loc.runwayId,
      reason: `${loc.locationKind === "AIR" ? "Mid-air collision" : loc.locationKind === "RUNWAY" ? "Runway collision" : loc.locationKind === "APRON" ? "Apron parking collision" : "Taxiway collision"} between ${a.callsign} and ${b.callsign} at ${loc.locationLabel}`,
      arffDispatched: false,
      runwayHalted: loc.locationKind === "RUNWAY",
      medicalRequested: false,
    };
  }

  state.metrics.safetyScore = Math.max(0, state.metrics.safetyScore - 50);

  const incidentCode =
    collisionType === "MID_AIR"
      ? "CRASH_MID_AIR_COLLISION"
      : collisionType === "RUNWAY"
      ? "CRASH_RUNWAY_COLLISION"
      : "CRASH_GROUND_COLLISION";

  state.incidents.push({
    id: nextId(state, "inc"),
    timestamp: state.time,
    severity: "CRITICAL",
    code: incidentCode,
    message: `COLLISION DISASTER (${collisionType}): ${a.callsign} and ${b.callsign} collided at ${loc.locationLabel}! (${reason})`,
    aircraftIds: [a.id, b.id],
  });

  const broadcastMsg =
    collisionType === "MID_AIR"
      ? `MAYDAY MAYDAY MAYDAY! Mid-air collision between ${a.callsign} and ${b.callsign} at ${collisionAlt} ft! Both aircraft down, search and rescue activated!`
      : collisionType === "RUNWAY"
      ? `CRASH ALARM! High-speed collision on runway ${runwaySpokenName(loc.runwayId ?? "09R")} between ${a.callsign} and ${b.callsign}! Runway closed, crash fire rescue responding!`
      : `GROUND EMERGENCY! Collision at ${loc.locationLabel} between ${a.callsign} and ${b.callsign}! Sector isolated, fire & rescue responding!`;

  addRadioMessage(state, {
    sender: "TOWER",
    recipient: "ALL_STATIONS",
    controller: "TOWER",
    aircraftId: a.id,
    category: "EMERGENCY",
    text: broadcastMsg,
  });
}

function issuePilotRequestIfNeeded(
  state: SimulationState,
  ac: Aircraft,
  reqType: NonNullable<Aircraft["pendingRequest"]>["type"],
  controller: Aircraft["controller"],
  message: string,
  runway?: RunwayId,
  gate?: string
): void {
  if (ac.commStatus === "RADIO_FAILURE") return;
  if (ac.pendingRequest && !ac.pendingRequest.resolved && ac.pendingRequest.type === reqType) {
    return;
  }
  if (state.time - ac.lastTransmissionAt < 0.5 && ac.pendingRequest && !ac.pendingRequest.resolved) {
    return;
  }
  ac.pendingRequest = {
    id: nextId(state, "req"),
    type: reqType,
    controller,
    message,
    requestedAt: state.time,
    runway,
    gate,
    resolved: false,
  };
  ac.lastTransmissionAt = state.time;
  addRadioMessage(state, {
    sender: ac.callsign,
    recipient: controllerCallsign(controller, state.airport, ac.flightKind),
    controller,
    aircraftId: ac.id,
    category: "PILOT_REQUEST",
    text: message,
  });
}

function selectExitHoldShortNode(
  state: SimulationState,
  ac: Aircraft,
  rwyId: RunwayId
): { exitRwyNodeId: string; holdShortNodeId: string } | null {
  if (
    ac.vacateAssignedRwyNodeId &&
    ac.vacateAssignedHoldShortId &&
    state.airport.nodes[ac.vacateAssignedRwyNodeId] &&
    state.airport.nodes[ac.vacateAssignedHoldShortId]
  ) {
    return {
      exitRwyNodeId: ac.vacateAssignedRwyNodeId,
      holdShortNodeId: ac.vacateAssignedHoldShortId,
    };
  }
  const options = getRunwayExitOptions(state.airport, ac, rwyId);
  if (options.length === 0) return null;
  return {
    exitRwyNodeId: options[0].exitRwyNodeId,
    holdShortNodeId: options[0].holdShortNodeId,
  };
}

/**
 * Evaluates pilot requests and clearance-gated operational state transitions.
 * ZERO automatic operational movement occurs here: every state change into a moving state
 * requires canAircraftExecuteAction(...) === allowed.
 */
export function updateAircraftStates(state: SimulationState): void {
  const elev = state.airport.elevationFt;
  const baseAlt = Math.round(elev / 500) * 500;
  const delName = controllerCallsign("DELIVERY", state.airport, "DEPARTURE");
  const gndName = controllerCallsign("GROUND", state.airport);
  const twrName = controllerCallsign("TOWER", state.airport);
  const depName = controllerCallsign("DEPARTURE", state.airport, "DEPARTURE");
  const appName = controllerCallsign("DEPARTURE", state.airport, "ARRIVAL");
  const ctrName = controllerCallsign("CENTER", state.airport);

  for (const id of state.aircraftOrder) {
    const ac = state.aircraft[id];
    if (!ac || ac.state === "CRASHED") continue;

    switch (ac.state) {
      case "AT_GATE": {
        const spokenGate = ac.gateId ? formatGateIcao(ac.gateId) : "";
        if (
          ac.flightKind === "DEPARTURE" &&
          (!ac.flightPlan || ac.flightPlan.clearanceStatus !== "CLEARED")
        ) {
          const rawDest = ac.destinationName ?? ac.destinationIcao ?? "destination";
          const dest = formatSpokenDestination(rawDest);
          issuePilotRequestIfNeeded(
            state,
            ac,
            "IFR_CLEARANCE",
            "DELIVERY",
            `${delName}, ${ac.spokenCallsign} at gate ${spokenGate}, IFR to ${dest}, ready to copy clearance.`,
            ac.targetRunway,
            ac.gateId
          );
        } else if (ac.controller === "GROUND") {
          if (ac.requiresPushback) {
            issuePilotRequestIfNeeded(
              state,
              ac,
              "PUSHBACK",
              "GROUND",
              `${gndName}, ${ac.spokenCallsign} at gate ${spokenGate}, request pushback.`,
              ac.targetRunway,
              ac.gateId
            );
          } else {
            issuePilotRequestIfNeeded(
              state,
              ac,
              "TAXI",
              "GROUND",
              `${gndName}, ${ac.spokenCallsign} at gate ${spokenGate}, ready to taxi.`,
              ac.targetRunway,
              ac.gateId
            );
          }
        }
        break;
      }

      case "PUSHBACK_APPROVED": {
        if (canAircraftExecuteAction(ac, "PUSHBACK", state).allowed) {
          ac.state = "PUSHING_BACK";
          ac.stateEnteredAt = state.time;
        }
        break;
      }

      case "PUSHBACK_COMPLETE": {
        issuePilotRequestIfNeeded(
          state,
          ac,
          "TAXI",
          "GROUND",
          `${gndName}, ${ac.spokenCallsign}, pushback complete, ready to taxi.`,
          ac.targetRunway,
          ac.gateId
        );
        break;
      }

      case "HOLDING_SHORT": {
        if (ac.holdingShortReason === "CROSSING_REQUIRED" && ac.holdingAtRunway) {
          if (canAircraftExecuteAction(ac, "CROSS_RUNWAY", state).allowed) {
            ac.holdingAtRunway = undefined;
            ac.holdingShortReason = undefined;
            ac.state = "CROSSING_RUNWAY";
            ac.stateEnteredAt = state.time;
          } else {
            issuePilotRequestIfNeeded(
              state,
              ac,
              "CROSS_RUNWAY",
              ac.controller,
              `${controllerCallsign(ac.controller, state.airport)}, ${ac.spokenCallsign}, holding short runway ${runwaySpokenName(ac.holdingAtRunway)}, request crossing.`,
              ac.holdingAtRunway
            );
          }
        } else if (ac.holdingShortReason === "DEPARTURE_RUNWAY") {
          const reqType = ac.controller === "GROUND" ? "HANDOFF" : "TAKEOFF";
          const targetCtrl = ac.controller === "GROUND" ? "GROUND" : "TOWER";
          const msg =
            ac.controller === "GROUND"
              ? `${controllerCallsign("GROUND", state.airport)}, ${ac.spokenCallsign}, holding short runway ${runwaySpokenName(ac.targetRunway)}, ready for departure, request Tower frequency.`
              : `${controllerCallsign("TOWER", state.airport)}, ${ac.spokenCallsign}, holding short runway ${runwaySpokenName(ac.targetRunway)}, ready for departure.`;
          issuePilotRequestIfNeeded(
            state,
            ac,
            reqType,
            targetCtrl,
            msg,
            ac.targetRunway
          );
        } else if (ac.flightKind === "ARRIVAL" && ac.holdingShortReason === "ROUTE_END") {
          const spokenGate = ac.gateId ? formatGateIcao(ac.gateId) : "";
          issuePilotRequestIfNeeded(
            state,
            ac,
            "GATE_TAXI",
            ac.controller,
            `${controllerCallsign(ac.controller, state.airport)}, ${ac.spokenCallsign}, clear of runway, request taxi to gate ${spokenGate}.`,
            undefined,
            ac.gateId
          );
        }
        break;
      }

      case "LINE_UP_WAIT": {
        const rwy = state.airport.runways[ac.targetRunway];
        if (!rwy) break;
        const along = alongRunwayNm(rwy, ac.x, ac.y);
        const cross = crossTrackRunwayNm(rwy, ac.x, ac.y);
        const alignedOnRwy =
          Math.abs(cross) < 0.008 &&
          along >= -0.02 &&
          headingDiffDeg(ac.heading, rwy.heading) < 5;
        if (alignedOnRwy) {
          ac.speed = 0;
          if (canAircraftExecuteAction(ac, "TAKEOFF_ROLL", state).allowed) {
            ac.state = "TAKEOFF_CLEARED";
            ac.stateEnteredAt = state.time;
          } else {
            issuePilotRequestIfNeeded(
              state,
              ac,
              "TAKEOFF",
              "TOWER",
              `${twrName}, ${ac.spokenCallsign}, lined up runway ${runwaySpokenName(ac.targetRunway)}, ready for takeoff.`,
              ac.targetRunway
            );
          }
        }
        break;
      }

      case "TAKEOFF_CLEARED": {
        if (!canAircraftExecuteAction(ac, "TAKEOFF_ROLL", state).allowed) {
          ac.state = "HOLD_POSITION";
          ac.speed = 0;
          break;
        }
        const rwy = state.airport.runways[ac.targetRunway];
        if (!rwy) break;
        const along = alongRunwayNm(rwy, ac.x, ac.y);
        const cross = crossTrackRunwayNm(rwy, ac.x, ac.y);
        const alignedOnRwy =
          Math.abs(cross) < 0.008 &&
          along >= -0.02 &&
          headingDiffDeg(ac.heading, rwy.heading) < 5;
        if (alignedOnRwy) {
          ac.state = "TAKEOFF_ROLL";
          ac.stateEnteredAt = state.time;
        }
        break;
      }

      case "TAKEOFF_CANCELLED": {
        ac.speed = 0;
        ac.holdingAtRunway = undefined;
        ac.holdingShortReason = undefined;
        if (state.time - ac.stateEnteredAt >= 0.8) {
          ac.state = "HOLD_POSITION";
          ac.stateEnteredAt = state.time;
        }
        break;
      }

      case "TAKEOFF_ROLL": {
        if (!canAircraftExecuteAction(ac, "TAKEOFF_ROLL", state).allowed) {
          ac.state = "HOLD_POSITION";
          break;
        }
        const rwy = state.airport.runways[ac.targetRunway];
        if (rwy) {
          const along = alongRunwayNm(rwy, ac.x, ac.y);
          const cross = crossTrackRunwayNm(rwy, ac.x, ac.y);
          if (Math.abs(cross) > 0.038 && ac.speed > 40) {
            declareAircraftCrash(state, ac, rwy, "Takeoff roll lateral excursion off runway into grass");
            break;
          }
          if (along > rwy.lengthNm + 0.04 && ac.speed > 45) {
            declareAircraftCrash(state, ac, rwy, "Takeoff overrun off departure runway end");
            break;
          }
        }
        const vr = ac.wakeCategory === "HEAVY" ? 150 : 140;
        if (ac.speed >= vr) {
          ac.state = "ROTATE";
          ac.stateEnteredAt = state.time;
        }
        break;
      }

      case "ROTATE": {
        const v2 = ac.wakeCategory === "HEAVY" ? 162 : 154;
        if (ac.altitude >= elev + 120 && ac.speed >= v2) {
          ac.state = "CLIMB";
          ac.stateEnteredAt = state.time;
          completeClearancesOfType(ac, "TAXI");
          completeClearancesOfType(ac, "LINE_UP");
        }
        break;
      }

      case "REJECTED_TAKEOFF": {
        ac.state = "BRAKING";
        ac.stateEnteredAt = state.time;
        break;
      }

      case "BRAKING": {
        if (ac.speed <= 0.5) {
          ac.speed = 0;
          ac.state = "STOPPED_ON_RUNWAY";
          ac.stateEnteredAt = state.time;
          ac.holdingAtRunway = undefined;
          ac.holdingShortReason = undefined;
          addRadioMessage(state, {
            sender: ac.callsign,
            recipient: twrName,
            controller: "TOWER",
            aircraftId: ac.id,
            category: "EMERGENCY",
            text: `${twrName}, ${ac.spokenCallsign} stopped on runway ${runwaySpokenName(ac.targetRunway)}, requesting equipment/tow.`,
          });
        }
        break;
      }

      case "STOPPED_ON_RUNWAY": {
        ac.speed = 0;
        ac.holdingAtRunway = undefined;
        ac.holdingShortReason = undefined;
        issuePilotRequestIfNeeded(
          state,
          ac,
          "GATE_TAXI",
          ac.controller,
          `${controllerCallsign(ac.controller, state.airport)}, ${ac.spokenCallsign}, stopped on runway ${runwaySpokenName(ac.targetRunway)}, request instructions to vacate runway.`,
          undefined,
          ac.gateId
        );
        break;
      }

      case "CLIMB": {
        if (
          ac.assignedAltitude !== null &&
          Math.abs(ac.altitude - ac.assignedAltitude) < 80 &&
          ac.assignedAltitude <= baseAlt + 3500 &&
          ac.controller === "DEPARTURE"
        ) {
          issuePilotRequestIfNeeded(
            state,
            ac,
            "CLIMB_HIGHER",
            "DEPARTURE",
            `${depName}, ${ac.spokenCallsign}, level ${ac.assignedAltitude}, request higher.`,
            ac.targetRunway
          );
        }
        const distFromAirport = Math.hypot(ac.x, ac.y);
        if (distFromAirport >= 14.5 && ac.altitude >= elev + 4400) {
          ac.state = "COMPLETED_DEPARTURE";
          ac.stateEnteredAt = state.time;
          state.metrics.departuresCompleted += 1;
        } else if (distFromAirport >= 8 && ac.altitude >= elev + 4400) {
          ac.state = "CRUISE_OUTBOUND";
          ac.stateEnteredAt = state.time;
        }
        break;
      }

      case "CRUISE_OUTBOUND": {
        const distFromAirport = Math.hypot(ac.x, ac.y);
        if (distFromAirport >= 14.5) {
          ac.state = "COMPLETED_DEPARTURE";
          ac.stateEnteredAt = state.time;
          state.metrics.departuresCompleted += 1;
        }
        break;
      }

      case "APPROACH": {
        const targetRwy = ac.assignedApproach ?? ac.targetRunway;
        const rwy = state.airport.runways[targetRwy];
        if (!rwy) break;
        const along = alongRunwayNm(rwy, ac.x, ac.y);
        const cross = crossTrackRunwayNm(rwy, ac.x, ac.y);

        const alignedOnLocalizer =
          Math.abs(cross) < 0.35 &&
          along < -0.5 &&
          along >= -9.0 &&
          headingDiffDeg(ac.heading, rwy.heading) < 30;

        if (!ac.requestedRunwayChange && state.airport.runwayIds.length >= 2 && along < -7.0 && along > -14.0) {
          if (hashCallsign(ac.callsign) % 5 === 0) {
            const curRwy = ac.assignedApproach ?? ac.targetRunway;
            const curSpec = state.airport.runways[curRwy];
            const altRwy =
              state.airport.runwayIds.find((r) => {
                if (r === curRwy) return false;
                const s = state.airport.runways[r];
                return s && Math.abs(headingDiffDeg(s.heading, curSpec?.heading ?? 0)) < 45;
              }) ?? state.airport.runwayIds.find((r) => r !== curRwy);

            if (altRwy) {
              ac.requestedRunwayChange = true;
              issuePilotRequestIfNeeded(
                state,
                ac,
                "RUNWAY_CHANGE",
                ac.controller,
                `${controllerCallsign(ac.controller, state.airport, ac.flightKind)}, ${ac.spokenCallsign}, request runway change to runway ${runwaySpokenName(altRwy)} due to wind/approach conditions.`,
                altRwy
              );
            }
          }
        }

        if (!ac.assignedApproach && along > -9.5 && ac.commStatus === "NORMAL") {
          issuePilotRequestIfNeeded(
            state,
            ac,
            "APPROACH_CLEARANCE",
            ac.controller,
            `${controllerCallsign(ac.controller, state.airport, ac.flightKind)}, ${ac.spokenCallsign}, approaching initial fix, request ILS runway ${runwaySpokenName(ac.targetRunway)}.`,
            ac.targetRunway
          );
        }

        if (
          alignedOnLocalizer &&
          (canAircraftExecuteAction(ac, "FLY_APPROACH", state).allowed ||
            canAircraftExecuteAction(ac, "LAND", state).allowed)
        ) {
          ac.state = "FINAL";
          ac.stateEnteredAt = state.time;
        }
        break;
      }

      case "FINAL": {
        const rwy = state.airport.runways[ac.assignedApproach ?? ac.targetRunway];
        if (!rwy) break;
        if (canAircraftExecuteAction(ac, "LAND", state).allowed) {
          ac.state = "CLEARED_TO_LAND";
          ac.stateEnteredAt = state.time;
          break;
        }

        const along = alongRunwayNm(rwy, ac.x, ac.y);
        if (ac.controller === "TOWER" && along >= -6.0 && along < -0.35) {
          issuePilotRequestIfNeeded(
            state,
            ac,
            "LANDING",
            "TOWER",
            `${controllerCallsign("TOWER", state.airport, ac.flightKind)}, ${ac.spokenCallsign}, final runway ${runwaySpokenName(rwy.id)}, request landing clearance.`,
            rwy.id
          );
        }

        if (along >= -0.25) {
          if (state.config.autoMinimumsGoAround) {
            ac.minimumsGoAroundTriggered = true;
            ac.state = "GO_AROUND";
            ac.stateEnteredAt = state.time;
            ac.assignedAltitude = baseAlt + 3000;
            ac.assignedHeading = rwy.heading;
            ac.assignedSpeed = 190;
            state.metrics.goAroundsExecuted += 1;
            addRadioMessage(state, {
              sender: ac.callsign,
              recipient: controllerCallsign(ac.controller, state.airport, ac.flightKind),
              controller: ac.controller,
              aircraftId: ac.id,
              category: "EMERGENCY",
              text: `${controllerCallsign(ac.controller, state.airport, ac.flightKind)}, ${ac.spokenCallsign}, going around at minimums — no landing clearance received!`,
            });
          } else {
            ac.altitude = Math.max(ac.altitude, elev + 250);
          }
        }
        break;
      }

      case "CLEARED_TO_LAND": {
        if (!canAircraftExecuteAction(ac, "LAND", state).allowed) {
          ac.state = "FINAL";
          break;
        }
        const rwy = state.airport.runways[ac.assignedApproach ?? ac.targetRunway];
        if (rwy && alongRunwayNm(rwy, ac.x, ac.y) >= -2.2) {
          ac.state = "LANDING";
          ac.stateEnteredAt = state.time;
        }
        break;
      }

      case "LANDING": {
        if (!canAircraftExecuteAction(ac, "LAND", state).allowed) {
          ac.state = "FINAL";
          break;
        }
        const rwy = state.airport.runways[ac.assignedApproach ?? ac.targetRunway];
        if (!rwy) break;
        const along = alongRunwayNm(rwy, ac.x, ac.y);
        const cross = crossTrackRunwayNm(rwy, ac.x, ac.y);
        const tdzAlong = Math.min(0.22, rwy.lengthNm * 0.14);

        // Ground/terrain impact and excursion checks outside runway boundaries:
        if (ac.altitude <= elev + 16) {
          if (along < -0.05 && ac.speed > 50) {
            declareAircraftCrash(state, ac, rwy, "Undershoot terrain collision short of runway threshold");
            break;
          }
          if (Math.abs(cross) > 0.035 && ac.speed > 40) {
            declareAircraftCrash(state, ac, rwy, "Lateral runway excursion into terrain at high speed");
            break;
          }
          if (along > rwy.lengthNm + 0.04 && ac.speed > 35) {
            declareAircraftCrash(state, ac, rwy, "Runway overrun past runway end at high speed");
            break;
          }
        }

        if (
          along >= tdzAlong * 0.5 &&
          along <= rwy.lengthNm * 0.60 &&
          ac.altitude <= elev + 28 &&
          Math.abs(cross) <= 0.035
        ) {
          ac.altitude = elev;
          ac.verticalSpeed = 0;
          ac.state = "TOUCHDOWN";
          ac.stateEnteredAt = state.time;
        } else if (along > rwy.lengthNm * 0.45 && ac.altitude > elev + 18) {
          // Missed approach protection if crossing past touchdown zone still high on glideslope
          ac.minimumsGoAroundTriggered = true;
          ac.state = "GO_AROUND";
          ac.stateEnteredAt = state.time;
          ac.verticalSpeed = 1800; // Immediate positive climb rate
          ac.assignedAltitude = baseAlt + 3000;
          ac.assignedHeading = rwy.heading;
          ac.assignedSpeed = 190;
          state.metrics.goAroundsExecuted += 1;
          addRadioMessage(state, {
            sender: ac.callsign,
            recipient: controllerCallsign(ac.controller, state.airport),
            controller: ac.controller,
            aircraftId: ac.id,
            category: "EMERGENCY",
            text: `${controllerCallsign(ac.controller, state.airport)}, ${ac.spokenCallsign}, floating past touchdown zone, going around!`,
          });
        }
        break;
      }

      case "TOUCHDOWN": {
        ac.altitude = elev;
        ac.verticalSpeed = 0;
        ac.state = "ROLLOUT";
        ac.stateEnteredAt = state.time;
        break;
      }

      case "ROLLOUT": {
        const rwyId = ac.assignedApproach ?? ac.targetRunway;
        const rwy = state.airport.runways[rwyId];
        if (!rwy) break;
        const along = alongRunwayNm(rwy, ac.x, ac.y);
        const cross = crossTrackRunwayNm(rwy, ac.x, ac.y);

        if (along > rwy.lengthNm + 0.04 && ac.speed > 35) {
          declareAircraftCrash(state, ac, rwy, "Rollout overrun off runway end into overrun area");
          break;
        }
        if (Math.abs(cross) > 0.035 && ac.speed > 35) {
          declareAircraftCrash(state, ac, rwy, "Lateral rollout veer-off off runway surface");
          break;
        }

        const exitSel = selectExitHoldShortNode(state, ac, rwyId);
        if (!exitSel) break;
        const rwyExitNode = state.airport.nodes[exitSel.exitRwyNodeId];
        if (!rwyExitNode) break;
        const exitAlong = alongRunwayNm(rwy, rwyExitNode.x, rwyExitNode.y);
        const maxTurnoffSpd = ac.expediteVacate ? 38 : 32;
        if (
          ac.speed <= maxTurnoffSpd &&
          (along >= exitAlong - 0.04 || along >= rwy.lengthNm - 0.06)
        ) {
          ac.vacatingExitNodeId = exitSel.holdShortNodeId;
          ac.state = "VACATING_RUNWAY";
          ac.stateEnteredAt = state.time;
        }
        break;
      }

      case "VACATING_RUNWAY": {
        const exitId = ac.vacatingExitNodeId;
        if (exitId && state.airport.nodes[exitId]) {
          const exitNode = state.airport.nodes[exitId];
          const dist = Math.hypot(exitNode.x - ac.x, exitNode.y - ac.y);
          if (dist < 0.015) {
            ac.x = exitNode.x;
            ac.y = exitNode.y;
            ac.speed = 0;
            ac.currentNodeId = exitNode.id;
            ac.vacatingExitNodeId = undefined;
            ac.vacateAssignedRwyNodeId = undefined;
            ac.vacateAssignedHoldShortId = undefined;
            ac.vacateAssignedTaxiway = undefined;
            ac.expediteVacate = false;
            completeClearancesOfType(ac, "LAND");
            completeClearancesOfType(ac, "VACATE_RUNWAY");
            completeClearancesOfType(ac, "APPROACH");
            ac.assignedApproach = null;
            ac.holdingAtRunway = undefined;
            ac.holdingShortReason = "ROUTE_END";
            ac.state = "HOLDING_SHORT";
            ac.stateEnteredAt = state.time;
            const spokenGate = ac.gateId ? formatGateIcao(ac.gateId) : "";
            issuePilotRequestIfNeeded(
              state,
              ac,
              "GATE_TAXI",
              ac.controller,
              `${controllerCallsign(ac.controller, state.airport)}, ${ac.spokenCallsign}, clear of runway, request taxi to gate ${spokenGate}.`,
              undefined,
              ac.gateId
            );
          }
        }
        break;
      }

      case "GO_AROUND": {
        const rwy = state.airport.runways[ac.assignedApproach ?? ac.targetRunway];
        if (rwy) {
          const along = alongRunwayNm(rwy, ac.x, ac.y);
          const cross = crossTrackRunwayNm(rwy, ac.x, ac.y);
          if (
            ac.altitude <= elev + 8 &&
            (along < -0.05 || along > rwy.lengthNm + 0.04 || Math.abs(cross) > 0.035) &&
            ac.speed > 35
          ) {
            declareAircraftCrash(state, ac, rwy, "Off-runway ground impact during go-around");
            break;
          }
        }
        if (ac.altitude >= elev + 1200) {
          ac.state = "MISSED_APPROACH";
          ac.stateEnteredAt = state.time;
          ac.assignedHeading = null;
        }
        break;
      }

      case "MISSED_APPROACH": {
        if (ac.commStatus === "NORMAL" && ac.altitude >= elev + 1600) {
          const recipientName =
            ac.controller === "DEPARTURE"
              ? appName
              : controllerCallsign(ac.controller, state.airport, ac.flightKind);

          if (!ac.requestedRunwayChange && state.airport.runwayIds.length >= 2 && hashCallsign(ac.callsign) % 3 === 0) {
            const curRwy = ac.assignedApproach ?? ac.targetRunway;
            const curSpec = state.airport.runways[curRwy];
            const altRwy =
              state.airport.runwayIds.find((r) => {
                if (r === curRwy) return false;
                const s = state.airport.runways[r];
                return s && Math.abs(headingDiffDeg(s.heading, curSpec?.heading ?? 0)) < 45;
              }) ?? state.airport.runwayIds.find((r) => r !== curRwy);

            if (altRwy) {
              ac.requestedRunwayChange = true;
              issuePilotRequestIfNeeded(
                state,
                ac,
                "RUNWAY_CHANGE",
                ac.controller,
                `${recipientName}, ${ac.spokenCallsign}, missed approach runway ${runwaySpokenName(curRwy)}, request runway change to runway ${runwaySpokenName(altRwy)} for next attempt.`,
                altRwy
              );
            }
          } else {
            issuePilotRequestIfNeeded(
              state,
              ac,
              "APPROACH_VECTORS",
              ac.controller,
              `${recipientName}, ${ac.spokenCallsign}, climbing on missed approach, request vectors back to ILS runway ${runwaySpokenName(ac.targetRunway)}.`,
              ac.targetRunway
            );
          }
        }
        if (ac.altitude >= elev + 2600) {
          ac.state = "APPROACH";
          ac.stateEnteredAt = state.time;
          ac.minimumsGoAroundTriggered = false;
          ac.assignedHeading = null;
          ac.assignedApproach = null;
          completeClearancesOfType(ac, "GO_AROUND");
        }
        break;
      }

      default:
        break;
    }
  }
}
