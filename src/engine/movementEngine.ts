import {
  alongRunwayNm,
  crossTrackRunwayNm,
  headingDiffDeg,
  runwayPoint,
} from "../data/asteriaAirport.ts";
import type { Aircraft, RunwayId, SimulationState } from "../types/atc.ts";
import { completeClearancesOfType } from "./clearanceEngine.ts";
import {
  canAircraftExecuteAction,
  canAircraftMove,
  isTrafficAheadOnPath,
} from "./validationEngine.ts";

function normalizeHeading(deg: number): number {
  const h = ((deg % 360) + 360) % 360;
  return h === 0 ? 360 : h;
}

function bearingDeg(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const rad = Math.atan2(dx, dy);
  return normalizeHeading((rad * 180) / Math.PI);
}

function turnTowardHeading(
  current: number,
  target: number,
  maxDelta: number,
  direction: "LEFT" | "RIGHT" | "NEAREST" = "NEAREST"
): number {
  const cur = current % 360;
  const tgt = target % 360;
  let diff = ((tgt - cur + 540) % 360) - 180; // [-180, 180)

  if (direction === "RIGHT" && diff < -0.5) {
    diff += 360;
  } else if (direction === "LEFT" && diff > 0.5) {
    diff -= 360;
  }

  if (Math.abs(diff) <= maxDelta) {
    return normalizeHeading(target);
  }
  return normalizeHeading(cur + Math.sign(diff) * maxDelta);
}

function moveTowardPoint(
  ac: Aircraft,
  tx: number,
  ty: number,
  speedKts: number,
  dt: number
): { arrived: boolean } {
  const dx = tx - ac.x;
  const dy = ty - ac.y;
  const dist = Math.hypot(dx, dy);
  const stepNm = (speedKts / 3600) * dt;

  if (dist > 0.0005) {
    const targetHdg = bearingDeg(ac.x, ac.y, tx, ty);
    ac.heading = turnTowardHeading(ac.heading, targetHdg, 95 * dt, "NEAREST");
  }

  if (dist <= Math.max(stepNm, 0.003)) {
    ac.x = tx;
    ac.y = ty;
    return { arrived: true };
  }

  ac.x += (dx / dist) * stepNm;
  ac.y += (dy / dist) * stepNm;
  return { arrived: false };
}

/**
 * Physical Movement & Kinematics Engine (Section 28 & 29).
 * Consults canAircraftMove(aircraft, simulation) BEFORE every movement step.
 */
