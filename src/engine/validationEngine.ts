import {
  alongRunwayNm,
  crossTrackRunwayNm,
  headingDiffDeg,
} from "../data/asteriaAirport.ts";
import type {
  ATCClearance,
  Aircraft,
  ClearanceType,
  OperationalAction,
  RunwayId,
  SimulationState,
  ValidationResult,
} from "../types/atc.ts";
import { getLatestActiveClearance } from "./clearanceEngine.ts";

export function hasValidClearance(
  aircraft: Aircraft,
  type: ClearanceType
): boolean {
  return Boolean(getLatestActiveClearance(aircraft, type));
}

export function getValidClearanceForRunway(
  aircraft: Aircraft,
  type: ClearanceType,
  runway: RunwayId
): ATCClearance | undefined {
  for (let i = aircraft.clearances.length - 1; i >= 0; i--) {
    const c = aircraft.clearances[i];
    if (
      c.type === type &&
      !c.cancelled &&
      c.acknowledged &&
      c.active &&
      (c.lifecycle === "ACTIVE" || c.lifecycle === "EXECUTED") &&
      c.parameters.runway === runway
    ) {
      return c;
    }
  }
  return undefined;
}

/**
 * Checks whether an aircraft has valid clearance / authorization to perform a given operational action.
 * Never infers permission from runway.isEmpty or aircraft readiness.
 */
