import React, { useEffect, useRef, useState } from "react";
import { Compass, Minus, Plus, PlaneLanding, PlaneTakeoff, Radio, RotateCcw } from "lucide-react";
import { runwayPoint } from "../data/asteriaAirport.ts";
import { isRunwayOccupied } from "../engine/validationEngine.ts";
import { useAtcStore, type CameraState } from "../store/atcStore.ts";
import type { Aircraft, AirportLayout, RunwaySpec, SimulationState, TaxiwayName } from "../types/atc.ts";
import { drawGeoreferencedTilesToCanvas } from "../utils/canvasTileLayer.ts";
import { computeDepAppGuidance } from "../utils/depAppGuidance.ts";
import {
  hitTestAircraftOrLabel,
  placeAircraftLabels,
  type DrawnLabelHit,
  type IconObstacle,
  type LabelCandidateInput,
} from "../utils/labelLayout.ts";
import { radioAudio } from "../utils/radioAudio.ts";
import { getActiveCallingSignals, type ActiveCallerSignal } from "../utils/radioSignals.ts";
import { getAglAltitudeFt, isSurfaceAircraft } from "../utils/telemetry.ts";

type ScopeBasemapLayer = "hybrid" | "satellite" | "chart";

interface ScreenPt {
  x: number;
  y: number;
}

function getRotRad(airport: AirportLayout): number {
  return ((airport.chartRotationDeg ?? 0) * Math.PI) / 180;
}

function worldToScreen(
  wx: number,
  wy: number,
  w: number,
  h: number,
  cam: CameraState,
  rotRad: number
): [number, number] {
  const dx = wx - cam.centerX;
  const dy = -(wy - cam.centerY);
  if (rotRad === 0) {
    return [w / 2 + dx * cam.pixelsPerNm, h / 2 + dy * cam.pixelsPerNm];
  }
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);
  return [
    w / 2 + (dx * cos - dy * sin) * cam.pixelsPerNm,
    h / 2 + (dx * sin + dy * cos) * cam.pixelsPerNm,
  ];
}

function screenToWorldCoords(
  sx: number,
  sy: number,
  w: number,
  h: number,
  cam: CameraState,
  rotRad: number
): { x: number; y: number } {
  const ux = (sx - w / 2) / cam.pixelsPerNm;
  const uy = (sy - h / 2) / cam.pixelsPerNm;
  if (rotRad === 0) {
    return { x: cam.centerX + ux, y: cam.centerY - uy };
  }
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);
  const dx = ux * cos + uy * sin;
  const dy = -ux * sin + uy * cos;
  return { x: cam.centerX + dx, y: cam.centerY - dy };
}

function shortStateTag(ac: Aircraft, elevationFt: number): string {
  const agl = getAglAltitudeFt(ac, elevationFt);
  const spd = Math.round(ac.speed);
  switch (ac.state) {
    case "AT_GATE":
      return `GATE ${ac.gateId ?? ""}`;
    case "PUSHBACK_APPROVED":
    case "PUSHING_BACK":
      return "PUSHING";
    case "PUSHBACK_COMPLETE":
      return "PB DONE";
    case "TAXIING":
      return `TAXI ${spd}kt`;
    case "HOLDING_SHORT":
      return ac.holdingAtRunway ? `HS ${ac.holdingAtRunway}` : "HOLDING";
    case "CROSSING_RUNWAY":
      return "CROSSING";
    case "HOLD_POSITION":
      return "HOLD POS";
    case "LINE_UP_WAIT":
      return `LUAW ${ac.targetRunway}`;
    case "TAKEOFF_CLEARED":
      return "T/O CLR";
    case "TAKEOFF_CANCELLED":
      return "T/O CNCL";
    case "TAKEOFF_ROLL":
      return `ROLL ${spd}kt`;
    case "REJECTED_TAKEOFF":
    case "BRAKING":
      return `BRK ${spd}kt`;
    case "STOPPED_ON_RUNWAY":
      return "STOP RWY!";
    case "ROTATE":
      return `ROT ${agl}ft ${spd}kt`;
    case "CLEARED_TO_LAND":
      return `CLR ${agl}ft ${spd}kt`;
    case "LANDING":
      return `LND ${agl}ft ${spd}kt`;
    case "TOUCHDOWN":
    case "ROLLOUT":
      return `ROLL ${spd}kt`;
    case "VACATING_RUNWAY":
      return `VAC ${spd}kt`;
    case "GO_AROUND":
    case "MISSED_APPROACH":
      return `GA ${agl}ft`;
    default: {
      const altTag =
        agl < 1500
          ? `${agl}ft`
          : String(Math.round(ac.altitude / 100)).padStart(3, "0");
      return `${altTag} ${spd}kt`;
    }
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

/**
 * Traces a continuous polyline or closed polygon with smooth rounded corner blends
 * so taxiways, aprons, and airport roads curve naturally instead of crisp grid boxes.
 */
function traceRoundedPolylinePath(
  ctx: CanvasRenderingContext2D,
  pts: ScreenPt[],
  radiusPx: number,
  closed = false
): void {
  if (pts.length < 2) return;
  ctx.beginPath();

  if (pts.length === 2 || radiusPx <= 0.5) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    if (closed) ctx.closePath();
    return;
  }

  if (closed) {
    const n = pts.length;
    const last = pts[n - 1];
    const first = pts[0];
    const startMid = { x: (last.x + first.x) / 2, y: (last.y + first.y) / 2 };
    ctx.moveTo(startMid.x, startMid.y);

    for (let i = 0; i < n; i++) {
      const pPrev = pts[(i - 1 + n) % n];
      const pCurr = pts[i];
      const pNext = pts[(i + 1) % n];
      const d1 = Math.hypot(pCurr.x - pPrev.x, pCurr.y - pPrev.y);
      const d2 = Math.hypot(pNext.x - pCurr.x, pNext.y - pCurr.y);
      if (d1 < 0.01 || d2 < 0.01) {
        ctx.lineTo(pCurr.x, pCurr.y);
        continue;
      }
      const r = Math.min(radiusPx, d1 * 0.42, d2 * 0.42);
      const t1x = pCurr.x - ((pCurr.x - pPrev.x) / d1) * r;
      const t1y = pCurr.y - ((pCurr.y - pPrev.y) / d1) * r;
      const t2x = pCurr.x + ((pNext.x - pCurr.x) / d2) * r;
      const t2y = pCurr.y + ((pNext.y - pCurr.y) / d2) * r;
      ctx.lineTo(t1x, t1y);
      ctx.quadraticCurveTo(pCurr.x, pCurr.y, t2x, t2y);
    }
    ctx.closePath();
    return;
  }

  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const pPrev = pts[i - 1];
    const pCurr = pts[i];
    const pNext = pts[i + 1];
    const d1 = Math.hypot(pCurr.x - pPrev.x, pCurr.y - pPrev.y);
    const d2 = Math.hypot(pNext.x - pCurr.x, pNext.y - pCurr.y);
    if (d1 < 0.01 || d2 < 0.01) {
      ctx.lineTo(pCurr.x, pCurr.y);
      continue;
    }
    const r = Math.min(radiusPx, d1 * 0.44, d2 * 0.44);
    const t1x = pCurr.x - ((pCurr.x - pPrev.x) / d1) * r;
    const t1y = pCurr.y - ((pCurr.y - pPrev.y) / d1) * r;
    const t2x = pCurr.x + ((pNext.x - pCurr.x) / d2) * r;
    const t2y = pCurr.y + ((pNext.y - pCurr.y) / d2) * r;
    ctx.lineTo(t1x, t1y);
    ctx.quadraticCurveTo(pCurr.x, pCurr.y, t2x, t2y);
  }
  const tail = pts[pts.length - 1];
  ctx.lineTo(tail.x, tail.y);
}

/**
 * Traces a C1-smooth quadratic midpoint spline directly through dense real-world
 * OpenStreetMap taxiway vertices so curves, rapid-exits, and bent fillets render fluidly.
 */
function traceSmoothSplinePath(ctx: CanvasRenderingContext2D, pts: ScreenPt[]): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    const midY = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
  }
  const tail = pts[pts.length - 1];
  ctx.lineTo(tail.x, tail.y);
}

/**
 * Extracts ordered polyline chains per taxiway when explicit chains aren't supplied.
 */
