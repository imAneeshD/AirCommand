export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LabelCandidateInput {
  id: string;
  ax: number;
  ay: number;
  boxW: number;
  boxH: number;
  preferredAbove: boolean;
  /** Controls which label gets first pick of prime closest slots (keep stable across hover!). */
  priority: number;
  /** Controls final paint order (higher renders last on top; defaults to priority). */
  drawPriority?: number;
}

export interface IconObstacle {
  id: string;
  ax: number;
  ay: number;
}

export interface PlacedLabel {
  id: string;
  rect: ScreenRect;
  leaderStartX: number;
  leaderStartY: number;
  leaderEndX: number;
  leaderEndY: number;
  priority: number;
}

export interface DrawnLabelHit {
  id: string;
  rect: ScreenRect;
}

function clamp(v: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, v));
}

function intersectionArea(a: ScreenRect, b: ScreenRect, pad = 0): number {
  const xOverlap = Math.max(
    0,
    Math.min(a.x + a.w + pad, b.x + b.w + pad) - Math.max(a.x - pad, b.x - pad)
  );
  if (xOverlap <= 0) return 0;
  const yOverlap = Math.max(
    0,
    Math.min(a.y + a.h + pad, b.y + b.h + pad) - Math.max(a.y - pad, b.y - pad)
  );
  return xOverlap * yOverlap;
}

function rectFromAngle(
  ax: number,
  ay: number,
  boxW: number,
  boxH: number,
  angleDeg: number,
  clearancePx: number,
  canvasWidth: number,
  canvasHeight: number
): ScreenRect {
  const rad = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const halfW = boxW / 2;
  const halfH = boxH / 2;
  const tx = Math.abs(ux) > 1e-4 ? halfW / Math.abs(ux) : 1e9;
  const ty = Math.abs(uy) > 1e-4 ? halfH / Math.abs(uy) : 1e9;
  const tEdge = Math.min(tx, ty);

  const cx = ax + ux * (clearancePx + tEdge);
  const cy = ay + uy * (clearancePx + tEdge);

  const edgePad = 6;
  const x = clamp(cx - halfW, edgePad, canvasWidth - boxW - edgePad);
  const y = clamp(cy - halfH, edgePad, canvasHeight - boxH - edgePad);
  return { x, y, w: boxW, h: boxH };
}

function computeLeaderEndpoints(
  ax: number,
  ay: number,
  rect: ScreenRect
): { leaderStartX: number; leaderStartY: number; leaderEndX: number; leaderEndY: number } {
  const leaderEndX = clamp(ax, rect.x, rect.x + rect.w);
  const leaderEndY = clamp(ay, rect.y, rect.y + rect.h);
  const dx = leaderEndX - ax;
  const dy = leaderEndY - ay;
  const dist = Math.hypot(dx, dy);

  if (dist > 10) {
    return {
      leaderStartX: ax + (dx / dist) * 7,
      leaderStartY: ay + (dy / dist) * 7,
      leaderEndX,
      leaderEndY,
    };
  }
  return {
    leaderStartX: ax,
    leaderStartY: ay,
    leaderEndX,
    leaderEndY,
  };
}

const ANGLES_ABOVE_FIRST = [
  -28, -152, 26, 154, -68, -112, 68, 112, 0, 180, -90, 90, -10, -170, 45, 135,
];

const ANGLES_BELOW_FIRST = [
  26, -28, 154, -152, 68, 112, -68, -112, 0, 180, 90, -90, 45, 135, -10, -170,
];

const RING_CLEARANCES = [15, 32, 54, 80, 110, 146];

/**
 * Places aircraft data-block rectangles deterministically without overlap against
 * previously placed labels or aircraft icons, fanning crowded ground aircraft outward
 * with crisp leader lines. Returns labels sorted in ascending draw priority
 * (so higher-priority / selected labels draw last on top).
 */
