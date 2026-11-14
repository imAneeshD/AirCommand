import {
  alongRunwayNm,
  crossTrackRunwayNm,
  getRunwayExitOptions,
  getSuggestedTaxiRoutes,
  headingDiffDeg,
  runwaySpokenName,
} from "../data/asteriaAirport.ts";
import type { Aircraft, ControllerRole, RunwayId, SimulationState } from "../types/atc.ts";
import { computeDepAppGuidance } from "../utils/depAppGuidance.ts";
import { buildResolutionCommands, inspectGroundConflict } from "../utils/groundConflict.ts";
import { getPendingReadbackClearances, nextId } from "./clearanceEngine.ts";
import { addRadioMessage, controllerCallsign, submitClearanceDecision } from "./decisionEngine.ts";
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
      other.state !== "LANDING" &&
      other.state !== "APPROACH"
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

function findNearestGroundNodeId(
  airport: SimulationState["airport"],
  x: number,
  y: number
): string | undefined {
  let bestId: string | undefined;
  let bestDist = Infinity;
  for (const node of Object.values(airport.nodes)) {
    if (node.kind === "RUNWAY_ENTRY" || node.kind === "RUNWAY_CROSSING" || node.runwayId) continue;
    const d = Math.hypot(node.x - x, node.y - y);
    if (d < bestDist) {
      bestDist = d;
      bestId = node.id;
    }
  }
  return bestDist < 0.45 ? bestId : undefined;
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
      } else if (
        ac.holdingShortReason === "DEPARTURE_RUNWAY" ||
        ac.holdingAtRunway === ac.targetRunway ||
        (!ac.holdingShortReason && ac.flightKind === "DEPARTURE")
      ) {
        submitClearanceDecision(
          state,
          {
            aircraftId: ac.id,
            controller: "GROUND",
            type: "HANDOFF",
            parameters: {
              targetController: "TOWER",
              bypassPending: state.config.stationControl.TOWER === "AUTONOMOUS",
            },
          },
          "AUTONOMOUS"
        );
      } else if (ac.flightKind === "ARRIVAL") {
        const startNodeId = ac.currentNodeId ?? findNearestGroundNodeId(state.airport, ac.x, ac.y);
        const destGate = ac.gateId ?? state.airport.gateIds[0];
        if (startNodeId && destGate) {
          const routes = getSuggestedTaxiRoutes(
            state.airport,
            startNodeId,
            ac.targetRunway,
            destGate,
            true,
            state,
            ac.id
          );
          const chosen = routes.find((r) => r.conflictLevel !== "BLOCKED") ?? routes[0];
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

    // Resume taxiing for aircraft in HOLD_POSITION once traffic is clear
    if (ac.state === "HOLD_POSITION") {
      if (ac.yieldToAircraftId) {
        const blocker = state.aircraft[ac.yieldToAircraftId];
        const blockerNear = blocker && Math.hypot(blocker.x - ac.x, blocker.y - ac.y) < 0.12;
        if (blockerNear) continue;
        ac.yieldToAircraftId = undefined;
      }
      if (state.time - ac.stateEnteredAt >= 3.0) {
        const startNodeId = ac.currentNodeId ?? findNearestGroundNodeId(state.airport, ac.x, ac.y);
        if (startNodeId) {
          const isArr = ac.flightKind === "ARRIVAL";
          const destGate = ac.gateId ?? state.airport.gateIds[0];
          const routes = getSuggestedTaxiRoutes(
            state.airport,
            startNodeId,
            ac.targetRunway,
            destGate,
            isArr,
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
      }
      continue;
    }

    // Automatically break mutual taxiway deadlocks under Autonomous Ground control
    if (
      ac.state === "TAXIING" &&
      ac.speed <= 1 &&
      state.time - ac.stateEnteredAt >= 3.5 &&
      !ac.yieldToAircraftId &&
      !ac.stepBackTargetNodeId &&
      !ac.stepBackRouteNodeIds
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

    // Priority 1: Arrivals on FINAL or APPROACH under TOWER control
    if (ac.flightKind === "ARRIVAL" && (ac.state === "FINAL" || ac.state === "APPROACH")) {
      const rwy = ac.assignedApproach ?? ac.targetRunway;
      const rwySpec = state.airport.runways[rwy];
      const along = rwySpec ? alongRunwayNm(rwySpec, ac.x, ac.y) : -10;
      const rwyOccupied = isRunwayActiveForTakeoffOrCrossing(state, rwy, ac.id);
      const aheadLanding = isFinalApproachCrowded(state, rwy, 2.5, ac.id);

      if (!rwyOccupied && !aheadLanding && along >= -8.5 && along < -0.3) {
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
      } else if (rwySpec && along >= -1.2 && (rwyOccupied || aheadLanding)) {
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

    // Priority 2: Landed arrivals vacating runway
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

    // Priority 3: Landed arrival clear of runway -> hand off to Ground
    if (
      ac.flightKind === "ARRIVAL" &&
      ac.state === "HOLDING_SHORT" &&
      (ac.holdingShortReason === "ROUTE_END" ||
        ac.holdingAtRunway === undefined)
    ) {
      submitClearanceDecision(
        state,
        {
          aircraftId: ac.id,
          controller: "TOWER",
          type: "HANDOFF",
          parameters: {
            targetController: "GROUND",
            bypassPending: state.config.stationControl.GROUND === "AUTONOMOUS",
          },
        },
        "AUTONOMOUS"
      );
      continue;
    }

    // Priority 4: Departures at runway threshold holding short
    if (
      ac.flightKind === "DEPARTURE" &&
      ac.state === "HOLDING_SHORT" &&
      (ac.holdingShortReason === "DEPARTURE_RUNWAY" ||
        ac.holdingAtRunway === ac.targetRunway ||
        !ac.holdingShortReason)
    ) {
      const rwy = ac.targetRunway;
      const safeTakeoff =
        !isRunwayOccupied(state, rwy, ac.id).occupied &&
        !isFinalApproachCrowded(state, rwy, 4.2, ac.id) &&
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
      } else {
        const safeLineUp =
          !isRunwayActiveForTakeoffOrCrossing(state, rwy, ac.id) &&
          !isFinalApproachCrowded(state, rwy, 3.2, ac.id);
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
      }
      continue;
    }

    // Priority 5: Departures lined up on runway waiting for takeoff
    if (ac.flightKind === "DEPARTURE" && ac.state === "LINE_UP_WAIT") {
      const rwy = ac.targetRunway;
      const rwySpec = state.airport.runways[rwy];
      if (!rwySpec) continue;
      const aligned =
        Math.abs(crossTrackRunwayNm(rwySpec, ac.x, ac.y)) < 0.03 &&
        alongRunwayNm(rwySpec, ac.x, ac.y) >= -0.05 &&
        headingDiffDeg(ac.heading, rwySpec.heading) < 18 &&
        ac.speed < 4;
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

    // Priority 6: Airborne departures climbing through Tower altitude -> hand off to Departure
    if (ac.state === "CLIMB" && ac.altitude >= elev + 700) {
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

    // Priority 7: Go-arounds climbing out -> hand off to Departure
    if (
      (ac.state === "GO_AROUND" || ac.state === "MISSED_APPROACH") &&
      ac.altitude >= elev + 1200
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
      continue;
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

    // Outbound departures climbing to cruise altitude
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
      const depFix =
        ac.assignedDepartureFix ??
        state.airport.departureFixIds[0];
      if (!ac.assignedDirectFix && depFix && ac.altitude >= elev + 1800) {
        submitClearanceDecision(
          state,
          {
            aircraftId: ac.id,
            controller: "DEPARTURE",
            type: "DIRECT",
            parameters: { fixId: depFix },
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

      const distFromAirport = Math.hypot(ac.x, ac.y);
      if (
        (distFromAirport >= 8.5 && ac.altitude >= elev + 2600) ||
        (ac.state === "CRUISE_OUTBOUND" && ac.altitude >= elev + 2400) ||
        distFromAirport >= 13
      ) {
        submitClearanceDecision(
          state,
          {
            aircraftId: ac.id,
            controller: "DEPARTURE",
            type: "HANDOFF",
            parameters: { targetController: "ACC" },
          },
          "AUTONOMOUS"
        );
        continue;
      }
    }

    // Inbound arrivals under Departure/Approach control
    if (ac.flightKind === "ARRIVAL") {
      const rwy = ac.targetRunway;
      const rwySpec = state.airport.runways[rwy];
      if (!rwySpec) continue;
      const along = alongRunwayNm(rwySpec, ac.x, ac.y);
      const guidance = computeDepAppGuidance(state.airport, ac, rwy);

      // 1. Proactively hand off to Tower when established on final approach within 12 NM
      const isEstablishedOnFinal =
        ac.state === "FINAL" ||
        (ac.assignedApproach !== null &&
          along >= -12.0 &&
          along <= -1.0 &&
          Math.abs(crossTrackRunwayNm(rwySpec, ac.x, ac.y)) <= 0.45);
      const isGoAroundActive = ac.state === "GO_AROUND" || ac.state === "MISSED_APPROACH";

      if (!isGoAroundActive && isEstablishedOnFinal) {
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

      // 2. Clear ILS Approach when within intercept corridor
      if (ac.assignedApproach === null && along >= -13.5 && along <= -2.5) {
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

      // 3. Steer aircraft to localizer intercept heading
      if (
        ac.assignedHeading === null ||
        headingDiffDeg(ac.assignedHeading, guidance.recommendedHeading) > 8
      ) {
        submitClearanceDecision(
          state,
          {
            aircraftId: ac.id,
            controller: "DEPARTURE",
            type: "HEADING",
            parameters: {
              heading: guidance.recommendedHeading,
              turnDirection: guidance.recommendedTurnDirection,
            },
          },
          "AUTONOMOUS"
        );
        continue;
      }

      // 4. Descend to approach altitude
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

      // 5. Approach speed control
      if (ac.assignedSpeed === null || ac.assignedSpeed > 175) {
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

      continue;
    }
  }
}

function runAutonomousDelivery(state: SimulationState): void {
  for (const id of state.aircraftOrder) {
    const ac = state.aircraft[id];
    if (!ac || ac.controller !== "DELIVERY" || ac.state === "CRASHED") continue;

    if (handleAutonomousReadbackError(state, ac, "DELIVERY")) continue;

    const pendingRb = getPendingReadbackClearances(ac);
    if (pendingRb.length > 0) continue;

    // 1. Issue IFR clearance if pending
    if (ac.flightPlan?.clearanceStatus !== "CLEARED") {
      submitClearanceDecision(
        state,
        {
          aircraftId: ac.id,
          controller: "DELIVERY",
          type: "IFR_CLEARANCE",
          parameters: { altitude: 5000 },
        },
        "AUTONOMOUS"
      );
      continue;
    }

    // 2. Once cleared, hand off to Ground Control for pushback & start
    if (ac.flightPlan?.clearanceStatus === "CLEARED") {
      submitClearanceDecision(
        state,
        {
          aircraftId: ac.id,
          controller: "DELIVERY",
          type: "HANDOFF",
          parameters: { targetController: "GROUND" },
        },
        "AUTONOMOUS"
      );
      continue;
    }
  }
}

function runAutonomousCenter(state: SimulationState): void {
  const elev = state.airport.elevationFt;
  for (const id of state.aircraftOrder) {
    const ac = state.aircraft[id];
    if (!ac || ac.controller !== "CENTER" || ac.state === "CRASHED") continue;

    if (handleAutonomousReadbackError(state, ac, "CENTER")) continue;

    const pendingRb = getPendingReadbackClearances(ac);
    if (pendingRb.length > 0) continue;

    if (ac.flightKind === "DEPARTURE") {
      const dist = Math.hypot(ac.x, ac.y);
      if (dist >= 18 || ac.altitude >= elev + 8000) {
        submitClearanceDecision(
          state,
          {
            aircraftId: ac.id,
            controller: "CENTER",
            type: "HANDOFF",
            parameters: { targetController: "ACC" },
          },
          "AUTONOMOUS"
        );
        continue;
      }
      if (ac.assignedAltitude === null || ac.assignedAltitude < 24000) {
        submitClearanceDecision(
          state,
          {
            aircraftId: ac.id,
            controller: "CENTER",
            type: "ALTITUDE",
            parameters: { altitude: 24000 },
          },
          "AUTONOMOUS"
        );
        continue;
      }
    } else {
      const dist = Math.hypot(ac.x, ac.y);
      if (dist <= 14) {
        submitClearanceDecision(
          state,
          {
            aircraftId: ac.id,
            controller: "CENTER",
            type: "HANDOFF",
            parameters: { targetController: "DEPARTURE" },
          },
          "AUTONOMOUS"
        );
        continue;
      }
      if (ac.assignedAltitude === null || ac.assignedAltitude > elev + 6000) {
        submitClearanceDecision(
          state,
          {
            aircraftId: ac.id,
            controller: "CENTER",
            type: "ALTITUDE",
            parameters: { altitude: Math.round((elev + 5000) / 500) * 500 },
          },
          "AUTONOMOUS"
        );
        continue;
      }
    }
  }
}

/**
 * Automatically accepts any pending handoffs addressed to autonomous/AI positions
 * so traffic never stalls waiting for human acceptance at an unmanned station.
 */
function autoAcceptHandoffsForAutonomousControllers(state: SimulationState): void {
  if (!state.handoffs || state.handoffs.length === 0) return;
  for (const h of state.handoffs) {
    if (
      h.status === "PENDING" &&
      h.toController !== "ACC" &&
      state.config.stationControl?.[h.toController as ControllerRole] === "AUTONOMOUS"
    ) {
      h.status = "ACCEPTED";
      h.respondedAt = state.time;
      const ac = state.aircraft[h.aircraftId];
      if (ac && ac.controller !== h.toController) {
        ac.controller = h.toController as ControllerRole;
        ac.lastTransmissionAt = state.time;
        if (h.toController === "TOWER" && ac.flightKind === "DEPARTURE" && ac.state === "HOLDING_SHORT") {
          const targetName = controllerCallsign("TOWER", state.airport, ac.flightKind);
          const msgText = `${targetName}, ${ac.spokenCallsign}, holding short runway ${runwaySpokenName(ac.targetRunway)}, ready for departure.`;
          ac.pendingRequest = {
            id: nextId(state, "req"),
            type: "TAKEOFF",
            controller: "TOWER",
            message: msgText,
            requestedAt: state.time,
            runway: ac.targetRunway,
            resolved: false,
          };
          addRadioMessage(state, {
            sender: ac.callsign,
            recipient: targetName,
            controller: "TOWER",
            aircraftId: ac.id,
            category: "PILOT_REQUEST",
            text: msgText,
          });
        } else if (h.toController === "GROUND" && ac.flightKind === "ARRIVAL") {
          const targetName = controllerCallsign("GROUND", state.airport, ac.flightKind);
          const msgText = `${targetName}, ${ac.spokenCallsign}, clear of runway, request taxi to gate.`;
          ac.pendingRequest = {
            id: nextId(state, "req"),
            type: "TAXI",
            controller: "GROUND",
            message: msgText,
            requestedAt: state.time,
            resolved: false,
          };
          addRadioMessage(state, {
            sender: ac.callsign,
            recipient: targetName,
            controller: "GROUND",
            aircraftId: ac.id,
            category: "PILOT_REQUEST",
            text: msgText,
          });
        }
      }
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

  // 0. Auto-accept any handoffs addressed to automated controllers
  autoAcceptHandoffsForAutonomousControllers(state);

  if (state.config.stationControl.DELIVERY === "AUTONOMOUS") {
    runAutonomousDelivery(state);
  }
  if (state.config.stationControl.GROUND === "AUTONOMOUS") {
    runAutonomousGround(state);
  }
  if (state.config.stationControl.TOWER === "AUTONOMOUS") {
    runAutonomousTower(state);
  }
  if (state.config.stationControl.DEPARTURE === "AUTONOMOUS") {
    runAutonomousDeparture(state);
  }
  if (state.config.stationControl.CENTER === "AUTONOMOUS") {
    runAutonomousCenter(state);
  }
}