function resolveTaxiwayChains(airport: AirportLayout): Array<{ taxiway: TaxiwayName; nodeIds: string[]; dashed?: boolean }> {
  const chains: Array<{ taxiway: TaxiwayName; nodeIds: string[]; dashed?: boolean }> = [];
  const coveredPairs = new Set<string>();

  if (airport.taxiwayChains && airport.taxiwayChains.length > 0) {
    for (const ch of airport.taxiwayChains) {
      chains.push(ch);
      for (let i = 0; i < ch.nodeIds.length - 1; i++) {
        const key = [ch.nodeIds[i], ch.nodeIds[i + 1]].sort().join("|");
        coveredPairs.add(key);
      }
    }
  } else {
    // Reconstruct chains from edges grouped by taxiway name
    const byTw = new Map<TaxiwayName, Map<string, Set<string>>>();
    for (const edge of airport.edges) {
      if (edge.taxiway === "APRON") continue;
      if (!byTw.has(edge.taxiway)) byTw.set(edge.taxiway, new Map());
      const adj = byTw.get(edge.taxiway)!;
      if (!adj.has(edge.from)) adj.set(edge.from, new Set());
      if (!adj.has(edge.to)) adj.set(edge.to, new Set());
      adj.get(edge.from)!.add(edge.to);
      adj.get(edge.to)!.add(edge.from);
    }

    for (const [tw, adj] of byTw.entries()) {
      const visitedEdges = new Set<string>();
      const allNodes = [...adj.keys()];
      const endpoints = allNodes.filter((n) => (adj.get(n)?.size ?? 0) === 1);
      const startCandidates = [...endpoints, ...allNodes];

      for (const start of startCandidates) {
        for (const firstNext of adj.get(start) ?? []) {
          const eKey = [start, firstNext].sort().join("|");
          if (visitedEdges.has(eKey)) continue;
          const chain = [start, firstNext];
          visitedEdges.add(eKey);
          coveredPairs.add(eKey);

          let prev = start;
          let curr = firstNext;
          while (true) {
            const nbrs = [...(adj.get(curr) ?? [])].filter(
              (n) => n !== prev && !visitedEdges.has([curr, n].sort().join("|"))
            );
            if (nbrs.length === 0) break;
            const next = nbrs[0];
            const k = [curr, next].sort().join("|");
            visitedEdges.add(k);
            coveredPairs.add(k);
            chain.push(next);
            prev = curr;
            curr = next;
          }
          chains.push({ taxiway: tw, nodeIds: chain });
        }
      }
    }
  }

  // Add remaining uncovered non-apron or apron spurs cleanly
  const seenStandalone = new Set<string>();
  for (const edge of airport.edges) {
    const key = [edge.from, edge.to].sort().join("|");
    if (coveredPairs.has(key) || seenStandalone.has(key)) continue;
    seenStandalone.add(key);
    chains.push({
      taxiway: edge.taxiway,
      nodeIds: [edge.from, edge.to],
      dashed: edge.taxiway === "APRON",
    });
  }

  return chains;
}

