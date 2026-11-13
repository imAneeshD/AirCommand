import {
  getSuggestedTaxiRoutes,
  type SuggestedTaxiRoute,
} from "../data/asteriaAirport.ts";
import { findBlockingTrafficAhead } from "../engine/validationEngine.ts";
import type {
  Aircraft,
  AirportLayout,
  ClearanceCommandInput,
  SimulationState,
} from "../types/atc.ts";

export type GroundResolutionKind =
  | "AUTO_RESOLVE"
  | "REROUTE"
  | "PUSHBACK_STEP"
  | "WAIT_PASS";

export interface GroundConflictReport {
  isBlocked: boolean;
  isYieldWaiting: boolean;
  mutualDeadlock: boolean;
  blocker: Aircraft | null;
  reason: string;
  bypassRoute: SuggestedTaxiRoute | null;
  stepBackNodeId: string | null;
  stepBackLabel: string | null;
  recommendedAction: Exclude<GroundResolutionKind, "AUTO_RESOLVE"> | null;
}

function isSurfaceContender(ac: Aircraft | undefined, elevFt: number): ac is Aircraft {
  if (!ac) return false;
  if (ac.altitude > elevFt + 50) return false;
  return (
    ac.state !== "COMPLETED_ARRIVAL" &&
    ac.state !== "COMPLETED_DEPARTURE" &&
    ac.state !== "AT_GATE" &&
    ac.state !== "TAKEOFF_ROLL" &&
    ac.state !== "ROTATE" &&
    ac.state !== "LANDING"
  );
}

export function findBestStepBackNode(
  airport: AirportLayout,
  ac: Aircraft,
  blocker: Aircraft | null
): { nodeId: string; label: string } | null {
  const blockerDistFrom = (nx: number, ny: number) =>
    blocker ? Math.hypot(nx - blocker.x, ny - blocker.y) : Infinity;

  const curDistToBlocker = blocker ? Math.hypot(ac.x - blocker.x, ac.y - blocker.y) : 0;

  // 1. Prefer stepping back to prior route waypoint behind the current segment
  if (ac.assignedRouteNodeIds.length >= 2) {
    const candidateIdx = Math.max(0, ac.routeStepIndex - 1);
    const candIds = [ac.assignedRouteNodeIds[ac.routeStepIndex], ac.assignedRouteNodeIds[candidateIdx]];
    for (const nid of candIds) {
      if (!nid) continue;
      const node = airport.nodes[nid];
      if (!node || node.runwayId) continue;
      const dAc = Math.hypot(node.x - ac.x, node.y - ac.y);
      if (dAc < 0.008 || dAc > 0.25) continue;
      if (!blocker || blockerDistFrom(node.x, node.y) > curDistToBlocker + 0.01) {
        return { nodeId: node.id, label: node.label ?? node.id };
      }
    }
  }

  // 2. Otherwise search connected non-runway neighbors moving behind nose or away from blocker
  let anchorId = ac.currentNodeId;
  if (!anchorId || !airport.nodes[anchorId]) {
    let bestD = 0.09;
    for (const n of Object.values(airport.nodes)) {
      if (n.runwayId) continue;
      const d = Math.hypot(n.x - ac.x, n.y - ac.y);
      if (d < bestD) {
        bestD = d;
        anchorId = n.id;
      }
    }
  }
  if (!anchorId) return null;

  const rad = (ac.heading * Math.PI) / 180;
  const fwdX = Math.sin(rad);
  const fwdY = Math.cos(rad);

  let best: { nodeId: string; label: string; score: number } | null = null;
  for (const edge of airport.edges) {
    if (edge.from !== anchorId) continue;
    const target = airport.nodes[edge.to];
    if (!target || target.runwayId) continue;
    const dx = target.x - ac.x;
    const dy = target.y - ac.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.012 || dist > 0.28) continue;

    const backwardDot = -((dx * fwdX + dy * fwdY) / dist); // +1 = straight behind tail
    const blockerGain = blocker ? blockerDistFrom(target.x, target.y) - curDistToBlocker : 0;
    const score = backwardDot * 2 + blockerGain * 20;
    if (backwardDot > 0 || blockerGain > 0.015) {
      if (!best || score > best.score) {
        best = {
          nodeId: target.id,
          label: target.label ?? edge.taxiway ?? target.id,
          score,
        };
      }
    }
  }

  return best ? { nodeId: best.nodeId, label: best.label } : null;
}

