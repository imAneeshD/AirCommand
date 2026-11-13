import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Crosshair,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  PlaneLanding,
  PlaneTakeoff,
  Radio,
  ShieldAlert,
} from "lucide-react";
import { getActiveClearances, getPendingReadbackClearances } from "../engine/clearanceEngine.ts";
import { getAircraftPhaseLabel } from "../engine/simulation.ts";
import { canAircraftMove } from "../engine/validationEngine.ts";
import { useAtcStore } from "../store/atcStore.ts";
import type { Aircraft, ControllerRole } from "../types/atc.ts";
import { formatAltitudeReadout } from "../utils/telemetry.ts";
import { getDeadlockedAircraftIds } from "../utils/groundConflict.ts";
import { radioAudio } from "../utils/radioAudio.ts";
import { getActiveCallingSignals } from "../utils/radioSignals.ts";
import { Accordion } from "./Accordion.tsx";

type StripFilter = "ALL" | "STATION" | "DEP" | "ARR";

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

function controllerBadge(ctrl: ControllerRole): { letter: string; cls: string } {
  switch (ctrl) {
    case "GROUND":
      return {
        letter: "G",
        cls: "bg-[var(--atc-amber-bg)] text-[var(--atc-amber)] border-[var(--atc-amber-border)]",
      };
    case "TOWER":
      return {
        letter: "T",
        cls: "bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)] border-[var(--atc-cyan-border)]",
      };
    case "DEPARTURE":
      return {
        letter: "D",
        cls: "bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] border-[var(--atc-emerald-border)]",
      };
  }
}