export function canAircraftExecuteAction(
  aircraft: Aircraft,
  requestedAction: OperationalAction,
  simulationState: SimulationState
): ValidationResult {
  if (aircraft.state === "CRASHED") {
    return {
      allowed: false,
      reason: "Aircraft crashed; emergency rescue operations active.",
    };
  }
  // Check NORDO light-gun override when explicitly configured
  const hasLightGun = (signal: "STEADY_GREEN" | "FLASHING_GREEN") =>
    aircraft.commStatus === "RADIO_FAILURE" &&
    simulationState.config.nordoMode === "LIGHT_GUN_SIGNALS" &&
    aircraft.lightGunAuthorized === signal;

  switch (requestedAction) {
    case "PUSHBACK": {
      const clr = getLatestActiveClearance(aircraft, "PUSHBACK");
      if (!clr && !hasLightGun("FLASHING_GREEN")) {
        return {
          allowed: false,
          reason: "Aircraft does not have a valid pushback clearance.",
        };
      }
      return {
        allowed: true,
        reason: "Valid pushback clearance acknowledged.",
        clearanceId: clr?.id,
      };
    }

    case "TAXI": {
      if (aircraft.state === "HOLD_POSITION" || aircraft.state === "TAKEOFF_CANCELLED") {
        // Must have a newer TAXI clearance issued after HOLD_POSITION
        const taxiClr = getLatestActiveClearance(aircraft, "TAXI");
        if (!taxiClr) {
          return {
            allowed: false,
            reason: "Aircraft is holding position pending a new taxi clearance.",
          };
        }
      }
      const clr = getLatestActiveClearance(aircraft, "TAXI");
      if (!clr && !hasLightGun("FLASHING_GREEN")) {
        return {
          allowed: false,
          reason: "Aircraft does not have a valid taxi clearance.",
        };
      }
      if (aircraft.assignedRouteNodeIds.length === 0) {
        return {
          allowed: false,
          reason: "Taxi clearance has no validated route nodes.",
        };
      }
      return {
        allowed: true,
        reason: "Valid taxi clearance and route active.",
        clearanceId: clr?.id,
      };
    }

    case "CROSS_RUNWAY": {
      const runway = getNextCrossingRunway(aircraft, simulationState);
      if (!runway) {
        return {
          allowed: false,
          reason: "No runway crossing segment pending.",
        };
      }
      // Explicitly forbid inferring crossing permission from an empty runway!
      const crossClr = getValidClearanceForRunway(aircraft, "CROSS_RUNWAY", runway);
      if (!crossClr || !aircraft.crossRunwayCleared[runway]) {
        return {
          allowed: false,
          reason: `Explicit CROSS_RUNWAY clearance required for runway ${runway}.`,
        };
      }
      // Check if an explicit HOLD_SHORT for this runway came after the CROSS_RUNWAY clearance
      const holdClr = getValidClearanceForRunway(aircraft, "HOLD_SHORT", runway);
      if (holdClr && holdClr.issuedAt >= crossClr.issuedAt) {
        return {
          allowed: false,
          reason: `Active HOLD_SHORT instruction for runway ${runway} blocks crossing.`,
        };
      }
      return {
        allowed: true,
        reason: `Valid crossing clearance for runway ${runway}.`,
        clearanceId: crossClr.id,
      };
    }

    case "ENTER_RUNWAY_LINE_UP": {
      const lineUpClr = getValidClearanceForRunway(
        aircraft,
        "LINE_UP",
        aircraft.targetRunway
      );
      const takeoffClr = getValidClearanceForRunway(
        aircraft,
        "TAKEOFF",
        aircraft.targetRunway
      );
      if (!lineUpClr && !takeoffClr && !hasLightGun("STEADY_GREEN")) {
        return {
          allowed: false,
          reason: `Runway ${aircraft.targetRunway} entry requires LINE UP AND WAIT or TAKEOFF clearance.`,
        };
      }
      return {
        allowed: true,
        reason: "Runway entry clearance acknowledged.",
        clearanceId: (takeoffClr ?? lineUpClr)?.id,
      };
    }

    case "TAKEOFF_ROLL": {
      if (
        aircraft.state === "TAKEOFF_CANCELLED" ||
        aircraft.state === "REJECTED_TAKEOFF" ||
        aircraft.state === "BRAKING" ||
        aircraft.state === "STOPPED_ON_RUNWAY" ||
        aircraft.state === "HOLD_POSITION"
      ) {
        return {
          allowed: false,
          reason: `Takeoff forbidden in state ${aircraft.state}.`,
        };
      }
      const takeoffClr = getValidClearanceForRunway(
        aircraft,
        "TAKEOFF",
        aircraft.targetRunway
      );
      if (!takeoffClr && !hasLightGun("STEADY_GREEN")) {
        return {
          allowed: false,
          reason: `Aircraft does not have a valid TAKEOFF clearance for runway ${aircraft.targetRunway}.`,
        };
      }
      return {
        allowed: true,
        reason: `Takeoff clearance valid for runway ${aircraft.targetRunway}.`,
        clearanceId: takeoffClr?.id,
      };
    }

    case "LAND": {
      const runway = aircraft.assignedApproach ?? aircraft.targetRunway;
      const landClr = getValidClearanceForRunway(aircraft, "LAND", runway);
      if (!landClr && !hasLightGun("STEADY_GREEN")) {
        return {
          allowed: false,
          reason: `Arrival does not have a valid LAND clearance for runway ${runway}.`,
        };
      }
      return {
        allowed: true,
        reason: `Landing clearance valid for runway ${runway}.`,
        clearanceId: landClr?.id,
      };
    }

    case "VACATE_RUNWAY": {
      const runway = aircraft.assignedApproach ?? aircraft.targetRunway;
      const landClr = getValidClearanceForRunway(aircraft, "LAND", runway);
      const vacateClr = getValidClearanceForRunway(aircraft, "VACATE_RUNWAY", runway);
      if (!landClr && !vacateClr && !hasLightGun("STEADY_GREEN")) {
        return {
          allowed: false,
          reason: "Runway vacation requires prior landing clearance completion.",
        };
      }
      return {
        allowed: true,
        reason: "Vacating runway following landing rollout.",
        clearanceId: vacateClr?.id ?? landClr?.id,
      };
    }

    case "GO_AROUND": {
      if (
        aircraft.state === "GO_AROUND" ||
        aircraft.state === "MISSED_APPROACH"
      ) {
        return {
          allowed: true,
          reason: "Aircraft actively executing go-around / missed approach procedure.",
        };
      }
      const gaClr = getLatestActiveClearance(aircraft, "GO_AROUND");
      if (gaClr) {
        return {
          allowed: true,
          reason: "ATC GO_AROUND clearance acknowledged.",
          clearanceId: gaClr.id,
        };
      }
      if (
        aircraft.lightGunAuthorized === "STEADY_RED" &&
        simulationState.config.nordoMode === "LIGHT_GUN_SIGNALS"
      ) {
        return {
          allowed: true,
          reason: "Tower Light Gun STEADY RED — give way and continue circling.",
        };
      }
      if (aircraft.minimumsGoAroundTriggered) {
        return {
          allowed: true,
          reason: "Safety minimums missed approach triggered (no landing clearance at minimums).",
        };
      }
      return {
        allowed: false,
        reason: "No GO_AROUND clearance or safety minimums trigger.",
      };
    }

    case "CHANGE_HEADING": {
      if (
        aircraft.commStatus === "RADIO_FAILURE" &&
        simulationState.config.nordoMode === "PREDEFINED_LOST_COMM"
      ) {
        return {
          allowed: true,
          reason: "NORDO predefined lost-communication flight plan tracking.",
        };
      }
      const hdgClr = getLatestActiveClearance(aircraft, "HEADING");
      const dirClr = getLatestActiveClearance(aircraft, "DIRECT");
      const appClr = getLatestActiveClearance(aircraft, "APPROACH");
      const toClr = getLatestActiveClearance(aircraft, "TAKEOFF");
      const gaClr = getLatestActiveClearance(aircraft, "GO_AROUND");
      const valid = hdgClr ?? dirClr ?? appClr ?? gaClr ?? toClr;
      if (!valid && aircraft.assignedHeading === null) {
        return {
          allowed: false,
          reason: "No valid heading, direct, approach, or takeoff clearance.",
        };
      }
      return {
        allowed: true,
        reason: "Authorized lateral guidance.",
        clearanceId: valid?.id,
      };
    }

    case "CHANGE_ALTITUDE": {
      if (
        aircraft.commStatus === "RADIO_FAILURE" &&
        simulationState.config.nordoMode === "PREDEFINED_LOST_COMM"
      ) {
        return {
          allowed: true,
          reason: "NORDO predefined lost-communication altitude profile.",
        };
      }
      const altClr = getLatestActiveClearance(aircraft, "ALTITUDE");
      const appClr = getLatestActiveClearance(aircraft, "APPROACH");
      const landClr = getLatestActiveClearance(aircraft, "LAND");
      const toClr = getLatestActiveClearance(aircraft, "TAKEOFF");
      const gaClr = getLatestActiveClearance(aircraft, "GO_AROUND");
      const valid = altClr ?? landClr ?? appClr ?? gaClr ?? toClr;
      if (!valid && aircraft.assignedAltitude === null) {
        return {
          allowed: false,
          reason: "No valid altitude clearance.",
        };
      }
      return {
        allowed: true,
        reason: "Authorized vertical guidance.",
        clearanceId: valid?.id,
      };
    }

    case "CHANGE_SPEED": {
      const spdClr = getLatestActiveClearance(aircraft, "SPEED");
      const appClr = getLatestActiveClearance(aircraft, "APPROACH");
      const landClr = getLatestActiveClearance(aircraft, "LAND");
      const toClr = getLatestActiveClearance(aircraft, "TAKEOFF");
      const gaClr = getLatestActiveClearance(aircraft, "GO_AROUND");
      const valid = spdClr ?? landClr ?? appClr ?? gaClr ?? toClr;
      if (!valid && aircraft.assignedSpeed === null) {
        return {
          allowed: false,
          reason: "No valid speed clearance.",
        };
      }
      return {
        allowed: true,
        reason: "Authorized speed guidance.",
        clearanceId: valid?.id,
      };
    }

    case "FLY_APPROACH": {
      if (
        aircraft.commStatus === "RADIO_FAILURE" &&
        simulationState.config.nordoMode === "PREDEFINED_LOST_COMM"
      ) {
        return {
          allowed: true,
          reason: "NORDO predefined lost-communication approach.",
        };
      }
      const appClr = getLatestActiveClearance(aircraft, "APPROACH");
      const landClr = getLatestActiveClearance(aircraft, "LAND");
      const valid = landClr ?? appClr;
      if (!valid) {
        return {
          allowed: false,
          reason: "Aircraft does not have an active APPROACH clearance.",
        };
      }
      return {
        allowed: true,
        reason: "Valid approach clearance active.",
        clearanceId: valid.id,
      };
    }

    case "DIRECT_FIX": {
      const dirClr = getLatestActiveClearance(aircraft, "DIRECT");
      if (!dirClr) {
        return {
          allowed: false,
          reason: "Aircraft does not have a valid DIRECT fix clearance.",
        };
      }
      return {
        allowed: true,
        reason: "Valid DIRECT fix clearance active.",
        clearanceId: dirClr.id,
      };
    }
  }
}