export function findBestBypassRoute(
  sim: SimulationState,
  ac: Aircraft,
  blocker: Aircraft | null
): SuggestedTaxiRoute | null {
  if (ac.state === "AT_GATE" && ac.requiresPushback) return null;

  let startNodeId: string | undefined = ac.currentNodeId;
  let bestDist = Infinity;
  for (const n of Object.values(sim.airport.nodes)) {
    if (n.runwayId) continue;
    const d = Math.hypot(n.x - ac.x, n.y - ac.y);
    if (d < 0.085 && d < bestDist) {
      if (blocker && Math.hypot(n.x - blocker.x, n.y - blocker.y) < 0.03) continue;
      bestDist = d;
      startNodeId = n.id;
    }
  }
  if (!startNodeId && ac.state === "PUSHBACK_COMPLETE" && ac.gateId) {
    startNodeId = `PB_${ac.gateId}`;
  }
  if (!startNodeId) return null;

  const isArrivalToGate = ac.flightKind === "ARRIVAL";
  const routes = getSuggestedTaxiRoutes(
    sim.airport,
    startNodeId,
    ac.targetRunway,
    ac.gateId,
    isArrivalToGate,
    sim,
    ac.id
  );
  if (routes.length === 0) return null;

  const currentRemKey = ac.assignedRouteNodeIds.slice(ac.routeStepIndex).join(">");
  const clearAlt = routes.find(
    (r) => r.conflictLevel === "CLEAR" && r.nodeIds.join(">") !== currentRemKey
  );
  if (clearAlt) return clearAlt;

  const nonBlockedAlt = routes.find(
    (r) =>
      r.conflictLevel !== "BLOCKED" &&
      r.nodeIds.join(">") !== currentRemKey &&
      (!blocker || !r.conflictCallsigns.includes(blocker.callsign))
  );
  return nonBlockedAlt ?? null;
}