export function updateAircraftMovement(
  state: SimulationState,
  dt: number
): void {
  const elev = state.airport.elevationFt;

  for (const id of state.aircraftOrder) {
    const ac = state.aircraft[id];
    if (!ac) continue;

    // HARD SAFETY INVARIANT: No movement without valid clearance (or braking stop)
    if (!canAircraftMove(ac, state)) {
      ac.speed = 0;
      ac.verticalSpeed = 0;
      continue;
    }

    switch (ac.state) {
      case "PUSHING_BACK": {
        const spotId = ac.pushbackSpotId ?? (ac.gateId ? `PB_${ac.gateId}` : undefined);
        const spot = spotId ? state.airport.nodes[spotId] : undefined;
        if (!spot) {
          ac.speed = 0;
          ac.state = "PUSHBACK_COMPLETE";
          break;
        }
        ac.speed = 6;
        const dx = spot.x - ac.x;
        const dy = spot.y - ac.y;
        const dist = Math.hypot(dx, dy);
        const step = (ac.speed / 3600) * dt;
        // Aircraft pushes tail-first, so keep nose pointing toward gate while backing out
        if (dist <= Math.max(step, 0.003)) {
          ac.x = spot.x;
          ac.y = spot.y;
          ac.currentNodeId = spot.id;
          const rwy = state.airport.runways[ac.targetRunway];
          ac.heading = rwy ? normalizeHeading((rwy.heading + 180) % 360) : spot.isNorthSide ? 270 : 90;
          ac.speed = 0;
          completeClearancesOfType(ac, "PUSHBACK");
          ac.state = "PUSHBACK_COMPLETE";
          ac.stateEnteredAt = state.time;
        } else {
          ac.x += (dx / dist) * step;
          ac.y += (dy / dist) * step;
        }
        break;
      }

      case "HOLD_POSITION": {
        // Smooth physical braking deceleration to 0 kts (Section 29)
        ac.speed = Math.max(0, ac.speed - 18 * dt);
        const step = (ac.speed / 3600) * dt;
        const rad = (ac.heading * Math.PI) / 180;
        ac.x += Math.sin(rad) * step;
        ac.y += Math.cos(rad) * step;
        break;
      }

      case "TAXIING":
      case "CROSSING_RUNWAY": {
        if (isTrafficAheadOnPath(ac, state, 0.055)) {
          ac.speed = Math.max(0, ac.speed - 24 * dt);
          break;
        }

        const route = ac.assignedRouteNodeIds;
        if (ac.routeStepIndex < 0 || ac.routeStepIndex >= route.length - 1) {
          ac.speed = 0;
          ac.state = "HOLD_POSITION";
          break;
        }

        const curNodeId = route[ac.routeStepIndex];
        const nextNodeId = route[ac.routeStepIndex + 1];
        const curNode = state.airport.nodes[curNodeId];
        const nextNode = state.airport.nodes[nextNodeId];
        if (!curNode || !nextNode) {
          ac.speed = 0;
          ac.state = "HOLD_POSITION";
          break;
        }

        // Before stepping onto a runway crossing segment from a HOLD_SHORT node,
        // verify explicit CROSS_RUNWAY clearance!
        const edge = state.airport.edges.find(
          (e) => e.from === curNodeId && e.to === nextNodeId
        );
        const crossingRwy: RunwayId | undefined =
          edge?.runwayCrossing ?? nextNode.runwayId;

        if (
          curNode.kind === "HOLD_SHORT" &&
          crossingRwy &&
          Math.hypot(ac.x - curNode.x, ac.y - curNode.y) < 0.015
        ) {
          const crossCheck = canAircraftExecuteAction(ac, "CROSS_RUNWAY", state);
          if (!crossCheck.allowed) {
            ac.x = curNode.x;
            ac.y = curNode.y;
            ac.currentNodeId = curNode.id;
            ac.speed = 0;
            ac.state = "HOLDING_SHORT";
            ac.holdingAtRunway = crossingRwy;
            ac.holdingShortReason = "CROSSING_REQUIRED";
            ac.stateEnteredAt = state.time;
            break;
          }
          ac.state = "CROSSING_RUNWAY";
        }

        const targetSpd = ac.state === "CROSSING_RUNWAY" ? 26 : 22;
        ac.speed = Math.min(targetSpd, ac.speed + 16 * dt);

        const { arrived } = moveTowardPoint(ac, nextNode.x, nextNode.y, ac.speed, dt);
        if (arrived) {
          ac.currentNodeId = nextNode.id;
          ac.routeStepIndex += 1;

          // If we just finished crossing a runway onto the opposite hold-short node,
          // consume that single crossing clearance and return to TAXIING if more route left.
          if (
            curNode.runwayId &&
            nextNode.kind === "HOLD_SHORT" &&
            nextNode.holdShortForRunway === curNode.runwayId
          ) {
            ac.crossRunwayCleared[curNode.runwayId] = false;
            completeClearancesOfType(ac, "CROSS_RUNWAY");
            if (ac.routeStepIndex < route.length - 1) {
              ac.state = "TAXIING";
            }
          }

          // Check if destination reached
          if (ac.routeStepIndex >= route.length - 1) {
            ac.speed = 0;
            completeClearancesOfType(ac, "TAXI");
            if (nextNode.kind === "GATE") {
              ac.state = "COMPLETED_ARRIVAL";
              ac.stateEnteredAt = state.time;
              state.metrics.arrivalsCompleted += 1;
            } else if (
              nextNode.kind === "HOLD_SHORT" &&
              nextNode.holdShortForRunway === ac.targetRunway &&
              ac.flightKind === "DEPARTURE"
            ) {
              ac.state = "HOLDING_SHORT";
              ac.holdingAtRunway = ac.targetRunway;
              ac.holdingShortReason = "DEPARTURE_RUNWAY";
              ac.stateEnteredAt = state.time;
              // Face toward the runway entry
              const entryId = `RWY_${ac.targetRunway}_${nextNode.id.split("_")[2]}`;
              const entryNode = state.airport.nodes[entryId];
              if (entryNode) {
                ac.heading = bearingDeg(ac.x, ac.y, entryNode.x, entryNode.y);
              }
            } else {
              ac.state = "HOLD_POSITION";
              ac.stateEnteredAt = state.time;
            }
          } else {
            // Check immediately at newly arrived node if next segment requires holding short
            const upcomingNodeId = route[ac.routeStepIndex + 1];
            const upcomingNode = state.airport.nodes[upcomingNodeId];
            const nextEdge = state.airport.edges.find(
              (e) => e.from === nextNode.id && e.to === upcomingNodeId
            );
            const upcomingRwy =
              nextEdge?.runwayCrossing ?? upcomingNode?.runwayId;
            if (nextNode.kind === "HOLD_SHORT" && upcomingRwy) {
              const crossCheck = canAircraftExecuteAction(ac, "CROSS_RUNWAY", state);
              if (!crossCheck.allowed) {
                ac.speed = 0;
                ac.state = "HOLDING_SHORT";
                ac.holdingAtRunway = upcomingRwy;
                ac.holdingShortReason = "CROSSING_REQUIRED";
                ac.stateEnteredAt = state.time;
              } else {
                ac.state = "CROSSING_RUNWAY";
              }
            }
          }
        }
        break;
      }

      case "LINE_UP_WAIT":
      case "TAKEOFF_CLEARED": {
        const rwy = state.airport.runways[ac.targetRunway];
        if (!rwy) break;
        const curAlong = alongRunwayNm(rwy, ac.x, ac.y);
        const lineupAlong = Math.max(0.03, Math.min(rwy.lengthNm - 0.5, curAlong));
        const targetPt = runwayPoint(rwy, lineupAlong, 0);
        const dist = Math.hypot(targetPt.x - ac.x, targetPt.y - ac.y);

        if (dist > 0.004) {
          ac.speed = 16;
          moveTowardPoint(ac, targetPt.x, targetPt.y, ac.speed, dt);
        } else {
          ac.x = targetPt.x;
          ac.y = targetPt.y;
          ac.heading = turnTowardHeading(ac.heading, rwy.heading, 90 * dt, "NEAREST");
          if (headingDiffDeg(ac.heading, rwy.heading) < 4) {
            ac.heading = rwy.heading;
            ac.speed = 0;
          }
        }
        break;
      }

      case "TAKEOFF_ROLL": {
        const rwy = state.airport.runways[ac.targetRunway];
        ac.heading = rwy.heading;
        ac.speed = Math.min(165, ac.speed + 14 * dt);
        const step = (ac.speed / 3600) * dt;
        const rad = (ac.heading * Math.PI) / 180;
        ac.x += Math.sin(rad) * step;
        ac.y += Math.cos(rad) * step;
        break;
      }

      case "REJECTED_TAKEOFF":
      case "BRAKING": {
        ac.speed = Math.max(0, ac.speed - 25 * dt);
        const step = (ac.speed / 3600) * dt;
        const rad = (ac.heading * Math.PI) / 180;
        ac.x += Math.sin(rad) * step;
        ac.y += Math.cos(rad) * step;
        break;
      }

      case "ROTATE": {
        ac.speed = Math.min(ac.assignedSpeed ?? 210, ac.speed + 10 * dt);
        ac.verticalSpeed = 1800;
        ac.altitude += (ac.verticalSpeed / 60) * dt;
        const step = (ac.speed / 3600) * dt;
        const rad = (ac.heading * Math.PI) / 180;
        ac.x += Math.sin(rad) * step;
        ac.y += Math.cos(rad) * step;
        break;
      }

      case "CLIMB":
      case "CRUISE_OUTBOUND":
      case "GO_AROUND":
      case "MISSED_APPROACH":
      case "APPROACH":
      case "FINAL":
      case "CLEARED_TO_LAND":
      case "LANDING": {
        integrateAirborneFlight(state, ac, dt, elev);
        break;
      }

      case "ROLLOUT": {
        const rwy = state.airport.runways[ac.assignedApproach ?? ac.targetRunway];
        if (!rwy) break;
        ac.heading = rwy.heading;
        ac.altitude = elev;
        ac.verticalSpeed = 0;
        const along = alongRunwayNm(rwy, ac.x, ac.y);
        let targetExitAlong = rwy.lengthNm;
        for (const eid of rwy.exitNodeIds) {
          const node = state.airport.nodes[eid];
          if (!node) continue;
          const ea = alongRunwayNm(rwy, node.x, node.y);
          if (ea >= along - 0.05) {
            targetExitAlong = ea;
            break;
          }
        }
        const distToExit = Math.max(0, targetExitAlong - along);
        const targetRolloutSpd = distToExit < 0.22 ? 22 : 58;
        if (ac.speed > targetRolloutSpd) {
          ac.speed = Math.max(targetRolloutSpd, ac.speed - 9.5 * dt);
        } else {
          ac.speed = targetRolloutSpd;
        }
        const step = (ac.speed / 3600) * dt;
        const nextPt = runwayPoint(rwy, along + step, 0);
        ac.x = nextPt.x;
        ac.y = nextPt.y;
        break;
      }

      case "VACATING_RUNWAY": {
        const exitId = ac.vacatingExitNodeId;
        if (!exitId || !state.airport.nodes[exitId]) {
          ac.speed = 0;
          break;
        }
        const exitNode = state.airport.nodes[exitId];
        ac.speed = 20;
        moveTowardPoint(ac, exitNode.x, exitNode.y, ac.speed, dt);
        break;
      }

      default:
        ac.speed = 0;
        break;
    }

    // Record radar trail periodically for airborne/moving radar tracks
    if (ac.speed > 5) {
      const last = ac.trail[ac.trail.length - 1];
      if (!last || Math.hypot(last.x - ac.x, last.y - ac.y) > 0.18) {
        ac.trail.push({ x: ac.x, y: ac.y });
        if (ac.trail.length > 24) ac.trail.shift();
      }
    }
  }
}