/**
 * Determines if the aircraft's next taxi edge enters or crosses a runway.
 */
export function getNextCrossingRunway(
  aircraft: Aircraft,
  simulation: SimulationState
): RunwayId | null {
  if (aircraft.holdingAtRunway && aircraft.holdingShortReason === "CROSSING_REQUIRED") {
    return aircraft.holdingAtRunway;
  }
  const route = aircraft.assignedRouteNodeIds;
  const idx = aircraft.routeStepIndex;
  if (idx < 0 || idx + 1 >= route.length) return null;
  const fromId = route[idx];
  const toId = route[idx + 1];
  const edge = simulation.airport.edges.find(
    (e) => e.from === fromId && e.to === toId
  );
  if (edge?.runwayCrossing) {
    return edge.runwayCrossing;
  }
  const toNode = simulation.airport.nodes[toId];
  if (toNode?.runwayId) {
    return toNode.runwayId;
  }
  return null;
}

/**
 * HARD SAFETY INVARIANT (Section 28)
 * Must be consulted before EVERY operational movement.
 * Returns true ONLY if the aircraft currently has a valid operational clearance
 * (or is physically braking down to zero speed after a stop/abort command).
 */
export function canAircraftMove(
  aircraft: Aircraft,
  simulation: SimulationState
): boolean {
  // If voice transmission is actively speaking this clearance, aircraft holds until voice ends
  if (
    aircraft.voiceGated &&
    simulation.config.activePlayerStation !== "ALL" &&
    aircraft.controller === simulation.config.activePlayerStation &&
    aircraft.altitude <= simulation.airport.elevationFt + 50
  ) {
    return false;
  }

  switch (aircraft.state) {
    case "AT_GATE":
    case "PUSHBACK_COMPLETE":
    case "HOLDING_SHORT":
    case "TAKEOFF_CANCELLED":
    case "STOPPED_ON_RUNWAY":
    case "COMPLETED_DEPARTURE":
    case "COMPLETED_ARRIVAL":
    case "CRASHED":
      return false;

    case "HOLD_POSITION":
      // Allow only smooth physical braking deceleration down to 0 kts (Section 29)
      return aircraft.speed > 0.05;

    case "PUSHBACK_APPROVED":
    case "PUSHING_BACK":
      return canAircraftExecuteAction(aircraft, "PUSHBACK", simulation).allowed;

    case "TAXIING": {
      if (!canAircraftExecuteAction(aircraft, "TAXI", simulation).allowed) {
        return false;
      }
      const nextCross = getNextCrossingRunway(aircraft, simulation);
      if (nextCross) {
        const currentNodeId = aircraft.assignedRouteNodeIds[aircraft.routeStepIndex];
        const curNode = currentNodeId
          ? simulation.airport.nodes[currentNodeId]
          : undefined;
        // If at a hold-short node for a runway we are about to enter, must have CROSS_RUNWAY!
        if (curNode?.kind === "HOLD_SHORT" && curNode.holdShortForRunway === nextCross) {
          return canAircraftExecuteAction(aircraft, "CROSS_RUNWAY", simulation).allowed;
        }
      }
      return true;
    }

    case "CROSSING_RUNWAY":
      return canAircraftExecuteAction(aircraft, "CROSS_RUNWAY", simulation).allowed;

    case "LINE_UP_WAIT": {
      // If not yet physically positioned on runway threshold, allow moving ONLY if LINE_UP or TAKEOFF cleared
      const rwy = simulation.airport.runways[aircraft.targetRunway];
      if (!rwy) return false;
      const along = alongRunwayNm(rwy, aircraft.x, aircraft.y);
      const cross = crossTrackRunwayNm(rwy, aircraft.x, aircraft.y);
      const onRunwayCenterline =
        Math.abs(cross) < 0.012 &&
        along >= -0.02 &&
        along <= rwy.lengthNm;
      const aligned = headingDiffDeg(aircraft.heading, rwy.heading) < 5;
      if (onRunwayCenterline && aligned) {
        // Physically lined up! Now wait strictly for TAKEOFF clearance!
        return canAircraftExecuteAction(aircraft, "TAKEOFF_ROLL", simulation).allowed;
      }
      return canAircraftExecuteAction(aircraft, "ENTER_RUNWAY_LINE_UP", simulation).allowed;
    }

    case "TAKEOFF_CLEARED":
    case "TAKEOFF_ROLL":
    case "ROTATE":
      return canAircraftExecuteAction(aircraft, "TAKEOFF_ROLL", simulation).allowed;

    case "REJECTED_TAKEOFF":
    case "BRAKING":
      // Physical braking deceleration on runway until 0 kts
      return aircraft.speed > 0.05;

    case "CLIMB":
    case "CRUISE_OUTBOUND":
      return (
        canAircraftExecuteAction(aircraft, "CHANGE_ALTITUDE", simulation).allowed ||
        canAircraftExecuteAction(aircraft, "CHANGE_HEADING", simulation).allowed ||
        (aircraft.lightGunAuthorized === "STEADY_RED" &&
          simulation.config.nordoMode === "LIGHT_GUN_SIGNALS") ||
        aircraft.operationMode === "EMERGENCY_OPERATION"
      );

    case "APPROACH":
    case "FINAL":
      // Airborne flight along cleared initial approach/vector
      return true;

    case "CLEARED_TO_LAND":
    case "LANDING":
    case "TOUCHDOWN":
    case "ROLLOUT":
      return canAircraftExecuteAction(aircraft, "LAND", simulation).allowed;

    case "VACATING_RUNWAY":
      return canAircraftExecuteAction(aircraft, "VACATE_RUNWAY", simulation).allowed;

    case "GO_AROUND":
    case "MISSED_APPROACH":
      // Airborne missed approach / go-around aircraft must continuously fly and climb out safely
      return true;
  }
}