export function inspectGroundConflict(
  sim: SimulationState,
  ac: Aircraft
): GroundConflictReport | null {
  const elev = sim.airport.elevationFt;
  if (!isSurfaceContender(ac, elev)) return null;
  if (ac.state === "PUSHING_BACK" || ac.state === "PUSHBACK_APPROVED") return null;

  let blocker = findBlockingTrafficAhead(ac, sim, 0.08);
  if (!blocker && ac.yieldToAircraftId) {
    const candidate = sim.aircraft[ac.yieldToAircraftId];
    if (isSurfaceContender(candidate, elev)) {
      blocker = candidate;
    }
  }
  if (!blocker && (ac.state === "HOLD_POSITION" || ac.speed <= 3.5)) {
    // Also detect close lateral / nose congestion within 0.065 NM when paused on taxiway
    let nearest: Aircraft | null = null;
    let nearestDist = 0.065;
    for (const oid of sim.aircraftOrder) {
      if (oid === ac.id) continue;
      const other = sim.aircraft[oid];
      if (!isSurfaceContender(other, elev)) continue;
      const d = Math.hypot(other.x - ac.x, other.y - ac.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = other;
      }
    }
    blocker = nearest;
  }

  // Check if blocker is on a completely different taxiway corridor / branch
  if (blocker && ac.assignedRouteNodeIds && ac.assignedRouteNodeIds.length >= 2) {
    const startIdx = Math.max(0, ac.routeStepIndex);
    const endIdx = Math.min(ac.assignedRouteNodeIds.length - 1, startIdx + 2);
    let minPerpDist = Infinity;
    for (let i = startIdx; i < endIdx; i++) {
      const n1 = sim.airport.nodes[ac.assignedRouteNodeIds[i]];
      const n2 = sim.airport.nodes[ac.assignedRouteNodeIds[i + 1]];
      if (!n1 || !n2) continue;
      const segDx = n2.x - n1.x;
      const segDy = n2.y - n1.y;
      const segLenSq = segDx * segDx + segDy * segDy;
      if (segLenSq > 0.0000001) {
        const t = Math.max(0, Math.min(1, ((blocker.x - n1.x) * segDx + (blocker.y - n1.y) * segDy) / segLenSq));
        const projX = n1.x + t * segDx;
        const projY = n1.y + t * segDy;
        const perp = Math.hypot(blocker.x - projX, blocker.y - projY);
        if (perp < minPerpDist) {
          minPerpDist = perp;
        }
      }
    }
    // Standard taxiway corridor width is ~20m (0.0108 NM).
    // If perpendicular distance > 0.018 NM (~33m), it's on an adjacent parallel taxiway or different branch!
    if (minPerpDist > 0.018) {
      blocker = null;
    }
  }

  const isYieldWaiting = Boolean(ac.state === "HOLD_POSITION" && ac.yieldToAircraftId);
  const isTaxiingStopped =
    (ac.state === "TAXIING" || ac.state === "CROSSING_RUNWAY") &&
    Boolean(blocker) &&
    ac.speed <= 3.5;
  const isManualHoldWithBlocker = (ac.state === "HOLD_POSITION" || ac.state === "HOLDING_SHORT") && Boolean(blocker);

  if (!isYieldWaiting && !isTaxiingStopped && !isManualHoldWithBlocker) {
    return null;
  }

  const distToBlocker = blocker ? Math.hypot(blocker.x - ac.x, blocker.y - ac.y) : Infinity;

  // Strict User Rules:
  // 1. Only show traffic in taxiway when planes are coming in opposite direction to one another, or stopped/deadlocked ahead.
  // 2. Distance must be less than 100-200m (<= 0.108 NM).
  // 3. Do NOT show traffic if planes are moving in same direction with proper distance.
  const DIST_200M_NM = 200 / 1852; // ~0.108 NM
  const PROPER_FOLLOWING_DIST_NM = 75 / 1852; // ~0.04 NM

  if (distToBlocker > DIST_200M_NM && !isYieldWaiting) {
    return null;
  }

  const headingDiff = blocker
    ? Math.abs(((ac.heading - blocker.heading + 540) % 360) - 180)
    : 0;

  if (blocker && headingDiff < 70 && !isYieldWaiting) {
    // Same direction traffic with proper distance or normal moving flow
    if (distToBlocker >= PROPER_FOLLOWING_DIST_NM || blocker.speed > 3.5) {
      return null;
    }
  }

  const isOpposingOrIntersecting = headingDiff >= 70;
  const mutualDeadlock = Boolean(
    blocker &&
      distToBlocker <= 0.054 &&
      (isOpposingOrIntersecting || (blocker.speed <= 3.5 && ac.speed <= 3.5))
  );

  const bypassRoute = findBestBypassRoute(sim, ac, blocker);
  const stepBack = findBestStepBackNode(sim.airport, ac, blocker);

  const isBlocked = Boolean(blocker && distToBlocker <= DIST_200M_NM);

  const recommendedAction: GroundConflictReport["recommendedAction"] =
    bypassRoute && bypassRoute.conflictLevel === "CLEAR"
      ? "REROUTE"
      : mutualDeadlock && stepBack
      ? "PUSHBACK_STEP"
      : blocker
      ? "WAIT_PASS"
      : stepBack
      ? "PUSHBACK_STEP"
      : bypassRoute
      ? "REROUTE"
      : null;

  const reason = isYieldWaiting && blocker
    ? `Holding for ${blocker.callsign} to pass (auto-resumes once clear)`
    : mutualDeadlock && blocker
    ? `Nose-to-nose deadlock with ${blocker.callsign} (${Math.round(ac.speed)}kt / ${Math.round(blocker.speed)}kt)`
    : isBlocked && blocker
    ? `Blocked on taxiway by ${blocker.callsign} (${Math.round(blocker.speed)}kt)`
    : `Holding position on ground`;

  return {
    isBlocked,
    isYieldWaiting,
    mutualDeadlock,
    blocker,
    reason,
    bypassRoute,
    stepBackNodeId: stepBack?.nodeId ?? null,
    stepBackLabel: stepBack?.label ?? null,
    recommendedAction,
  };
}

