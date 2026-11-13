import {
  alongRunwayNm,
  crossTrackRunwayNm,
  getRunwayExitOptions,
  headingDiffDeg,
  runwaySpokenName,
} from "../data/asteriaAirport.ts";
import { hashCallsign } from "../data/aircraftCatalog.ts";
import type { Aircraft, RunwayId, RunwaySpec, SimulationState } from "../types/atc.ts";
import { formatGateIcao } from "../utils/natoPhonetics.ts";
import { completeClearancesOfType, nextId } from "./clearanceEngine.ts";
import { addRadioMessage, controllerCallsign } from "./decisionEngine.ts";
import { canAircraftExecuteAction } from "./validationEngine.ts";

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
  const rwyId = rwy?.id ?? ac.targetRunway ?? "09R";
  ac.crashDetails = {
    time: state.time,
    runwayId: rwyId,
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
    code: "CRASH_EXCURSION",
    message: `CRASH / RUNWAY EXCURSION: ${ac.callsign} impacted off-runway at ${rwyId} (${reason}).`,
    aircraftIds: [ac.id],
  });

  addRadioMessage(state, {
    sender: "TOWER",
    recipient: "ALL_STATIONS",
    controller: "TOWER",
    aircraftId: ac.id,
    category: "EMERGENCY",
    text: `CRASH ALARM! ${ac.callsign} off-runway excursion / impact declared at runway ${runwaySpokenName(rwyId)}. Emergency crash rescue facilities activated.`,
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
  const gndName = controllerCallsign("GROUND", state.airport);
  const twrName = controllerCallsign("TOWER", state.airport);
  const depName = controllerCallsign("DEPARTURE", state.airport, "DEPARTURE");
  const appName = controllerCallsign("DEPARTURE", state.airport, "ARRIVAL");

  for (const id of state.aircraftOrder) {
    const ac = state.aircraft[id];
    if (!ac || ac.state === "CRASHED") continue;

    switch (ac.state) {
      case "AT_GATE": {
        const spokenGate = ac.gateId ? formatGateIcao(ac.gateId) : "";
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
          Math.abs(cross) < 0.015 &&
          along >= -0.02 &&
          headingDiffDeg(ac.heading, rwy.heading) < 6;
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
          Math.abs(cross) < 0.015 &&
          along >= -0.02 &&
          headingDiffDeg(ac.heading, rwy.heading) < 6;
        if (alignedOnRwy) {
          ac.state = "TAKEOFF_ROLL";
          ac.stateEnteredAt = state.time;
        }
        break;
      }

      case "TAKEOFF_CANCELLED": {
        ac.speed = 0;
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