export function isRunwayOccupied(
  simulation: SimulationState,
  runway: RunwayId,
  excludeAircraftId?: string
): { occupied: boolean; occupantIds: string[] } {
  const rwy = simulation.airport.runways[runway];
  if (!rwy) return { occupied: false, occupantIds: [] };
  const occupantIds: string[] = [];

  for (const id of simulation.aircraftOrder) {
    if (id === excludeAircraftId) continue;
    const ac = simulation.aircraft[id];
    if (!ac) continue;
    if (
      ac.state === "COMPLETED_DEPARTURE" ||
      ac.state === "COMPLETED_ARRIVAL"
    ) {
      continue;
    }

    const along = alongRunwayNm(rwy, ac.x, ac.y);
    const cross = crossTrackRunwayNm(rwy, ac.x, ac.y);

    const onSurfaceBounds =
      ac.altitude <= simulation.airport.elevationFt + 60 &&
      Math.abs(cross) < 0.045 &&
      along >= -0.04 &&
      along <= rwy.lengthNm + 0.04;

    if (onSurfaceBounds) {
      occupantIds.push(ac.id);
      continue;
    }

    // Also treat landing aircraft inside 1.2 NM short final as runway-active
    if (
      (ac.state === "CLEARED_TO_LAND" || ac.state === "LANDING") &&
      (ac.assignedApproach ?? ac.targetRunway) === runway &&
      along >= -1.2 &&
      along <= rwy.lengthNm
    ) {
      occupantIds.push(ac.id);
    }
  }

  return {
    occupied: occupantIds.length > 0,
    occupantIds,
  };
}