export function getDeadlockedAircraftIds(sim: SimulationState): Set<string> {
  const out = new Set<string>();
  for (const id of sim.aircraftOrder) {
    const ac = sim.aircraft[id];
    if (!ac) continue;
    const report = inspectGroundConflict(sim, ac);
    if (report && (report.mutualDeadlock || (report.blocker && ac.speed <= 2))) {
      out.add(id);
    }
  }
  return out;
}

export function buildResolutionCommands(
  sim: SimulationState,
  ac: Aircraft,
  kind: GroundResolutionKind
): ClearanceCommandInput[] {
  const report = inspectGroundConflict(sim, ac);
  if (!report) return [];

  const chosen: Exclude<GroundResolutionKind, "AUTO_RESOLVE"> =
    kind === "AUTO_RESOLVE" ? report.recommendedAction ?? "WAIT_PASS" : kind;

  const commands: ClearanceCommandInput[] = [];

  if (chosen === "REROUTE" && report.bypassRoute) {
    commands.push({
      aircraftId: ac.id,
      controller: "GROUND",
      type: "TAXI",
      parameters: {
        runway: ac.targetRunway,
        routeTaxiways: report.bypassRoute.taxiways,
        destinationNodeId: report.bypassRoute.destinationNodeId,
        routeNodeIds: report.bypassRoute.nodeIds,
        immediate: true,
      },
    });
    return commands;
  }

  if (chosen === "PUSHBACK_STEP" && report.stepBackNodeId) {
    commands.push({
      aircraftId: ac.id,
      controller: "GROUND",
      type: "PUSHBACK",
      parameters: {
        stepBack: true,
        targetNodeId: report.stepBackNodeId,
        yieldToAircraftId: report.blocker?.id,
        immediate: true,
      },
    });
    // If blocker was stuck in HOLD_POSITION without an active roll, resume it past the cleared lane
    if (
      report.blocker &&
      report.blocker.state === "HOLD_POSITION" &&
      report.blocker.assignedRouteNodeIds.length >= 2 &&
      report.blocker.routeStepIndex < report.blocker.assignedRouteNodeIds.length - 1
    ) {
      const remNodes = report.blocker.assignedRouteNodeIds.slice(report.blocker.routeStepIndex);
      if (remNodes.length >= 2) {
        commands.push({
          aircraftId: report.blocker.id,
          controller: "GROUND",
          type: "TAXI",
          parameters: {
            runway: report.blocker.targetRunway,
            routeTaxiways: report.blocker.assignedRouteTaxiways,
            destinationNodeId: remNodes[remNodes.length - 1],
            routeNodeIds: remNodes,
            immediate: true,
          },
        });
      }
    }
    return commands;
  }

  if (chosen === "WAIT_PASS" && report.blocker) {
    commands.push({
      aircraftId: ac.id,
      controller: "GROUND",
      type: "HOLD_POSITION",
      parameters: {
        yieldToAircraftId: report.blocker.id,
        yieldToCallsign: report.blocker.spokenCallsign,
      },
    });
    if (
      report.blocker.state === "HOLD_POSITION" &&
      report.blocker.assignedRouteNodeIds.length >= 2 &&
      report.blocker.routeStepIndex < report.blocker.assignedRouteNodeIds.length - 1
    ) {
      const remNodes = report.blocker.assignedRouteNodeIds.slice(report.blocker.routeStepIndex);
      if (remNodes.length >= 2) {
        commands.push({
          aircraftId: report.blocker.id,
          controller: "GROUND",
          type: "TAXI",
          parameters: {
            runway: report.blocker.targetRunway,
            routeTaxiways: report.blocker.assignedRouteTaxiways,
            destinationNodeId: remNodes[remNodes.length - 1],
            routeNodeIds: remNodes,
            immediate: true,
          },
        });
      }
    }
  }

  return commands;
}
