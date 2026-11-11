import {
  alongRunwayNm,
  crossTrackRunwayNm,
  headingDiffDeg,
  runwaySpokenName,
} from "../data/asteriaAirport.ts";
import type { Aircraft, RunwayId, SimulationState } from "../types/atc.ts";
import { formatGateIcao } from "../utils/natoPhonetics.ts";
import { completeClearancesOfType, nextId } from "./clearanceEngine.ts";
import { addRadioMessage, controllerCallsign } from "./decisionEngine.ts";
import { canAircraftExecuteAction } from "./validationEngine.ts";

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
    recipient: controllerCallsign(controller, state.airport),
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
  const rwy = state.airport.runways[rwyId];
  if (!rwy || rwy.exitNodeIds.length === 0) return null;

  const along = alongRunwayNm(rwy, ac.x, ac.y);
  const exitCandidates = rwy.exitNodeIds
    .map((eid) => {
      const node = state.airport.nodes[eid];
      return node ? { eid, eAlong: alongRunwayNm(rwy, node.x, node.y) } : null;
    })
    .filter((item): item is { eid: string; eAlong: number } => Boolean(item))
    .sort((a, b) => a.eAlong - b.eAlong);

  if (exitCandidates.length === 0) return null;
  const aheadExit =
    exitCandidates.find((c) => c.eAlong >= along + 0.04) ??
    exitCandidates[exitCandidates.length - 1];
  const chosenExitId = aheadExit.eid;

  const gateNode = ac.gateId ? state.airport.nodes[`GATE_${ac.gateId}`] : undefined;
  const candidateHs: Array<{ id: string; distToGate: number }> = [];
  for (const e of state.airport.edges) {
    if (e.from !== chosenExitId) continue;
    const targetNode = state.airport.nodes[e.to];
    if (!targetNode || targetNode.kind !== "HOLD_SHORT") continue;
    const distToGate = gateNode
      ? Math.hypot(gateNode.x - targetNode.x, gateNode.y - targetNode.y)
      : targetNode.isNorthSide
      ? 0
      : 1;
    candidateHs.push({ id: targetNode.id, distToGate });
  }
  candidateHs.sort((a, b) => a.distToGate - b.distToGate);
  if (candidateHs.length === 0) return null;
  return { exitRwyNodeId: chosenExitId, holdShortNodeId: candidateHs[0].id };
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
  const depName = controllerCallsign("DEPARTURE", state.airport);

  for (const id of state.aircraftOrder) {
    const ac = state.aircraft[id];
    if (!ac) continue;

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
          issuePilotRequestIfNeeded(
            state,
            ac,
            "TAKEOFF",
            ac.controller,
            `${controllerCallsign(ac.controller, state.airport)}, ${ac.spokenCallsign}, holding short runway ${runwaySpokenName(ac.targetRunway)}, ready for departure.`,
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

        if (!ac.assignedApproach && along > -9.5 && ac.commStatus === "NORMAL") {
          issuePilotRequestIfNeeded(
            state,
            ac,
            "APPROACH_CLEARANCE",
            ac.controller,
            `${controllerCallsign(ac.controller, state.airport)}, ${ac.spokenCallsign}, approaching initial fix, request ILS runway ${runwaySpokenName(ac.targetRunway)}.`,
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
        if (along >= -6.0 && along < -0.35) {
          issuePilotRequestIfNeeded(
            state,
            ac,
            "LANDING",
            ac.controller,
            `${controllerCallsign(ac.controller, state.airport)}, ${ac.spokenCallsign}, final runway ${runwaySpokenName(rwy.id)}, request landing clearance.`,
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
              recipient: controllerCallsign(ac.controller, state.airport),
              controller: ac.controller,
              aircraftId: ac.id,
              category: "EMERGENCY",
              text: `${controllerCallsign(ac.controller, state.airport)}, ${ac.spokenCallsign}, going around at minimums — no landing clearance received!`,
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
        const tdzAlong = Math.min(0.22, rwy.lengthNm * 0.14);
        if (along >= tdzAlong * 0.7 && along <= rwy.lengthNm * 0.55 && ac.altitude <= elev + 22) {
          ac.altitude = elev;
          ac.verticalSpeed = 0;
          ac.state = "TOUCHDOWN";
          ac.stateEnteredAt = state.time;
        } else if (along > rwy.lengthNm * 0.45 && ac.altitude > elev + 65) {
          // Missed approach protection if crossing past touchdown zone still high on glideslope
          ac.state = "GO_AROUND";
          ac.stateEnteredAt = state.time;
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
            text: `${controllerCallsign(ac.controller, state.airport)}, ${ac.spokenCallsign}, high and unstable over runway, going around!`,
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
        const exitSel = selectExitHoldShortNode(state, ac, rwyId);
        if (!exitSel) break;
        const rwyExitNode = state.airport.nodes[exitSel.exitRwyNodeId];
        if (!rwyExitNode) break;
        const along = alongRunwayNm(rwy, ac.x, ac.y);
        const exitAlong = alongRunwayNm(rwy, rwyExitNode.x, rwyExitNode.y);
        if (
          ac.speed <= 32 &&
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
            completeClearancesOfType(ac, "LAND");
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
        if (ac.altitude >= elev + 1200) {
          ac.state = "MISSED_APPROACH";
          ac.stateEnteredAt = state.time;
        }
        break;
      }

      case "MISSED_APPROACH": {
        if (ac.altitude >= elev + 2600) {
          ac.state = "APPROACH";
          ac.stateEnteredAt = state.time;
          ac.minimumsGoAroundTriggered = false;
          completeClearancesOfType(ac, "GO_AROUND");
        }
        break;
      }

      default:
        break;
    }
  }
}