export const RadarScopeCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const drawnLabelHitsRef = useRef<DrawnLabelHit[]>([]);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origCenterX: number;
    origCenterY: number;
    moved: boolean;
  }>({ active: false, startX: 0, startY: 0, origCenterX: 0, origCenterY: 0, moved: false });

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [scopeLayer, setScopeLayer] = useState<ScopeBasemapLayer>("hybrid");
  const [ttsVersion, setTtsVersion] = useState(0);

  useEffect(() => {
    return radioAudio.subscribe(() => setTtsVersion((v) => v + 1));
  }, []);

  const sim = useAtcStore((s) => s.sim);
  const tickVersion = useAtcStore((s) => s.tickVersion);
  const camera = useAtcStore((s) => s.camera);
  const hoverPreviewRoute = useAtcStore((s) => s.hoverPreviewRoute);
  const theme = useAtcStore((s) => s.theme);

  const selectAircraft = useAtcStore((s) => s.selectAircraft);
  const setCamera = useAtcStore((s) => s.setCamera);
  const zoomAtPoint = useAtcStore((s) => s.zoomAtPoint);
  const resetCameraForStation = useAtcStore((s) => s.resetCameraForStation);
  const spawnFlight = useAtcStore((s) => s.spawnFlight);

  const activeCallers = getActiveCallingSignals(sim, radioAudio.getActiveTransmission());
  const primaryCaller = activeCallers[0] ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    drawnLabelHitsRef.current = drawScope(
      ctx,
      width,
      height,
      sim,
      camera,
      hoverPreviewRoute,
      hoveredId,
      theme,
      scopeLayer,
      activeCallers
    );
    ctx.restore();
  }, [sim, tickVersion, ttsVersion, camera, hoverPreviewRoute, hoveredId, theme, scopeLayer]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      useAtcStore.setState((s) => ({ tickVersion: s.tickVersion + 1 }));
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const rotRad = getRotRad(sim.airport);

  const screenToWorld = (sx: number, sy: number) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    return screenToWorldCoords(
      sx,
      sy,
      container.clientWidth,
      container.clientHeight,
      camera,
      rotRad
    );
  };

  const findAircraftAtScreen = (sx: number, sy: number): string | null => {
    const container = containerRef.current;
    if (!container) return null;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const icons: IconObstacle[] = [];
    for (const id of sim.aircraftOrder) {
      const ac = sim.aircraft[id];
      if (!ac) continue;
      if (ac.state === "COMPLETED_ARRIVAL" || ac.state === "COMPLETED_DEPARTURE") continue;
      const [ax, ay] = worldToScreen(ac.x, ac.y, w, h, camera, rotRad);
      icons.push({ id: ac.id, ax, ay });
    }
    return hitTestAircraftOrLabel(sx, sy, icons, drawnLabelHitsRef.current);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    dragRef.current = {
      active: true,
      startX: sx,
      startY: sy,
      origCenterX: camera.centerX,
      origCenterY: camera.centerY,
      moved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (dragRef.current.active) {
      const dxScreen = sx - dragRef.current.startX;
      const dyScreen = sy - dragRef.current.startY;
      if (Math.hypot(dxScreen, dyScreen) > 4) {
        dragRef.current.moved = true;
      }
      if (dragRef.current.moved) {
        const ux = -dxScreen / camera.pixelsPerNm;
        const uy = -dyScreen / camera.pixelsPerNm;
        const cos = Math.cos(rotRad);
        const sin = Math.sin(rotRad);
        setCamera({
          centerX: dragRef.current.origCenterX + (ux * cos + uy * sin),
          centerY: dragRef.current.origCenterY - (-ux * sin + uy * cos),
        });
        return;
      }
    }

    setHoveredId(findAircraftAtScreen(sx, sy));
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    if (dragRef.current.active && !dragRef.current.moved) {
      const hitId = findAircraftAtScreen(sx, sy);
      if (hitId) {
        selectAircraft(hitId);
      }
    }
    dragRef.current.active = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);
    const factor = e.deltaY < 0 ? 1.16 : 0.86;
    zoomAtPoint(factor, world.x, world.y);
  };

  return (
    <div ref={containerRef} className="relative flex-1 bg-[var(--atc-bg)] overflow-hidden min-w-0 min-h-0 transition-colors">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          dragRef.current.active = false;
          setHoveredId(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={handleWheel}
        className={`w-full h-full block ${hoveredId ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
      />

      {/* Top-Left Scope Mode Watermark + Live Radio Caller Voice Line */}
      <div className="absolute top-2.5 left-3 flex flex-col items-start gap-1.5 z-10 pointer-events-none max-w-[calc(100%-7rem)]">
        <div className="px-2.5 py-1 rounded-md bg-[var(--atc-surface)]/92 border border-[var(--atc-border)] shadow-[var(--atc-shadow)] backdrop-blur-sm text-[11px] font-mono text-[var(--atc-text)] flex items-center gap-2">
          <Compass className="w-3.5 h-3.5 text-[var(--atc-cyan)] shrink-0" />
          <span className="font-semibold">
            {camera.pixelsPerNm >= 220
              ? "SURFACE MOVEMENT CHART"
              : camera.pixelsPerNm >= 80
              ? "TOWER LOCAL & FINAL"
              : "TERMINAL RADAR (30 NM)"}
          </span>
          <span className="text-[var(--atc-muted)]">•</span>
          <span className="text-[var(--atc-muted)]">{sim.airport.windLabel}</span>
        </div>

        {primaryCaller && (
          <button
            type="button"
            onClick={() => selectAircraft(primaryCaller.aircraftId)}
            title={`Click to select calling aircraft ${primaryCaller.callsign}`}
            className={`pointer-events-auto px-2.5 py-1.5 rounded-md border shadow-[var(--atc-shadow)] backdrop-blur-sm text-[11px] font-mono flex items-center gap-2 max-w-full transition-colors ${
              primaryCaller.category === "EMERGENCY" || primaryCaller.category === "READBACK_ERROR"
                ? "bg-[var(--atc-red-bg)] border-[var(--atc-red-border)] text-[var(--atc-red)]"
                : primaryCaller.category === "PILOT_REQUEST"
                ? "bg-[var(--atc-amber-bg)] border-[var(--atc-amber-border)] text-[var(--atc-amber)]"
                : "bg-[var(--atc-cyan-bg)] border-[var(--atc-cyan-border)] text-[var(--atc-cyan)]"
            }`}
          >
            <Radio className="w-3.5 h-3.5 shrink-0 animate-pulse" />
            <span className="font-extrabold shrink-0">
              TX {primaryCaller.callsign}
            </span>
            <span className="px-1 py-0.2 rounded bg-black/10 text-[9px] font-bold shrink-0">
              {primaryCaller.controller === "DEPARTURE" ? "DEP" : primaryCaller.controller}
            </span>
            <span className="truncate text-[var(--atc-text)] font-sans font-medium">
              "{primaryCaller.text}"
            </span>
          </button>
        )}
      </div>

      {/* Bottom-Left Scope Controls */}
      <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-1.5">
        <div className="flex items-center bg-[var(--atc-surface)]/95 border border-[var(--atc-border)] shadow-[var(--atc-shadow)] rounded-md p-0.5 backdrop-blur-sm">
          {(["GROUND", "TOWER", "DEPARTURE"] as const).map((role) => (
            <button
              key={role}
              onClick={() => resetCameraForStation(role)}
              className="px-2 py-1 rounded text-[10px] font-mono font-medium text-[var(--atc-text-secondary)] hover:bg-[var(--atc-accent-bg)] hover:text-[var(--atc-accent-text)] transition-colors"
            >
              {role === "GROUND" ? "GND" : role === "TOWER" ? "TWR" : "RADAR"}
            </button>
          ))}
        </div>

        <div className="flex items-center bg-[var(--atc-surface)]/95 border border-[var(--atc-border)] shadow-[var(--atc-shadow)] rounded-md p-0.5 backdrop-blur-sm">
          <button
            onClick={() => zoomAtPoint(1.25)}
            title="Zoom In"
            className="p-1 text-[var(--atc-text-secondary)] hover:text-[var(--atc-text)]"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => zoomAtPoint(0.8)}
            title="Zoom Out"
            className="p-1 text-[var(--atc-text-secondary)] hover:text-[var(--atc-text)]"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => resetCameraForStation()}
            title="Reset View"
            className="p-1 text-[var(--atc-text-secondary)] hover:text-[var(--atc-text)]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center bg-[var(--atc-surface)]/95 border border-[var(--atc-border)] shadow-[var(--atc-shadow)] rounded-md p-0.5 gap-0.5 backdrop-blur-sm">
          <button
            onClick={() => spawnFlight("DEPARTURE")}
            className="px-2 py-1 rounded text-[10px] font-mono font-semibold text-[var(--atc-cyan)] hover:bg-[var(--atc-cyan-bg)] flex items-center gap-1"
          >
            <PlaneTakeoff className="w-3 h-3" />+ DEP
          </button>
          <button
            onClick={() => spawnFlight("ARRIVAL")}
            className="px-2 py-1 rounded text-[10px] font-mono font-semibold text-[var(--atc-emerald)] hover:bg-[var(--atc-emerald-bg)] flex items-center gap-1"
          >
            <PlaneLanding className="w-3 h-3" />+ ARR
          </button>
        </div>

        {sim.airport.isRealWorld && sim.airport.lat !== undefined && sim.airport.lon !== undefined && (
          <div className="flex items-center bg-[var(--atc-surface)]/95 border border-[var(--atc-border)] shadow-[var(--atc-shadow)] rounded-md p-0.5 backdrop-blur-sm">
            {(
              [
                { id: "hybrid", label: "HYBRID" },
                { id: "satellite", label: "SAT" },
                { id: "chart", label: "CHART" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                onClick={() => setScopeLayer(m.id)}
                title="Switch real-world airport underlay (Satellite + OSM Hybrid / Full Satellite / Vector Chart)"
                className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-colors ${
                  scopeLayer === m.id
                    ? "bg-[var(--atc-accent-soft)] text-[var(--atc-accent-text)] border border-[var(--atc-accent-border)]"
                    : "text-[var(--atc-muted)] hover:text-[var(--atc-text)]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Top-Right Micro Legend (placed left of Compass Rose) */}
      <div className="pointer-events-none absolute top-2.5 right-14 px-2.5 py-1 rounded-md bg-[var(--atc-surface)]/92 border border-[var(--atc-border)] shadow-[var(--atc-shadow)] text-[10px] font-mono text-[var(--atc-muted)] hidden xl:flex items-center gap-3 backdrop-blur-sm">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Hold / Req
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Cleared
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Error / Emerg
        </span>
      </div>
    </div>
  );
};

function drawTopographicTerrain(
  ctx: CanvasRenderingContext2D,
  toScreen: (wx: number, wy: number) => [number, number],
  pixelsPerNm: number,
  isLight: boolean
): void {
  if (pixelsPerNm < 35) return;

  // Organic perimeter contour loops and subtle natural landscape patches well outside runways
  const contours: Array<Array<{ x: number; y: number }>> = [
    [
      { x: -1.75, y: 0.72 },
      { x: -1.25, y: 1.05 },
      { x: -0.55, y: 1.18 },
      { x: 0.25, y: 1.06 },
      { x: 0.95, y: 0.98 },
      { x: 1.55, y: 0.62 },
      { x: 1.72, y: -0.05 },
      { x: 1.48, y: -0.78 },
      { x: 0.78, y: -1.04 },
      { x: -0.15, y: -1.02 },
      { x: -1.05, y: -0.86 },
      { x: -1.58, y: -0.22 },
    ],
    [
      { x: -1.48, y: 0.60 },
      { x: -0.96, y: 0.88 },
      { x: -0.20, y: 0.94 },
      { x: 0.56, y: 0.86 },
      { x: 1.24, y: 0.56 },
      { x: 1.45, y: -0.12 },
      { x: 1.24, y: -0.62 },
      { x: 0.52, y: -0.82 },
      { x: -0.45, y: -0.84 },
      { x: -1.22, y: -0.60 },
      { x: -1.42, y: 0.04 },
    ],
  ];

  // Subtle greenbelt/park pockets (outside the airfield perimeter)
  const greens: Array<Array<{ x: number; y: number }>> = [
    [
      { x: -1.32, y: 0.68 },
      { x: -0.98, y: 0.84 },
      { x: -0.70, y: 0.72 },
      { x: -0.88, y: 0.54 },
    ],
    [
      { x: 0.65, y: 0.66 },
      { x: 0.95, y: 0.78 },
      { x: 1.12, y: 0.56 },
      { x: 0.86, y: 0.44 },
    ],
    [
      { x: -1.08, y: -0.58 },
      { x: -0.76, y: -0.74 },
      { x: -0.52, y: -0.66 },
      { x: -0.74, y: -0.48 },
    ],
  ];

  for (const poly of greens) {
    const pts = poly.map((p) => {
      const [x, y] = toScreen(p.x, p.y);
      return { x, y };
    });
    traceRoundedPolylinePath(ctx, pts, 18, true);
    ctx.fillStyle = isLight ? "rgba(176, 188, 152, 0.24)" : "rgba(16, 42, 34, 0.25)";
    ctx.fill();
  }

  for (const loop of contours) {
    const pts = loop.map((p) => {
      const [x, y] = toScreen(p.x, p.y);
      return { x, y };
    });
    traceRoundedPolylinePath(ctx, pts, 40, true);
    ctx.strokeStyle = isLight ? "rgba(148, 138, 118, 0.22)" : "rgba(30, 52, 78, 0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawRealisticRunway(
  ctx: CanvasRenderingContext2D,
  sim: SimulationState,
  rwy: RunwaySpec,
  toScreen: (wx: number, wy: number) => [number, number],
  pixelsPerNm: number,
  rotRad: number,
  isLight: boolean,
  scopeLayer: ScopeBasemapLayer = "hybrid"
): void {
  const isSatOnly = scopeLayer === "satellite";
  const midPt = runwayPoint(rwy, rwy.lengthNm / 2, 0);
  const [midX, midY] = toScreen(midPt.x, midPt.y);
  const rwW = rwy.lengthNm * pixelsPerNm;
  const rwH =
    pixelsPerNm >= 120
      ? Math.max(16, Math.min(32, rwy.widthNm * pixelsPerNm * 1.75))
      : Math.max(8, rwy.widthNm * pixelsPerNm * 1.4);
  const screenAngle = Math.atan2(-rwy.uy, rwy.ux) + rotRad;

  const occ = isRunwayOccupied(sim, rwy.id);
  const hasEmergencyStop = occ.occupantIds.some(
    (id) => sim.aircraft[id]?.state === "STOPPED_ON_RUNWAY"
  );

  ctx.save();
  ctx.translate(midX, midY);
  ctx.rotate(screenAngle);

  // Subtle drop shadow beneath runway slab in Light mode (skip in satellite mode)
  if (isLight && !isSatOnly) {
    ctx.fillStyle = "rgba(30, 41, 59, 0.12)";
    ctx.fillRect(-rwW / 2 - 4, -rwH / 2 + 2, rwW + 8, rwH);
  }

  // Overrun / Blast Pads beyond both thresholds
  const padW = Math.min(20, Math.max(7, rwW * 0.045));
  ctx.fillStyle = isSatOnly
    ? "rgba(17, 27, 42, 0.42)"
    : isLight
    ? "#3a4351"
    : "#111b2a";
  ctx.fillRect(-rwW / 2 - padW, -rwH / 2, padW, rwH);
  ctx.fillRect(rwW / 2, -rwH / 2, padW, rwH);

  // Yellow blast pad chevrons
  if (pixelsPerNm >= 120) {
    ctx.strokeStyle = "rgba(234, 179, 8, 0.65)";
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      const startX = side === -1 ? -rwW / 2 - padW + 3 : rwW / 2 + padW - 3;
      const tipX = side === -1 ? -rwW / 2 - 2 : rwW / 2 + 2;
      ctx.beginPath();
      ctx.moveTo(startX, -rwH * 0.35);
      ctx.lineTo(tipX, 0);
      ctx.lineTo(startX, rwH * 0.35);
      ctx.stroke();
    }
  }

  // Main Runway Asphalt (translucent over real aerial tiles in Satellite mode)
  ctx.fillStyle = isSatOnly
    ? "rgba(15, 23, 42, 0.45)"
    : isLight
    ? "#2a3340"
    : "#0b121d";
  ctx.fillRect(-rwW / 2, -rwH / 2, rwW, rwH);

  // Outer status highlight border
  if (hasEmergencyStop) {
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2.6;
    ctx.strokeRect(-rwW / 2, -rwH / 2, rwW, rwH);
  } else if (occ.occupied) {
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    ctx.strokeRect(-rwW / 2, -rwH / 2, rwW, rwH);
  } else {
    ctx.strokeStyle = isLight ? "#1e293b" : "#3b4e68";
    ctx.lineWidth = 1;
    ctx.strokeRect(-rwW / 2, -rwH / 2, rwW, rwH);
  }

  // White Side Edge Stripes
  const edgeInset = Math.max(1.5, rwH * 0.1);
  ctx.strokeStyle = isLight ? "rgba(248, 250, 252, 0.72)" : "rgba(203, 213, 225, 0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-rwW / 2 + 2, -rwH / 2 + edgeInset);
  ctx.lineTo(rwW / 2 - 2, -rwH / 2 + edgeInset);
  ctx.moveTo(-rwW / 2 + 2, rwH / 2 - edgeInset);
  ctx.lineTo(rwW / 2 - 2, rwH / 2 - edgeInset);
  ctx.stroke();

  // Piano-Key Threshold Bars & Aiming Points
  const keyCount = rwH >= 14 ? 8 : 6;
  const keyLen = Math.min(18, Math.max(6, rwW * 0.045));
  const keyPitch = (rwH - edgeInset * 3) / keyCount;
  ctx.fillStyle = isLight ? "#f8fafc" : "#e2e8f0";

  for (let i = 0; i < keyCount; i++) {
    const ky = -rwH / 2 + edgeInset * 1.5 + i * keyPitch + keyPitch * 0.15;
    const kh = Math.max(1, keyPitch * 0.62);
    ctx.fillRect(-rwW / 2 + 4, ky, keyLen, kh);
    ctx.fillRect(rwW / 2 - 4 - keyLen, ky, keyLen, kh);
  }

  // Painted On-Asphalt Runway Designators (aligned with runway orientation!)
  if (pixelsPerNm >= 85) {
    const fontSize = Math.max(8.5, Math.min(13, rwH * 0.56));
    ctx.fillStyle = isLight ? "#f8fafc" : "#e2e8f0";
    ctx.font = `800 ${fontSize.toFixed(1)}px 'JetBrains Mono', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const numOffset = keyLen + Math.max(18, fontSize * 1.45);

    // Threshold ID (e.g. 09L) oriented cleanly along the runway
    ctx.save();
    ctx.translate(-rwW / 2 + numOffset, 0);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(rwy.id, 0, 0);
    ctx.restore();

    // Reciprocal end ID (e.g. 27R)
    ctx.save();
    ctx.translate(rwW / 2 - numOffset, 0);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(rwy.oppositeId, 0, 0);
    ctx.restore();

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  // Aiming Point Blocks & Centerline Dashes
  const centerStart = keyLen + Math.max(36, rwW * 0.14);
  if (rwW > centerStart * 2 + 24) {
    if (pixelsPerNm >= 140) {
      const aimX = rwW / 2 - centerStart - 16;
      const aimW = Math.min(16, rwW * 0.038);
      const aimH = Math.max(2, rwH * 0.16);
      ctx.fillStyle = isLight ? "rgba(248, 250, 252, 0.88)" : "rgba(226, 232, 240, 0.72)";
      ctx.fillRect(-aimX - aimW, -rwH * 0.25, aimW, aimH);
      ctx.fillRect(-aimX - aimW, rwH * 0.25 - aimH, aimW, aimH);
      ctx.fillRect(aimX, -rwH * 0.25, aimW, aimH);
      ctx.fillRect(aimX, rwH * 0.25 - aimH, aimW, aimH);
    }

    ctx.strokeStyle = isLight ? "rgba(248, 250, 252, 0.88)" : "rgba(226, 232, 240, 0.72)";
    ctx.lineWidth = Math.max(1.2, rwH * 0.08);
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(-rwW / 2 + centerStart, 0);
    ctx.lineTo(rwW / 2 - centerStart, 0);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawCompassNorthArrow(
  ctx: CanvasRenderingContext2D,
  w: number,
  rotRad: number,
  isLight: boolean
): void {
  const cx = w - 28;
  const cy = 28;
  ctx.save();
  ctx.translate(cx, cy);

  // Subtle circular chart plate
  ctx.fillStyle = isLight ? "rgba(255, 255, 255, 0.86)" : "rgba(13, 24, 40, 0.86)";
  ctx.strokeStyle = isLight ? "#cfc7b4" : "#243b55";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Rotate arrow to True North relative to viewport
  ctx.save();
  ctx.rotate(rotRad);
  ctx.fillStyle = isLight ? "#334155" : "#38bdf8";
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(4.5, 5);
  ctx.lineTo(0, 2);
  ctx.lineTo(-4.5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = isLight ? "#1e293b" : "#cbd5e1";
  ctx.font = "800 8px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", 0, 9);
  ctx.restore();
}

function getRadioSignalRgb(cat: ActiveCallerSignal["category"], isLight: boolean): [number, number, number] {
  if (cat === "EMERGENCY" || cat === "READBACK_ERROR") return [239, 68, 68];
  if (cat === "PILOT_REQUEST") return isLight ? [217, 119, 6] : [245, 158, 11];
  return isLight ? [2, 132, 199] : [34, 211, 238];
}

function drawRadioTransmissionSignal(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  towerX: number,
  towerY: number,
  signal: ActiveCallerSignal,
  isLight: boolean,
  nowMs: number
): void {
  const [rC, gC, bC] = getRadioSignalRgb(signal.category, isLight);
  const fade = signal.isLiveTts ? 1.0 : Math.max(0.28, 1 - signal.progress01 * 0.72);

  // 1. Animated VHF RF signal line linking the transmitting aircraft to Airport Control Tower
  const distToTower = Math.hypot(towerX - ax, towerY - ay);
  if (distToTower > 28) {
    ctx.save();
    ctx.strokeStyle = `rgba(${rC}, ${gC}, ${bC}, ${(0.65 * fade).toFixed(2)})`;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -((nowMs * 0.045) % 14);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(towerX, towerY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Small receiver ring around Tower origin
    ctx.strokeStyle = `rgba(${rC}, ${gC}, ${bC}, ${(0.45 * fade).toFixed(2)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(towerX, towerY, 9 + 3 * Math.sin(nowMs * 0.01), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 2. Concentric propagating radio wave arcs ((( ✈ ))) radiating from the calling aircraft
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const phase = ((nowMs % 1450) / 1450 + i / 3) % 1;
    const waveR = 13 + phase * 26;
    const waveAlpha = (1 - phase) * 0.85 * fade;
    ctx.strokeStyle = `rgba(${rC}, ${gC}, ${bC}, ${waveAlpha.toFixed(2)})`;
    ctx.lineWidth = 1.8 - phase * 0.6;

    // Right-facing wave arc
    ctx.beginPath();
    ctx.arc(ax, ay, waveR, -0.72, 0.72);
    ctx.stroke();

    // Left-facing wave arc
    ctx.beginPath();
    ctx.arc(ax, ay, waveR, Math.PI - 0.72, Math.PI + 0.72);
    ctx.stroke();
  }
  ctx.restore();
}

function drawScope(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sim: SimulationState,
  cam: CameraState,
  hoverPreviewRoute: string[] | null,
  hoveredId: string | null,
  theme: "light" | "dark",
  scopeLayer: ScopeBasemapLayer = "hybrid",
  activeCallers: ActiveCallerSignal[] = []
): DrawnLabelHit[] {
  const isLight = theme === "light";
  const rotRad = getRotRad(sim.airport);
  const toScreen = (wx: number, wy: number): [number, number] =>
    worldToScreen(wx, wy, w, h, cam, rotRad);

  // 1. Background (Real Georeferenced Satellite Aerial Underlay for Real Airports when Hybrid/Sat active)
  ctx.fillStyle = isLight ? "#efeae0" : "#050b13";
  ctx.fillRect(0, 0, w, h);

  if (
    sim.airport.isRealWorld &&
    sim.airport.lat !== undefined &&
    sim.airport.lon !== undefined &&
    scopeLayer !== "chart"
  ) {
    drawGeoreferencedTilesToCanvas({
      ctx,
      width: w,
      height: h,
      airportLat: sim.airport.lat,
      airportLon: sim.airport.lon,
      centerX: cam.centerX,
      centerY: cam.centerY,
      pixelsPerNm: cam.pixelsPerNm,
      rotRad,
      variant: "satellite",
      opacity: scopeLayer === "satellite" ? 0.96 : isLight ? 0.42 : 0.45,
      onTileReady: () => useAtcStore.setState((s) => ({ tickVersion: s.tickVersion + 1 })),
    });
    if (scopeLayer === "hybrid") {
      ctx.fillStyle = isLight ? "rgba(239, 234, 224, 0.36)" : "rgba(5, 11, 19, 0.48)";
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Subtle chart grid & range rings
  const [cx0, cy0] = toScreen(0, 0);
  ctx.strokeStyle = isLight ? "rgba(140, 128, 108, 0.11)" : "rgba(30, 48, 72, 0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx0, 0);
  ctx.lineTo(cx0, h);
  ctx.moveTo(0, cy0);
  ctx.lineTo(w, cy0);
  ctx.stroke();

  for (const ringNm of [2, 5, 10, 15]) {
    const rPx = ringNm * cam.pixelsPerNm;
    if (rPx < 25 || rPx > 3500) continue;
    ctx.strokeStyle = isLight ? "rgba(120, 113, 108, 0.16)" : "rgba(34, 211, 238, 0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(cx0, cy0, rPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = isLight ? "rgba(87, 83, 78, 0.65)" : "rgba(100, 116, 139, 0.7)";
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.fillText(`${ringNm} NM`, cx0 + 4, cy0 - rPx + 12);
  }

  // Organic Topographic Terrain & Natural Perimeter Contours (skip for real airports with real satellite/OSM terrain)
  if (!sim.airport.isRealWorld) {
    drawTopographicTerrain(ctx, toScreen, cam.pixelsPerNm, isLight);
  }

  // ILS Localizer extended approach corridors
  for (const rwyId of sim.airport.runwayIds) {
    const rwy = sim.airport.runways[rwyId];
    if (!rwy) continue;
    const appStart = runwayPoint(rwy, -9.5, 0);
    const depEnd = runwayPoint(rwy, rwy.lengthNm + 6.0, 0);
    const [tx, ty] = toScreen(rwy.thresholdX, rwy.thresholdY);
    const [lx, ly] = toScreen(appStart.x, appStart.y);
    ctx.strokeStyle = isLight ? "rgba(5, 150, 105, 0.32)" : "rgba(16, 185, 129, 0.25)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);

    const [ex, ey] = toScreen(rwy.endX, rwy.endY);
    const [dx, dy] = toScreen(depEnd.x, depEnd.y);
    ctx.strokeStyle = isLight ? "rgba(2, 132, 199, 0.24)" : "rgba(34, 211, 238, 0.16)";
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(dx, dy);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Navigational Fixes
  for (const fix of Object.values(sim.airport.fixes)) {
    const [fx, fy] = toScreen(fix.x, fix.y);
    if (fx < -40 || fx > w + 40 || fy < -40 || fy > h + 40) continue;

    ctx.strokeStyle =
      fix.kind === "IAF"
        ? isLight
          ? "#047857"
          : "#10b981"
        : fix.kind === "DEPARTURE"
        ? isLight
          ? "#0284c7"
          : "#38bdf8"
        : fix.kind === "MISSED"
        ? isLight
          ? "#d97706"
          : "#f59e0b"
        : isLight
        ? "#57534e"
        : "#94a3b8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(fx, fy - 5);
    ctx.lineTo(fx + 5, fy + 4);
    ctx.lineTo(fx - 5, fy + 4);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = isLight ? "#292524" : "#cbd5e1";
    ctx.font = "600 10px 'JetBrains Mono', monospace";
    ctx.fillText(fix.id, fx + 7, fy + 3);
  }

  // 2. Organic Airport Apron Concrete Slabs & Curved Taxiway Network
  if (cam.pixelsPerNm >= 32) {
    const isSatOnly = sim.airport.isRealWorld && scopeLayer === "satellite";
    const isHybrid = sim.airport.isRealWorld && scopeLayer === "hybrid";

    // Organic Multi-Vertex Apron Pads (hugging terminals/gates rather than a giant full-field square)
    if (sim.airport.apronPolygons && sim.airport.apronPolygons.length > 0) {
      for (const poly of sim.airport.apronPolygons) {
        const pts = poly.map((p) => {
          const [x, y] = toScreen(p.x, p.y);
          return { x, y };
        });
        traceRoundedPolylinePath(ctx, pts, Math.max(8, cam.pixelsPerNm * 0.04), true);
        ctx.fillStyle = isSatOnly
          ? "rgba(255, 250, 235, 0.12)"
          : isHybrid
          ? isLight
            ? "rgba(228, 222, 208, 0.72)"
            : "rgba(18, 29, 45, 0.72)"
          : isLight
          ? "#e4ded0"
          : "rgba(18, 29, 45, 0.85)";
        ctx.strokeStyle = isSatOnly
          ? "rgba(245, 158, 11, 0.35)"
          : isLight
          ? "#cdc4b0"
          : "rgba(38, 58, 84, 0.7)";
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
      }
    } else {
      // Sculpted fallback apron ribbons tight around terminalZones (no outer field box)
      for (const tz of sim.airport.terminalZones) {
        const [bx1, by1] = toScreen(tz.x1, tz.y1);
        const [bx2, by2] = toScreen(tz.x2, tz.y2);
        const [bx3, by3] = toScreen(tz.x2, tz.y2 + (tz.y1 > 0 ? -0.14 : 0.14));
        const [bx4, by4] = toScreen(tz.x1, tz.y1 + (tz.y1 > 0 ? -0.14 : 0.14));
        traceRoundedPolylinePath(
          ctx,
          [
            { x: bx1, y: by1 },
            { x: bx2, y: by2 },
            { x: bx3, y: by3 },
            { x: bx4, y: by4 },
          ],
          10,
          true
        );
        ctx.fillStyle = isSatOnly
          ? "rgba(255, 250, 235, 0.12)"
          : isHybrid
          ? isLight
            ? "rgba(228, 222, 208, 0.7)"
            : "rgba(18, 29, 45, 0.7)"
          : isLight
          ? "#e4ded0"
          : "rgba(18, 29, 45, 0.8)";
        ctx.strokeStyle = isSatOnly
          ? "rgba(245, 158, 11, 0.35)"
          : isLight
          ? "#cdc4b0"
          : "rgba(38, 58, 84, 0.65)";
        ctx.fill();
        ctx.stroke();
      }
    }

    // Curved Continuous Taxiways (Layer 1: Outer Shoulder, Layer 2: Pavement, Layer 3: Continuous Golden Centerlines)
    const widthScale = sim.airport.isRealWorld ? 0.020 : 0.024;
    const twWidthPx = Math.max(3.5, Math.min(20, widthScale * cam.pixelsPerNm));
    const cornerRadiusPx = Math.max(5, twWidthPx * 1.25);
    const hasLosslessVisual =
      Boolean(sim.airport.visualTaxiways && sim.airport.visualTaxiways.length > 0);

    const chainPts: Array<{
      taxiway: TaxiwayName;
      dashed?: boolean;
      pts: ScreenPt[];
    }> = hasLosslessVisual
      ? sim.airport.visualTaxiways!
          .map((vt) => ({
            taxiway: vt.taxiway,
            dashed: false,
            pts: vt.points.map((p) => {
              const [x, y] = toScreen(p.x, p.y);
              return { x, y };
            }),
          }))
          .filter((ch) => ch.pts.length >= 2)
      : resolveTaxiwayChains(sim.airport)
          .map((ch) => ({
            ...ch,
            pts: ch.nodeIds
              .map((id) => sim.airport.nodes[id])
              .filter((n): n is NonNullable<typeof n> => Boolean(n))
              .map((n) => {
                const [x, y] = toScreen(n.x, n.y);
                return { x, y };
              }),
          }))
          .filter((ch) => ch.pts.length >= 2);

    const traceTaxiway = (pts: ScreenPt[]) => {
      if (hasLosslessVisual) {
        traceSmoothSplinePath(ctx, pts);
      } else {
        traceRoundedPolylinePath(ctx, pts, cornerRadiusPx, false);
      }
    };

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Layer 1: Taxiway Outer Shoulder Edge (subtle over satellite tiles)
    for (const ch of chainPts) {
      traceTaxiway(ch.pts);
      ctx.strokeStyle = isSatOnly
        ? "rgba(15, 23, 42, 0.28)"
        : isLight
        ? ch.taxiway === "APRON"
          ? "#cbc3b0"
          : "#bcb39e"
        : "#0e1726";
      ctx.lineWidth = ch.taxiway === "APRON" ? twWidthPx * 0.72 + 1.5 : twWidthPx + 2.4;
      ctx.stroke();
    }

    // Layer 2: Taxiway Inner Asphalt / Concrete
    for (const ch of chainPts) {
      traceTaxiway(ch.pts);
      ctx.strokeStyle = isSatOnly
        ? ch.taxiway === "APRON"
          ? "rgba(30, 41, 59, 0.22)"
          : "rgba(30, 41, 59, 0.32)"
        : isHybrid
        ? isLight
          ? ch.taxiway === "APRON"
            ? "rgba(222, 215, 199, 0.85)"
            : "rgba(213, 206, 190, 0.88)"
          : ch.taxiway === "APRON"
          ? "rgba(24, 35, 52, 0.82)"
          : "rgba(30, 44, 64, 0.86)"
        : isLight
        ? ch.taxiway === "APRON"
          ? "#ded7c7"
          : "#d5cebe"
        : ch.taxiway === "APRON"
        ? "#182334"
        : "#1e2c40";
      ctx.lineWidth = ch.taxiway === "APRON" ? twWidthPx * 0.72 : twWidthPx;
      ctx.stroke();
    }

    // Layer 3: Continuous Golden Taxiway Centerlines across all intersections
    for (const ch of chainPts) {
      traceTaxiway(ch.pts);
      ctx.strokeStyle = isSatOnly
        ? ch.dashed || ch.taxiway === "APRON"
          ? "rgba(250, 204, 21, 0.55)"
          : "rgba(250, 204, 21, 0.9)"
        : isLight
        ? ch.dashed || ch.taxiway === "APRON"
          ? "rgba(217, 119, 6, 0.45)"
          : "#eab308"
        : ch.dashed || ch.taxiway === "APRON"
        ? "rgba(245, 158, 11, 0.35)"
        : "rgba(245, 158, 11, 0.78)";
      ctx.lineWidth = Math.max(1, cam.pixelsPerNm > 200 ? 1.6 : 1.15);
      if (ch.dashed || ch.taxiway === "APRON") ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Taxiway Badge Pills (deduplicate tight overlapping badges on dense real hubs)
    if (cam.pixelsPerNm >= (sim.airport.isRealWorld ? 82 : 135)) {
      const placedLabels: Array<{ x: number; y: number }> = [];
      for (const lbl of sim.airport.taxiwayLabels) {
        const [lx, ly] = toScreen(lbl.x, lbl.y);
        if (lx < -30 || lx > w + 30 || ly < -30 || ly > h + 30) continue;
        if (placedLabels.some((p) => Math.hypot(p.x - lx, p.y - ly) < 34)) continue;
        placedLabels.push({ x: lx, y: ly });
        const boxW = Math.max(16, lbl.label.length * 6.2 + 6);
        ctx.fillStyle = isLight && !isSatOnly ? "#fffdf0" : "rgba(11, 19, 31, 0.92)";
        ctx.strokeStyle = isLight && !isSatOnly ? "#d97706" : "#f59e0b";
        ctx.lineWidth = 1.1;
        drawRoundedRect(ctx, lx - boxW / 2, ly - 8, boxW, 16, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = isLight && !isSatOnly ? "#78350f" : "#fbbf24";
        ctx.font = "800 9px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(lbl.label, lx, ly + 0.5);
      }
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    // Realistic Staggered & Styled Runways
    for (const rwyId of sim.airport.runwayIds) {
      const rwy = sim.airport.runways[rwyId];
      if (!rwy) continue;
      drawRealisticRunway(ctx, sim, rwy, toScreen, cam.pixelsPerNm, rotRad, isLight, scopeLayer);
    }

    // Architectural Terminals, Jetbridges, Hangars & ATC Tower
    if (cam.pixelsPerNm >= (sim.airport.isRealWorld ? 50 : 100)) {
      if (sim.airport.terminalBuildings && sim.airport.terminalBuildings.length > 0) {
        const placedBldLabels: Array<{ x: number; y: number }> = [];
        const sortedBuildings = [...sim.airport.terminalBuildings].sort((a, b) =>
          a.kind === b.kind ? 0 : a.kind === "TERMINAL" ? -1 : 1
        );
        for (const bld of sortedBuildings) {
          // Jetbridges
          if (bld.jetbridges && cam.pixelsPerNm >= 145) {
            ctx.strokeStyle = isLight ? "#78716c" : "#64748b";
            ctx.lineWidth = Math.max(1.5, cam.pixelsPerNm * 0.009);
            ctx.lineCap = "round";
            for (const jb of bld.jetbridges) {
              const [jx1, jy1] = toScreen(jb.x1, jb.y1);
              const [jx2, jy2] = toScreen(jb.x2, jb.y2);
              ctx.beginPath();
              ctx.moveTo(jx1, jy1);
              ctx.lineTo(jx2, jy2);
              ctx.stroke();
            }
          }

          const bPts = bld.polygon.map((p) => {
            const [x, y] = toScreen(p.x, p.y);
            return { x, y };
          });

          // Building Drop Shadow (omit in pure satellite overlay)
          if (!isSatOnly) {
            traceRoundedPolylinePath(
              ctx,
              bPts.map((p) => ({ x: p.x + 3, y: p.y + 4 })),
              4,
              true
            );
            ctx.fillStyle = isLight ? "rgba(28, 25, 23, 0.14)" : "rgba(0, 0, 0, 0.35)";
            ctx.fill();
          }

          // Main Roof Mass
          traceRoundedPolylinePath(ctx, bPts, 4, true);
          ctx.fillStyle = isSatOnly
            ? bld.kind === "TERMINAL"
              ? "rgba(56, 189, 248, 0.18)"
              : "rgba(148, 163, 184, 0.16)"
            : bld.kind === "TERMINAL"
            ? isLight
              ? "#cbc4b4"
              : "#1b293d"
            : isLight
            ? "#c5beae"
            : "#152233";
          ctx.strokeStyle = isSatOnly ? "#38bdf8" : isLight ? "#9c937f" : "#3b4f6b";
          ctx.lineWidth = 1.1;
          ctx.fill();
          ctx.stroke();

          if (bld.label && bld.labelX !== undefined && bld.labelY !== undefined && cam.pixelsPerNm >= (sim.airport.isRealWorld ? 90 : 165)) {
            const [lx, ly] = toScreen(bld.labelX, bld.labelY);
            if (!placedBldLabels.some((p) => Math.hypot(p.x - lx, p.y - ly) < 70)) {
              placedBldLabels.push({ x: lx, y: ly });
              ctx.fillStyle = isSatOnly ? "#e0f2fe" : isLight ? "#44403c" : "#94a3b8";
              ctx.font = "700 9px 'JetBrains Mono', monospace";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(bld.label, lx, ly);
              ctx.textAlign = "left";
              ctx.textBaseline = "alphabetic";
            }
          }
        }
      } else {
        // Fallback sculpted concourses for other airports
        for (const tz of sim.airport.terminalZones) {
          const [tx1, ty1] = toScreen(tz.x1, tz.y1);
          const [tx2, ty2] = toScreen(tz.x2, tz.y1);
          const [tx3, ty3] = toScreen(tz.x2, tz.y2);
          const [tx4, ty4] = toScreen(tz.x1, tz.y2);
          const pts = [
            { x: tx1, y: ty1 },
            { x: tx2, y: ty2 },
            { x: tx3, y: ty3 },
            { x: tx4, y: ty4 },
          ];
          traceRoundedPolylinePath(
            ctx,
            pts.map((p) => ({ x: p.x + 3, y: p.y + 4 })),
            5,
            true
          );
          ctx.fillStyle = isLight ? "rgba(28, 25, 23, 0.14)" : "rgba(0,0,0,0.4)";
          ctx.fill();

          traceRoundedPolylinePath(ctx, pts, 5, true);
          ctx.fillStyle = isLight ? "#cbc4b4" : "#182538";
          ctx.strokeStyle = isLight ? "#9c937f" : "#334155";
          ctx.fill();
          ctx.stroke();
        }
      }

      // Octagonal ATC Control Tower Landmark
      if (sim.airport.controlTower) {
        const [ctxX, ctxY] = toScreen(sim.airport.controlTower.x, sim.airport.controlTower.y);
        const r = Math.max(5, Math.min(10, cam.pixelsPerNm * 0.032));
        // Tower Spire Shadow
        ctx.fillStyle = isLight ? "rgba(28, 25, 23, 0.18)" : "rgba(0, 0, 0, 0.45)";
        ctx.beginPath();
        ctx.ellipse(ctxX + r * 0.8, ctxY + r * 0.9, r * 1.15, r * 0.75, 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Tower Cab
        ctx.fillStyle = isLight ? "#a8a29e" : "#334155";
        ctx.strokeStyle = isLight ? "#57534e" : "#94a3b8";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const ang = (i * Math.PI) / 4;
          const vx = ctxX + Math.cos(ang) * r;
          const vy = ctxY + Math.sin(ang) * r;
          if (i === 0) ctx.moveTo(vx, vy);
          else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isLight ? "#fef08a" : "#38bdf8";
        ctx.beginPath();
        ctx.arc(ctxX, ctxY, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Hold-Short Double Bars (perpendicular to runway axis!) & Gate Markers
    if (cam.pixelsPerNm >= 120) {
      for (const node of Object.values(sim.airport.nodes)) {
        const [nx, ny] = toScreen(node.x, node.y);
        if (node.kind === "HOLD_SHORT") {
          const holdingHere = sim.aircraftOrder.some((id) => {
            const a = sim.aircraft[id];
            return (
              a &&
              a.state === "HOLDING_SHORT" &&
              Math.hypot(a.x - node.x, a.y - node.y) < 0.03
            );
          });
          const rwySpec = node.holdShortForRunway
            ? sim.airport.runways[node.holdShortForRunway]
            : undefined;
          const barAngle = rwySpec
            ? Math.atan2(-rwySpec.uy, rwySpec.ux) + rotRad
            : rotRad;

          ctx.save();
          ctx.translate(nx, ny);
          ctx.rotate(barAngle);
          ctx.strokeStyle = holdingHere ? "#ef4444" : isLight ? "#d97706" : "#f59e0b";
          ctx.lineWidth = holdingHere ? 2.4 : 1.5;
          ctx.beginPath();
          ctx.moveTo(-6, -2);
          ctx.lineTo(6, -2);
          ctx.moveTo(-6, 2);
          ctx.lineTo(6, 2);
          ctx.stroke();
          ctx.restore();
        } else if (node.kind === "GATE" && node.gateId) {
          ctx.fillStyle = isLight ? "#0284c7" : "#38bdf8";
          ctx.beginPath();
          ctx.arc(nx, ny, 2.5, 0, Math.PI * 2);
          ctx.fill();
          if (cam.pixelsPerNm >= 175) {
            ctx.fillStyle = isLight ? "#57534e" : "#94a3b8";
            ctx.font = "600 9px 'JetBrains Mono', monospace";
            ctx.textAlign = "center";
            ctx.fillText(node.gateId, nx, ny - 6);
            ctx.textAlign = "left";
          }
        }
      }
    }
  }

  // 3. Draw Cleared Route & Hover Preview Route with Smooth Curves
  const drawNodeRoute = (
    nodeIds: string[],
    startIdx: number,
    color: string,
    dashed: boolean
  ) => {
    const pts: ScreenPt[] = [];
    for (let i = Math.max(0, startIdx); i < nodeIds.length; i++) {
      const node = sim.airport.nodes[nodeIds[i]];
      if (!node) continue;
      const [nx, ny] = toScreen(node.x, node.y);
      pts.push({ x: nx, y: ny });
    }
    if (pts.length < 2) return;
    traceRoundedPolylinePath(ctx, pts, 14, false);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.8;
    if (dashed) ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const selectedAc = sim.selectedAircraftId ? sim.aircraft[sim.selectedAircraftId] : null;
  if (selectedAc && selectedAc.assignedRouteNodeIds.length >= 2) {
    drawNodeRoute(
      selectedAc.assignedRouteNodeIds,
      selectedAc.routeStepIndex,
      isLight ? "#059669" : "rgba(16, 185, 129, 0.85)",
      true
    );
  }
  if (hoverPreviewRoute && hoverPreviewRoute.length >= 2) {
    drawNodeRoute(
      hoverPreviewRoute,
      0,
      isLight ? "#0284c7" : "rgba(34, 211, 238, 0.9)",
      false
    );
  }

  // Airborne Vector Line + Suggested Go-Around Return Path for Selected Aircraft
  if (selectedAc && selectedAc.altitude > sim.airport.elevationFt + 50) {
    const [ax, ay] = toScreen(selectedAc.x, selectedAc.y);
    if (selectedAc.assignedDirectFix && sim.airport.fixes[selectedAc.assignedDirectFix]) {
      const fix = sim.airport.fixes[selectedAc.assignedDirectFix];
      const [fx, fy] = toScreen(fix.x, fix.y);
      ctx.strokeStyle = isLight ? "rgba(2, 132, 199, 0.55)" : "rgba(34, 211, 238, 0.55)";
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (
      selectedAc.state === "GO_AROUND" ||
      selectedAc.state === "MISSED_APPROACH"
    ) {
      const guidance = computeDepAppGuidance(sim.airport, selectedAc);
      if (guidance.recoveryPreviewPoints.length >= 2) {
        const recPts: ScreenPt[] = guidance.recoveryPreviewPoints.map((pt) => {
          const [sx, sy] = toScreen(pt.x, pt.y);
          return { x: sx, y: sy };
        });
        ctx.save();
        traceRoundedPolylinePath(ctx, recPts, 28, false);
        ctx.strokeStyle = isLight
          ? "rgba(217, 119, 6, 0.65)"
          : "rgba(245, 158, 11, 0.72)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
  }

  // 4. Draw Aircraft Icons first, then Place & Draw Non-Overlapping Data Tags
  const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
  const callerById = new Map<string, ActiveCallerSignal>(
    activeCallers.map((c) => [c.aircraftId, c])
  );
  const visibleIcons: IconObstacle[] = [];
  const labelMetaById = new Map<
    string,
    {
      input: LabelCandidateInput;
      line1: string;
      line2: string;
      primaryColor: string;
      isSelected: boolean;
      isHovered: boolean;
      isError: boolean;
      isEmerg: boolean;
      caller?: ActiveCallerSignal;
    }
  >();

  for (const id of sim.aircraftOrder) {
    const ac = sim.aircraft[id];
    if (!ac) continue;
    if (ac.state === "COMPLETED_ARRIVAL" || ac.state === "COMPLETED_DEPARTURE") continue;

    const [ax, ay] = toScreen(ac.x, ac.y);
    if (ax < -80 || ax > w + 80 || ay < -80 || ay > h + 80) continue;

    visibleIcons.push({ id: ac.id, ax, ay });

    const caller = callerById.get(ac.id);
    if (caller) {
      drawRadioTransmissionSignal(ctx, ax, ay, cx0, cy0, caller, isLight, nowMs);
    }

    // Radar Trail
    if (ac.trail.length > 1 && !isSurfaceAircraft(ac, sim.airport.elevationFt)) {
      for (let i = 0; i < ac.trail.length; i++) {
        const [tx, ty] = toScreen(ac.trail[i].x, ac.trail[i].y);
        const alpha = ((i + 1) / ac.trail.length) * (isLight ? 0.55 : 0.45);
        ctx.fillStyle = isLight
          ? `rgba(2, 132, 199, ${alpha})`
          : `rgba(34, 211, 238, ${alpha})`;
        ctx.beginPath();
        ctx.arc(tx, ty, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const isSelected = sim.selectedAircraftId === ac.id;
    const isHovered = hoveredId === ac.id;
    const isEmerg =
      ac.operationMode === "EMERGENCY_OPERATION" || ac.state === "STOPPED_ON_RUNWAY";
    const isError = ac.hasReadbackError;
    const isNordo = ac.commStatus === "RADIO_FAILURE";
    const isHolding =
      ac.state === "HOLDING_SHORT" ||
      ac.state === "HOLD_POSITION" ||
      ac.state === "TAKEOFF_CANCELLED";

    const primaryColor = isEmerg || isError
      ? isLight
        ? "#dc2626"
        : "#ef4444"
      : isNordo
      ? "#ea580c"
      : isHolding
      ? isLight
        ? "#d97706"
        : "#f59e0b"
      : ac.flightKind === "ARRIVAL"
      ? isLight
        ? "#059669"
        : "#10b981"
      : isLight
      ? "#0284c7"
      : "#22d3ee";

    // Selection / Alert Halo + Target Lock Corner Reticle for selected aircraft
    if (isSelected) {
      const selColor = isError || isEmerg ? "#ef4444" : isLight ? "#d97706" : "#22d3ee";
      const pulseR = 16 + Math.sin(nowMs * 0.006) * 2;
      ctx.save();
      ctx.strokeStyle = isLight ? "rgba(217, 119, 6, 0.35)" : "rgba(34, 211, 238, 0.35)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ax, ay, pulseR, 0, Math.PI * 2);
      ctx.stroke();

      // 4 crisp corner target-lock brackets around selected aircraft
      const r = 18;
      const tick = 6;
      ctx.strokeStyle = selColor;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      // Top-Left
      ctx.moveTo(ax - r, ay - r + tick);
      ctx.lineTo(ax - r, ay - r);
      ctx.lineTo(ax - r + tick, ay - r);
      // Top-Right
      ctx.moveTo(ax + r - tick, ay - r);
      ctx.lineTo(ax + r, ay - r);
      ctx.lineTo(ax + r, ay - r + tick);
      // Bottom-Right
      ctx.moveTo(ax + r, ay + r - tick);
      ctx.lineTo(ax + r, ay + r);
      ctx.lineTo(ax + r - tick, ay + r);
      // Bottom-Left
      ctx.moveTo(ax - r + tick, ay + r);
      ctx.lineTo(ax - r, ay + r);
      ctx.lineTo(ax - r, ay + r - tick);
      ctx.stroke();
      ctx.restore();
    } else if (isHovered || isError || isEmerg) {
      ctx.strokeStyle = isError || isEmerg ? "#ef4444" : "#94a3b8";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ax, ay, 11, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Aircraft Symbol (rotated by world heading + chart rotation)
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate((ac.heading * Math.PI) / 180 + rotRad);

    if (cam.pixelsPerNm >= 120) {
      ctx.fillStyle = primaryColor;
      ctx.strokeStyle = isLight ? "#ffffff" : "#040810";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(1.8, -3);
      ctx.lineTo(9, 2);
      ctx.lineTo(9, 4);
      ctx.lineTo(1.8, 2);
      ctx.lineTo(1.4, 6.5);
      ctx.lineTo(4.2, 8.5);
      ctx.lineTo(4.2, 9.8);
      ctx.lineTo(0, 8.5);
      ctx.lineTo(-4.2, 9.8);
      ctx.lineTo(-4.2, 8.5);
      ctx.lineTo(-1.4, 6.5);
      ctx.lineTo(-1.8, 2);
      ctx.lineTo(-9, 4);
      ctx.lineTo(-9, 2);
      ctx.lineTo(-1.8, -3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.strokeStyle = primaryColor;
      ctx.fillStyle = primaryColor;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(5, 0);
      ctx.lineTo(0, 5);
      ctx.lineTo(-5, 0);
      ctx.closePath();
      ctx.stroke();

      if (ac.speed > 5) {
        const vecLen = Math.min(24, Math.max(8, ac.speed / 10));
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.lineTo(0, -5 - vecLen);
        ctx.stroke();
      }
    }
    ctx.restore();

    const isSurfaceOnly =
      ac.altitude <= sim.airport.elevationFt + 40 &&
      ac.state !== "TAKEOFF_ROLL" &&
      ac.state !== "LANDING" &&
      ac.state !== "LINE_UP_WAIT" &&
      ac.state !== "STOPPED_ON_RUNWAY";

    if (
      cam.pixelsPerNm < 75 &&
      isSurfaceOnly &&
      !isSelected &&
      !isHovered &&
      !isError &&
      !isEmerg &&
      !caller
    ) {
      continue;
    }

    const hasPendingReq = Boolean(ac.pendingRequest && !ac.pendingRequest.resolved);
    const badge = isError
      ? " ERR!"
      : isEmerg
      ? " 7700"
      : isNordo
      ? " 7600"
      : hasPendingReq
      ? " *"
      : "";

    const line1 = `${ac.callsign}${badge}`;
    const line2 = shortStateTag(ac, sim.airport.elevationFt);
    const boxW = Math.max(line1.length, line2.length) * 6.4 + 12;
    const boxH = isLight ? 27 : 25;

    // Keep placement priority independent of hover/selection so fanning labels stay rock-steady under the cursor.
    const placementPriority = isError || isEmerg ? 200 : hasPendingReq ? 50 : 0;
    const drawPriority = isSelected
      ? 400
      : isError || isEmerg
      ? 300
      : caller
      ? 260
      : isHovered
      ? 200
      : hasPendingReq
      ? 100
      : 0;

    labelMetaById.set(ac.id, {
      input: {
        id: ac.id,
        ax,
        ay,
        boxW,
        boxH,
        preferredAbove: ac.flightKind === "ARRIVAL",
        priority: placementPriority,
        drawPriority,
      },
      line1,
      line2,
      primaryColor,
      isSelected,
      isHovered,
      isError,
      isEmerg,
      caller,
    });
  }

  const placedLabels = placeAircraftLabels(
    Array.from(labelMetaById.values(), (m) => m.input),
    visibleIcons,
    w,
    h
  );
  const drawnLabelHits: DrawnLabelHit[] = [];

  for (const placed of placedLabels) {
    const meta = labelMetaById.get(placed.id);
    if (!meta) continue;
    const { line1, line2, primaryColor, isSelected, isHovered, isError, isEmerg, caller } = meta;
    const { x: tagX, y: boxTop, w: boxW, h: boxH } = placed.rect;
    const tagY = boxTop + (isLight ? 11 : 10);
    const callerRgb = caller ? getRadioSignalRgb(caller.category, isLight) : null;
    const callerCss = callerRgb ? `rgb(${callerRgb[0]}, ${callerRgb[1]}, ${callerRgb[2]})` : null;

    // Leader line pointing cleanly from aircraft perimeter to closest label edge
    ctx.strokeStyle = callerCss
      ? callerCss
      : isSelected
      ? isLight
        ? "rgba(234, 179, 8, 0.85)"
        : "rgba(34, 211, 238, 0.85)"
      : isLight
      ? "rgba(87, 83, 78, 0.55)"
      : "rgba(148, 163, 184, 0.5)";
    ctx.lineWidth = caller || isSelected ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(placed.leaderStartX, placed.leaderStartY);
    ctx.lineTo(placed.leaderEndX, placed.leaderEndY);
    ctx.stroke();

    if (isLight) {
      ctx.fillStyle = isSelected ? "#fffdf5" : isHovered ? "#ffffff" : "rgba(255, 255, 255, 0.94)";
      ctx.strokeStyle = callerCss
        ? callerCss
        : isError || isEmerg
        ? "#ef4444"
        : isSelected
        ? "#eab308"
        : isHovered
        ? "#0284c7"
        : "#d6d3d1";
      ctx.lineWidth = caller || isSelected || isHovered ? 1.8 : 1;
      drawRoundedRect(ctx, tagX, boxTop, boxW, boxH, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isError || isEmerg ? "#b91c1c" : "#0f172a";
      ctx.font = "700 10px 'JetBrains Mono', monospace";
      ctx.fillText(line1, tagX + 5, tagY);

      ctx.fillStyle = "#57534e";
      ctx.font = "500 9px 'JetBrains Mono', monospace";
      ctx.fillText(line2, tagX + 5, tagY + 11);
    } else {
      ctx.fillStyle = isSelected
        ? "rgba(15, 32, 54, 0.94)"
        : isHovered
        ? "rgba(15, 28, 48, 0.92)"
        : "rgba(8, 16, 28, 0.84)";
      ctx.strokeStyle = callerCss
        ? callerCss
        : isError || isEmerg
        ? "#ef4444"
        : isSelected
        ? primaryColor
        : isHovered
        ? "#38bdf8"
        : "rgba(30, 48, 72, 0.85)";
      ctx.lineWidth = caller || isSelected || isHovered ? 1.6 : 1;
      drawRoundedRect(ctx, tagX, boxTop, boxW, boxH, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = primaryColor;
      ctx.font = "700 10px 'JetBrains Mono', monospace";
      ctx.fillText(line1, tagX + 5, tagY);

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "500 9px 'JetBrains Mono', monospace";
      ctx.fillText(line2, tagX + 5, tagY + 11);
    }

    drawnLabelHits.push({ id: placed.id, rect: placed.rect });
  }

  // 5. True North Compass Indicator (Top-Right)
  drawCompassNorthArrow(ctx, w, rotRad, isLight);
  return drawnLabelHits;
}
