import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Crosshair,
  FileText,
  GripVertical,
  Layers,
  LayoutGrid,
  List,
  PanelLeftClose,
  PanelLeftOpen,
  PlaneLanding,
  PlaneTakeoff,
  Radio,
  ShieldAlert,
} from "lucide-react";
import { IfrFlightPlanModal } from "./IfrFlightPlanModal.tsx";
import { getActiveClearances, getPendingReadbackClearances } from "../engine/clearanceEngine.ts";
import { getAircraftPhaseLabel } from "../engine/simulation.ts";
import { canAircraftMove } from "../engine/validationEngine.ts";
import { useAtcStore } from "../store/atcStore.ts";
import type { Aircraft, ControllerRole, FlightKind } from "../types/atc.ts";
import { formatAltitudeReadout } from "../utils/telemetry.ts";
import { getDeadlockedAircraftIds } from "../utils/groundConflict.ts";
import { radioAudio } from "../utils/radioAudio.ts";
import { getActiveCallingSignals } from "../utils/radioSignals.ts";
import { VoiceWaveform } from "./VoiceWaveform.tsx";
import { Accordion } from "./Accordion.tsx";

type StripFilter = "ALL" | "STATION" | "DEP" | "ARR";
type StripViewMode = "LIST" | "KANBAN";

function stateBadgeStyle(ac: Aircraft): string {
  if (
    ac.hasReadbackError ||
    ac.operationMode === "EMERGENCY_OPERATION" ||
    ac.state === "STOPPED_ON_RUNWAY" ||
    ac.state === "CRASHED"
  ) {
    return "bg-[var(--atc-red-bg)] text-[var(--atc-red)] border-[var(--atc-red-border)]";
  }
  if (ac.commStatus === "RADIO_FAILURE") {
    return "bg-[var(--atc-amber-bg)] text-[var(--atc-amber)] border-[var(--atc-amber-border)]";
  }
  if (
    ac.state === "HOLDING_SHORT" ||
    ac.state === "HOLD_POSITION" ||
    ac.state === "TAKEOFF_CANCELLED"
  ) {
    return "bg-[var(--atc-amber-bg)] text-[var(--atc-amber)] border-[var(--atc-amber-border)]";
  }
  if (
    ac.state === "TAKEOFF_ROLL" ||
    ac.state === "ROTATE" ||
    ac.state === "CLEARED_TO_LAND" ||
    ac.state === "LANDING" ||
    ac.state === "LINE_UP_WAIT"
  ) {
    return "bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] border-[var(--atc-emerald-border)]";
  }
  if (ac.state === "TAXIING" || ac.state === "CROSSING_RUNWAY" || ac.state === "PUSHING_BACK") {
    return "bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)] border-[var(--atc-cyan-border)]";
  }
  return "bg-[var(--atc-surface-alt)] text-[var(--atc-text-secondary)] border-[var(--atc-border)]";
}

function controllerBadge(ctrl: ControllerRole, flightKind?: FlightKind): { letter: string; cls: string; title: string } {
  switch (ctrl) {
    case "DELIVERY":
      return {
        letter: "CD",
        title: "Clearance Delivery",
        cls: "bg-purple-950/70 text-purple-300 border-purple-700/60",
      };
    case "GROUND":
      return {
        letter: "G",
        title: "Ground Control",
        cls: "bg-[var(--atc-amber-bg)] text-[var(--atc-amber)] border-[var(--atc-amber-border)]",
      };
    case "TOWER":
      return {
        letter: "T",
        title: "Tower Control",
        cls: "bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)] border-[var(--atc-cyan-border)]",
      };
    case "DEPARTURE":
      return flightKind === "ARRIVAL"
        ? {
            letter: "A",
            title: "Approach Control (APP)",
            cls: "bg-[var(--atc-accent-bg)] text-[var(--atc-accent-text)] border-[var(--atc-accent-border)]",
          }
        : {
            letter: "D",
            title: "Departure Control (DEP)",
            cls: "bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] border-[var(--atc-emerald-border)]",
          };
    case "CENTER":
      return {
        letter: "C",
        title: "Area Control / Center",
        cls: "bg-indigo-950/70 text-indigo-300 border-indigo-700/60",
      };
  }
}