export function placeAircraftLabels(
  items: LabelCandidateInput[],
  icons: IconObstacle[],
  canvasWidth: number,
  canvasHeight: number
): PlacedLabel[] {
  if (items.length === 0) return [];

  const placementOrder = [...items].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });

  const iconRects: ScreenRect[] = icons.map((ic) => ({
    x: ic.ax - 11,
    y: ic.ay - 11,
    w: 22,
    h: 22,
  }));

  const placedRects: ScreenRect[] = [];
  const results: PlacedLabel[] = [];

  for (const item of placementOrder) {
    const angles = item.preferredAbove ? ANGLES_ABOVE_FIRST : ANGLES_BELOW_FIRST;
    let bestRect: ScreenRect | null = null;
    let bestCost = Infinity;

    const evaluateCandidate = (rect: ScreenRect, ringPenalty: number, anglePenalty: number) => {
      let labelOverlap = 0;
      for (const prev of placedRects) {
        labelOverlap += intersectionArea(rect, prev, 3);
      }

      let iconOverlap = 0;
      for (const ir of iconRects) {
        iconOverlap += intersectionArea(rect, ir, 1);
      }

      const leader = computeLeaderEndpoints(item.ax, item.ay, rect);
      const leaderDist = Math.hypot(leader.leaderEndX - item.ax, leader.leaderEndY - item.ay);

      const cost =
        labelOverlap * 1200 +
        iconOverlap * 650 +
        ringPenalty * 14 +
        anglePenalty * 4 +
        leaderDist * 0.45;

      if (cost < bestCost) {
        bestCost = cost;
        bestRect = rect;
      }
      return labelOverlap === 0 && iconOverlap === 0;
    };

    let foundClean = false;
    for (let rIdx = 0; rIdx < RING_CLEARANCES.length && !foundClean; rIdx++) {
      const clearance = RING_CLEARANCES[rIdx];
      for (let aIdx = 0; aIdx < angles.length; aIdx++) {
        const rect = rectFromAngle(
          item.ax,
          item.ay,
          item.boxW,
          item.boxH,
          angles[aIdx],
          clearance,
          canvasWidth,
          canvasHeight
        );
        if (evaluateCandidate(rect, rIdx, aIdx)) {
          // Wait through only the first ring's angles? No, since angles & rings are sorted
          // cleanly by preference, the very first zero-overlap candidate IS minimal!
          foundClean = true;
          break;
        }
      }
    }

    // Fallback stacked grid slots if ultra-dense cluster still overlaps
    if (!foundClean) {
      const edgePad = 6;
      const colStep = item.boxW + 8;
      const rowStep = item.boxH + 6;
      outer: for (let ring = 1; ring <= 4; ring++) {
        for (let dy = -ring; dy <= ring; dy++) {
          for (let dx = -ring; dx <= ring; dx++) {
            if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
            const rect: ScreenRect = {
              x: clamp(item.ax + dx * colStep - item.boxW / 2, edgePad, canvasWidth - item.boxW - edgePad),
              y: clamp(item.ay + dy * rowStep - item.boxH / 2, edgePad, canvasHeight - item.boxH - edgePad),
              w: item.boxW,
              h: item.boxH,
            };
            if (evaluateCandidate(rect, 6 + ring, 0)) {
              break outer;
            }
          }
        }
      }
    }

    const chosen =
      bestRect ??
      rectFromAngle(
        item.ax,
        item.ay,
        item.boxW,
        item.boxH,
        angles[0],
        RING_CLEARANCES[0],
        canvasWidth,
        canvasHeight
      );

    placedRects.push(chosen);
    const endpoints = computeLeaderEndpoints(item.ax, item.ay, chosen);
    results.push({
      id: item.id,
      rect: chosen,
      ...endpoints,
      priority: item.drawPriority ?? item.priority,
    });
  }

  // Return in ascending priority order so higher-priority labels render last on top
  results.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.id.localeCompare(b.id);
  });

  return results;
}

/**
 * Resolves a click or hover point against aircraft icons and rendered data-block labels.
 * 1. Direct click right on an aircraft fuselage/icon (<= 9px) picks nearest icon.
 * 2. Click inside any rendered label pill (checked top-to-bottom / reverse draw order) picks that label's aircraft.
 * 3. Fallback generous icon proximity (<= 22px) catches near-misses or unlabeled aircraft.
 */
export function hitTestAircraftOrLabel(
  sx: number,
  sy: number,
  icons: IconObstacle[],
  drawnLabels: DrawnLabelHit[]
): string | null {
  let directIconId: string | null = null;
  let directIconDist = 9;
  for (const ic of icons) {
    const d = Math.hypot(sx - ic.ax, sy - ic.ay);
    if (d <= directIconDist) {
      directIconDist = d;
      directIconId = ic.id;
    }
  }
  if (directIconId) return directIconId;

  for (let i = drawnLabels.length - 1; i >= 0; i--) {
    const hit = drawnLabels[i];
    const r = hit.rect;
    if (sx >= r.x - 2 && sx <= r.x + r.w + 2 && sy >= r.y - 2 && sy <= r.y + r.h + 2) {
      return hit.id;
    }
  }

  let bestId: string | null = null;
  let bestDist = 22;
  for (const ic of icons) {
    const d = Math.hypot(sx - ic.ax, sy - ic.ay);
    if (d < bestDist) {
      bestDist = d;
      bestId = ic.id;
    }
  }
  return bestId;
}
