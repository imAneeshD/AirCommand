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
  TaxiwayName,
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
  stepBackRouteNodeIds?: string[];
  stepBackLabel: string | null;
  recommendedAction: Exclude<GroundResolutionKind, "AUTO_RESOLVE"> | null;
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function distToBlockerForwardCorridor(
  px: number,
  py: number,
  blocker: Aircraft | null,
  airport: AirportLayout
): number {
  if (!blocker) return Infinity;

  let minDist = Infinity;

  // 1. If blocker has planned route ahead, check segments of the route
  if (blocker.assignedRouteNodeIds && blocker.assignedRouteNodeIds.length >= 2) {
    const startIdx = Math.max(0, blocker.routeStepIndex);
    const firstNode = airport.nodes[blocker.assignedRouteNodeIds[startIdx]];
    if (firstNode) {
      const d = distToSegment(px, py, blocker.x, blocker.y, firstNode.x, firstNode.y);
      if (d < minDist) minDist = d;
    }
    const endIdx = Math.min(blocker.assignedRouteNodeIds.length - 1, startIdx + 6);
    for (let i = startIdx; i < endIdx; i++) {
      const n1 = airport.nodes[blocker.assignedRouteNodeIds[i]];
      const n2 = airport.nodes[blocker.assignedRouteNodeIds[i + 1]];
      if (!n1 || !n2) continue;
      const d = distToSegment(px, py, n1.x, n1.y, n2.x, n2.y);
      if (d < minDist) minDist = d;
    }
  }

  // 2. Also check forward projection along blocker heading (at least 0.25 NM ahead)
  const bRad = (blocker.heading * Math.PI) / 180;
  const bFwdX = blocker.x + Math.sin(bRad) * 0.25;
  const bFwdY = blocker.y + Math.cos(bRad) * 0.25;
  const forwardRayDist = distToSegment(px, py, blocker.x, blocker.y, bFwdX, bFwdY);
  if (forwardRayDist < minDist) minDist = forwardRayDist;

  // Direct distance to blocker nose/center
  const directDist = Math.hypot(px - blocker.x, py - blocker.y);
  if (directDist < minDist) minDist = directDist;

  return minDist;
}

function getNodeConnectedNeighbors(
  nodeId: string,
  airport: AirportLayout
): Array<{ to: string; taxiway: TaxiwayName }> {
  const neighbors: Array<{ to: string; taxiway: TaxiwayName }> = [];
  const seen = new Set<string>();
  for (const e of airport.edges) {
    if (e.runwayCrossing) continue;
    if (e.from === nodeId && !seen.has(e.to)) {
      neighbors.push({ to: e.to, taxiway: e.taxiway });
      seen.add(e.to);
    }
    if (e.to === nodeId && !seen.has(e.from)) {
      neighbors.push({ to: e.from, taxiway: e.taxiway });
      seen.add(e.from);
    }
  }
  return neighbors;
}

