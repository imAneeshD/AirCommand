import {
  alongRunwayNm,
  crossTrackRunwayNm,
  headingDiffDeg,
  runwayPoint,
} from "../data/asteriaAirport.ts";
import type { Aircraft, RunwayId, SimulationState } from "../types/atc.ts";
import { computeDepAppGuidance } from "../utils/depAppGuidance.ts";
import { completeClearancesOfType } from "./clearanceEngine.ts";
import {
  canAircraftExecuteAction,
  canAircraftMove,
  findBlockingTrafficAhead,
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

    // Auto-resume traffic yield once the yielded aircraft has passed clear
    if (ac.state === "HOLD_POSITION" && ac.yieldToAircraftId && ac.altitude <= elev + 50) {
      const blocker = state.aircraft[ac.yieldToAircraftId];
      const distToBlocker = blocker ? Math.hypot(blocker.x - ac.x, blocker.y - ac.y) : Infinity;
      const blockerGone =
        !blocker ||
        blocker.state === "COMPLETED_ARRIVAL" ||
        blocker.state === "COMPLETED_DEPARTURE" ||
        blocker.altitude > elev + 50;
      const blockerPassed =
        blockerGone ||
        distToBlocker >= 0.085 ||
        (distToBlocker >= 0.06 &&
          !findBlockingTrafficAhead(ac, state, 0.068) &&
          state.time - ac.stateEnteredAt >= 2.0);
      if (blockerPassed) {
        ac.yieldToAircraftId = undefined;
        ac.holdingShortReason = undefined;
        if (
          ac.assignedRouteNodeIds.length >= 2 &&
          ac.routeStepIndex < ac.assignedRouteNodeIds.length - 1 &&
          canAircraftExecuteAction(ac, "TAXI", state).allowed
        ) {
          ac.state = "TAXIING";
          ac.stateEnteredAt = state.time;
        }
      }
    }

    // HARD SAFETY INVARIANT: No movement without valid clearance (or braking stop)
    if (!canAircraftMove(ac, state)) {
      ac.speed = 0;
      ac.verticalSpeed = 0;
      if (ac.altitude <= elev + 12) {
        ac.altitude = elev;
      }
      continue;
    }

    switch (ac.state) {
      case "PUSHING_BACK": {
        ac.altitude = elev;
        ac.verticalSpeed = 0;

        // Taxiway step-back / pull-back resolution (clearing an intersection deadlock)
        if (ac.stepBackTargetNodeId || (ac.stepBackRouteNodeIds && ac.stepBackRouteNodeIds.length > 0)) {
          if (!ac.stepBackRouteNodeIds || ac.stepBackRouteNodeIds.length === 0) {
            if (ac.stepBackTargetNodeId) {
              ac.stepBackRouteNodeIds = [ac.stepBackTargetNodeId];
            }
          }

          const nextNodeId = ac.stepBackRouteNodeIds?.[0] ?? ac.stepBackTargetNodeId;
          const targetNode = nextNodeId ? state.airport.nodes[nextNodeId] : undefined;

          if (!targetNode) {
            ac.stepBackTargetNodeId = undefined;
            ac.stepBackRouteNodeIds = undefined;
            ac.speed = 0;
            ac.state = "HOLD_POSITION";
            ac.stateEnteredAt = state.time;
            break;
          }

          ac.speed = 10;
          const dx = targetNode.x - ac.x;
          const dy = targetNode.y - ac.y;
          const dist = Math.hypot(dx, dy);
          const step = (ac.speed / 3600) * dt;

          if (dist <= Math.max(step, 0.003)) {
            ac.x = targetNode.x;
            ac.y = targetNode.y;
            ac.currentNodeId = targetNode.id;

            if (ac.stepBackRouteNodeIds && ac.stepBackRouteNodeIds.length > 1) {
              ac.stepBackRouteNodeIds.shift();
              ac.stepBackTargetNodeId = ac.stepBackRouteNodeIds[0];
            } else {
              ac.speed = 0;
              ac.stepBackTargetNodeId = undefined;
              ac.stepBackRouteNodeIds = undefined;
              completeClearancesOfType(ac, "PUSHBACK");

              // Orient heading cleanly with connected taxiway branch edge
              const connectedEdges = state.airport.edges.filter(
                (e) => (e.from === targetNode.id || e.to === targetNode.id) && !e.runwayCrossing
              );
              if (connectedEdges.length > 0) {
                const otherEndId = connectedEdges[0].from === targetNode.id ? connectedEdges[0].to : connectedEdges[0].from;
                const otherEnd = state.airport.nodes[otherEndId];
                if (otherEnd) {
                  const edgeAngle = ((Math.atan2(otherEnd.x - targetNode.x, otherEnd.y - targetNode.y) * 180) / Math.PI + 360) % 360;
                  ac.heading = edgeAngle;
                }
              }

              const idxInRoute = ac.assignedRouteNodeIds.indexOf(targetNode.id);
              if (idxInRoute >= 0) {
                ac.routeStepIndex = idxInRoute;
              } else if (ac.assignedRouteNodeIds.length > 0) {
                const firstNext = ac.assignedRouteNodeIds[0];
                const edgeExists = state.airport.edges.some(
                  (e) => e.from === targetNode.id && e.to === firstNext
                );
                if (edgeExists) {
                  ac.assignedRouteNodeIds = [targetNode.id, ...ac.assignedRouteNodeIds];
                  ac.routeStepIndex = 0;
                }
              }

              ac.state = "HOLD_POSITION";
              ac.holdingShortReason = "TRAFFIC";
              ac.stateEnteredAt = state.time;
            }
          } else {
            ac.x += (dx / dist) * step;
            ac.y += (dy / dist) * step;
          }
          break;
        }

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
        // Turn nose smoothly toward outbound taxiway direction while pushing tail-first onto alley
        const rwy = state.airport.runways[ac.targetRunway];
        const pbTwEdge = state.airport.edges.find(
          (e) => e.from === spot.id && !e.to.startsWith("GATE_")
        );
        const pbTwNode = pbTwEdge ? state.airport.nodes[pbTwEdge.to] : undefined;
        const outboundHdg = pbTwNode
          ? bearingDeg(spot.x, spot.y, pbTwNode.x, pbTwNode.y)
          : rwy
          ? normalizeHeading((rwy.heading + 180) % 360)
          : spot.isNorthSide
          ? 270
          : 90;

        if (dist <= Math.max(step, 0.003)) {
          ac.x = spot.x;
          ac.y = spot.y;
          ac.currentNodeId = spot.id;
          ac.heading = outboundHdg;
          ac.speed = 0;
          completeClearancesOfType(ac, "PUSHBACK");
          ac.state = "PUSHBACK_COMPLETE";
          ac.stateEnteredAt = state.time;
        } else {
          ac.heading = turnTowardHeading(ac.heading, outboundHdg, 14 * dt, "NEAREST");
          ac.x += (dx / dist) * step;
          ac.y += (dy / dist) * step;
        }
        break;
      }

      case "HOLD_POSITION": {
        // Safety invariant: never freeze or snap an airborne aircraft to ground elevation
        if (ac.altitude > elev + 50) {
          ac.state = "GO_AROUND";
          ac.stateEnteredAt = state.time;
          ac.assignedAltitude = ac.assignedAltitude ?? Math.round(elev / 500) * 500 + 2200;
          ac.assignedSpeed = Math.max(190, ac.speed);
          integrateAirborneFlight(state, ac, dt, elev);
          break;
        }
        ac.altitude = elev;
        ac.verticalSpeed = 0;
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
        ac.altitude = elev;
        ac.verticalSpeed = 0;
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

          // If we just finished crossing a runway onto the opposite side,
          // consume that single crossing clearance and return to TAXIING if more route left.
          if (
            ac.state === "CROSSING_RUNWAY" &&
            (curNode.runwayId || crossingRwy) &&
            !nextNode.runwayId
          ) {
            if (curNode.runwayId) {
              ac.crossRunwayCleared[curNode.runwayId] = false;
            }
            if (crossingRwy) {
              ac.crossRunwayCleared[crossingRwy] = false;
            }
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
              // Face toward the connected runway entry node
              const adjRwyEdge = state.airport.edges.find(
                (e) =>
                  e.from === nextNode.id &&
                  state.airport.nodes[e.to]?.runwayId === ac.targetRunway
              );
              const entryId = adjRwyEdge
                ? adjRwyEdge.to
                : `RWY_${ac.targetRunway}_${nextNode.id.split("_")[2]}`;
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
        ac.altitude = elev;
        ac.verticalSpeed = 0;
        const rwy = state.airport.runways[ac.targetRunway];
        if (!rwy) break;
        const curAlong = alongRunwayNm(rwy, ac.x, ac.y);
        const curCross = Math.abs(crossTrackRunwayNm(rwy, ac.x, ac.y));
        const leadDist = curCross > 0.008 ? Math.min(0.035, curCross * 0.6) : 0;
        const lineupAlong = Math.max(0.03, Math.min(rwy.lengthNm - 0.5, curAlong + leadDist));
        const targetPt = runwayPoint(rwy, lineupAlong, 0);

        if (curCross > 0.004) {
          ac.speed = 16;
          moveTowardPoint(ac, targetPt.x, targetPt.y, ac.speed, dt);
        } else {
          const centerPt = runwayPoint(rwy, Math.max(0.03, Math.min(rwy.lengthNm - 0.5, curAlong)), 0);
          ac.x = centerPt.x;
          ac.y = centerPt.y;
          ac.heading = turnTowardHeading(ac.heading, rwy.heading, 110 * dt, "NEAREST");
          if (headingDiffDeg(ac.heading, rwy.heading) < 4) {
            ac.heading = rwy.heading;
            ac.speed = 0;
          } else {
            ac.speed = Math.max(0, ac.speed - 24 * dt);
          }
        }
        break;
      }

      case "TAKEOFF_ROLL": {
        const rwy = state.airport.runways[ac.targetRunway];
        if (!rwy) break;
        ac.heading = rwy.heading;
        ac.altitude = elev;
        ac.verticalSpeed = 0;
        const accel = ac.wakeCategory === "HEAVY" ? 9.8 : 10.8;
        ac.speed = Math.min(168, ac.speed + accel * dt);
        const step = (ac.speed / 3600) * dt;
        const rad = (ac.heading * Math.PI) / 180;
        ac.x += Math.sin(rad) * step;
        ac.y += Math.cos(rad) * step;
        break;
      }

      case "REJECTED_TAKEOFF":
      case "BRAKING": {
        ac.altitude = elev;
        ac.verticalSpeed = 0;
        ac.speed = Math.max(0, ac.speed - 25 * dt);
        const step = (ac.speed / 3600) * dt;
        const rad = (ac.heading * Math.PI) / 180;
        ac.x += Math.sin(rad) * step;
        ac.y += Math.cos(rad) * step;
        break;
      }

      case "ROTATE": {
        const rotElapsed = Math.max(0, state.time - ac.stateEnteredAt);
        const v2 = ac.assignedSpeed ?? (ac.wakeCategory === "HEAVY" ? 166 : 158);
        ac.speed = Math.min(v2, ac.speed + 6.5 * dt);
        if (rotElapsed < 0.85) {
          // Initial nose-up rotation on main wheels prior to positive liftoff
          ac.altitude = elev;
          ac.verticalSpeed = 0;
        } else {
          ac.verticalSpeed = Math.min(1550, ac.verticalSpeed + 950 * dt);
          ac.altitude += (ac.verticalSpeed / 60) * dt;
        }
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
        ac.heading = turnTowardHeading(ac.heading, rwy.heading, 45 * dt, "NEAREST");
        ac.altitude = elev;
        ac.verticalSpeed = 0;
        const along = alongRunwayNm(rwy, ac.x, ac.y);
        const cross = crossTrackRunwayNm(rwy, ac.x, ac.y);

        // Runway collision avoidance: emergency braking if another aircraft is ahead on the same runway strip
        const opposingTrafficAhead = state.aircraftOrder.some((oid) => {
          if (oid === ac.id) return false;
          const other = state.aircraft[oid];
          if (!other || other.altitude > elev + 50) return false;
          if (other.state === "COMPLETED_ARRIVAL" || other.state === "COMPLETED_DEPARTURE") return false;
          const distNm = Math.hypot(other.x - ac.x, other.y - ac.y);
          if (distNm > 0.45) return false;
          const otherAlong = alongRunwayNm(rwy, other.x, other.y);
          const otherCross = Math.abs(crossTrackRunwayNm(rwy, other.x, other.y));
          return otherCross < 0.04 && otherAlong > along && otherAlong - along < 0.45;
        });

        if (opposingTrafficAhead) {
          ac.speed = Math.max(0, ac.speed - 35 * dt);
          if (ac.speed < 1) {
            ac.speed = 0;
            ac.state = "STOPPED_ON_RUNWAY";
          }
          break;
        }

        let targetExitAlong = rwy.lengthNm - 0.05;
        const assignedNode = ac.vacateAssignedRwyNodeId
          ? state.airport.nodes[ac.vacateAssignedRwyNodeId]
          : undefined;
        if (assignedNode) {
          targetExitAlong = alongRunwayNm(rwy, assignedNode.x, assignedNode.y);
        } else {
          const forwardExits = rwy.exitNodeIds
            .map((eid) => state.airport.nodes[eid])
            .filter((n): n is NonNullable<typeof n> => Boolean(n))
            .map((n) => alongRunwayNm(rwy, n.x, n.y))
            .filter((ea) => ea >= along + 0.02)
            .sort((a, b) => a - b);
          if (forwardExits.length > 0) {
            targetExitAlong = forwardExits[0];
          }
        }

        const distToExit = Math.max(0, targetExitAlong - along);
        const expedite = Boolean(ac.expediteVacate);
        const targetRolloutSpd =
          distToExit < 0.09 ? (expedite ? 32 : 24) : expedite ? 74 : 62;
        if (ac.speed > targetRolloutSpd) {
          const brakeRate = ac.speed > 55 ? 16 : 11;
          ac.speed = Math.max(targetRolloutSpd, ac.speed - brakeRate * dt);
        } else if (ac.speed < targetRolloutSpd) {
          ac.speed = Math.min(targetRolloutSpd, ac.speed + 10 * dt);
        }
        const step = (ac.speed / 3600) * dt;
        const nextAlong = Math.min(rwy.lengthNm - 0.04, along + step);
        const smoothCross = Math.abs(cross) < 0.002 ? 0 : cross * Math.max(0, 1 - 3.5 * dt);
        const nextPt = runwayPoint(rwy, nextAlong, smoothCross);
        ac.x = nextPt.x;
        ac.y = nextPt.y;
        break;
      }

      case "VACATING_RUNWAY": {
        ac.altitude = elev;
        ac.verticalSpeed = 0;
        const exitId = ac.vacatingExitNodeId;
        if (!exitId || !state.airport.nodes[exitId]) {
          ac.speed = 0;
          break;
        }
        const exitNode = state.airport.nodes[exitId];
        ac.speed = ac.expediteVacate ? 30 : 20;
        moveTowardPoint(ac, exitNode.x, exitNode.y, ac.speed, dt);
        break;
      }

      default:
        ac.speed = 0;
        ac.verticalSpeed = 0;
        if (ac.altitude <= elev + 12) {
          ac.altitude = elev;
        }
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
    const interceptAngle = Math.max(-28, Math.min(28, crossErr * 55));
    const desiredHdg = normalizeHeading(rwy.heading + interceptAngle);
    ac.heading = turnTowardHeading(ac.heading, desiredHdg, 8 * dt, "NEAREST");
  } else if (
    ac.assignedDirectFix &&
    canAircraftExecuteAction(ac, "DIRECT_FIX", state).allowed
  ) {
    const fix = state.airport.fixes[ac.assignedDirectFix];
    if (fix) {
      const dist = Math.hypot(fix.x - ac.x, fix.y - ac.y);
      if (dist < 1.2 && ac.flightKind === "DEPARTURE") {
        // Departure fix reached! Proceed outbound en route instead of circling around the waypoint
        ac.assignedDirectFix = null;
        ac.assignedHeading = ac.heading;
        ac.state = "CRUISE_OUTBOUND";
      } else if (dist < 1.1 && ac.assignedApproach && fix.kind === "IAF") {
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
  } else if (
    ac.flightKind === "DEPARTURE" &&
    (ac.state === "CLIMB" || ac.state === "CRUISE_OUTBOUND")
  ) {
    // If no heading assigned, keep tracking outbound on runway heading away from airfield
    const outboundHdg = rwy?.heading ?? ac.heading;
    ac.heading = turnTowardHeading(ac.heading, outboundHdg, 4 * dt, "NEAREST");
  } else if (
    (ac.state === "GO_AROUND" || ac.state === "MISSED_APPROACH" || ac.state === "APPROACH") &&
    ac.assignedHeading === null &&
    !ac.assignedDirectFix
  ) {
    const missedFix = state.airport.fixes["MISSED"];
    const agl = Math.max(0, ac.altitude - elev);
    if (ac.state === "GO_AROUND" && agl < 1200) {
      // Initial straight-out TOGA climb on runway centerline
      const gaHdg = rwy?.heading ?? ac.heading;
      ac.heading = turnTowardHeading(ac.heading, gaHdg, 4 * dt, "NEAREST");
    } else if (missedFix && ac.state === "MISSED_APPROACH" && agl < 1800) {
      const tgtHdg = bearingDeg(ac.x, ac.y, missedFix.x, missedFix.y);
      ac.heading = turnTowardHeading(ac.heading, tgtHdg, 4 * dt, "NEAREST");
    } else {
      // Re-sequencing or pattern recovery toward downwind gate or IAF
      const guidance = computeDepAppGuidance(state.airport, ac, rwyId);
      ac.heading = turnTowardHeading(
        ac.heading,
        guidance.recommendedHeading,
        4 * dt,
        guidance.recommendedTurnDirection
      );
    }
  }

  // Intercept and lock onto ILS localizer when returning on approach
  if (ac.flightKind === "ARRIVAL" && ac.state === "APPROACH" && rwy) {
    const alongApp = alongRunwayNm(rwy, ac.x, ac.y);
    const crossApp = crossTrackRunwayNm(rwy, ac.x, ac.y);
    if (
      alongApp >= -12.0 &&
      alongApp <= -0.8 &&
      Math.abs(crossApp) <= 0.45 &&
      headingDiffDeg(ac.heading, rwy.heading) <= 45
    ) {
      ac.assignedApproach = rwy.id;
      ac.state = "FINAL";
      ac.stateEnteredAt = state.time;
      ac.assignedHeading = null;
    }
  }

  // 2. Vertical Guidance (Unified 3-degree ILS Glideslope & Smooth Climb Profile)
  const along = alongRunwayNm(rwy, ac.x, ac.y);
  const tdzAlong = rwy ? Math.min(0.22, rwy.lengthNm * 0.14) : 0.15;
  const distToTdz = Math.max(0, tdzAlong - along);
  const glideSlopeAlt = elev + distToTdz * 318; // 3-degree ILS (~318 ft/NM)
  const agl = Math.max(0, ac.altitude - elev);

  const smoothSetVs = (targetVs: number, maxStepPerSec = 700) => {
    const dv = targetVs - ac.verticalSpeed;
    const maxStep = maxStepPerSec * dt;
    if (Math.abs(dv) <= maxStep) ac.verticalSpeed = targetVs;
    else ac.verticalSpeed += Math.sign(dv) * maxStep;
  };

  if (
    ac.state === "LANDING" ||
    (ac.state === "CLEARED_TO_LAND" && along >= -5.5)
  ) {
    if (ac.altitude < glideSlopeAlt - 25 && along < -0.35) {
      // Hold altitude level to capture the 3° glidepath from below rather than diving early
      smoothSetVs(0);
    } else if (distToTdz <= 0.12 && agl <= 55) {
      // Smooth landing flare down onto touchdown elevation
      const flareVs = -Math.max(180, agl * 4.5);
      smoothSetVs(flareVs, 950);
    } else {
      const ideal3Deg = -318 * (Math.max(115, ac.speed) / 60);
      const errCorrection = (glideSlopeAlt - ac.altitude) * 3.5;
      const targetVs = Math.max(-1850, Math.min(100, ideal3Deg + errCorrection));
      smoothSetVs(targetVs);
    }
    ac.altitude = Math.max(elev, ac.altitude + (ac.verticalSpeed / 60) * dt);
  } else if (ac.state === "FINAL") {
    // Glideslope down to Decision Minimums (elev + 250 ft) — NEVER lower without LAND clearance!
    const targetFinalAlt = Math.max(elev + 250, glideSlopeAlt);
    if (ac.altitude > targetFinalAlt + 15) {
      const ideal3Deg = -318 * (Math.max(125, ac.speed) / 60);
      const excess = ac.altitude - targetFinalAlt;
      const targetVs = -Math.min(1750, Math.max(-ideal3Deg, excess * 3.2));
      smoothSetVs(targetVs);
      ac.altitude = Math.max(targetFinalAlt, ac.altitude + (ac.verticalSpeed / 60) * dt);
    } else {
      smoothSetVs(0);
    }
  } else {
    const defaultAirAlt = Math.round((elev + 3000) / 500) * 500;
    const targetAlt =
      ac.assignedAltitude !== null &&
      ac.assignedAltitude >= elev + 400 &&
      (ac.state === "GO_AROUND" ||
        ac.state === "MISSED_APPROACH" ||
        canAircraftExecuteAction(ac, "CHANGE_ALTITUDE", state).allowed)
        ? ac.assignedAltitude
        : ac.state === "GO_AROUND" || ac.state === "MISSED_APPROACH"
        ? defaultAirAlt
        : ac.state === "CLIMB"
        ? defaultAirAlt
        : ac.state === "APPROACH"
        ? defaultAirAlt
        : null;

    if (targetAlt !== null) {
      const altDiff = targetAlt - ac.altitude;
      if (Math.abs(altDiff) <= 15) {
        ac.altitude = targetAlt;
        smoothSetVs(0);
      } else {
        if ((ac.state === "GO_AROUND" || ac.state === "MISSED_APPROACH") && ac.verticalSpeed < 1200) {
          // Immediate TOGA go-around climb rate: arrest descent instantaneously
          ac.verticalSpeed = 1600;
        }
        const maxRate = ac.state === "GO_AROUND" ? 2400 : ac.state === "CLIMB" ? 2100 : 1800;
        const targetVs = Math.sign(altDiff) * Math.min(maxRate, Math.max(300, Math.abs(altDiff) * 3.2));
        smoothSetVs(targetVs, ac.state === "GO_AROUND" ? 1400 : 650);
        if (ac.state === "GO_AROUND" || ac.state === "MISSED_APPROACH") {
          // Go-around altitude must strictly climb and never descend into terrain
          ac.altitude = Math.max(ac.altitude, ac.altitude + (Math.max(600, ac.verticalSpeed) / 60) * dt);
        } else {
          ac.altitude = Math.max(elev, ac.altitude + (ac.verticalSpeed / 60) * dt);
        }
      }
    } else {
      smoothSetVs(0);
    }
  }

  // 3. Speed Guidance (Synced with Flight Phase & Distance)
  const vref = ac.wakeCategory === "HEAVY" ? 144 : 136;
  let desiredSpeed = ac.speed;
  if (ac.state === "LANDING") {
    desiredSpeed = agl <= 55 ? vref - 4 : vref;
  } else if (ac.state === "CLEARED_TO_LAND" && along >= -6.0) {
    desiredSpeed = along > -2.2 ? vref + 4 : along > -4.2 ? 156 : 172;
  } else if (ac.state === "FINAL") {
    desiredSpeed = ac.assignedSpeed ?? (along > -2.5 ? vref + 8 : 162);
  } else if (
    ac.assignedSpeed !== null &&
    canAircraftExecuteAction(ac, "CHANGE_SPEED", state).allowed
  ) {
    desiredSpeed = ac.assignedSpeed;
  } else if (ac.state === "GO_AROUND" || ac.state === "MISSED_APPROACH") {
    desiredSpeed = Math.max(190, ac.assignedSpeed ?? 190);
  } else if (ac.state === "CLIMB" || ac.state === "CRUISE_OUTBOUND") {
    // Natural jet climb acceleration schedule when no explicit speed restriction assigned
    desiredSpeed = agl < 1200 ? 178 : agl < 3000 ? 215 : 250;
  }

  const spdDiff = desiredSpeed - ac.speed;
  const maxSpdStep = 7.5 * dt;
  if (Math.abs(spdDiff) <= maxSpdStep) {
    ac.speed = desiredSpeed;
  } else {
    ac.speed += Math.sign(spdDiff) * maxSpdStep;
  }

  // 4. Integrate horizontal position
  const stepNm = (ac.speed / 3600) * dt;
  const rad = (ac.heading * Math.PI) / 180;
  ac.x += Math.sin(rad) * stepNm;
  ac.y += Math.cos(rad) * stepNm;
}