export function findBlockingTrafficAhead(
  aircraft: Aircraft,
  simulation: SimulationState,
  minDistanceNm = 0.055
): Aircraft | null {
  const rad = (aircraft.heading * Math.PI) / 180;
  const fwdX = Math.sin(rad);
  const fwdY = Math.cos(rad);

  let closest: Aircraft | null = null;
  let closestDist = Infinity;

  for (const otherId of simulation.aircraftOrder) {
    if (otherId === aircraft.id) continue;
    const other = simulation.aircraft[otherId];
    if (!other) continue;
    if (
      other.state === "COMPLETED_DEPARTURE" ||
      other.state === "COMPLETED_ARRIVAL" ||
      other.altitude > simulation.airport.elevationFt + 40
    ) {
      continue;
    }
    const dx = other.x - aircraft.x;
    const dy = other.y - aircraft.y;
    const dist = Math.hypot(dx, dy);

    // If the other aircraft explicitly yielded / stepped aside to let us pass,
    // allow closer lateral clearance unless it sits dead-center on our nose.
    const otherYieldingToUs =
      other.yieldToAircraftId === aircraft.id &&
      other.state === "HOLD_POSITION" &&
      other.speed < 1;
    const effDist = otherYieldingToUs ? Math.min(minDistanceNm, 0.025) : minDistanceNm;
    const effDot = otherYieldingToUs ? 0.86 : 0.5;

    if (dist > effDist || dist < 0.0001) continue;

    const dot = (dx * fwdX + dy * fwdY) / dist;
    if (dot > effDot && dist < closestDist) {
      // Do NOT block if the other aircraft is on a completely different taxiway / path
      if (
        aircraft.assignedRouteNodeIds &&
        aircraft.routeStepIndex < aircraft.assignedRouteNodeIds.length - 1
      ) {
        const curId = aircraft.assignedRouteNodeIds[aircraft.routeStepIndex];
        const nextId = aircraft.assignedRouteNodeIds[aircraft.routeStepIndex + 1];
        const n1 = simulation.airport.nodes[curId];
        const n2 = simulation.airport.nodes[nextId];
        if (n1 && n2) {
          const segDx = n2.x - n1.x;
          const segDy = n2.y - n1.y;
          const segLenSq = segDx * segDx + segDy * segDy;
          if (segLenSq > 0.0000001) {
            const t = Math.max(0, Math.min(1, ((other.x - n1.x) * segDx + (other.y - n1.y) * segDy) / segLenSq));
            const projX = n1.x + t * segDx;
            const projY = n1.y + t * segDy;
            const perpDist = Math.hypot(other.x - projX, other.y - projY);

            // Standard taxiway corridor half-width is ~20m (0.0108 NM).
            // If the lateral offset to our active route segment is > 0.018 NM (~33m),
            // other aircraft is on an adjacent parallel taxiway, ramp, or different branch!
            if (perpDist > 0.018) {
              continue;
            }
          }
        }
      }

      closest = other;
      closestDist = dist;
    }
  }
  return closest;
}

export function isTrafficAheadOnPath(
  aircraft: Aircraft,
  simulation: SimulationState,
  minDistanceNm = 0.055
): boolean {
  return findBlockingTrafficAhead(aircraft, simulation, minDistanceNm) !== null;
}