function integrateAirborneFlight(
  state: SimulationState,
  ac: Aircraft,
  dt: number,
  elev: number
): void {
  const rwyId = ac.assignedApproach ?? ac.targetRunway;
  const rwy = state.airport.runways[rwyId];

  // 1. Lateral Guidance (Strictly clearance-gated)
  if (
    ac.state === "CLEARED_TO_LAND" ||
    ac.state === "LANDING" ||
    (ac.state === "FINAL" && ac.assignedApproach)
  ) {
    // ILS Localizer tracking onto runway centerline along rwy.heading
    const crossErr = crossTrackRunwayNm(rwy, ac.x, ac.y);
    const interceptAngle = Math.max(-25, Math.min(25, crossErr * 45));
    const desiredHdg = normalizeHeading(rwy.heading + interceptAngle);
    ac.heading = turnTowardHeading(ac.heading, desiredHdg, 5 * dt, "NEAREST");
  } else if (
    ac.assignedDirectFix &&
    canAircraftExecuteAction(ac, "DIRECT_FIX", state).allowed
  ) {
    const fix = state.airport.fixes[ac.assignedDirectFix];
    if (fix) {
      const dist = Math.hypot(fix.x - ac.x, fix.y - ac.y);
      if (dist < 0.85 && ac.assignedApproach && fix.kind === "IAF") {
        ac.heading = turnTowardHeading(ac.heading, rwy.heading, 4.5 * dt, "NEAREST");
      } else {
        const targetHdg = bearingDeg(ac.x, ac.y, fix.x, fix.y);
        ac.heading = turnTowardHeading(ac.heading, targetHdg, 4 * dt, "NEAREST");
      }
    }
  } else if (
    ac.assignedHeading !== null &&
    canAircraftExecuteAction(ac, "CHANGE_HEADING", state).allowed
  ) {
    if (headingDiffDeg(ac.heading, ac.assignedHeading) > 0.5) {
      ac.heading = turnTowardHeading(
        ac.heading,
        ac.assignedHeading,
        4 * dt,
        ac.assignedTurnDirection
      );
      if (headingDiffDeg(ac.heading, ac.assignedHeading) <= 0.5) {
        ac.assignedTurnDirection = "NEAREST";
      }
    }
  }

  // 2. Vertical Guidance (Strictly clearance-gated)
  const along = alongRunwayNm(rwy, ac.x, ac.y);
  if (
    ac.state === "LANDING" ||
    (ac.state === "CLEARED_TO_LAND" && along >= -5.5)
  ) {
    const distToTouchdown = Math.max(0, 0.15 - along);
    const glideSlopeAlt = elev + distToTouchdown * 330;
    const altDiff = glideSlopeAlt - ac.altitude;
    if (Math.abs(altDiff) < 12) {
      ac.altitude = glideSlopeAlt;
      ac.verticalSpeed = -700;
    } else {
      const rate = Math.max(-1800, Math.min(600, altDiff * 4));
      ac.verticalSpeed = rate;
      ac.altitude = Math.max(elev, ac.altitude + (rate / 60) * dt);
    }
  } else if (ac.state === "FINAL") {
    // Glideslope down to Decision Minimums (elev + 250 ft) — NEVER lower without LAND clearance!
    const distToThreshold = Math.max(0, -along);
    const minAlt = elev + 250;
    const glideSlopeAlt = Math.max(minAlt, elev + distToThreshold * 315);
    if (ac.altitude > glideSlopeAlt + 15) {
      ac.verticalSpeed = -900;
      ac.altitude = Math.max(glideSlopeAlt, ac.altitude + (ac.verticalSpeed / 60) * dt);
    } else {
      ac.verticalSpeed = 0;
    }
  } else if (
    ac.assignedAltitude !== null &&
    canAircraftExecuteAction(ac, "CHANGE_ALTITUDE", state).allowed
  ) {
    const altDiff = ac.assignedAltitude - ac.altitude;
    if (Math.abs(altDiff) <= 15) {
      ac.altitude = ac.assignedAltitude;
      ac.verticalSpeed = 0;
    } else {
      const maxRate = ac.state === "GO_AROUND" ? 2400 : 1800;
      const vs = Math.sign(altDiff) * Math.min(maxRate, Math.abs(altDiff) * 3);
      ac.verticalSpeed = vs;
      ac.altitude += (vs / 60) * dt;
    }
  } else {
    ac.verticalSpeed = 0;
  }

  // 3. Speed Guidance
  let desiredSpeed = ac.speed;
  if (ac.state === "LANDING") {
    desiredSpeed = 135;
  } else if (ac.state === "CLEARED_TO_LAND" && along >= -3.5) {
    desiredSpeed = 145;
  } else if (ac.state === "FINAL") {
    desiredSpeed = ac.assignedSpeed ?? 155;
  } else if (
    ac.assignedSpeed !== null &&
    canAircraftExecuteAction(ac, "CHANGE_SPEED", state).allowed
  ) {
    desiredSpeed = ac.assignedSpeed;
  }

  const spdDiff = desiredSpeed - ac.speed;
  if (Math.abs(spdDiff) <= 0.5) {
    ac.speed = desiredSpeed;
  } else {
    ac.speed += Math.sign(spdDiff) * Math.min(Math.abs(spdDiff), 8 * dt);
  }

  // 4. Integrate horizontal position
  const stepNm = (ac.speed / 3600) * dt;
  const rad = (ac.heading * Math.PI) / 180;
  ac.x += Math.sin(rad) * stepNm;
  ac.y += Math.cos(rad) * stepNm;
}
