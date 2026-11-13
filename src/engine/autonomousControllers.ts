import {
  alongRunwayNm,
  crossTrackRunwayNm,
  getRunwayExitOptions,
  getSuggestedTaxiRoutes,
  headingDiffDeg,
} from "../data/asteriaAirport.ts";
import type { Aircraft, ControllerRole, RunwayId, SimulationState } from "../types/atc.ts";
import { buildResolutionCommands, inspectGroundConflict } from "../utils/groundConflict.ts";
import { getPendingReadbackClearances } from "./clearanceEngine.ts";
import { submitClearanceDecision } from "./decisionEngine.ts";
import { isRunwayOccupied } from "./validationEngine.ts";

function isBusyWithReadback(ac: Aircraft): boolean {
  return getPendingReadbackClearances(ac).length > 0;
}

function handleAutonomousReadbackError(
  state: SimulationState,
  ac: Aircraft,
  role: ControllerRole
): boolean {
  if (!ac.hasReadbackError || !ac.readbackErrorClearanceId) return false;
  const errClr = ac.clearances.find((c) => c.id === ac.readbackErrorClearanceId);
  if (!errClr || errClr.controller !== role) return false;
  // Re-issue the exact same clearance to correct the pilot's readback error
  submitClearanceDecision(
    state,
    {
      aircraftId: ac.id,
      controller: role,
      type: errClr.type,
      parameters: errClr.parameters,
    },
    "AUTONOMOUS"
  );
  return true;
}

function isFinalApproachCrowded(
  state: SimulationState,
  runway: RunwayId,
  minDistanceNm: number,
  excludeId?: string
): boolean {
  const rwy = state.airport.runways[runway];
  if (!rwy) return false;
  for (const id of state.aircraftOrder) {
    if (id === excludeId) continue;
    const other = state.aircraft[id];
    if (!other || other.flightKind !== "ARRIVAL") continue;
    if (
      other.state !== "FINAL" &&
      other.state !== "CLEARED_TO_LAND" &&
      other.state !== "LANDING"
    ) {
      continue;
    }
    const targetRwy = other.assignedApproach ?? other.targetRunway;
    if (targetRwy !== runway) continue;
    const dist = -alongRunwayNm(rwy, other.x, other.y);
    if (dist > -0.3 && dist < minDistanceNm) {
      return true;
    }
  }
  return false;
}

function isRunwayActiveForTakeoffOrCrossing(
  state: SimulationState,
  runway: RunwayId,
  excludeId?: string
): boolean {
  if (isRunwayOccupied(state, runway, excludeId).occupied) return true;
  for (const id of state.aircraftOrder) {
    if (id === excludeId) continue;
    const other = state.aircraft[id];
    if (!other) continue;
    if (
      other.targetRunway === runway &&
      (other.state === "LINE_UP_WAIT" ||
        other.state === "TAKEOFF_CLEARED" ||
        other.state === "TAKEOFF_ROLL" ||
        other.state === "ROTATE")
    ) {
      return true;
    }
    if (
      other.state === "CROSSING_RUNWAY" &&
      other.holdingAtRunway === runway
    ) {
      return true;
    }
  }
  return false;
}

function isRampClearForPushback(
  state: SimulationState,
  ac: Aircraft
): boolean {
  const spotId = ac.pushbackSpotId ?? (ac.gateId ? `PB_${ac.gateId}` : undefined);
  if (!spotId) return true;
  const spot = state.airport.nodes[spotId];
  if (!spot) return true;

  for (const otherId of state.aircraftOrder) {
    if (otherId === ac.id) continue;
    const other = state.aircraft[otherId];
    if (!other || other.altitude > state.airport.elevationFt + 40) continue;
    if (
      other.state === "COMPLETED_ARRIVAL" ||
      other.state === "COMPLETED_DEPARTURE" ||
      other.state === "AT_GATE"
    ) {
      continue;
    }
    if (Math.hypot(other.x - spot.x, other.y - spot.y) < 0.14) {
      return false;
    }
  }
  return true;
}