export const FlightStripRack: React.FC = () => {
  const sim = useAtcStore((s) => s.sim);
  useAtcStore((s) => s.tickVersion);
  const focusAircraft = useAtcStore((s) => s.focusAircraft);
  const respondToHandoff = useAtcStore((s) => s.respondToHandoff);
  const claimAircraftStation = useAtcStore((s) => s.claimAircraftStation);
  const issueClearance = useAtcStore((s) => s.issueClearance);
  const roomState = useAtcStore((s) => s.roomState);
  const minimized = useAtcStore((s) => s.minimizedPanels.left);
  const togglePanelMinimized = useAtcStore((s) => s.togglePanelMinimized);
  const stripRefs = useRef<Record<string, HTMLElement | null>>({});

  const [viewMode, setViewMode] = useState<StripViewMode>(() => {
    try {
      const saved = localStorage.getItem("aircommand_strip_view_mode");
      if (saved === "KANBAN" || saved === "LIST") return saved;
    } catch {}
    return "LIST";
  });

  const toggleViewMode = (mode: StripViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem("aircommand_strip_view_mode", mode);
    } catch {}
  };

  const [selectedFlightPlanAcId, setSelectedFlightPlanAcId] = useState<string | null>(null);
  const [dragOverRole, setDragOverRole] = useState<ControllerRole | null>(null);
  const [filter, setFilter] = useState<StripFilter>(
    sim.config.activePlayerStation === "ALL" ? "ALL" : "STATION"
  );

  useEffect(() => {
    setFilter(sim.config.activePlayerStation === "ALL" ? "ALL" : "STATION");
  }, [sim.config.activePlayerStation]);

  useEffect(() => {
    const id = sim.selectedAircraftId;
    if (!id) return;
    const el = stripRefs.current[id];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [sim.selectedAircraftId, filter, viewMode]);

  const activeFlights = sim.aircraftOrder
    .map((id) => sim.aircraft[id])
    .filter(
      (ac): ac is Aircraft =>
        Boolean(ac) &&
        ac.state !== "COMPLETED_ARRIVAL" &&
        ac.state !== "COMPLETED_DEPARTURE"
    );

  const allHandoffs = [
    ...(sim.handoffs ?? []),
    ...(roomState?.handoffs ?? []),
  ].filter((h, idx, arr) => arr.findIndex((x) => x.id === h.id) === idx);

  const pendingHandoffsByAcId = new Map(
    allHandoffs
      .filter((h) => h.status === "PENDING" && h.toController === sim.config.activePlayerStation)
      .map((h) => [h.aircraftId, h])
  );

  const strips = activeFlights.filter((ac) => {
    if (filter === "STATION") {
      if (sim.config.activePlayerStation === "ALL") return true;
      return (
        ac.controller === sim.config.activePlayerStation ||
        pendingHandoffsByAcId.has(ac.id)
      );
    }
    if (filter === "DEP") return ac.flightKind === "DEPARTURE";
    if (filter === "ARR") return ac.flightKind === "ARRIVAL";
    return true;
  });

  const workloadCounts: Record<ControllerRole, number> = {
    DELIVERY: activeFlights.filter((a) => a.controller === "DELIVERY").length,
    GROUND: activeFlights.filter((a) => a.controller === "GROUND").length,
    TOWER: activeFlights.filter((a) => a.controller === "TOWER").length,
    DEPARTURE: activeFlights.filter((a) => a.controller === "DEPARTURE").length,
    CENTER: activeFlights.filter((a) => a.controller === "CENTER").length,
  };

  const urgentCount = activeFlights.filter(
    (a) => a.hasReadbackError || Boolean(a.pendingRequest && !a.pendingRequest.resolved)
  ).length;
  const activeCallerIds = new Set(
    getActiveCallingSignals(sim, radioAudio.getActiveTransmission()).map((c) => c.aircraftId)
  );
  const deadlockedIds = getDeadlockedAircraftIds(sim);

  const handleDragStart = (e: React.DragEvent, aircraftId: string) => {
    e.dataTransfer.setData("text/plain", aircraftId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleApprovePilotRequest = (e: React.MouseEvent, ac: Aircraft) => {
    e.stopPropagation();
    const req = ac.pendingRequest;
    if (!req) return;

    if (req.type === "RUNWAY_CHANGE" && req.runway) {
      issueClearance({
        aircraftId: ac.id,
        controller: ac.controller,
        type: ac.flightKind === "ARRIVAL" ? "APPROACH" : "TAXI",
        parameters: { runway: req.runway },
      });
      return;
    }

    if (req.type === "TAXI" || req.type === "GATE_TAXI") {
      issueClearance({
        aircraftId: ac.id,
        controller: ac.controller,
        type: "TAXI",
        parameters: ac.flightKind === "ARRIVAL" ? { gate: ac.gateId } : { runway: ac.targetRunway },
      });
      return;
    }

    if (req.type === "PUSHBACK") {
      issueClearance({
        aircraftId: ac.id,
        controller: ac.controller,
        type: "PUSHBACK",
        parameters: { pushbackDirection: "TAXIWAY_A" },
      });
      return;
    }

    if (req.type === "TAKEOFF") {
      issueClearance({
        aircraftId: ac.id,
        controller: ac.controller,
        type: "TAKEOFF",
        parameters: { runway: ac.targetRunway },
      });
      return;
    }

    if (req.type === "LANDING") {
      issueClearance({
        aircraftId: ac.id,
        controller: ac.controller,
        type: "LAND",
        parameters: { runway: ac.assignedApproach ?? ac.targetRunway },
      });
      return;
    }

    if (req.type === "CROSS_RUNWAY") {
      issueClearance({
        aircraftId: ac.id,
        controller: ac.controller,
        type: "CROSS_RUNWAY",
        parameters: { runway: ac.holdingAtRunway ?? ac.targetRunway },
      });
      return;
    }

    if (req.type === "IFR_CLEARANCE") {
      issueClearance({
        aircraftId: ac.id,
        controller: "DELIVERY",
        type: "IFR_CLEARANCE",
        parameters: {
          altitude: 5000,
        },
      });
      return;
    }

    if (req.type === "CLIMB_HIGHER") {
      issueClearance({
        aircraftId: ac.id,
        controller: ac.controller,
        type: "ALTITUDE",
        parameters: { altitude: Math.min(10000, (ac.assignedAltitude ?? 3000) + 2000) },
      });
      return;
    }

    if (req.type === "APPROACH_VECTORS") {
      issueClearance({
        aircraftId: ac.id,
        controller: ac.controller,
        type: "HEADING",
        parameters: { heading: ac.heading },
      });
      return;
    }

    focusAircraft(ac.id);
  };

  const handleDropToColumn = (e: React.DragEvent, targetRole: ControllerRole) => {
    e.preventDefault();
    setDragOverRole(null);
    const aircraftId = e.dataTransfer.getData("text/plain");
    if (!aircraftId) return;
    const ac = sim.aircraft[aircraftId];
    if (!ac || ac.controller === targetRole) return;
    claimAircraftStation(aircraftId, targetRole);
  };

  // Render Full Detailed Strip (Used in List View and in Player's Kanban Column)
  const renderFullStrip = (ac: Aircraft, draggable = false) => {
    const isSelected = sim.selectedAircraftId === ac.id;
    const activeClrs = getActiveClearances(ac);
    const pendingRb = getPendingReadbackClearances(ac);
    const movable = canAircraftMove(ac, sim);
    const ctrl = controllerBadge(ac.controller, ac.flightKind);
    const hasReq = Boolean(ac.pendingRequest && !ac.pendingRequest.resolved);
    const isCalling = activeCallerIds.has(ac.id);
    const ho = pendingHandoffsByAcId.get(ac.id);
    const fp = ac.flightPlan;
    const isCleared = fp ? fp.clearanceStatus === "CLEARED" : ac.flightKind === "ARRIVAL";

    return (
      <div
        key={ac.id}
        ref={(el) => {
          stripRefs.current[ac.id] = el;
        }}
        draggable={draggable}
        onDragStart={draggable ? (e) => handleDragStart(e, ac.id) : undefined}
        onClick={() => focusAircraft(ac.id)}
        className={`w-full text-left rounded-lg border p-2 transition-all cursor-pointer ${
          draggable ? "cursor-grab active:cursor-grabbing" : ""
        } ${
          isSelected
            ? "bg-[var(--atc-accent-soft)] border-[var(--atc-accent)] border-l-4 ring-2 ring-[var(--atc-accent)]/60 shadow-md"
            : isCalling
            ? "bg-[var(--atc-amber-bg)]/45 border-[var(--atc-amber-border)] shadow-sm"
            : "bg-[var(--atc-surface)]/80 border-[var(--atc-border)] hover:border-[var(--atc-border-strong)]"
        }`}
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {draggable && <GripVertical className="w-2.5 h-2.5 text-[var(--atc-muted)] shrink-0 opacity-60" />}
            {ac.flightKind === "DEPARTURE" ? (
              <PlaneTakeoff className="w-3.5 h-3.5 text-[var(--atc-cyan)] shrink-0" />
            ) : (
              <PlaneLanding className="w-3.5 h-3.5 text-[var(--atc-emerald)] shrink-0" />
            )}
            <span className="font-mono font-bold text-xs text-[var(--atc-text)] truncate">
              {ac.callsign}
            </span>
            <span className="text-[10px] font-mono text-[var(--atc-muted)] shrink-0">
              {ac.aircraftType}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isSelected && (
              <span
                title="Currently selected aircraft (focused on scope)"
                className="px-1.5 py-0.5 rounded bg-[var(--atc-accent)] text-slate-950 text-[8px] font-mono font-extrabold inline-flex items-center gap-0.5 shadow-sm"
              >
                <Crosshair className="w-2.5 h-2.5" />
                SEL
              </span>
            )}
            {deadlockedIds.has(ac.id) && (
              <span
                title="Blocked on taxiway — click strip to resolve"
                className="px-1.5 py-0.5 rounded bg-[var(--atc-red-bg)] text-[var(--atc-red)] border border-[var(--atc-red-border)] text-[8px] font-mono font-extrabold animate-pulse"
              >
                BLK
              </span>
            )}
            {isCalling && (
              <span
                title="Actively transmitting voice on radio"
                className="px-1.5 py-0.5 rounded bg-[var(--atc-amber-bg)] text-[var(--atc-amber)] border border-[var(--atc-amber-border)] text-[9px] font-mono font-bold inline-flex items-center gap-1.5"
              >
                <VoiceWaveform
                  size="xs"
                  isSpeaking={true}
                  className="text-[var(--atc-amber)]"
                />
                TX
              </span>
            )}
            {ac.commStatus === "RADIO_FAILURE" && (
              <span className="px-1 py-0.5 rounded bg-[var(--atc-amber-bg)] text-[var(--atc-amber)] border border-[var(--atc-amber-border)] text-[9px] font-mono font-bold">
                7600
              </span>
            )}
            {ac.operationMode === "EMERGENCY_OPERATION" && (
              <span className="px-1 py-0.5 rounded bg-[var(--atc-red-bg)] text-[var(--atc-red)] border border-[var(--atc-red-border)] text-[9px] font-mono font-bold animate-pulse">
                7700
              </span>
            )}
            <span
              className={`px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold ${ctrl.cls}`}
            >
              {ctrl.letter}
            </span>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-[var(--atc-muted)]">
          <span className="truncate">
            {ac.flightKind === "DEPARTURE"
              ? `${ac.gateId ?? "RAMP"} → ${ac.targetRunway}`
              : `${ac.assignedApproach ?? ac.targetRunway} → ${ac.gateId ?? "GATE"}`}
          </span>
          <span
            className="shrink-0"
            title={formatAltitudeReadout(ac, sim.airport.elevationFt).detailed}
          >
            {formatAltitudeReadout(ac, sim.airport.elevationFt).strip} • {Math.round(ac.speed)}kt
          </span>
        </div>

        {/* IFR Flight Plan Quick Bar */}
        <div className="mt-1 flex items-center justify-between gap-1 text-[10px] font-mono">
          <div className="flex items-center gap-1.5 truncate">
            {ac.flightKind === "DEPARTURE" && !isCleared && (
              <span className="px-1 py-0.2 rounded text-[8px] font-bold border bg-[var(--atc-amber-bg)] text-[var(--atc-amber)] border-[var(--atc-amber-border)] animate-pulse">
                IFR PENDING
              </span>
            )}
            <span className="text-[var(--atc-text)] truncate font-semibold">
              {ac.aircraftType}{fp?.equipmentSuffix ?? "/L"} → {fp?.destinationIcao ?? ac.destinationIcao ?? "DEST"} · {fp?.proposedDepartureTimeZ ?? "P2121"}
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedFlightPlanAcId(ac.id);
            }}
            title="Inspect full IFR Flight Plan details"
            className="px-1.5 py-0.5 rounded border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] hover:border-[var(--atc-accent)] text-[9px] font-mono text-[var(--atc-text-secondary)] hover:text-[var(--atc-accent-text)] flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
          >
            <FileText className="w-2.5 h-2.5" />
            PLAN
          </button>
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-1">
          <span
            className={`px-1.5 py-0.5 rounded border text-[9px] font-mono font-semibold truncate ${stateBadgeStyle(ac)}`}
            title={ac.state}
          >
            {getAircraftPhaseLabel(ac)}
          </span>
        </div>

        {/* Incoming Handoff Request with 1-click ACCEPT Button */}
        {ho && (
          <div className="mt-1.5 px-2 py-1.5 rounded-md bg-[var(--atc-cyan-bg)] border border-[var(--atc-cyan-border)] flex items-center justify-between gap-2 text-[10px] font-mono shadow-sm">
            <span className="font-bold text-[var(--atc-cyan)] flex items-center gap-1.5 truncate">
              <Radio className="w-3.5 h-3.5 animate-spin-slow shrink-0" />
              INCOMING HANDOFF
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                respondToHandoff(ho.id, true);
              }}
              className="h-5 px-2.5 rounded border border-[var(--atc-emerald)] bg-transparent hover:bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] font-mono font-bold text-[9px] tracking-wider uppercase inline-flex items-center justify-center text-center shrink-0 transition-colors cursor-pointer select-none gap-1 pt-[1px]"
            >
              <CheckCircle className="w-2.5 h-2.5" />
              ACCEPT
            </button>
          </div>
        )}

        {/* Pilot Request Banner with Inline Approval Button (Only shown in strip as requested) */}
        {!ac.hasReadbackError && pendingRb.length === 0 && hasReq && ac.pendingRequest && !ho && (
          <div className="mt-1.5 px-2 py-1.5 rounded-md border border-[var(--atc-amber-border)] bg-[var(--atc-amber-bg)] flex items-center justify-between gap-2 shadow-sm">
            <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-[var(--atc-amber)] truncate">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[var(--atc-amber)]" />
              <span className="truncate">
                REQ: {ac.pendingRequest.type}
                {ac.pendingRequest.runway
                  ? ` ${ac.pendingRequest.runway}`
                  : ac.holdingAtRunway
                  ? ` (${ac.holdingAtRunway})`
                  : ""}
              </span>
            </span>
            <button
              type="button"
              onClick={(e) => handleApprovePilotRequest(e, ac)}
              title={`Approve pilot request (${ac.pendingRequest.type})`}
              className="h-5 px-2.5 rounded border border-[var(--atc-emerald)] bg-transparent hover:bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] font-mono font-bold text-[9px] tracking-wider uppercase inline-flex items-center justify-center text-center shrink-0 transition-colors cursor-pointer select-none pt-[1px]"
            >
              APPROVE
            </button>
          </div>
        )}

        {ac.hasReadbackError && (
          <div className="mt-1.5 px-1.5 py-0.5 rounded bg-[var(--atc-red-bg)] border border-[var(--atc-red-border)] text-[10px] font-mono text-[var(--atc-red)] flex items-center gap-1">
            <ShieldAlert className="w-3 h-3 shrink-0" />
            READBACK ERROR
          </div>
        )}

        {!ac.hasReadbackError && pendingRb.length > 0 && (
          <div className="mt-1.5 px-1.5 py-0.5 rounded bg-[var(--atc-cyan-bg)] border border-[var(--atc-cyan-border)] text-[10px] font-mono text-[var(--atc-cyan)] flex items-center gap-1">
            <Radio className="w-3 h-3 shrink-0 animate-pulse" />
            <span className="truncate">Readback: {pendingRb[pendingRb.length - 1].type}</span>
          </div>
        )}
      </div>
    );
  };

  // Render Minimal Strip (For other controller lanes in Kanban view, as requested)
  const renderMinimalStrip = (ac: Aircraft) => {
    const isSelected = sim.selectedAircraftId === ac.id;
    const isCalling = activeCallerIds.has(ac.id);
    const fp = ac.flightPlan;
    const isCleared = fp ? fp.clearanceStatus === "CLEARED" : ac.flightKind === "ARRIVAL";

    return (
      <div
        key={ac.id}
        ref={(el) => {
          stripRefs.current[ac.id] = el;
        }}
        draggable={true}
        onDragStart={(e) => handleDragStart(e, ac.id)}
        onClick={() => focusAircraft(ac.id)}
        className={`w-full text-left rounded-md border p-1.5 transition-all cursor-grab active:cursor-grabbing select-none ${
          isSelected
            ? "bg-[var(--atc-accent-soft)] border-[var(--atc-accent)] border-l-4 ring-1 ring-[var(--atc-accent)]/60 shadow-sm"
            : isCalling
            ? "bg-[var(--atc-amber-bg)]/40 border-[var(--atc-amber-border)] shadow-xs"
            : "bg-[var(--atc-surface)]/80 border-[var(--atc-border)] hover:border-[var(--atc-border-strong)]"
        }`}
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <GripVertical className="w-2.5 h-2.5 text-[var(--atc-muted)] shrink-0 opacity-60" />
            {ac.flightKind === "DEPARTURE" ? (
              <PlaneTakeoff className="w-3 h-3 text-[var(--atc-cyan)] shrink-0" />
            ) : (
              <PlaneLanding className="w-3 h-3 text-[var(--atc-emerald)] shrink-0" />
            )}
            <span className="font-mono font-bold text-xs text-[var(--atc-text)] truncate">
              {ac.callsign}
            </span>
            {isCalling && (
              <VoiceWaveform
                size="xs"
                isSpeaking={true}
                className="text-[var(--atc-amber)] shrink-0 ml-0.5"
                title={`${ac.callsign} transmitting voice`}
              />
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isSelected && (
              <span className="px-1 py-0.2 rounded bg-[var(--atc-accent)] text-slate-950 text-[7px] font-mono font-extrabold">
                SEL
              </span>
            )}
            {ac.flightKind === "DEPARTURE" && !isCleared && (
              <span
                className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"
                title="IFR Clearance Pending"
              />
            )}
            <span className="text-[9px] font-mono text-[var(--atc-muted)]">
              {ac.aircraftType}
            </span>
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between text-[9px] font-mono text-[var(--atc-muted)]">
          <span className="truncate">{getAircraftPhaseLabel(ac)}</span>
          <span className="shrink-0">{Math.round(ac.speed)}kt</span>
        </div>
      </div>
    );
  };

  if (minimized) {
    return (
      <aside
        onClick={() => togglePanelMinimized("left")}
        title="Expand Flight Strips & Workload panel"
        className="w-9 bg-[var(--atc-panel)] border-r border-[var(--atc-border)] flex flex-col items-center py-2.5 gap-2.5 shrink-0 cursor-pointer hover:bg-[var(--atc-surface-alt)] transition-colors select-none"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            togglePanelMinimized("left");
          }}
          aria-label="Expand Flight Strips panel"
          title="Expand Flight Strips panel"
          className="p-1 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)] text-[var(--atc-text-secondary)] hover:text-[var(--atc-text)]"
        >
          <PanelLeftOpen className="w-3.5 h-3.5" />
        </button>

        <span className="px-1.5 py-0.5 rounded bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] text-[10px] font-mono font-bold text-[var(--atc-text)]">
          {strips.length}
        </span>

        {urgentCount > 0 && (
          <span
            title={`${urgentCount} pending alert(s)`}
            className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"
          />
        )}

        <span
          className="mt-1 text-[10px] font-mono font-bold tracking-widest uppercase text-[var(--atc-muted)]"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          FLIGHT STRIPS
        </span>
      </aside>
    );
  }

  const kanbanRoles: Array<{ role: ControllerRole; label: string; short: string; colorCls: string }> = [
    { role: "DELIVERY", label: "DELIVERY", short: "DEL", colorCls: "text-purple-400" },
    { role: "GROUND", label: "GROUND", short: "GND", colorCls: "text-[var(--atc-amber)]" },
    { role: "TOWER", label: "TOWER", short: "TWR", colorCls: "text-[var(--atc-cyan)]" },
    { role: "DEPARTURE", label: "DEP / APP", short: "DEP", colorCls: "text-[var(--atc-emerald)]" },
    { role: "CENTER", label: "CENTER", short: "CTR", colorCls: "text-indigo-400" },
  ];

  return (
    <aside
      className={`${
        viewMode === "KANBAN" ? "w-[760px] xl:w-[900px]" : "w-72 xl:w-[300px]"
      } bg-[var(--atc-panel)] border-r border-[var(--atc-border)] flex flex-col shrink-0 min-h-0 p-2.5 gap-2.5 overflow-hidden transition-all duration-200`}
    >
      {/* Flight Strips Accordion */}
      <Accordion
        title="Flight Strips"
        icon={<Layers className="w-3.5 h-3.5" />}
        defaultOpen={true}
        badge={
          <span className="px-1.5 py-0.5 rounded bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] text-[10px] font-mono text-[var(--atc-text-secondary)]">
            {strips.length}
          </span>
        }
        rightSlot={
          <div className="flex items-center gap-1.5">
            {/* View Mode Toggle: LIST vs KANBAN */}
            <div className="flex items-center gap-0.5 p-0.5 rounded border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleViewMode("LIST");
                }}
                aria-label="List view"
                title="List View"
                className={`p-1 rounded text-[10px] font-mono flex items-center gap-1 transition-colors ${
                  viewMode === "LIST"
                    ? "bg-[var(--atc-surface)] text-[var(--atc-text)] font-bold shadow-xs border border-[var(--atc-border)]"
                    : "text-[var(--atc-muted)] hover:text-[var(--atc-text)]"
                }`}
              >
                <List className="w-3 h-3" />
                <span className="hidden sm:inline">LIST</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleViewMode("KANBAN");
                }}
                aria-label="Kanban view"
                title="Kanban View: Drag-and-drop handoffs between Ground, Tower, and Departure"
                className={`p-1 rounded text-[10px] font-mono flex items-center gap-1 transition-colors ${
                  viewMode === "KANBAN"
                    ? "bg-[var(--atc-surface)] text-[var(--atc-text)] font-bold shadow-xs border border-[var(--atc-border)]"
                    : "text-[var(--atc-muted)] hover:text-[var(--atc-text)]"
                }`}
              >
                <LayoutGrid className="w-3 h-3" />
                <span className="hidden sm:inline">KANBAN</span>
              </button>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePanelMinimized("left");
              }}
              aria-label="Minimize Flight Strips panel"
              title="Minimize Flight Strips panel"
              className="p-0.5 rounded text-[var(--atc-muted)] hover:text-[var(--atc-text)] hover:bg-[var(--atc-border)]/40 transition-colors"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          </div>
        }
        className="flex-1 min-h-0 flex flex-col"
        bodyClassName="flex-1 min-h-0 flex flex-col p-2 gap-2"
      >
        {viewMode === "LIST" ? (
          <>
            {/* Minimal Filter Pills */}
            <div className="grid grid-cols-4 gap-1 p-1 rounded-md bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] text-[10px] font-mono shrink-0">
              {(
                [
                  { id: "ALL", label: "ALL" },
                  {
                    id: "STATION",
                    label:
                      sim.config.activePlayerStation === "ALL"
                        ? "AUTO"
                        : pendingHandoffsByAcId.size > 0
                        ? `MY (${sim.config.activePlayerStation[0]}) · ${pendingHandoffsByAcId.size} REQ`
                        : `MY (${sim.config.activePlayerStation[0]})`,
                  },
                  { id: "DEP", label: "DEP" },
                  { id: "ARR", label: "ARR" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`py-1 rounded transition-all cursor-pointer ${
                    filter === tab.id
                      ? "bg-[var(--atc-surface)] text-[var(--atc-text)] font-bold shadow-sm border border-[var(--atc-border)]"
                      : "text-[var(--atc-muted)] hover:text-[var(--atc-text)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Scrollable Strips */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-0">
              {sim.selectedAircraftId &&
                sim.aircraft[sim.selectedAircraftId] &&
                !strips.some((s) => s.id === sim.selectedAircraftId) &&
                (() => {
                  const pinned = sim.aircraft[sim.selectedAircraftId!];
                  if (
                    !pinned ||
                    pinned.state === "COMPLETED_ARRIVAL" ||
                    pinned.state === "COMPLETED_DEPARTURE"
                  ) {
                    return null;
                  }
                  return (
                    <button
                      type="button"
                      onClick={() => focusAircraft(pinned.id)}
                      className="w-full text-left rounded-lg border-2 border-[var(--atc-accent)] border-l-4 bg-[var(--atc-accent-soft)] p-2 shadow-sm flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Crosshair className="w-3 h-3 text-[var(--atc-accent-text)] shrink-0" />
                          <span className="font-mono font-extrabold text-xs text-[var(--atc-text)]">
                            {pinned.callsign}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-[var(--atc-accent)] text-slate-950 text-[8px] font-mono font-extrabold">
                            SELECTED
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-[var(--atc-muted)] truncate mt-0.5">
                          On {pinned.controller} • {getAircraftPhaseLabel(pinned)}
                        </div>
                      </div>
                      <span className="text-[9px] font-mono text-[var(--atc-accent-text)] font-bold shrink-0">
                        FOCUS
                      </span>
                    </button>
                  );
                })()}

              {strips.length === 0 && (
                <div className="text-xs text-[var(--atc-muted)] font-mono text-center py-8">
                  No active flights in this filter.
                </div>
              )}

              {strips.map((ac) => renderFullStrip(ac, false))}
            </div>
          </>
        ) : (
          /* Kanban Board View with Drag & Drop Handoffs */
          <div className="flex-1 flex gap-2 min-h-0 overflow-x-auto pb-1">
            {kanbanRoles.map(({ role, label, colorCls }) => {
              const isPlayerStation =
                sim.config.activePlayerStation === "ALL" || sim.config.activePlayerStation === role;
              const isAuto = sim.config.stationControl[role] === "AUTONOMOUS";
              const colFlights = activeFlights.filter((ac) => ac.controller === role);
              const isOver = dragOverRole === role;

              return (
                <div
                  key={role}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDragEnter={() => setDragOverRole(role)}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                    setDragOverRole(null);
                  }}
                  onDrop={(e) => handleDropToColumn(e, role)}
                  className={`flex-1 flex flex-col min-w-[170px] rounded-lg border p-1.5 transition-all min-h-0 ${
                    isOver
                      ? "border-[var(--atc-accent)] bg-[var(--atc-accent-soft)]/50 ring-2 ring-[var(--atc-accent)]/50"
                      : isPlayerStation
                      ? "border-[var(--atc-border-strong)] bg-[var(--atc-surface-alt)]/40"
                      : "border-[var(--atc-border)] bg-[var(--atc-surface-alt)]/20"
                  }`}
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[var(--atc-border)] shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[11px] font-mono font-bold ${colorCls}`}>
                        {label}
                      </span>
                      <span
                        className={`text-[8px] font-mono px-1 rounded border ${
                          isPlayerStation
                            ? "bg-[var(--atc-accent)] text-slate-950 font-bold border-transparent"
                            : "bg-[var(--atc-surface)] text-[var(--atc-muted)] border-[var(--atc-border)]"
                        }`}
                      >
                        {isPlayerStation ? "YOU" : isAuto ? "AI" : "AUTO"}
                      </span>
                    </div>
                    <span className="px-1.5 py-0.2 rounded bg-[var(--atc-surface)] border border-[var(--atc-border)] text-[9px] font-mono font-bold text-[var(--atc-text)]">
                      {colFlights.length}
                    </span>
                  </div>

                  {/* Column Cards */}
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-0">
                    {colFlights.length === 0 ? (
                      <div className="text-[10px] text-[var(--atc-muted)] font-mono text-center py-6 italic opacity-60">
                        Drop aircraft here to transfer
                      </div>
                    ) : (
                      colFlights.map((ac) =>
                        isPlayerStation ? renderFullStrip(ac, true) : renderMinimalStrip(ac)
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Accordion>

      {/* Collapsible Station Workload Accordion */}
      <Accordion
        title="Station Workload"
        icon={<Activity className="w-3.5 h-3.5" />}
        defaultOpen={false}
        badge={
          <span className="text-[10px] font-mono text-[var(--atc-muted)]">
            {activeFlights.length} acft
          </span>
        }
        className="shrink-0"
      >
        <div className="space-y-2 text-[11px] font-mono">
          {(["DELIVERY", "GROUND", "TOWER", "DEPARTURE", "CENTER"] as const).map((role) => {
            const count = workloadCounts[role];
            const pct = Math.min(100, Math.round((count / Math.max(4, activeFlights.length)) * 100));
            const isAuto = sim.config.stationControl[role] === "AUTONOMOUS";
            return (
              <div key={role} className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-[var(--atc-text)] flex items-center gap-1.5">
                    {role === "DELIVERY"
                      ? "Clearance"
                      : role === "DEPARTURE"
                      ? "Departure"
                      : role === "CENTER"
                      ? "Center"
                      : role[0] + role.slice(1).toLowerCase()}
                    <span className="text-[8px] px-1 rounded bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] text-[var(--atc-muted)]">
                      {isAuto ? "AI" : "YOU"}
                    </span>
                  </span>
                  <span className="text-[var(--atc-muted)]">{count} flt</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--atc-surface-alt)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--atc-accent)] transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Accordion>

      {/* Interactive IFR Flight Plan Modal */}
      {selectedFlightPlanAcId && (
        <IfrFlightPlanModal
          aircraft={sim.aircraft[selectedFlightPlanAcId] ?? null}
          onClose={() => setSelectedFlightPlanAcId(null)}
        />
      )}
    </aside>
  );
};
