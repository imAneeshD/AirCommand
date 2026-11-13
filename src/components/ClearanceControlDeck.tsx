import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle,
  ClipboardList,
  Compass,
  Info,
  Lock,
  PanelRightClose,
  PanelRightOpen,
  Radio,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Unlock,
  Wrench,
} from "lucide-react";
import { getRunwayExitOptions, getSuggestedTaxiRoutes } from "../data/asteriaAirport.ts";
import { getAircraftPhaseLabel } from "../engine/simulation.ts";
import {
  canAircraftExecuteAction,
  canAircraftMove,
} from "../engine/validationEngine.ts";
import { useAtcStore } from "../store/atcStore.ts";
import type { ControllerRole, RunwayId } from "../types/atc.ts";
import { computeDepAppGuidance } from "../utils/depAppGuidance.ts";
import {
  buildResolutionCommands,
  inspectGroundConflict,
  type GroundResolutionKind,
} from "../utils/groundConflict.ts";
import { formatAltitudeReadout } from "../utils/telemetry.ts";
import { controllerFrequency } from "../engine/decisionEngine.ts";
import { Accordion } from "./Accordion.tsx";

export const ClearanceControlDeck: React.FC = () => {
  const sim = useAtcStore((s) => s.sim);
  useAtcStore((s) => s.tickVersion);
  const lastFeedback = useAtcStore((s) => s.lastFeedback);
  const roomState = useAtcStore((s) => s.roomState);
  const assignedRole = useAtcStore((s) => s.assignedRole);
  const respondToHandoff = useAtcStore((s) => s.respondToHandoff);

  const issueClearance = useAtcStore((s) => s.issueClearance);
  const selectAircraft = useAtcStore((s) => s.selectAircraft);
  const switchStation = useAtcStore((s) => s.switchStation);
  const armReadbackError = useAtcStore((s) => s.armReadbackError);
  const causeRadioFailure = useAtcStore((s) => s.causeRadioFailure);
  const causeEmergency = useAtcStore((s) => s.causeEmergency);
  const towDisabledAircraft = useAtcStore((s) => s.towDisabledAircraft);
  const dispatchCrashRescue = useAtcStore((s) => s.dispatchCrashRescue);
  const haltRunwayOperations = useAtcStore((s) => s.haltRunwayOperations);
  const requestMedicalEvacuation = useAtcStore((s) => s.requestMedicalEvacuation);
  const clearCrashSite = useAtcStore((s) => s.clearCrashSite);
  const setHoverPreviewRoute = useAtcStore((s) => s.setHoverPreviewRoute);
  const minimized = useAtcStore((s) => s.minimizedPanels.right);
  const togglePanelMinimized = useAtcStore((s) => s.togglePanelMinimized);

  const ac = sim.selectedAircraftId ? sim.aircraft[sim.selectedAircraftId] : null;
  const activeRole = sim.config.activePlayerStation;
  const fallbackRole: ControllerRole = activeRole === "ALL" ? "TOWER" : activeRole;

  // In a role-locked session (solo non-ALL or multiplayer), always pin the deck to the
  // player's own role so they never see another station's controls.
  const roleLocked = activeRole !== "ALL" || Boolean(assignedRole);
  const lockedRole: ControllerRole = assignedRole ?? (activeRole === "ALL" ? "TOWER" : activeRole);

  const [deckTab, setDeckTab] = useState<ControllerRole>(fallbackRole);
  const [selectedTaxiRunway, setSelectedTaxiRunway] = useState<RunwayId>("09L");
  const [selectedApproachRunway, setSelectedApproachRunway] = useState<RunwayId>("09L");
  const [turnDir, setTurnDir] = useState<"NEAREST" | "LEFT" | "RIGHT">("NEAREST");
  const [customHeading, setCustomHeading] = useState("090");

  // Keep deck tab in sync: role-locked sessions always show own role,
  // ALL-AUTO sessions follow the aircraft's current controller.
  useEffect(() => {
    setDeckTab(roleLocked ? lockedRole : (ac?.controller ?? "TOWER"));
    if (ac) {
      setSelectedTaxiRunway(ac.targetRunway);
      const rwyId = ac.assignedApproach ?? ac.targetRunway;
      setSelectedApproachRunway(rwyId);
      const g = computeDepAppGuidance(sim.airport, ac, rwyId);
      setCustomHeading(String(g.recommendedHeading).padStart(3, "0"));
      setTurnDir(g.recommendedTurnDirection);
    }
  }, [ac?.id, ac?.controller, ac?.state, ac?.targetRunway, ac?.assignedApproach, activeRole]);

  if (minimized) {
    const hasAlert = Boolean(
      ac &&
        (ac.hasReadbackError ||
          ac.operationMode === "EMERGENCY_OPERATION" ||
          (ac.pendingRequest && !ac.pendingRequest.resolved))
    );
    return (
      <aside
        onClick={() => togglePanelMinimized("right")}
        title="Expand Flight Deck & Clearances panel"
        className="w-9 bg-[var(--atc-panel)] border-l border-[var(--atc-border)] flex flex-col items-center py-2.5 gap-2.5 shrink-0 cursor-pointer hover:bg-[var(--atc-surface-alt)] transition-colors select-none"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            togglePanelMinimized("right");
          }}
          aria-label="Expand Flight Deck panel"
          title="Expand Flight Deck panel"
          className="p-1 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)] text-[var(--atc-text-secondary)] hover:text-[var(--atc-text)]"
        >
          <PanelRightOpen className="w-3.5 h-3.5" />
        </button>

        {ac && (
          <span
            className={`w-2 h-2 rounded-full ${
              ac.hasReadbackError || ac.operationMode === "EMERGENCY_OPERATION"
                ? "bg-red-500 animate-pulse"
                : hasAlert
                ? "bg-amber-500 animate-pulse"
                : "bg-[var(--atc-cyan)]"
            }`}
          />
        )}

        <span
          className="mt-1 text-[10px] font-mono font-bold tracking-widest uppercase text-[var(--atc-muted)]"
          style={{ writingMode: "vertical-rl" }}
        >
          {ac ? ac.callsign : "FLIGHT DECK"}
        </span>
      </aside>
    );
  }

  if (!ac) {
    return (
      <aside className="w-80 xl:w-[356px] bg-[var(--atc-panel)] border-l border-[var(--atc-border)] flex flex-col shrink-0 transition-colors">
        <div className="px-3 py-2 border-b border-[var(--atc-border)] bg-[var(--atc-surface)] flex items-center justify-between">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--atc-text-secondary)]">
            Flight Deck
          </span>
          <button
            type="button"
            onClick={() => togglePanelMinimized("right")}
            aria-label="Minimize Flight Deck panel"
            title="Minimize Flight Deck panel"
            className="p-1 rounded text-[var(--atc-muted)] hover:text-[var(--atc-text)] hover:bg-[var(--atc-surface-alt)] transition-colors"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 p-5 flex flex-col justify-center items-center text-center">
          <div className="w-11 h-11 rounded-full bg-[var(--atc-surface)] border border-[var(--atc-border)] flex items-center justify-center mb-3 shadow-[var(--atc-shadow)]">
            <Radio className="w-5 h-5 text-[var(--atc-muted)]" />
          </div>
          <div className="text-sm font-semibold text-[var(--atc-text)]">No Aircraft Selected</div>
          <div className="text-xs text-[var(--atc-muted)] mt-1 max-w-[230px] leading-relaxed">
            Click any aircraft on the chart or flight strips to inspect telemetry and issue clearances.
          </div>
        </div>
      </aside>
    );
  }

  const movable = canAircraftMove(ac, sim);
  const altInfo = formatAltitudeReadout(ac, sim.airport.elevationFt);
  const nordoLocked = ac.commStatus === "RADIO_FAILURE";
  const errClearance = ac.readbackErrorClearanceId
    ? ac.clearances.find((c) => c.id === ac.readbackErrorClearanceId)
    : undefined;

  const currentNodeId =
    ac.currentNodeId ??
    (ac.state === "AT_GATE" && ac.gateId ? `GATE_${ac.gateId}` : undefined) ??
    (ac.state === "PUSHBACK_COMPLETE" && ac.gateId ? `PB_${ac.gateId}` : undefined);

  const isArrivalToGate = ac.flightKind === "ARRIVAL";
  const taxiRoutes = currentNodeId
    ? getSuggestedTaxiRoutes(
        sim.airport,
        currentNodeId,
        selectedTaxiRunway,
        ac.gateId,
        isArrivalToGate,
        sim,
        ac.id
      )
    : [];

  const groundConflict = inspectGroundConflict(sim, ac);

  const runGroundResolution = (kind: GroundResolutionKind) => {
    setHoverPreviewRoute(null);
    const cmds = buildResolutionCommands(sim, ac, kind);
    for (const cmd of cmds) {
      issueClearance(cmd);
    }
  };

  const movementReason = (() => {
    if (movable) return "Valid ATC clearance acknowledged";
    if (ac.state === "AT_GATE") {
      return ac.requiresPushback
        ? canAircraftExecuteAction(ac, "PUSHBACK", sim).reason
        : canAircraftExecuteAction(ac, "TAXI", sim).reason;
    }
    if (ac.state === "PUSHBACK_COMPLETE") {
      return canAircraftExecuteAction(ac, "TAXI", sim).reason;
    }
    if (ac.state === "HOLDING_SHORT") {
      return ac.holdingShortReason === "CROSSING_REQUIRED"
        ? canAircraftExecuteAction(ac, "CROSS_RUNWAY", sim).reason
        : canAircraftExecuteAction(ac, "ENTER_RUNWAY_LINE_UP", sim).reason;
    }
    if (ac.state === "LINE_UP_WAIT") {
      return canAircraftExecuteAction(ac, "TAKEOFF_ROLL", sim).reason;
    }
    return "Awaiting valid ATC instruction";
  })();

  const neutralBtn =
    "rounded-md border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] hover:border-[var(--atc-border-strong)] hover:bg-[var(--atc-surface)] text-[var(--atc-text)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <aside className="w-80 xl:w-[356px] bg-[var(--atc-panel)] border-l border-[var(--atc-border)] flex flex-col shrink-0 min-h-0 transition-colors">
      {/* Minimal Clean Aircraft Identity Header */}
      <div className="px-3.5 py-3 border-b border-[var(--atc-border)] bg-[var(--atc-surface)] shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-extrabold text-lg tracking-tight text-[var(--atc-text)]">
                {ac.callsign}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] text-[10px] font-mono font-medium text-[var(--atc-text-secondary)]">
                {ac.aircraftType} • {ac.wakeCategory}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-[var(--atc-cyan-bg)] border border-[var(--atc-cyan-border)] text-[10px] font-mono font-semibold text-[var(--atc-cyan)]">
                SQK {ac.squawk}
              </span>
            </div>
            <div className="text-[11px] text-[var(--atc-muted)] mt-0.5 truncate">
              {ac.airline} • "{ac.spokenCallsign}" •{" "}
              <span className="font-semibold text-[var(--atc-text-secondary)]">{ac.controller}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => togglePanelMinimized("right")}
            aria-label="Minimize Flight Deck panel"
            title="Minimize Flight Deck panel"
            className="p-1 rounded text-[var(--atc-muted)] hover:text-[var(--atc-text)] hover:bg-[var(--atc-surface-alt)] shrink-0 transition-colors"
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
        </div>

        {/* Compact Status & Movement Gate Pill */}
        <div className="mt-2.5 flex items-center justify-between gap-2 text-[10px] font-mono">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border font-semibold truncate ${
              movable
                ? "bg-[var(--atc-emerald-bg)] border-[var(--atc-emerald-border)] text-[var(--atc-emerald)]"
                : "bg-[var(--atc-amber-bg)] border-[var(--atc-amber-border)] text-[var(--atc-amber)]"
            }`}
            title={movementReason}
          >
            {movable ? (
              <Unlock className="w-3 h-3 shrink-0" />
            ) : (
              <Lock className="w-3 h-3 shrink-0" />
            )}
            <span className="truncate" title={ac.state}>{getAircraftPhaseLabel(ac)}</span>
          </span>

          <div className="flex items-center gap-2 text-[var(--atc-text-secondary)] font-semibold shrink-0">
            <span title={altInfo.detailed}>{altInfo.compact}</span>
            <span className="text-[var(--atc-border-strong)]">•</span>
            <span>{Math.round(ac.speed)}kt</span>
            <span className="text-[var(--atc-border-strong)]">•</span>
            <span>{String(Math.round(ac.heading)).padStart(3, "0")}°</span>
          </div>
        </div>

        <div className="mt-1.5 text-[10px] text-[var(--atc-muted)] truncate">
          {movable ? "Authorized: " : "Holding: "}
          <span className="text-[var(--atc-text-secondary)] font-medium">{movementReason}</span>
        </div>
      </div>

      {/* Scrollable Organized Accordion Stack */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
        {/* Urgent Contextual Banners (Always visible when triggered) */}
        {ac.pendingRequest && !ac.pendingRequest.resolved && (
          <div className="rounded-lg border border-[var(--atc-amber-border)] bg-[var(--atc-amber-bg)] p-2.5">
            <div className="text-[10px] font-mono font-bold text-[var(--atc-amber)] uppercase flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              REQUEST ({ac.pendingRequest.type})
            </div>
            <div className="text-xs text-[var(--atc-text)] mt-1 italic">
              "{ac.pendingRequest.message}"
            </div>
          </div>
        )}

        {ac.hasReadbackError && errClearance && (
          <div className="rounded-lg border border-[var(--atc-red-border)] bg-[var(--atc-red-bg)] p-2.5 space-y-2">
            <div className="text-[10px] font-mono font-bold text-[var(--atc-red)] flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              READBACK ERROR — AIRCRAFT HOLDING
            </div>
            <div className="text-[11px] font-mono text-[var(--atc-text)]">
              Readback: "{errClearance.actualReadbackText}"
              <br />
              Expected: "{errClearance.expectedReadbackText}"
            </div>
            <button
              onClick={() =>
                issueClearance({
                  aircraftId: ac.id,
                  controller: errClearance.controller,
                  type: errClearance.type,
                  parameters: errClearance.parameters,
                })
              }
              className="w-full py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-xs transition-colors"
            >
              CORRECT & RE-ISSUE {errClearance.type}
            </button>
          </div>
        )}

        {nordoLocked && (
          <div className="rounded-lg border border-[var(--atc-amber-border)] bg-[var(--atc-amber-bg)] p-2.5 text-[11px] font-mono text-[var(--atc-text)]">
            <div className="font-bold flex items-center gap-1 text-[var(--atc-amber)]">
              <Ban className="w-3.5 h-3.5" />
              RADIO FAILURE (NORDO 7600)
            </div>
            <div className="mt-1 text-[var(--atc-text-secondary)]">
              Radio clearances disabled. Use Tower Light Gun signals (TOWER tab).
            </div>
          </div>
        )}

        {groundConflict && !nordoLocked && (
          <div
            className={`rounded-lg border p-2.5 space-y-2 font-mono ${
              groundConflict.mutualDeadlock
                ? "border-[var(--atc-red-border)] bg-[var(--atc-red-bg)]"
                : "border-[var(--atc-amber-border)] bg-[var(--atc-amber-bg)]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div
                className={`text-[10px] font-bold uppercase flex items-center gap-1 ${
                  groundConflict.mutualDeadlock ? "text-[var(--atc-red)]" : "text-[var(--atc-amber)]"
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {groundConflict.isYieldWaiting
                    ? "YIELDING FOR TRAFFIC"
                    : groundConflict.mutualDeadlock
                    ? "GROUND TRAFFIC DEADLOCK"
                    : "TAXIWAY TRAFFIC BLOCKED"}
                </span>
              </div>
              {groundConflict.blocker && (
                <button
                  type="button"
                  onClick={() => selectAircraft(groundConflict.blocker!.id)}
                  title={`Inspect blocking aircraft ${groundConflict.blocker.callsign}`}
                  className="px-1.5 py-0.5 rounded bg-[var(--atc-surface)] border border-[var(--atc-border)] text-[9px] font-bold text-[var(--atc-text)] hover:border-[var(--atc-accent)]"
                >
                  {groundConflict.blocker.callsign}
                </button>
              )}
            </div>

            <div className="text-[11px] text-[var(--atc-text)] leading-snug">
              {groundConflict.reason}
            </div>

            {!groundConflict.isYieldWaiting && groundConflict.recommendedAction && (
              <button
                type="button"
                onClick={() => runGroundResolution("AUTO_RESOLVE")}
                className="w-full py-1.5 px-2.5 rounded-md bg-[var(--atc-accent)] hover:opacity-90 text-slate-950 font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-sm transition-opacity"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>
                  AUTO-RESOLVE (
                  {groundConflict.recommendedAction === "REROUTE"
                    ? "BYPASS ROUTE"
                    : groundConflict.recommendedAction === "PUSHBACK_STEP"
                    ? "PUSH BACK & YIELD"
                    : "WAIT & AUTO-RESUME"}
                  )
                </span>
              </button>
            )}

            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                disabled={!groundConflict.blocker}
                onClick={() => runGroundResolution("WAIT_PASS")}
                title={
                  groundConflict.blocker
                    ? `Hold ${ac.callsign} and automatically resume once ${groundConflict.blocker.callsign} passes`
                    : "Wait for traffic ahead to clear"
                }
                className="py-1.5 px-1.5 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:border-[var(--atc-amber-border)] hover:bg-[var(--atc-amber-bg)] text-[var(--atc-text)] text-[9px] font-bold disabled:opacity-35 disabled:cursor-not-allowed text-center leading-tight"
              >
                WAIT &amp; PASS
              </button>
              <button
                type="button"
                disabled={!groundConflict.stepBackNodeId}
                onClick={() => runGroundResolution("PUSHBACK_STEP")}
                title={
                  groundConflict.stepBackLabel
                    ? `Push back toward ${groundConflict.stepBackLabel} to clear intersection`
                    : "No backward node available"
                }
                className="py-1.5 px-1.5 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:border-[var(--atc-cyan-border)] hover:bg-[var(--atc-cyan-bg)] text-[var(--atc-text)] text-[9px] font-bold disabled:opacity-35 disabled:cursor-not-allowed text-center leading-tight"
              >
                PUSH BACK
              </button>
              <button
                type="button"
                disabled={!groundConflict.bypassRoute}
                onMouseEnter={() => {
                  if (groundConflict.bypassRoute) {
                    setHoverPreviewRoute(groundConflict.bypassRoute.nodeIds);
                  }
                }}
                onMouseLeave={() => setHoverPreviewRoute(null)}
                onClick={() => runGroundResolution("REROUTE")}
                title={
                  groundConflict.bypassRoute
                    ? `Reroute via ${groundConflict.bypassRoute.taxiways.join(", ")}`
                    : "No alternate bypass path available"
                }
                className="py-1.5 px-1.5 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:border-[var(--atc-emerald-border)] hover:bg-[var(--atc-emerald-bg)] text-[var(--atc-text)] text-[9px] font-bold disabled:opacity-35 disabled:cursor-not-allowed text-center leading-tight"
              >
                CHANGE ROUTE
              </button>
            </div>
          </div>
        )}

        {lastFeedback && sim.time - lastFeedback.at < 8 && (
          <div
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono flex items-center gap-1.5 ${
              lastFeedback.ok
                ? "bg-[var(--atc-cyan-bg)] border-[var(--atc-cyan-border)] text-[var(--atc-cyan)]"
                : "bg-[var(--atc-red-bg)] border-[var(--atc-red-border)] text-[var(--atc-red)]"
            }`}
          >
            {lastFeedback.ok ? (
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{lastFeedback.text}</span>
          </div>
        )}


        {/* Incoming Handoff Requests awaiting user acceptance / rejection */}
        {(roomState?.status === "ACTIVE" ? roomState.handoffs : sim.handoffs)
          ?.filter((h) => h.status === "PENDING" && h.toController === lockedRole)
          .slice(0, 3)
          .map((h) => (
            <div
              key={h.id}
              className="rounded-lg border border-[var(--atc-cyan-border)] bg-[var(--atc-cyan-bg)] p-2.5 text-[11px] font-mono space-y-1.5 shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--atc-cyan)]">
                  HANDOFF REQ: {h.callsign} ({h.fromController} → {h.toController})
                </span>
                <span className="text-[10px] text-[var(--atc-muted)]">
                  {controllerFrequency(h.toController, sim.airport)} MHz
                </span>
              </div>
              <p className="text-[10px] text-[var(--atc-text-secondary)]">
                {h.fromController} requested transfer of {h.callsign} to your frequency.
              </p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => respondToHandoff(h.id, true)}
                  className="flex-1 py-1 rounded bg-[var(--atc-emerald-bg)] hover:opacity-90 border border-[var(--atc-emerald-border)] text-[var(--atc-emerald)] font-bold text-xs transition-opacity"
                >
                  ACCEPT
                </button>
                <button
                  onClick={() => respondToHandoff(h.id, false)}
                  className="flex-1 py-1 rounded bg-[var(--atc-red-bg)] hover:opacity-90 border border-[var(--atc-red-border)] text-[var(--atc-red)] font-bold text-xs transition-opacity"
                >
                  REJECT
                </button>
              </div>
            </div>
          ))}

        {roomState?.status === "ACTIVE" && assignedRole && deckTab !== assignedRole ? (
          <div className="rounded-lg border border-[var(--atc-amber-border)] bg-[var(--atc-amber-bg)] p-2.5 text-[11px] font-mono text-[var(--atc-amber)]">
            Multiplayer Lock: You are controlling <strong>{assignedRole}</strong>. Switch deck tab back to{" "}
            <button
              onClick={() => setDeckTab(assignedRole)}
              className="underline font-bold"
            >
              {assignedRole}
            </button>{" "}
            or ask {deckTab} controller in Coordination Chat.
          </div>
        ) : null}

        {ac.state === "CRASHED" ? (
          <div className="rounded-lg border border-red-500 bg-red-950/40 p-3 space-y-3 font-mono shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-red-400 font-extrabold text-xs">
                <AlertOctagon className="w-4 h-4 animate-pulse" />
                <span>CRASH ALARM · RUNWAY EXCURSION</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white font-bold">
                MAYDAY 7700
              </span>
            </div>

            <div className="text-[11px] text-red-200 leading-snug">
              {ac.crashDetails?.reason ?? "Off-runway ground collision / excursion detected at high speed."}
            </div>

            <div className="space-y-1.5 pt-1">
              {/* Facility 1: ARFF */}
              <button
                type="button"
                disabled={Boolean(ac.crashDetails?.arffDispatched)}
                onClick={() => dispatchCrashRescue(ac.id)}
                className={`w-full py-2 px-2.5 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  ac.crashDetails?.arffDispatched
                    ? "bg-emerald-950/60 border border-emerald-500/80 text-emerald-300 cursor-default"
                    : "bg-red-600 hover:bg-red-500 text-white shadow-md animate-pulse"
                }`}
              >
                {ac.crashDetails?.arffDispatched ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>ARFF ON SCENE · FOAM SUPPRESSION ACTIVE</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-4 h-4" />
                    <span>DISPATCH CRASH TENDERS &amp; RESCUE (ARFF)</span>
                  </>
                )}
              </button>

              {/* Facility 2: Halt Runway */}
              {(() => {
                const rwyId = ac.crashDetails?.runwayId ?? ac.targetRunway;
                const isHalted = Boolean(ac.crashDetails?.runwayHalted || sim.closedRunways?.[rwyId]);
                return (
                  <button
                    type="button"
                    disabled={isHalted}
                    onClick={() => haltRunwayOperations(rwyId, ac.id)}
                    className={`w-full py-2 px-2.5 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      isHalted
                        ? "bg-amber-950/60 border border-amber-500/80 text-amber-300 cursor-default"
                        : "bg-amber-600 hover:bg-amber-500 text-white shadow-md"
                    }`}
                  >
                    {isHalted ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>RUNWAY {rwyId} CLOSED · OPERATIONS HALTED</span>
                      </>
                    ) : (
                      <>
                        <Ban className="w-4 h-4" />
                        <span>HALT RUNWAY {rwyId} OPERATIONS (CLOSE RWY)</span>
                      </>
                    )}
                  </button>
                );
              })()}

              {/* Facility 3: Medical Evac */}
              <button
                type="button"
                disabled={Boolean(ac.crashDetails?.medicalRequested)}
                onClick={() => requestMedicalEvacuation(ac.id)}
                className={`w-full py-2 px-2.5 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  ac.crashDetails?.medicalRequested
                    ? "bg-cyan-950/60 border border-cyan-500/80 text-cyan-300 cursor-default"
                    : "bg-cyan-600 hover:bg-cyan-500 text-slate-950 shadow-md"
                }`}
              >
                {ac.crashDetails?.medicalRequested ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>MEDICAL EVAC EN ROUTE · 6 AMBULANCES ACTIVE</span>
                  </>
                ) : (
                  <>
                    <Activity className="w-4 h-4" />
                    <span>REQUEST MEDICAL &amp; FIRE EVACUATION</span>
                  </>
                )}
              </button>

              {/* Facility 4: Clear Crash Site */}
              {(() => {
                const canClear = Boolean(
                  ac.crashDetails?.arffDispatched &&
                    ac.crashDetails?.runwayHalted &&
                    ac.crashDetails?.medicalRequested
                );
                return (
                  <button
                    type="button"
                    disabled={!canClear}
                    onClick={() => clearCrashSite(ac.id)}
                    className="w-full py-2 px-2.5 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-2 bg-slate-800 border border-slate-600 hover:border-emerald-500 hover:text-emerald-400 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={
                      canClear
                        ? "Clear wreckage with crane and tug and restore airfield operations"
                        : "Requires ARFF dispatch, Runway halt, and Medical evacuation coordination first"
                    }
                  >
                    <Wrench className="w-4 h-4" />
                    <span>CLEAR CRASH SITE &amp; REOPEN RUNWAY</span>
                  </button>
                );
              })()}
            </div>
          </div>
        ) : roleLocked && ac.controller !== lockedRole ? (
          <div className="rounded-lg border border-[var(--atc-emerald-border)] bg-[var(--atc-emerald-bg)] p-3 text-[11px] font-mono text-[var(--atc-text)] space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--atc-emerald)] shrink-0" />
              <div>
                <span className="font-bold text-[var(--atc-emerald)]">{ac.callsign}</span> is on{" "}
                <span className="font-bold">{ac.controller}</span> (auto-managed while operating{" "}
                <span className="font-bold">{lockedRole === "DEPARTURE" ? "DEP/APP" : lockedRole}</span>).
              </div>
            </div>
            <p className="text-[10px] text-[var(--atc-text-secondary)] leading-relaxed">
              Clearance controls belong to <strong>{ac.controller}</strong>. As{" "}
              <strong>{lockedRole === "DEPARTURE" ? "DEP/APP" : lockedRole}</strong>, controls for{" "}
              {ac.callsign} will become available once the aircraft is transferred / handed off to your station.
            </p>
            {activeRole !== "ALL" && !assignedRole && (
              <button
                onClick={() => switchStation(ac.controller)}
                className="w-full py-1.5 rounded bg-[var(--atc-surface)] hover:bg-[var(--atc-surface-alt)] border border-[var(--atc-emerald-border)] text-[var(--atc-emerald)] font-bold text-[10px] transition-colors"
              >
                SWITCH ROLE TO {ac.controller}
              </button>
            )}
          </div>
        ) : (
        /* ACCORDION 1: Clearances & Actions (Open by default) */
        <Accordion
          title="Available Clearances"
          icon={<Compass className="w-3.5 h-3.5" />}
          defaultOpen={true}
          badge={
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[var(--atc-accent-bg)] text-[var(--atc-accent-text)]">
              {deckTab === "DEPARTURE" ? "DEP/APP" : deckTab}
            </span>
          }
          rightSlot={
            activeRole === "ALL" ? (
              <span className="relative group inline-flex items-center">
                <span
                  tabIndex={0}
                  aria-label="ALL AUTO mode info"
                  className="p-0.5 rounded text-[var(--atc-amber)] hover:bg-[var(--atc-amber-bg)] cursor-help inline-flex items-center"
                >
                  <Info className="w-3.5 h-3.5" />
                </span>
                <span className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity absolute right-0 top-full mt-1.5 w-60 z-40 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] shadow-xl p-2 text-[10px] leading-relaxed text-[var(--atc-text-secondary)]">
                  <strong className="text-[var(--atc-accent-text)]">ALL AUTO:</strong> All stations automated &amp; all voices active. You can still manually override any clearance below or switch to G / T / D.
                </span>
              </span>
            ) : undefined
          }
          bodyClassName="space-y-2.5"
        >
          {/* Controller Section Tabs — only shown in ALL-AUTO mode.
              When the player has a specific role, show only their station label. */}
          {roleLocked ? (
            <div className="flex items-center gap-2 px-1 py-0.5">
              <span className="px-2.5 py-1 rounded-md bg-[var(--atc-surface)] border border-[var(--atc-accent-border)] text-[var(--atc-accent-text)] text-[11px] font-mono font-bold">
                {lockedRole === "DEPARTURE" ? "DEP/APP" : lockedRole}
              </span>
              <span className="text-[10px] text-[var(--atc-muted)] font-mono">
                Your station · other roles are AI-managed
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1 bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] p-1 rounded-md text-[11px] font-mono">
              {(["GROUND", "TOWER", "DEPARTURE"] as const).map((role) => {
                const isRoleAuto = sim.config.stationControl[role] === "AUTONOMOUS";
                const isSelected = deckTab === role;
                return (
                  <button
                    key={role}
                    onClick={() => setDeckTab(role)}
                    className={`py-1 rounded font-semibold transition-all flex items-center justify-center gap-1 ${
                      isSelected
                        ? "bg-[var(--atc-surface)] text-[var(--atc-text)] shadow-sm border border-[var(--atc-border)]"
                        : "text-[var(--atc-muted)] hover:text-[var(--atc-text)]"
                    }`}
                  >
                    <span>{role === "DEPARTURE" ? "DEP/APP" : role}</span>
                    {isRoleAuto && (
                      <span className="text-[8px] px-1 rounded bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)]">
                        AI
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* GROUND COMMANDS */}
          {deckTab === "GROUND" && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  disabled={nordoLocked || (ac.state !== "AT_GATE" && ac.state !== "HOLD_POSITION")}
                  onClick={() =>
                    issueClearance({
                      aircraftId: ac.id,
                      controller: "GROUND",
                      type: "PUSHBACK",
                    })
                  }
                  className="py-2 px-2 rounded-md border font-mono text-[11px] font-bold transition-colors disabled:opacity-35 disabled:cursor-not-allowed bg-[var(--atc-accent-bg)] hover:opacity-90 border-[var(--atc-accent-border)] text-[var(--atc-accent-text)]"
                >
                  APPROVE PUSHBACK
                </button>
                <button
                  disabled={nordoLocked || ac.altitude > sim.airport.elevationFt + 50}
                  onClick={() =>
                    issueClearance({
                      aircraftId: ac.id,
                      controller: "GROUND",
                      type: "HOLD_POSITION",
                    })
                  }
                  className="py-2 px-2 rounded-md border font-mono text-[11px] font-semibold disabled:opacity-35 disabled:cursor-not-allowed bg-[var(--atc-amber-bg)] hover:opacity-90 border-[var(--atc-amber-border)] text-[var(--atc-amber)]"
                >
                  HOLD POSITION
                </button>
              </div>

              {/* Taxi Route Builder */}
              <div className="rounded-md border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] p-2 space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono font-bold text-[var(--atc-text-secondary)] uppercase">
                    {isArrivalToGate ? `Taxi to Gate ${ac.gateId ?? ""}` : "Taxi Clearance"}
                  </span>
                  {!isArrivalToGate && (
                    <div className="flex gap-1">
                      {sim.airport.runwayIds.map((rwy) => (
                        <button
                          key={rwy}
                          onClick={() => setSelectedTaxiRunway(rwy)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                            selectedTaxiRunway === rwy
                              ? "bg-[var(--atc-accent-bg)] border-[var(--atc-accent-border)] text-[var(--atc-accent-text)] font-bold"
                              : "bg-[var(--atc-surface)] border-[var(--atc-border)] text-[var(--atc-muted)]"
                          }`}
                        >
                          {rwy}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {taxiRoutes.length > 0 ? (() => {
                  const hasConflicts = taxiRoutes.some((r) => r.conflictLevel !== "CLEAR");
                  const firstConflict = taxiRoutes.find((r) => r.conflictLevel !== "CLEAR");
                  const hasClearBypass = taxiRoutes.some((r) => r.conflictLevel === "CLEAR");
                  return (
                    <div className="space-y-1.5">
                      {hasConflicts && firstConflict && (
                        <div
                          className={`rounded px-2 py-1.5 text-[10px] font-mono border flex items-start gap-1.5 ${
                            !hasClearBypass || firstConflict.conflictLevel === "BLOCKED"
                              ? "bg-[var(--atc-red-bg)] border-[var(--atc-red-border)] text-[var(--atc-red)]"
                              : "bg-[var(--atc-amber-bg)] border-[var(--atc-amber-border)] text-[var(--atc-amber)]"
                          }`}
                        >
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>
                            <strong>Route Traffic Warning:</strong> {firstConflict.conflictReason}.{" "}
                            {hasClearBypass
                              ? "Select a CLEAR bypass route below."
                              : "All paths share traffic — hold position or pick least congested route."}
                          </span>
                        </div>
                      )}

                      <div className="space-y-1">
                        {taxiRoutes.slice(0, 5).map((rt, idx) => {
                          const isClear = rt.conflictLevel === "CLEAR";
                          const isBlocked = rt.conflictLevel === "BLOCKED";
                          return (
                            <button
                              key={idx}
                              disabled={nordoLocked}
                              onMouseEnter={() => setHoverPreviewRoute(rt.nodeIds)}
                              onMouseLeave={() => setHoverPreviewRoute(null)}
                              onClick={() => {
                                setHoverPreviewRoute(null);
                                issueClearance({
                                  aircraftId: ac.id,
                                  controller: "GROUND",
                                  type: "TAXI",
                                  parameters: {
                                    runway: selectedTaxiRunway,
                                    routeTaxiways: rt.taxiways,
                                    destinationNodeId: rt.destinationNodeId,
                                    routeNodeIds: rt.nodeIds,
                                  },
                                });
                              }}
                              title={rt.conflictReason ?? "Conflict-free taxiway route"}
                              className={`w-full text-left px-2.5 py-1.5 rounded border text-[11px] font-mono flex items-center justify-between gap-2 disabled:opacity-35 transition-colors ${
                                isBlocked
                                  ? "border-[var(--atc-red-border)] bg-[var(--atc-red-bg)]/60 hover:bg-[var(--atc-red-bg)] text-[var(--atc-text)]"
                                  : !isClear
                                  ? "border-[var(--atc-amber-border)] bg-[var(--atc-amber-bg)]/50 hover:bg-[var(--atc-amber-bg)] text-[var(--atc-text)]"
                                  : "border-[var(--atc-border)] hover:border-[var(--atc-emerald-border)] bg-[var(--atc-surface)] hover:bg-[var(--atc-emerald-bg)] text-[var(--atc-text)]"
                              }`}
                            >
                              <span className="truncate">TAXI {rt.label}</span>
                              <span className="flex items-center gap-1.5 shrink-0">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                    isBlocked
                                      ? "bg-[var(--atc-red-bg)] border-[var(--atc-red-border)] text-[var(--atc-red)]"
                                      : !isClear
                                      ? "bg-[var(--atc-amber-bg)] border-[var(--atc-amber-border)] text-[var(--atc-amber)]"
                                      : "bg-[var(--atc-emerald-bg)] border-[var(--atc-emerald-border)] text-[var(--atc-emerald)]"
                                  }`}
                                >
                                  {isBlocked
                                    ? `BLOCKED · ${rt.conflictCallsigns.slice(0, 2).join(",")}`
                                    : !isClear
                                    ? `TRAFFIC · ${rt.conflictCallsigns.slice(0, 2).join(",")}`
                                    : "CLEAR"}
                                </span>
                                <ArrowRight className="w-3 h-3 text-[var(--atc-accent)] shrink-0" />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })() : (
                  <div className="text-[11px] font-mono text-[var(--atc-muted)]">
                    {ac.altitude > sim.airport.elevationFt + 50
                      ? "Aircraft airborne."
                      : "No taxi routes from current position."}
                  </div>
                )}
              </div>

              {/* Runway Crossing & Hold Short */}
              <div className="grid grid-cols-2 gap-1.5">
                {sim.airport.runwayIds.map((rwy) => (
                  <button
                    key={`cross-${rwy}`}
                    disabled={nordoLocked || ac.altitude > sim.airport.elevationFt + 50}
                    onClick={() =>
                      issueClearance({
                        aircraftId: ac.id,
                        controller: "GROUND",
                        type: "CROSS_RUNWAY",
                        parameters: { runway: rwy },
                      })
                    }
                    className="py-1.5 px-2 rounded-md border font-mono text-[11px] font-semibold disabled:opacity-35 bg-[var(--atc-emerald-bg)] hover:opacity-90 border-[var(--atc-emerald-border)] text-[var(--atc-emerald)]"
                  >
                    CROSS RWY {rwy}
                  </button>
                ))}
                {sim.airport.runwayIds.map((rwy) => (
                  <button
                    key={`hs-${rwy}`}
                    disabled={nordoLocked || ac.altitude > sim.airport.elevationFt + 50}
                    onClick={() =>
                      issueClearance({
                        aircraftId: ac.id,
                        controller: "GROUND",
                        type: "HOLD_SHORT",
                        parameters: { runway: rwy },
                      })
                    }
                    className="py-1.5 px-2 rounded-md border font-mono text-[11px] font-semibold disabled:opacity-35 bg-[var(--atc-amber-bg)] hover:opacity-90 border-[var(--atc-amber-border)] text-[var(--atc-amber)]"
                  >
                    HOLD SHORT {rwy}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  disabled={nordoLocked}
                  onClick={() =>
                    issueClearance({
                      aircraftId: ac.id,
                      controller: "GROUND",
                      type: "UNABLE",
                    })
                  }
                  className={`py-1.5 px-2 font-mono text-xs ${neutralBtn}`}
                >
                  UNABLE
                </button>
                <button
                  disabled={nordoLocked || ac.controller === "TOWER"}
                  onClick={() =>
                    issueClearance({
                      aircraftId: ac.id,
                      controller: "GROUND",
                      type: "HANDOFF",
                      parameters: { targetController: "TOWER" },
                    })
                  }
                  className="py-1.5 px-2 rounded-md border border-[var(--atc-cyan-border)] bg-[var(--atc-cyan-bg)] hover:opacity-90 text-[var(--atc-cyan)] font-mono text-xs font-semibold disabled:opacity-35"
                >
                  HANDOFF → TWR ({controllerFrequency("TOWER", sim.airport)})
                </button>
              </div>
            </div>
          )}

          {/* TOWER COMMANDS */}
          {deckTab === "TOWER" && (
            <div className="space-y-2.5">
              {ac.flightKind === "DEPARTURE" && (
                <div className="space-y-1.5">
                  <button
                    disabled={nordoLocked}
                    onClick={() =>
                      issueClearance({
                        aircraftId: ac.id,
                        controller: "TOWER",
                        type: "LINE_UP",
                        parameters: { runway: ac.targetRunway },
                      })
                    }
                    className="w-full py-2 rounded-md border border-[var(--atc-accent-border)] bg-[var(--atc-accent-bg)] hover:opacity-90 text-[var(--atc-accent-text)] font-mono text-xs font-bold disabled:opacity-35"
                  >
                    LINE UP AND WAIT RWY {ac.targetRunway}
                  </button>

                  <button
                    disabled={nordoLocked}
                    onClick={() => {
                      const baseAlt = Math.round(sim.airport.elevationFt / 500) * 500;
                      issueClearance({
                        aircraftId: ac.id,
                        controller: "TOWER",
                        type: "TAKEOFF",
                        parameters: { runway: ac.targetRunway, initialAltitude: baseAlt + 3000 },
                      });
                    }}
                    className="w-full py-2 rounded-md border border-[var(--atc-emerald-border)] bg-[var(--atc-emerald-bg)] hover:opacity-90 text-[var(--atc-emerald)] font-mono text-xs font-bold disabled:opacity-35"
                  >
                    CLEARED FOR TAKEOFF RWY {ac.targetRunway}
                  </button>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      disabled={nordoLocked}
                      onClick={() =>
                        issueClearance({
                          aircraftId: ac.id,
                          controller: "TOWER",
                          type: "CANCEL_TAKEOFF",
                        })
                      }
                      className="py-1.5 px-2 rounded-md border border-[var(--atc-amber-border)] bg-[var(--atc-amber-bg)] hover:opacity-90 text-[var(--atc-amber)] font-mono text-[11px] font-semibold disabled:opacity-35"
                    >
                      CANCEL TAKEOFF
                    </button>
                    <button
                      disabled={nordoLocked || ac.state !== "TAKEOFF_ROLL"}
                      onClick={() =>
                        issueClearance({
                          aircraftId: ac.id,
                          controller: "TOWER",
                          type: "REJECT_TAKEOFF",
                        })
                      }
                      className="py-1.5 px-2 rounded-md border border-[var(--atc-red-border)] bg-[var(--atc-red-bg)] hover:opacity-90 text-[var(--atc-red)] font-mono text-[11px] font-bold disabled:opacity-35"
                    >
                      REJECT TAKEOFF
                    </button>
                  </div>
                </div>
              )}

              {ac.flightKind === "ARRIVAL" && (() => {
                const activeLandRwy = ac.assignedApproach ?? ac.targetRunway;
                const onSurface = ac.altitude <= sim.airport.elevationFt + 50;
                const canVacateRwy =
                  !nordoLocked &&
                  ac.controller === "TOWER" &&
                  (ac.state === "TOUCHDOWN" ||
                    ac.state === "ROLLOUT" ||
                    ac.state === "VACATING_RUNWAY" ||
                    (ac.state === "HOLD_POSITION" && onSurface) ||
                    ac.state === "STOPPED_ON_RUNWAY");
                const exitOptions = canVacateRwy
                  ? getRunwayExitOptions(sim.airport, ac, activeLandRwy)
                  : [];

                return (
                  <div className="space-y-2">
                    <div className="space-y-1.5">
                      <button
                        disabled={
                          nordoLocked ||
                          (ac.state !== "APPROACH" &&
                            ac.state !== "FINAL" &&
                            ac.state !== "CLEARED_TO_LAND")
                        }
                        onClick={() =>
                          issueClearance({
                            aircraftId: ac.id,
                            controller: "TOWER",
                            type: "LAND",
                            parameters: { runway: activeLandRwy },
                          })
                        }
                        className="w-full py-2 rounded-md border border-[var(--atc-emerald-border)] bg-[var(--atc-emerald-bg)] hover:opacity-90 text-[var(--atc-emerald)] font-mono text-xs font-bold disabled:opacity-35"
                      >
                        CLEARED TO LAND RWY {activeLandRwy}
                      </button>
                      <button
                        disabled={
                          nordoLocked ||
                          (ac.state !== "APPROACH" &&
                            ac.state !== "FINAL" &&
                            ac.state !== "CLEARED_TO_LAND" &&
                            ac.state !== "LANDING")
                        }
                        onClick={() =>
                          issueClearance({
                            aircraftId: ac.id,
                            controller: "TOWER",
                            type: "GO_AROUND",
                            parameters: { altitude: 3000, heading: 90 },
                          })
                        }
                        className="w-full py-2 rounded-md border border-[var(--atc-red-border)] bg-[var(--atc-red-bg)] hover:opacity-90 text-[var(--atc-red)] font-mono text-xs font-semibold disabled:opacity-35"
                      >
                        GO AROUND (CLIMB 3000)
                      </button>
                    </div>

                    {/* Vacate Runway (Exit Runway onto Taxiway) */}
                    <div className="rounded-md border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] p-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-mono font-bold text-[var(--atc-text-secondary)] uppercase">
                          Vacate Runway (RWY {activeLandRwy})
                        </span>
                        {ac.vacateAssignedTaxiway && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)] border border-[var(--atc-cyan-border)]">
                            {ac.expediteVacate ? "EXPEDITE " : ""}
                            VIA {ac.vacateAssignedTaxiway}
                          </span>
                        )}
                      </div>

                      {canVacateRwy && exitOptions.length > 0 ? (
                        <div className="space-y-1">
                          <button
                            onMouseEnter={() => setHoverPreviewRoute(exitOptions[0].nodeIds)}
                            onMouseLeave={() => setHoverPreviewRoute(null)}
                            onClick={() => {
                              setHoverPreviewRoute(null);
                              const opt = exitOptions[0];
                              issueClearance({
                                aircraftId: ac.id,
                                controller: "TOWER",
                                type: "VACATE_RUNWAY",
                                parameters: {
                                  runway: activeLandRwy,
                                  exitRwyNodeId: opt.exitRwyNodeId,
                                  holdShortNodeId: opt.holdShortNodeId,
                                  taxiway: opt.taxiway,
                                  expedite: true,
                                },
                              });
                            }}
                            className="w-full py-1.5 px-2.5 rounded border border-[var(--atc-amber-border)] bg-[var(--atc-amber-bg)] hover:opacity-90 text-[var(--atc-amber)] font-mono text-[11px] font-bold flex items-center justify-between transition-opacity"
                          >
                            <span>EXPEDITE VACATE ({exitOptions[0].taxiway})</span>
                            <ArrowRight className="w-3 h-3 shrink-0" />
                          </button>

                          <div className="grid grid-cols-2 gap-1">
                            {exitOptions.slice(0, 4).map((opt) => (
                              <button
                                key={`${opt.exitRwyNodeId}-${opt.holdShortNodeId}`}
                                onMouseEnter={() => setHoverPreviewRoute(opt.nodeIds)}
                                onMouseLeave={() => setHoverPreviewRoute(null)}
                                onClick={() => {
                                  setHoverPreviewRoute(null);
                                  issueClearance({
                                    aircraftId: ac.id,
                                    controller: "TOWER",
                                    type: "VACATE_RUNWAY",
                                    parameters: {
                                      runway: activeLandRwy,
                                      exitRwyNodeId: opt.exitRwyNodeId,
                                      holdShortNodeId: opt.holdShortNodeId,
                                      taxiway: opt.taxiway,
                                    },
                                  });
                                }}
                                className={`text-left px-2 py-1.5 rounded border text-[10px] font-mono transition-colors ${
                                  ac.vacateAssignedHoldShortId === opt.holdShortNodeId
                                    ? "bg-[var(--atc-cyan-bg)] border-[var(--atc-cyan-border)] text-[var(--atc-cyan)] font-bold"
                                    : "bg-[var(--atc-surface)] border-[var(--atc-border)] hover:border-[var(--atc-accent-border)] text-[var(--atc-text)]"
                                }`}
                              >
                                VACATE {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] font-mono text-[var(--atc-muted)]">
                          {ac.controller !== "TOWER"
                            ? `Switch / handoff under TOWER control to issue vacate clearance (currently ${ac.controller}).`
                            : "Available once aircraft lands on the runway (Touchdown / Rollout)."}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  disabled={nordoLocked || ac.controller === "DEPARTURE"}
                  onClick={() =>
                    issueClearance({
                      aircraftId: ac.id,
                      controller: "TOWER",
                      type: "HANDOFF",
                      parameters: { targetController: "DEPARTURE" },
                    })
                  }
                  className="py-1.5 px-2 rounded-md border border-[var(--atc-cyan-border)] bg-[var(--atc-cyan-bg)] hover:opacity-90 text-[var(--atc-cyan)] font-mono text-[11px] font-semibold disabled:opacity-35"
                >
                  HANDOFF → DEP ({controllerFrequency("DEPARTURE", sim.airport)})
                </button>
                <button
                  disabled={nordoLocked || ac.controller === "GROUND"}
                  onClick={() =>
                    issueClearance({
                      aircraftId: ac.id,
                      controller: "TOWER",
                      type: "HANDOFF",
                      parameters: { targetController: "GROUND" },
                    })
                  }
                  className="py-1.5 px-2 rounded-md border border-[var(--atc-amber-border)] bg-[var(--atc-amber-bg)] hover:opacity-90 text-[var(--atc-amber)] font-mono text-[11px] font-semibold disabled:opacity-35"
                >
                  HANDOFF → GND ({controllerFrequency("GROUND", sim.airport)})
                </button>
              </div>

              {/* Nested Collapsible Light Gun unless NORDO */}
              <Accordion
                title="Tower Light Gun (NORDO 7600)"
                defaultOpen={nordoLocked}
                className={nordoLocked ? "border-[var(--atc-amber-border)]" : ""}
              >
                <div className="grid grid-cols-3 gap-1">
                  <button
                    onClick={() =>
                      issueClearance({
                        aircraftId: ac.id,
                        controller: "TOWER",
                        type: "LIGHT_GUN",
                        parameters: { signal: "STEADY_GREEN" },
                      })
                    }
                    className="py-1 rounded bg-[var(--atc-emerald-bg)] border border-[var(--atc-emerald-border)] text-[var(--atc-emerald)] text-[10px] font-mono font-semibold"
                  >
                    STEADY GRN
                  </button>
                  <button
                    onClick={() =>
                      issueClearance({
                        aircraftId: ac.id,
                        controller: "TOWER",
                        type: "LIGHT_GUN",
                        parameters: { signal: "FLASHING_GREEN" },
                      })
                    }
                    className="py-1 rounded bg-[var(--atc-cyan-bg)] border border-[var(--atc-cyan-border)] text-[var(--atc-cyan)] text-[10px] font-mono font-semibold"
                  >
                    FLASH GRN
                  </button>
                  <button
                    onClick={() =>
                      issueClearance({
                        aircraftId: ac.id,
                        controller: "TOWER",
                        type: "LIGHT_GUN",
                        parameters: { signal: "STEADY_RED" },
                      })
                    }
                    title={
                      ac.altitude > sim.airport.elevationFt + 40 ||
                      ac.state === "ROTATE" ||
                      ac.state === "CLIMB" ||
                      ac.state === "APPROACH" ||
                      ac.state === "FINAL" ||
                      ac.state === "CLEARED_TO_LAND" ||
                      ac.state === "LANDING" ||
                      ac.state === "GO_AROUND"
                        ? "In Flight: Give way & continue circling (Go Around if landing)"
                        : "On Ground: Stop immediately"
                    }
                    className="py-1 rounded bg-[var(--atc-red-bg)] border border-[var(--atc-red-border)] text-[var(--atc-red)] text-[10px] font-mono font-semibold"
                  >
                    STEADY RED
                  </button>
                </div>
              </Accordion>

              {ac.state === "STOPPED_ON_RUNWAY" && (
                <button
                  onClick={() => towDisabledAircraft(ac.id)}
                  className="w-full py-2 rounded-md border border-[var(--atc-amber-border)] bg-[var(--atc-amber-bg)] hover:opacity-90 text-[var(--atc-amber)] font-mono text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  DISPATCH ARFF & TOW OFF RUNWAY
                </button>
              )}
            </div>
          )}

          {/* DEPARTURE / APPROACH COMMANDS */}
          {deckTab === "DEPARTURE" && (() => {
            const depAppGuidance = computeDepAppGuidance(
              sim.airport,
              ac,
              selectedApproachRunway
            );
            const recHdgStr = String(depAppGuidance.recommendedHeading).padStart(3, "0");
            const recBaseAlt = Math.round(sim.airport.elevationFt / 500) * 500;
            const altOptions = Array.from(
              new Set([
                recBaseAlt + 2500,
                recBaseAlt + 3000,
                recBaseAlt + 5000,
                recBaseAlt + 7000,
                recBaseAlt + 10000,
              ])
            ).sort((a, b) => a - b);
            const speedOptions = [160, 180, 210, 250];
            const isGoAroundOrPattern =
              depAppGuidance.mode === "GO_AROUND_RECOVERY" ||
              (ac.flightKind === "ARRIVAL" && depAppGuidance.needsPatternTurn);

            const handleApplyGuidance = () => {
              if (nordoLocked) return;
              if (depAppGuidance.mode === "DEPARTURE_CLIMB") {
                issueClearance({
                  aircraftId: ac.id,
                  controller: "DEPARTURE",
                  type: "ALTITUDE",
                  parameters: { altitude: depAppGuidance.recommendedAltitude },
                });
                issueClearance({
                  aircraftId: ac.id,
                  controller: "DEPARTURE",
                  type: "SPEED",
                  parameters: { speed: depAppGuidance.recommendedSpeed },
                });
                if (depAppGuidance.recommendedDirectFix) {
                  issueClearance({
                    aircraftId: ac.id,
                    controller: "DEPARTURE",
                    type: "DIRECT",
                    parameters: { fixId: depAppGuidance.recommendedDirectFix },
                  });
                }
                return;
              }

              // Go-Around / Arrival recovery back to runway
              issueClearance({
                aircraftId: ac.id,
                controller: "DEPARTURE",
                type: "ALTITUDE",
                parameters: { altitude: depAppGuidance.recommendedAltitude },
              });
              issueClearance({
                aircraftId: ac.id,
                controller: "DEPARTURE",
                type: "SPEED",
                parameters: { speed: depAppGuidance.recommendedSpeed },
              });
              if (depAppGuidance.needsPatternTurn) {
                issueClearance({
                  aircraftId: ac.id,
                  controller: "DEPARTURE",
                  type: "HEADING",
                  parameters: {
                    heading: depAppGuidance.recommendedHeading,
                    turnDirection: depAppGuidance.recommendedTurnDirection,
                  },
                });
              } else {
                if (depAppGuidance.recommendedDirectFix) {
                  issueClearance({
                    aircraftId: ac.id,
                    controller: "DEPARTURE",
                    type: "DIRECT",
                    parameters: { fixId: depAppGuidance.recommendedDirectFix },
                  });
                }
                issueClearance({
                  aircraftId: ac.id,
                  controller: "DEPARTURE",
                  type: "APPROACH",
                  parameters: { runway: depAppGuidance.recommendedRunway },
                });
              }
            };

            return (
              <div className="space-y-2.5">
                {/* Smart Suggested Values & Go-Around Pattern Recovery Card */}
                <div
                  className={`rounded-md border p-2.5 space-y-2 ${
                    isGoAroundOrPattern
                      ? "bg-[var(--atc-amber-bg)] border-[var(--atc-amber-border)]"
                      : "bg-[var(--atc-cyan-bg)]/55 border-[var(--atc-cyan-border)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[10px] font-mono font-extrabold tracking-wide ${
                        isGoAroundOrPattern
                          ? "text-[var(--atc-amber)]"
                          : "text-[var(--atc-cyan)]"
                      }`}
                    >
                      {depAppGuidance.headline}
                    </span>
                    {ac.flightKind === "ARRIVAL" && (
                      <div className="flex gap-1">
                        {sim.airport.runwayIds.map((r) => (
                          <button
                            key={`rec-rwy-${r}`}
                            type="button"
                            onClick={() => setSelectedApproachRunway(r)}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${
                              depAppGuidance.recommendedRunway === r
                                ? "bg-[var(--atc-accent-bg)] border-[var(--atc-accent-border)] text-[var(--atc-accent-text)] font-bold"
                                : "bg-[var(--atc-surface)] border-[var(--atc-border)] text-[var(--atc-muted)]"
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] font-mono text-[var(--atc-text)] leading-relaxed">
                    {depAppGuidance.stepSummary}
                  </div>

                  {depAppGuidance.mode !== "GROUND_PREFLIGHT" && (
                    <button
                      type="button"
                      disabled={nordoLocked}
                      onClick={handleApplyGuidance}
                      className={`w-full py-1.5 px-2 rounded-md border font-mono text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-35 ${
                        isGoAroundOrPattern
                          ? "bg-[var(--atc-accent)] border-[var(--atc-accent-border)] text-slate-950 hover:opacity-90"
                          : "bg-[var(--atc-surface)] border-[var(--atc-cyan-border)] text-[var(--atc-cyan)] hover:bg-[var(--atc-surface-alt)]"
                      }`}
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      {depAppGuidance.mode === "DEPARTURE_CLIMB"
                        ? `APPLY CLIMB (${depAppGuidance.recommendedAltitude} FT · ${depAppGuidance.recommendedSpeed} KT)`
                        : depAppGuidance.needsPatternTurn
                        ? `VECTOR BACK TO RWY ${depAppGuidance.recommendedRunway} (HDG ${recHdgStr}°)`
                        : `INTERCEPT ILS RWY ${depAppGuidance.recommendedRunway} (${depAppGuidance.recommendedAltitude} FT)`}
                    </button>
                  )}
                </div>

                <div className="rounded-md border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] p-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[var(--atc-text-secondary)]">
                    <span className="font-bold">
                      HEADING (
                      {ac.assignedHeading !== null
                        ? `${String(Math.round(ac.assignedHeading)).padStart(3, "0")}°`
                        : "---"}
                      ) ·{" "}
                      <span className="text-[var(--atc-accent-text)]">REC {recHdgStr}°</span>
                    </span>
                    <div className="flex gap-1">
                      {(["LEFT", "NEAREST", "RIGHT"] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => setTurnDir(d)}
                          className={`px-1.5 py-0.5 rounded border ${
                            turnDir === d
                              ? "bg-[var(--atc-accent-bg)] border-[var(--atc-accent-border)] text-[var(--atc-accent-text)] font-bold"
                              : "bg-[var(--atc-surface)] border-[var(--atc-border)] text-[var(--atc-muted)]"
                          }`}
                        >
                          {d === "NEAREST" ? "DIR" : d[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[30, 60, 90, 120, 180, 240, 270, 330].map((hdg) => (
                      <button
                        key={hdg}
                        disabled={nordoLocked}
                        onClick={() =>
                          issueClearance({
                            aircraftId: ac.id,
                            controller: "DEPARTURE",
                            type: "HEADING",
                            parameters: { heading: hdg, turnDirection: turnDir },
                          })
                        }
                        className={`py-1 font-mono text-[11px] ${neutralBtn}`}
                      >
                        {String(hdg).padStart(3, "0")}°
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <input
                      value={customHeading}
                      onChange={(e) => setCustomHeading(e.target.value)}
                      className="w-20 bg-[var(--atc-surface)] border border-[var(--atc-accent-border)] rounded px-2 py-1 text-xs font-mono text-[var(--atc-text)]"
                      placeholder={recHdgStr}
                    />
                    <button
                      disabled={nordoLocked}
                      onClick={() =>
                        issueClearance({
                          aircraftId: ac.id,
                          controller: "DEPARTURE",
                          type: "HEADING",
                          parameters: {
                            heading: Number(customHeading) || depAppGuidance.recommendedHeading,
                            turnDirection: turnDir,
                          },
                        })
                      }
                      className="flex-1 py-1 rounded bg-[var(--atc-accent-bg)] hover:opacity-90 border border-[var(--atc-accent-border)] text-[var(--atc-accent-text)] font-mono text-xs font-semibold disabled:opacity-35"
                    >
                      ASSIGN HDG {customHeading.padStart(3, "0")}°
                    </button>
                  </div>
                </div>

                <div className="rounded-md border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] p-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold text-[var(--atc-text-secondary)]">
                    <span>ALTITUDE (CLEARED: {ac.assignedAltitude ?? "---"} FT)</span>
                    <span className="text-[var(--atc-accent-text)]">
                      REC {(depAppGuidance.recommendedAltitude / 1000).toFixed(depAppGuidance.recommendedAltitude % 1000 === 0 ? 0 : 1)}k
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {altOptions.map((alt) => {
                      const isRec = alt === depAppGuidance.recommendedAltitude;
                      return (
                        <button
                          key={alt}
                          disabled={nordoLocked}
                          onClick={() =>
                            issueClearance({
                              aircraftId: ac.id,
                              controller: "DEPARTURE",
                              type: "ALTITUDE",
                              parameters: { altitude: alt },
                            })
                          }
                          title={isRec ? `Recommended altitude (${alt} ft)` : `${alt} ft`}
                          className={`py-1 font-mono text-[10px] rounded border transition-colors disabled:opacity-40 ${
                            isRec
                              ? "bg-[var(--atc-accent-bg)] border-[var(--atc-accent-border)] text-[var(--atc-accent-text)] font-bold"
                              : neutralBtn
                          }`}
                        >
                          {(alt / 1000).toFixed(alt % 1000 === 0 ? 0 : 1)}k
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-md border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] p-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold text-[var(--atc-text-secondary)]">
                    <span>SPEED (CLEARED: {ac.assignedSpeed ?? "---"} KTS)</span>
                    <span className="text-[var(--atc-accent-text)]">
                      REC {depAppGuidance.recommendedSpeed}kt
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {speedOptions.map((spd) => {
                      const isRec = spd === depAppGuidance.recommendedSpeed;
                      return (
                        <button
                          key={spd}
                          disabled={nordoLocked}
                          onClick={() =>
                            issueClearance({
                              aircraftId: ac.id,
                              controller: "DEPARTURE",
                              type: "SPEED",
                              parameters: { speed: spd },
                            })
                          }
                          title={isRec ? `Recommended speed (${spd} kt)` : `${spd} kt`}
                          className={`py-1 font-mono text-[11px] rounded border transition-colors disabled:opacity-40 ${
                            isRec
                              ? "bg-[var(--atc-accent-bg)] border-[var(--atc-accent-border)] text-[var(--atc-accent-text)] font-bold"
                              : neutralBtn
                          }`}
                        >
                          {spd}kt
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-md border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] p-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold text-[var(--atc-text-secondary)]">
                    <span>APPROACH & DIRECT FIXES</span>
                    {depAppGuidance.recommendedDirectFix && (
                      <span className="text-[var(--atc-accent-text)]">
                        REC {depAppGuidance.recommendedDirectFix}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {sim.airport.runwayIds.map((rwy) => {
                      const isRecRwy =
                        ac.flightKind === "ARRIVAL" &&
                        rwy === depAppGuidance.recommendedRunway;
                      return (
                        <button
                          key={`ils-${rwy}`}
                          disabled={nordoLocked}
                          onClick={() =>
                            issueClearance({
                              aircraftId: ac.id,
                              controller: "DEPARTURE",
                              type: "APPROACH",
                              parameters: { runway: rwy },
                            })
                          }
                          className={`py-1.5 rounded border font-mono text-[11px] font-semibold disabled:opacity-35 ${
                            isRecRwy
                              ? "bg-[var(--atc-emerald-bg)] border-[var(--atc-emerald)] ring-1 ring-[var(--atc-emerald)]/50 text-[var(--atc-emerald)] font-extrabold"
                              : "bg-[var(--atc-emerald-bg)] hover:opacity-90 border-[var(--atc-emerald-border)] text-[var(--atc-emerald)]"
                          }`}
                        >
                          ILS RWY {rwy}
                          {isRecRwy ? " ★" : ""}
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {Object.keys(sim.airport.fixes)
                      .filter((id) => id !== "MISSED")
                      .map((fixId) => {
                        const isRecFix = fixId === depAppGuidance.recommendedDirectFix;
                        return (
                          <button
                            key={fixId}
                            disabled={nordoLocked}
                            onClick={() =>
                              issueClearance({
                                aircraftId: ac.id,
                                controller: "DEPARTURE",
                                type: "DIRECT",
                                parameters: { fixId },
                              })
                            }
                            title={isRecFix ? `Recommended fix (${fixId})` : `Proceed direct ${fixId}`}
                            className={`py-1 font-mono text-[10px] rounded border transition-colors disabled:opacity-40 ${
                              isRecFix
                                ? "bg-[var(--atc-accent-bg)] border-[var(--atc-accent-border)] text-[var(--atc-accent-text)] font-bold"
                                : neutralBtn
                            }`}
                          >
                            {fixId}
                          </button>
                        );
                      })}
                  </div>
                </div>

                <button
                  disabled={nordoLocked || ac.controller === "TOWER"}
                  onClick={() =>
                    issueClearance({
                      aircraftId: ac.id,
                      controller: "DEPARTURE",
                      type: "HANDOFF",
                      parameters: { targetController: "TOWER" },
                    })
                  }
                  className="w-full py-1.5 rounded-md border border-[var(--atc-cyan-border)] bg-[var(--atc-cyan-bg)] hover:opacity-90 text-[var(--atc-cyan)] font-mono text-xs font-semibold disabled:opacity-35"
                >
                  HANDOFF → TOWER ({controllerFrequency("TOWER", sim.airport)})
                </button>
              </div>
            );
          })()}
        </Accordion>
        )}

        {/* ACCORDION 2: Flight Telemetry & Assignments (Collapsed for minimal view) */}
        <Accordion
          title="Flight Telemetry"
          icon={<Activity className="w-3.5 h-3.5" />}
          defaultOpen={false}
          badge={
            <span className="text-[10px] font-mono text-[var(--atc-muted)]">
              RWY {ac.targetRunway}
            </span>
          }
        >
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] font-mono">
            <div className="flex justify-between">
              <span className="text-[var(--atc-muted)]">Kind</span>
              <span className="font-semibold text-[var(--atc-text)]">{ac.flightKind}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--atc-muted)]">Runway</span>
              <span className="font-semibold text-[var(--atc-text)]">{ac.targetRunway}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--atc-muted)]">Asgn Alt</span>
              <span className="font-semibold text-[var(--atc-text)]">
                {ac.assignedAltitude ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--atc-muted)]">Asgn Hdg</span>
              <span className="font-semibold text-[var(--atc-text)]">
                {ac.assignedHeading !== null
                  ? `${String(Math.round(ac.assignedHeading)).padStart(3, "0")}°`
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--atc-muted)]">Asgn Spd</span>
              <span className="font-semibold text-[var(--atc-text)]">
                {ac.assignedSpeed ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--atc-muted)]">Gate</span>
              <span className="font-semibold text-[var(--atc-text)]">{ac.gateId ?? "—"}</span>
            </div>
            <div className="col-span-2 pt-1 mt-0.5 border-t border-[var(--atc-border)] flex items-center justify-between text-[10px]">
              <span
                className={`px-1.5 py-0.5 rounded border ${
                  ac.operationMode === "EMERGENCY_OPERATION"
                    ? "bg-[var(--atc-red-bg)] border-[var(--atc-red-border)] text-[var(--atc-red)] font-bold"
                    : "bg-[var(--atc-surface-alt)] border-[var(--atc-border)] text-[var(--atc-muted)]"
                }`}
              >
                {ac.operationMode}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded border ${
                  nordoLocked
                    ? "bg-[var(--atc-amber-bg)] border-[var(--atc-amber-border)] text-[var(--atc-amber)] font-bold"
                    : "bg-[var(--atc-surface-alt)] border-[var(--atc-border)] text-[var(--atc-muted)]"
                }`}
              >
                {ac.commStatus}
              </span>
            </div>
          </div>
        </Accordion>

        {/* ACCORDION 3: Structured Clearances Log */}
        <Accordion
          title="Structured Clearances"
          icon={<ClipboardList className="w-3.5 h-3.5" />}
          defaultOpen={false}
          badge={
            <span className="px-1.5 py-0.5 rounded bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] text-[10px] font-mono text-[var(--atc-text-secondary)]">
              {ac.clearances.length}
            </span>
          }
        >
          {ac.clearances.length === 0 ? (
            <div className="text-[11px] font-mono text-[var(--atc-muted)]">
              No clearances issued yet. Aircraft waiting.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {[...ac.clearances].reverse().map((clr) => (
                <div
                  key={clr.id}
                  className="px-2 py-1.5 rounded bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] text-[10px] font-mono"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-[var(--atc-text)]">
                      {clr.type} ({clr.issuedBy === "AUTONOMOUS" ? "AI" : "YOU"})
                    </span>
                    <span
                      className={`px-1 rounded text-[9px] font-semibold ${
                        clr.lifecycle === "ACTIVE"
                          ? "bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)]"
                          : clr.lifecycle === "READBACK_ERROR" || clr.lifecycle === "CANCELLED"
                          ? "bg-[var(--atc-red-bg)] text-[var(--atc-red)]"
                          : clr.lifecycle === "READBACK_PENDING"
                          ? "bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)]"
                          : "bg-[var(--atc-surface)] text-[var(--atc-muted)]"
                      }`}
                    >
                      {clr.lifecycle}
                    </span>
                  </div>
                  <div className="text-[var(--atc-muted)] truncate mt-0.5">
                    {clr.phraseology}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Accordion>

        {/* ACCORDION 4: Incident / Verification Triggers */}
        <Accordion
          title="Incident Triggers"
          icon={<Sliders className="w-3.5 h-3.5" />}
          defaultOpen={false}
        >
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => armReadbackError(ac.id)}
              className={`py-1.5 px-1.5 rounded border font-mono text-[10px] ${
                ac.armNextReadbackError
                  ? "bg-[var(--atc-amber-bg)] border-[var(--atc-amber-border)] text-[var(--atc-amber)] font-bold"
                  : neutralBtn
              }`}
            >
              <RotateCcw className="w-3 h-3 inline mr-0.5" />
              {ac.armNextReadbackError ? "RB ARMED" : "Next RB Err"}
            </button>
            <button
              disabled={nordoLocked}
              onClick={() => causeRadioFailure(ac.id)}
              className="py-1.5 px-1.5 rounded border bg-[var(--atc-amber-bg)] border-[var(--atc-amber-border)] text-[var(--atc-amber)] font-mono text-[10px] font-semibold disabled:opacity-35"
            >
              NORDO 7600
            </button>
            <button
              onClick={() =>
                causeEmergency(
                  ac.id,
                  ac.state === "TAKEOFF_ROLL" ? "REJECTED_TAKEOFF_ABORT" : "ENGINE_FAILURE"
                )
              }
              className="py-1.5 px-1.5 rounded border bg-[var(--atc-red-bg)] border-[var(--atc-red-border)] text-[var(--atc-red)] font-mono text-[10px] font-semibold"
            >
              {ac.state === "TAKEOFF_ROLL" ? "RTO Abort" : "Emg 7700"}
            </button>
          </div>
        </Accordion>
      </div>
    </aside>
  );
};