function runAutonomousGround(state: SimulationState): void {
  for (const id of state.aircraftOrder) {
    const ac = state.aircraft[id];
    if (
      !ac ||
      ac.controller !== "GROUND" ||
      ac.commStatus === "RADIO_FAILURE" ||
      isBusyWithReadback(ac)
    ) {
      continue;
    }
    if (handleAutonomousReadbackError(state, ac, "GROUND")) continue;

    if (ac.state === "AT_GATE") {
      if (ac.requiresPushback) {
        if (isRampClearForPushback(state, ac)) {
          submitClearanceDecision(
            state,
            { aircraftId: ac.id, controller: "GROUND", type: "PUSHBACK" },
            "AUTONOMOUS"
          );
        }
      } else {
        const nodeId = ac.currentNodeId ?? (ac.gateId ? `GATE_${ac.gateId}` : undefined);
        if (nodeId) {
          const routes = getSuggestedTaxiRoutes(
            state.airport,
            nodeId,
            ac.targetRunway,
            ac.gateId,
            false,
            state,
            ac.id
          );
          const chosen = routes.find((r) => r.conflictLevel !== "BLOCKED");
          if (chosen) {
            submitClearanceDecision(
              state,
              {
                aircraftId: ac.id,
                controller: "GROUND",
                type: "TAXI",
                parameters: {
                  runway: ac.targetRunway,
                  routeTaxiways: chosen.taxiways,
                  destinationNodeId: chosen.destinationNodeId,
                  routeNodeIds: chosen.nodeIds,
                },
              },
              "AUTONOMOUS"
            );
          }
        }
      }
      continue;
    }

    if (ac.state === "PUSHBACK_COMPLETE") {
      const nodeId = ac.currentNodeId ?? (ac.gateId ? `PB_${ac.gateId}` : undefined);
      if (nodeId) {
        const routes = getSuggestedTaxiRoutes(
          state.airport,
          nodeId,
          ac.targetRunway,
          ac.gateId,
          false,
          state,
          ac.id
        );
        const chosen = routes.find((r) => r.conflictLevel !== "BLOCKED") ?? routes[0];
        if (chosen && chosen.conflictLevel !== "BLOCKED") {
          submitClearanceDecision(
            state,
            {
              aircraftId: ac.id,
              controller: "GROUND",
              type: "TAXI",
              parameters: {
                runway: ac.targetRunway,
                routeTaxiways: chosen.taxiways,
                destinationNodeId: chosen.destinationNodeId,
                routeNodeIds: chosen.nodeIds,
              },
            },
            "AUTONOMOUS"
          );
        }
      }
      continue;
    }

    if (ac.state === "HOLDING_SHORT") {
      if (ac.holdingShortReason === "CROSSING_REQUIRED" && ac.holdingAtRunway) {
        const rwy = ac.holdingAtRunway;
        const safeToCross =
          !isRunwayActiveForTakeoffOrCrossing(state, rwy, ac.id) &&
          !isFinalApproachCrowded(state, rwy, 3.2, ac.id);
        if (safeToCross) {
          submitClearanceDecision(
            state,
            {
              aircraftId: ac.id,
              controller: "GROUND",
              type: "CROSS_RUNWAY",
              parameters: { runway: rwy },
            },
            "AUTONOMOUS"
          );
        }
      } else if (ac.holdingShortReason === "DEPARTURE_RUNWAY") {
        submitClearanceDecision(
          state,
          {
            aircraftId: ac.id,
            controller: "GROUND",
            type: "HANDOFF",
            parameters: { targetController: "TOWER" },
          },
          "AUTONOMOUS"
        );
      } else if (ac.flightKind === "ARRIVAL" && ac.gateId && ac.currentNodeId) {
        const routes = getSuggestedTaxiRoutes(
          state.airport,
          ac.currentNodeId,
          ac.targetRunway,
          ac.gateId,
          true,
          state,
          ac.id
        );
        const chosen = routes.find((r) => r.conflictLevel !== "BLOCKED");
        if (chosen) {
          submitClearanceDecision(
            state,
            {
              aircraftId: ac.id,
              controller: "GROUND",
              type: "TAXI",
              parameters: {
                runway: ac.targetRunway,
                routeTaxiways: chosen.taxiways,
                destinationNodeId: chosen.destinationNodeId,
                routeNodeIds: chosen.nodeIds,
              },
            },
            "AUTONOMOUS"
          );
        }
      }
      continue;
    }

    // Automatically break mutual taxiway deadlocks under Autonomous Ground control
    if (
      (ac.state === "TAXIING" || ac.state === "HOLD_POSITION") &&
      ac.speed <= 1 &&
      state.time - ac.stateEnteredAt >= 3.5 &&
      !ac.yieldToAircraftId &&
      !ac.stepBackTargetNodeId
    ) {
      const conflict = inspectGroundConflict(state, ac);
      if (conflict?.mutualDeadlock && conflict.blocker) {
        const iShouldYield =
          (ac.flightKind === "DEPARTURE" && conflict.blocker.flightKind === "ARRIVAL") ||
          (ac.flightKind === conflict.blocker.flightKind && ac.id < conflict.blocker.id);
        if (iShouldYield) {
          const cmds = buildResolutionCommands(state, ac, "AUTO_RESOLVE");
          for (const cmd of cmds) {
            submitClearanceDecision(state, cmd, "AUTONOMOUS");
          }
        }
      }
    }
  }
}