function isIntersectionNode(nodeId: string, airport: AirportLayout): boolean {
  const neighbors = getNodeConnectedNeighbors(nodeId, airport);
  if (neighbors.length >= 3) return true;
  const twys = new Set(neighbors.map((n) => n.taxiway).filter(Boolean));
  return twys.size >= 2;
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
): { nodeId: string; routeNodeIds: string[]; label: string } | null {
  const curDistToBlocker = blocker ? Math.hypot(ac.x - blocker.x, ac.y - blocker.y) : 0;
  const SAFE_CLEARANCE_NM = 0.018; // ~33m lateral clearance from blocker corridor
  const MAX_STEP_BACK_NM = 0.12; // Keep pushback localized to nearest intersection within ~220m

  const rad = (ac.heading * Math.PI) / 180;
  const fwdX = Math.sin(rad);
  const fwdY = Math.cos(rad);

  // 1. First priority: Check immediate prior waypoints along aircraft's own route
  if (ac.assignedRouteNodeIds.length >= 2) {
    const curIdx = Math.max(0, ac.routeStepIndex);
    const backtrackPath: string[] = [];
    for (let i = curIdx - 1; i >= 0; i--) {
      const nid = ac.assignedRouteNodeIds[i];
      if (!nid) continue;
      const node = airport.nodes[nid];
      if (!node || node.runwayId) continue;

      const dFromAc = Math.hypot(node.x - ac.x, node.y - ac.y);
      if (dFromAc > MAX_STEP_BACK_NM) break;
      backtrackPath.push(nid);

      // Check if this prior route node is an intersection/junction
      if (isIntersectionNode(nid, airport)) {
        const neighbors = getNodeConnectedNeighbors(nid, airport);
        for (const nbr of neighbors) {
          const bNode = airport.nodes[nbr.to];
          if (!bNode || bNode.runwayId) continue;
          if (backtrackPath.includes(bNode.id)) continue;

          const latDist = distToBlockerForwardCorridor(bNode.x, bNode.y, blocker, airport);
          const distToB = Math.hypot(bNode.x - ac.x, bNode.y - ac.y);

          if (latDist >= SAFE_CLEARANCE_NM && distToB <= MAX_STEP_BACK_NM) {
            return {
              nodeId: bNode.id,
              routeNodeIds: [...backtrackPath, bNode.id],
              label: bNode.label ?? nbr.taxiway ?? `Intersection TWY ${nbr.taxiway ?? ""}`,
            };
          }
        }
      }

      // Or if the prior node itself is already laterally clear of blocker's corridor
      const nodeLatDist = distToBlockerForwardCorridor(node.x, node.y, blocker, airport);
      if (nodeLatDist >= SAFE_CLEARANCE_NM && dFromAc >= 0.008) {
        return {
          nodeId: node.id,
          routeNodeIds: [...backtrackPath],
          label: node.label ?? `Intersection ${node.id}`,
        };
      }
    }
  }

  // 2. Second priority: Local BFS search backwards (within MAX_STEP_BACK_NM)
  let anchorId = ac.currentNodeId;
  if (!anchorId || !airport.nodes[anchorId]) {
    let bestD = 0.08;
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

  interface SearchNode {
    id: string;
    path: string[];
    dist: number;
  }

  const queue: SearchNode[] = [{ id: anchorId, path: [anchorId], dist: 0 }];
  const visited = new Set<string>([anchorId]);

  let bestBranchSolution: { nodeId: string; routeNodeIds: string[]; label: string; score: number } | null = null;
  let bestFallbackSolution: { nodeId: string; routeNodeIds: string[]; label: string; score: number } | null = null;

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.dist > MAX_STEP_BACK_NM) continue;

    const curNode = airport.nodes[cur.id];
    if (!curNode) continue;

    const neighbors = getNodeConnectedNeighbors(cur.id, airport);

    if (isIntersectionNode(cur.id, airport)) {
      for (const nbr of neighbors) {
        if (cur.path.includes(nbr.to)) continue;
        const bNode = airport.nodes[nbr.to];
        if (!bNode || bNode.runwayId) continue;

        const latDist = distToBlockerForwardCorridor(bNode.x, bNode.y, blocker, airport);
        const distFromAc = Math.hypot(bNode.x - ac.x, bNode.y - ac.y);

        if (latDist >= SAFE_CLEARANCE_NM && distFromAc <= MAX_STEP_BACK_NM) {
          const score = latDist * 100 - distFromAc * 10;
          if (!bestBranchSolution || score > bestBranchSolution.score) {
            const cleanPath = cur.path[0] === anchorId ? cur.path.slice(1) : cur.path;
            bestBranchSolution = {
              nodeId: bNode.id,
              routeNodeIds: [...cleanPath, bNode.id],
              label: bNode.label ?? nbr.taxiway ?? `Intersection TWY ${nbr.taxiway ?? ""}`,
              score,
            };
          }
        }
      }
    }

    for (const nbr of neighbors) {
      if (visited.has(nbr.to)) continue;
      const target = airport.nodes[nbr.to];
      if (!target || target.runwayId) continue;

      const dx = target.x - ac.x;
      const dy = target.y - ac.y;
      const distFromAc = Math.hypot(dx, dy);
      if (distFromAc > MAX_STEP_BACK_NM) continue;

      const backwardDot = -((dx * fwdX + dy * fwdY) / Math.max(0.001, distFromAc));
      const latDist = distToBlockerForwardCorridor(target.x, target.y, blocker, airport);
      const blockerDist = blocker ? Math.hypot(target.x - blocker.x, target.y - blocker.y) : Infinity;

      if (backwardDot >= -0.2 || blockerDist > curDistToBlocker + 0.008) {
        visited.add(nbr.to);
        const nextDist = cur.dist + Math.hypot(target.x - curNode.x, target.y - curNode.y);
        queue.push({
          id: nbr.to,
          path: [...cur.path, nbr.to],
          dist: nextDist,
        });

        const fallbackScore = latDist * 40 + blockerDist * 20 - distFromAc * 10;
        if (!bestFallbackSolution || fallbackScore > bestFallbackSolution.score) {
          const cleanPath = cur.path[0] === anchorId ? cur.path.slice(1) : cur.path;
          bestFallbackSolution = {
            nodeId: target.id,
            routeNodeIds: [...cleanPath, target.id],
            label: target.label ?? nbr.taxiway ?? target.id,
            score: fallbackScore,
          };
        }
      }
    }
  }

  if (bestBranchSolution) {
    return {
      nodeId: bestBranchSolution.nodeId,
      routeNodeIds: bestBranchSolution.routeNodeIds,
      label: bestBranchSolution.label,
    };
  }

  // 3. Fallback: immediate prior route waypoint
  if (ac.assignedRouteNodeIds.length >= 2) {
    const candidateIdx = Math.max(0, ac.routeStepIndex - 1);
    const candIds = [ac.assignedRouteNodeIds[candidateIdx], ac.assignedRouteNodeIds[ac.routeStepIndex]];
    for (const nid of candIds) {
      if (!nid) continue;
      const node = airport.nodes[nid];
      if (!node || node.runwayId) continue;
      const dAc = Math.hypot(node.x - ac.x, node.y - ac.y);
      if (dAc < 0.008 || dAc > 0.25) continue;
      return { nodeId: node.id, routeNodeIds: [node.id], label: node.label ?? node.id };
    }
  }

  return bestFallbackSolution
    ? {
        nodeId: bestFallbackSolution.nodeId,
        routeNodeIds: bestFallbackSolution.routeNodeIds,
        label: bestFallbackSolution.label,
      }
    : null;
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
    stepBackRouteNodeIds: stepBack?.routeNodeIds,
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
        routeNodeIds: report.stepBackRouteNodeIds ?? [report.stepBackNodeId],
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