export const FlightStripRack: React.FC = () => {
  const sim = useAtcStore((s) => s.sim);
  useAtcStore((s) => s.tickVersion);
  const focusAircraft = useAtcStore((s) => s.focusAircraft);
  const minimized = useAtcStore((s) => s.minimizedPanels.left);
  const togglePanelMinimized = useAtcStore((s) => s.togglePanelMinimized);
  const stripRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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
  }, [sim.selectedAircraftId, filter]);

  const activeFlights = sim.aircraftOrder
    .map((id) => sim.aircraft[id])
    .filter(
      (ac): ac is Aircraft =>
        Boolean(ac) &&
        ac.state !== "COMPLETED_ARRIVAL" &&
        ac.state !== "COMPLETED_DEPARTURE"
    );

  const strips = activeFlights.filter((ac) => {
    if (filter === "STATION") {
      return sim.config.activePlayerStation === "ALL"
        ? true
        : ac.controller === sim.config.activePlayerStation;
    }
    if (filter === "DEP") return ac.flightKind === "DEPARTURE";
    if (filter === "ARR") return ac.flightKind === "ARRIVAL";
    return true;
  });

  const workloadCounts: Record<ControllerRole, number> = {
    GROUND: activeFlights.filter((a) => a.controller === "GROUND").length,
    TOWER: activeFlights.filter((a) => a.controller === "TOWER").length,
    DEPARTURE: activeFlights.filter((a) => a.controller === "DEPARTURE").length,
  };

  const urgentCount = activeFlights.filter(
    (a) => a.hasReadbackError || Boolean(a.pendingRequest && !a.pendingRequest.resolved)
  ).length;
  const activeCallerIds = new Set(
    getActiveCallingSignals(sim, radioAudio.getActiveTransmission()).map((c) => c.aircraftId)
  );
  const deadlockedIds = getDeadlockedAircraftIds(sim);

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

  return (
    <aside className="w-72 xl:w-[300px] bg-[var(--atc-panel)] border-r border-[var(--atc-border)] flex flex-col shrink-0 min-h-0 p-2.5 gap-2.5 overflow-hidden transition-colors">
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
        }
        className="flex-1 min-h-0 flex flex-col"
        bodyClassName="flex-1 min-h-0 flex flex-col p-2 gap-2"
      >
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
                    : `MY (${sim.config.activePlayerStation[0]})`,
              },
              { id: "DEP", label: "DEP" },
              { id: "ARR", label: "ARR" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`py-1 rounded transition-all ${
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

          {strips.map((ac) => {
            const isSelected = sim.selectedAircraftId === ac.id;
            const activeClrs = getActiveClearances(ac);
            const pendingRb = getPendingReadbackClearances(ac);
            const movable = canAircraftMove(ac, sim);
            const ctrl = controllerBadge(ac.controller);
            const hasReq = Boolean(ac.pendingRequest && !ac.pendingRequest.resolved);
            const isCalling = activeCallerIds.has(ac.id);

            return (
              <button
                key={ac.id}
                ref={(el) => {
                  stripRefs.current[ac.id] = el;
                }}
                onClick={() => focusAircraft(ac.id)}
                className={`w-full text-left rounded-lg border p-2 transition-all ${
                  isSelected
                    ? "bg-[var(--atc-accent-soft)] border-[var(--atc-accent)] border-l-4 ring-2 ring-[var(--atc-accent)]/60 shadow-md"
                    : isCalling
                    ? "bg-[var(--atc-amber-bg)]/45 border-[var(--atc-amber-border)] shadow-sm"
                    : "bg-[var(--atc-surface)]/80 border-[var(--atc-border)] hover:border-[var(--atc-border-strong)]"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
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
                        title="Blocked on taxiway — click strip and use 1-click Auto-Resolve / Push Back / Wait & Pass"
                        className="px-1.5 py-0.5 rounded bg-[var(--atc-red-bg)] text-[var(--atc-red)] border border-[var(--atc-red-border)] text-[8px] font-mono font-extrabold animate-pulse"
                      >
                        BLK
                      </span>
                    )}
                    {isCalling && (
                      <span
                        title="Actively transmitting voice on radio"
                        className="px-1.5 py-0.5 rounded bg-[var(--atc-amber-bg)] text-[var(--atc-amber)] border border-[var(--atc-amber-border)] text-[9px] font-mono font-bold inline-flex items-center gap-1"
                      >
                        <span className="inline-flex items-end gap-[1.5px] h-2.5" aria-hidden="true">
                          <span className="w-[2px] h-1.5 bg-amber-500 rounded-full animate-pulse" />
                          <span className="w-[2px] h-2.5 bg-amber-500 rounded-full animate-bounce" />
                          <span className="w-[2px] h-1 bg-amber-500 rounded-full animate-pulse" />
                        </span>
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

                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <span
                    className={`px-1.5 py-0.5 rounded border text-[9px] font-mono font-semibold truncate ${stateBadgeStyle(ac)}`}
                    title={ac.state}
                  >
                    {getAircraftPhaseLabel(ac)}
                  </span>

                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                      movable
                        ? "text-[var(--atc-emerald)] bg-[var(--atc-emerald-bg)] font-semibold"
                        : "text-[var(--atc-muted)] bg-[var(--atc-surface-alt)]"
                    }`}
                  >
                    {movable ? "CLEARED" : "HOLD"}
                  </span>
                </div>

                {ac.hasReadbackError && (
                  <div className="mt-1.5 px-1.5 py-0.5 rounded bg-[var(--atc-red-bg)] border border-[var(--atc-red-border)] text-[10px] font-mono text-[var(--atc-red)] flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 shrink-0" />
                    READBACK ERROR
                  </div>
                )}

                {!ac.hasReadbackError && pendingRb.length > 0 && (
                  <div className="mt-1.5 px-1.5 py-0.5 rounded bg-[var(--atc-cyan-bg)] border border-[var(--atc-cyan-border)] text-[10px] font-mono text-[var(--atc-cyan)] flex items-center gap-1">
                    <Radio className="w-3 h-3 shrink-0 animate-pulse" />
                    Readback: {pendingRb[pendingRb.length - 1].type}
                  </div>
                )}

                {!ac.hasReadbackError && pendingRb.length === 0 && hasReq && ac.pendingRequest && (
                  <div className="mt-1.5 px-1.5 py-0.5 rounded bg-[var(--atc-amber-bg)] border border-[var(--atc-amber-border)] text-[10px] font-mono text-[var(--atc-amber)] flex items-center gap-1 truncate font-medium">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    REQ: {ac.pendingRequest.type}
                    {ac.holdingAtRunway ? ` (${ac.holdingAtRunway})` : ""}
                  </div>
                )}

                {activeClrs.length > 0 && !hasReq && !ac.hasReadbackError && (
                  <div className="mt-1 text-[10px] font-mono text-[var(--atc-muted)] truncate">
                    Active: {activeClrs[activeClrs.length - 1].type}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Accordion>

      {/* Collapsible Station Workload Accordion (matching reference minimal summary) */}
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
          {(["GROUND", "TOWER", "DEPARTURE"] as const).map((role) => {
            const count = workloadCounts[role];
            const pct = Math.min(100, Math.round((count / Math.max(4, activeFlights.length)) * 100));
            const isAuto = sim.config.stationControl[role] === "AUTONOMOUS";
            return (
              <div key={role} className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-[var(--atc-text)] flex items-center gap-1.5">
                    {role === "DEPARTURE" ? "Departure" : role[0] + role.slice(1).toLowerCase()}
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
    </aside>
  );
};