function runAutonomousTower(state: SimulationState): void {
  const elev = state.airport.elevationFt;
  const baseAlt = Math.round(elev / 500) * 500;

  // Priority 1: Arrivals on FINAL or APPROACH under TOWER control
  for (const id of state.aircraftOrder) {
    const ac = state.aircraft[id];
    if (
      !ac ||
      ac.controller !== "TOWER" ||
      ac.commStatus === "RADIO_FAILURE" ||
      isBusyWithReadback(ac)
    ) {
      continue;
    }
    if (handleAutonomousReadbackError(state, ac, "TOWER")) continue;

    if (ac.flightKind === "ARRIVAL" && ac.state === "FINAL") {
      const rwy = ac.assignedApproach ?? ac.targetRunway;
      const rwySpec = state.airport.runways[rwy];
      const rwyOccupied = isRunwayActiveForTakeoffOrCrossing(state, rwy, ac.id);
      const aheadLanding = isFinalApproachCrowded(state, rwy, 2.5, ac.id);

      if (!rwyOccupied && !aheadLanding) {
        submitClearanceDecision(
          state,
          {
            aircraftId: ac.id,
            controller: "TOWER",
            type: "LAND",
            parameters: { runway: rwy },
          },
          "AUTONOMOUS"
        );
      } else if (rwySpec && alongRunwayNm(rwySpec, ac.x, ac.y) >= -1.4) {
        submitClearanceDecision(
          state,
          {
            aircraftId: ac.id,
            controller: "TOWER",
            type: "GO_AROUND",
            parameters: { altitude: baseAlt + 3000, heading: rwySpec.heading },
          },
          "AUTONOMOUS"
        );
      }
      continue;
    }

    if (
      ac.flightKind === "ARRIVAL" &&
      (ac.state === "ROLLOUT" || ac.state === "VACATING_RUNWAY") &&
      !ac.expediteVacate &&
      !ac.vacateAssignedHoldShortId
    ) {
      const rwy = ac.assignedApproach ?? ac.targetRunway;
      const depWaiting = state.aircraftOrder.some((oid) => {
        const o = state.aircraft[oid];
        return (
          o &&
          o.id !== ac.id &&
          o.flightKind === "DEPARTURE" &&
          o.targetRunway === rwy &&
          o.state === "HOLDING_SHORT" &&
          o.holdingShortReason === "DEPARTURE_RUNWAY"
        );
      });
      if (depWaiting || isFinalApproachCrowded(state, rwy, 4.0, ac.id)) {
        const exits = getRunwayExitOptions(state.airport, ac, rwy);
        if (exits.length > 0) {
          submitClearanceDecision(
            state,
            {
              aircraftId: ac.id,
              controller: "TOWER",
              type: "VACATE_RUNWAY",
              parameters: {
                runway: rwy,
                exitRwyNodeId: exits[0].exitRwyNodeId,
                holdShortNodeId: exits[0].holdShortNodeId,
                taxiway: exits[0].taxiway,
                expedite: true,
              },
            },
            "AUTONOMOUS"
          );
        }
      }
      continue;
    }

    if (
      ac.flightKind === "ARRIVAL" &&
      ac.state === "HOLDING_SHORT" &&
      ac.holdingShortReason === "ROUTE_END"
    ) {
      submitClearanceDecision(
        state,
        {
          aircraftId: ac.id,
          controller: "TOWER",
          type: "HANDOFF",
          parameters: { targetController: "GROUND" },
        },
        "AUTONOMOUS"
      );
      continue;
    }

    if (
      ac.flightKind === "DEPARTURE" &&
      ac.state === "HOLDING_SHORT" &&
      ac.holdingShortReason === "DEPARTURE_RUNWAY"
    ) {
      const rwy = ac.targetRunway;
      const safeLineUp =
        !isRunwayActiveForTakeoffOrCrossing(state, rwy, ac.id) &&
        !isFinalApproachCrowded(state, rwy, 3.8, ac.id);
      if (safeLineUp) {
        submitClearanceDecision(
          state,
          {
            aircraftId: ac.id,
            controller: "TOWER",
            type: "LINE_UP",
            parameters: { runway: rwy },
          },
          "AUTONOMOUS"
        );
      }
      continue;
    }

    if (ac.flightKind === "DEPARTURE" && ac.state === "LINE_UP_WAIT") {
      const rwy = ac.targetRunway;
      const rwySpec = state.airport.runways[rwy];
      if (!rwySpec) continue;
      const aligned =
        Math.abs(crossTrackRunwayNm(rwySpec, ac.x, ac.y)) < 0.015 &&
        alongRunwayNm(rwySpec, ac.x, ac.y) >= -0.02 &&
        headingDiffDeg(ac.heading, rwySpec.heading) < 6 &&
        ac.speed < 2;
      if (!aligned) continue;

      const safeTakeoff =
        !isRunwayOccupied(state, rwy, ac.id).occupied &&
        !isFinalApproachCrowded(state, rwy, 3.2, ac.id) &&
        !hasRecentDepartureClimbOnRunway(state, rwy, ac.id);
      if (safeTakeoff) {
        submitClearanceDecision(
          state,
          {
            aircraftId: ac.id,
            controller: "TOWER",
            type: "TAKEOFF",
            parameters: { runway: rwy, initialAltitude: baseAlt + 3000 },
          },
          "AUTONOMOUS"
        );
      }
      continue;
    }

    if (ac.state === "CLIMB" && ac.altitude >= elev + 800) {
      submitClearanceDecision(
        state,
        {
          aircraftId: ac.id,
          controller: "TOWER",
          type: "HANDOFF",
          parameters: { targetController: "DEPARTURE" },
        },
        "AUTONOMOUS"
      );
      continue;
    }

    if (
      (ac.state === "GO_AROUND" || ac.state === "MISSED_APPROACH") &&
      ac.altitude >= elev + 1400
    ) {
      submitClearanceDecision(
        state,
        {
          aircraftId: ac.id,
          controller: "TOWER",
          type: "HANDOFF",
          parameters: { targetController: "DEPARTURE" },
        },
        "AUTONOMOUS"
      );
    }
  }
}

function hasRecentDepartureClimbOnRunway(
  state: SimulationState,
  runway: RunwayId,
  excludeId: string
): boolean {
  const rwySpec = state.airport.runways[runway];
  for (const id of state.aircraftOrder) {
    if (id === excludeId) continue;
    const other = state.aircraft[id];
    if (!other || other.flightKind !== "DEPARTURE") continue;
    const along = rwySpec ? alongRunwayNm(rwySpec, other.x, other.y) : 0;
    if (
      other.targetRunway === runway &&
      (other.state === "TAKEOFF_CLEARED" ||
        other.state === "TAKEOFF_ROLL" ||
        other.state === "ROTATE" ||
        (other.state === "CLIMB" && along < 4.5))
    ) {
      return true;
    }
  }
  return false;
}

function runAutonomousDeparture(state: SimulationState): void {
  const elev = state.airport.elevationFt;
  const baseAlt = Math.round(elev / 500) * 500;

  for (const id of state.aircraftOrder) {
    const ac = state.aircraft[id];
    if (
      !ac ||
      ac.controller !== "DEPARTURE" ||
      ac.commStatus === "RADIO_FAILURE" ||
      isBusyWithReadback(ac)
    ) {
      continue;
    }
    if (handleAutonomousReadbackError(state, ac, "DEPARTURE")) continue;

    if (
      ac.flightKind === "DEPARTURE" &&
      (ac.state === "CLIMB" || ac.state === "CRUISE_OUTBOUND")
    ) {
      if (ac.assignedAltitude === null || ac.assignedAltitude < baseAlt + 7000) {
        submitClearanceDecision(
          state,
          {
            aircraftId: ac.id,
            controller: "DEPARTURE",
            type: "ALTITUDE",
            parameters: { altitude: baseAlt + 7000 },
          },
          "AUTONOMOUS"
        );
        continue;
      }
      if (!ac.assignedDirectFix && ac.assignedDepartureFix && ac.altitude >= elev + 1900) {
        submitClearanceDecision(
          state,
          {
            aircraftId: ac.id,
            controller: "DEPARTURE",
            type: "DIRECT",
            parameters: { fixId: ac.assignedDepartureFix },
          },
          "AUTONOMOUS"
        );
        continue;
      }
      if (ac.assignedSpeed === null || ac.assignedSpeed < 240) {
        submitClearanceDecision(
          state,
          {
            aircraftId: ac.id,
            controller: "DEPARTURE",
            type: "SPEED",
            parameters: { speed: 250 },
          },
          "AUTONOMOUS"
        );
        continue;
      }
    }

    if (ac.flightKind === "ARRIVAL" && ac.state === "APPROACH") {
      const rwy = ac.targetRunway;
      const rwySpec = state.airport.runways[rwy];
      if (!rwySpec) continue;
      const iaf = state.airport.iafByRunway[rwy];
      const along = alongRunwayNm(rwySpec, ac.x, ac.y);
      const recipHeading = ((rwySpec.heading + 180) % 360) || 360;

      if (along > -4.5 && ac.assignedApproach === null) {
        if (ac.assignedHeading !== recipHeading) {
          submitClearanceDecision(
            state,
            {
              aircraftId: ac.id,
              controller: "DEPARTURE",
              type: "HEADING",
              parameters: { heading: recipHeading, turnDirection: "LEFT" },
            },
            "AUTONOMOUS"
          );
          continue;
        }
      } else if (ac.assignedApproach === null) {
        if (iaf && ac.assignedDirectFix !== iaf) {
          submitClearanceDecision(
            state,
            {
              aircraftId: ac.id,
              controller: "DEPARTURE",
              type: "DIRECT",
              parameters: { fixId: iaf },
            },
            "AUTONOMOUS"
          );
          continue;
        }
        if (ac.assignedAltitude === null || ac.assignedAltitude > baseAlt + 2800) {
          submitClearanceDecision(
            state,
            {
              aircraftId: ac.id,
              controller: "DEPARTURE",
              type: "ALTITUDE",
              parameters: { altitude: baseAlt + 2500 },
            },
            "AUTONOMOUS"
          );
          continue;
        }
        if (along <= -5.5 && along >= -11.8) {
          submitClearanceDecision(
            state,
            {
              aircraftId: ac.id,
              controller: "DEPARTURE",
              type: "APPROACH",
              parameters: { runway: rwy },
            },
            "AUTONOMOUS"
          );
          continue;
        }
      } else if (ac.assignedSpeed === null || ac.assignedSpeed > 175) {
        submitClearanceDecision(
          state,
          {
            aircraftId: ac.id,
            controller: "DEPARTURE",
            type: "SPEED",
            parameters: { speed: 165 },
          },
          "AUTONOMOUS"
        );
        continue;
      }
    }

    if (ac.flightKind === "ARRIVAL" && ac.state === "FINAL") {
      submitClearanceDecision(
        state,
        {
          aircraftId: ac.id,
          controller: "DEPARTURE",
          type: "HANDOFF",
          parameters: { targetController: "TOWER" },
        },
        "AUTONOMOUS"
      );
    }
  }
}

/**
 * Autonomous Controllers (Section 26 & 27).
 * Strictly inspect SimulationState and issue ATCClearances via DecisionEngine.
 * Never move aircraft directly.
 */
export function runAutonomousControllers(state: SimulationState): void {
  if (state.time - state.lastAutonomousRunAt < state.config.autonomousReactionInterval) {
    return;
  }
  state.lastAutonomousRunAt = state.time;

  if (state.config.stationControl.GROUND === "AUTONOMOUS") {
    runAutonomousGround(state);
  }
  if (state.config.stationControl.TOWER === "AUTONOMOUS") {
    runAutonomousTower(state);
  }
  if (state.config.stationControl.DEPARTURE === "AUTONOMOUS") {
    runAutonomousDeparture(state);
  }
}
