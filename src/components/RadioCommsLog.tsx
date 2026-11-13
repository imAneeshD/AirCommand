import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronDown,
  Fuel,
  Gauge,
  Plane,
  Radio,
  Send,
  Users,
  X,
} from "lucide-react";
import { getResolvedAircraftDetails } from "../data/aircraftCatalog.ts";
import { getAircraftPhaseLabel } from "../engine/simulation.ts";
import { useAtcStore } from "../store/atcStore.ts";
import { formatWallClockAtSimOffset } from "../utils/dateTime.ts";
import { computeAircraftPitchDeg, formatAltitudeReadout } from "../utils/telemetry.ts";
import { AircraftPhotoFrame } from "./AircraftPhotoFrame.tsx";

type BottomTab = "LOGS" | "AIRCRAFT" | "COORD";
type LogFilter = "ALL" | "STATION" | "ALERTS";

function formatElapsedSimTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `T+${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const RadioCommsLog: React.FC = () => {
  const sim = useAtcStore((s) => s.sim);
  useAtcStore((s) => s.tickVersion);
  const theme = useAtcStore((s) => s.theme);
  const selectAircraft = useAtcStore((s) => s.selectAircraft);
  const roomState = useAtcStore((s) => s.roomState);
  const assignedRole = useAtcStore((s) => s.assignedRole);
  const respondToHandoff = useAtcStore((s) => s.respondToHandoff);
  const sendMultiplayerChat = useAtcStore((s) => s.sendMultiplayerChat);
  const listRef = useRef<HTMLDivElement | null>(null);
  const sessionAnchorRef = useRef<{ key: string; wallMs: number; simSec: number }>({
    key: `${sim.airport.icao}|${sim.scenarioId}`,
    wallMs: Date.now(),
    simSec: sim.time,
  });

  const sessionKey = `${sim.airport.icao}|${sim.scenarioId}`;
  if (sessionAnchorRef.current.key !== sessionKey || sim.time < sessionAnchorRef.current.simSec) {
    sessionAnchorRef.current = {
      key: sessionKey,
      wallMs: Date.now(),
      simSec: sim.time,
    };
  }

  const [activeTab, setActiveTab] = useState<BottomTab>("LOGS");
  const collapsed = useAtcStore((s) => s.minimizedPanels.bottom);
  const togglePanelMinimized = useAtcStore((s) => s.togglePanelMinimized);
  const setPanelMinimized = useAtcStore((s) => s.setPanelMinimized);
  const [chatText, setChatText] = useState("");
  const [filter, setFilter] = useState<LogFilter>(
    sim.config.activePlayerStation === "ALL" ? "ALL" : "STATION"
  );

  useEffect(() => {
    setFilter(sim.config.activePlayerStation === "ALL" ? "ALL" : "STATION");
  }, [sim.config.activePlayerStation]);

  const messages = sim.radioLog.filter((m) => {
    if (filter === "STATION") {
      return sim.config.activePlayerStation === "ALL"
        ? true
        : m.controller === sim.config.activePlayerStation;
    }
    if (filter === "ALERTS") {
      return m.category === "READBACK_ERROR" || m.category === "EMERGENCY";
    }
    return true;
  });

  useEffect(() => {
    if (!collapsed && activeTab === "LOGS" && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, collapsed, activeTab]);

  const selectedAc = sim.selectedAircraftId ? sim.aircraft[sim.selectedAircraftId] : null;
  const latestMsg = messages[messages.length - 1];
  const resolved = selectedAc ? getResolvedAircraftDetails(selectedAc, sim.airport) : null;

  const switchTab = (tab: BottomTab) => {
    setActiveTab(tab);
    if (collapsed) setPanelMinimized("bottom", false);
  };

  return (
    <section
      className={`bg-[var(--atc-panel)] border-t border-[var(--atc-border)] flex flex-col shrink-0 transition-all duration-150 ${
        collapsed ? "h-9" : activeTab === "AIRCRAFT" ? "h-[228px]" : "h-36"
      }`}
    >
      {/* Header / Tab Bar */}
      <div className="px-3 h-9 border-b border-[var(--atc-border)] bg-[var(--atc-surface)]/85 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-1 min-w-0">
          {/* Tab 1: Radio & Event Log */}
          <button
            type="button"
            onClick={() => switchTab("LOGS")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all shrink-0 ${
              activeTab === "LOGS" && !collapsed
                ? "bg-[var(--atc-accent-bg)] text-[var(--atc-accent-text)] border border-[var(--atc-accent-border)]"
                : "text-[var(--atc-muted)] hover:text-[var(--atc-text)] hover:bg-[var(--atc-surface-alt)] border border-transparent"
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-[var(--atc-cyan)] shrink-0" />
            <span>RADIO & EVENT LOG</span>
            {sim.incidents.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-[var(--atc-red-bg)] border border-[var(--atc-red-border)] text-[9px] text-[var(--atc-red)] inline-flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5" />
                {sim.incidents.length}
              </span>
            )}
          </button>

          {/* Tab 2: Selected Aircraft Details & Image */}
          <button
            type="button"
            onClick={() => switchTab("AIRCRAFT")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all shrink-0 ${
              activeTab === "AIRCRAFT" && !collapsed
                ? "bg-[var(--atc-accent-bg)] text-[var(--atc-accent-text)] border border-[var(--atc-accent-border)]"
                : "text-[var(--atc-muted)] hover:text-[var(--atc-text)] hover:bg-[var(--atc-surface-alt)] border border-transparent"
            }`}
          >
            <Plane className="w-3.5 h-3.5 text-[var(--atc-emerald)] shrink-0" />
            <span>AIRCRAFT DETAILS</span>
            {selectedAc && (
              <span className="px-1.5 py-0.5 rounded bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] text-[9px] text-[var(--atc-text)] font-bold">
                {selectedAc.callsign} • {selectedAc.aircraftType}
              </span>
            )}
          </button>

          {/* Tab 3: Multiplayer Handoffs & Coordination */}
          {roomState && (
            <button
              type="button"
              onClick={() => switchTab("COORD")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all shrink-0 ${
                activeTab === "COORD" && !collapsed
                  ? "bg-[var(--atc-accent-bg)] text-[var(--atc-accent-text)] border border-[var(--atc-accent-border)]"
                  : "text-[var(--atc-muted)] hover:text-[var(--atc-text)] hover:bg-[var(--atc-surface-alt)] border border-transparent"
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--atc-cyan)] shrink-0" />
              <span>HANDOFFS & COORD</span>
              {roomState.handoffs.filter((h) => h.status === "PENDING").length > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-[var(--atc-amber-bg)] border border-[var(--atc-amber-border)] text-[9px] text-[var(--atc-amber)] font-bold">
                  {roomState.handoffs.filter((h) => h.status === "PENDING").length}
                </span>
              )}
            </button>
          )}

          {collapsed && latestMsg && (
            <span className="text-[10px] font-mono text-[var(--atc-muted)] truncate ml-2 hidden md:inline">
              [
              {formatWallClockAtSimOffset(
                sessionAnchorRef.current.wallMs,
                sessionAnchorRef.current.simSec,
                latestMsg.timestamp
              )}
              ] {latestMsg.sender}: "{latestMsg.text}"
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[10px] font-mono shrink-0">
          {!collapsed &&
            activeTab === "LOGS" &&
            (
              [
                { id: "ALL", label: "ALL FREQ" },
                {
                  id: "STATION",
                  label:
                    sim.config.activePlayerStation === "ALL"
                      ? "ALL (AUTO)"
                      : `${sim.config.activePlayerStation} ONLY`,
                },
                { id: "ALERTS", label: `ALERTS (${sim.incidents.length})` },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-2 py-0.5 rounded border transition-colors ${
                  filter === f.id
                    ? "bg-[var(--atc-accent-bg)] border-[var(--atc-accent-border)] text-[var(--atc-accent-text)] font-bold"
                    : "border-transparent text-[var(--atc-muted)] hover:text-[var(--atc-text)]"
                }`}
              >
                {f.label}
              </button>
            ))}

          <button
            type="button"
            onClick={() => togglePanelMinimized("bottom")}
            aria-label={collapsed ? "Expand Bottom Panel" : "Minimize Bottom Panel"}
            title={collapsed ? "Expand Bottom Panel" : "Minimize Bottom Panel"}
            className="p-1 rounded text-[var(--atc-muted)] hover:text-[var(--atc-text)] hover:bg-[var(--atc-surface-alt)]"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-150 ${
                collapsed ? "rotate-180" : "rotate-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* TAB BODY 1: RADIO & EVENT LOG */}
      {!collapsed && activeTab === "LOGS" && (
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto px-3 py-1.5 space-y-0.5 font-mono text-[11px] bg-[var(--atc-panel)]"
        >
          {messages.length === 0 ? (
            <div className="text-[var(--atc-muted)] py-2">Listening on frequency...</div>
          ) : (
            messages.map((m) => {
              const cls =
                m.category === "ATC_CLEARANCE"
                  ? "text-[var(--atc-cyan)] font-medium"
                  : m.category === "PILOT_READBACK"
                  ? "text-[var(--atc-emerald)]"
                  : m.category === "PILOT_REQUEST"
                  ? "text-[var(--atc-amber)]"
                  : m.category === "READBACK_ERROR" || m.category === "EMERGENCY"
                  ? "text-[var(--atc-red)] font-semibold"
                  : "text-[var(--atc-muted)]";

              return (
                <div
                  key={m.id}
                  onClick={() => m.aircraftId && selectAircraft(m.aircraftId)}
                  className={`flex items-baseline gap-2 leading-snug ${
                    m.aircraftId
                      ? "cursor-pointer hover:bg-[var(--atc-surface)] rounded px-1.5 py-0.5"
                      : "px-1.5 py-0.5"
                  }`}
                >
                  <span
                    className="text-[var(--atc-muted)] shrink-0 text-[10px] tabular-nums"
                    title={formatElapsedSimTime(m.timestamp)}
                  >
                    {formatWallClockAtSimOffset(
                      sessionAnchorRef.current.wallMs,
                      sessionAnchorRef.current.simSec,
                      m.timestamp
                    )}
                  </span>
                  <span className="text-[var(--atc-text-secondary)] shrink-0 w-36 truncate font-medium">
                    {m.sender} → {m.recipient}:
                  </span>
                  <span className={cls}>"{m.text}"</span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB BODY 2: AIRCRAFT DETAILS & PROFILE ILLUSTRATION */}
      {!collapsed && activeTab === "AIRCRAFT" && (
        <div className="flex-1 overflow-y-auto px-3 py-2 bg-[var(--atc-panel)] min-h-0">
          {!selectedAc || !resolved ? (
            <div className="h-full flex items-center justify-center text-xs font-mono text-[var(--atc-muted)] gap-2">
              <Plane className="w-4 h-4" />
              Select any aircraft on the chart or flight strip rack to inspect full aircraft profile & image.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full items-stretch">
              {/* Column 1: Real Aircraft Photo (with seamless fallback to SVG Profile) + Identity Strip */}
              <div className="lg:col-span-4 flex flex-col justify-between gap-1.5">
                <AircraftPhotoFrame
                  aircraft={selectedAc}
                  spec={resolved.spec}
                  livery={resolved.livery}
                  registration={resolved.registration}
                  elevationFt={sim.airport.elevationFt}
                  theme={theme}
                />
                <div className="flex items-center justify-between gap-2 text-[10px] font-mono px-1.5 py-1 rounded-md border border-[var(--atc-border)] bg-[var(--atc-surface)]">
                  <span className="font-bold text-[var(--atc-text)] truncate">
                    {resolved.spec.model}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="px-1.5 py-0.2 rounded bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] text-[9px] text-[var(--atc-text-secondary)] font-semibold">
                      {resolved.spec.code}
                    </span>
                    <span className="text-[9px] text-[var(--atc-muted)]">
                      {resolved.spec.bodyClass}
                    </span>
                  </div>
                </div>
              </div>

              {/* Column 2: Livery Identity, Route (From -> To) & Live ATC Assignment */}
              <div className="lg:col-span-4 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] p-2.5 shadow-[var(--atc-shadow)] flex flex-col justify-between gap-2">
                {/* Airline Livery Swatch + Callsign + Wake/Phase Row */}
                <div className="flex items-center justify-between gap-2 border-b border-[var(--atc-border)] pb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-7 rounded-sm shrink-0 border border-[var(--atc-border)] overflow-hidden flex flex-col"
                      title={`${resolved.livery.airlineName} Livery`}
                    >
                      <span
                        className="flex-1 w-full"
                        style={{ backgroundColor: resolved.livery.tailBg }}
                      />
                      <span
                        className="h-2 w-full"
                        style={{ backgroundColor: resolved.livery.cheatline }}
                      />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold font-mono text-[var(--atc-text)] flex items-center gap-1.5">
                        <span>{selectedAc.callsign}</span>
                        <span className="text-[10px] font-normal text-[var(--atc-muted)]">
                          ({resolved.flightNumber})
                        </span>
                      </div>
                      <div className="text-[10px] text-[var(--atc-muted)] truncate">
                        {resolved.livery.airlineName} • Reg{" "}
                        <span className="font-semibold text-[var(--atc-text-secondary)]">
                          {resolved.registration}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 text-[9px] font-mono">
                    <span className="px-1.5 py-0.5 rounded bg-[var(--atc-accent-bg)] border border-[var(--atc-accent-border)] text-[var(--atc-accent-text)] font-bold">
                      {getAircraftPhaseLabel(selectedAc)}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[var(--atc-cyan-bg)] border border-[var(--atc-cyan-border)] text-[var(--atc-cyan)] font-bold">
                      {selectedAc.wakeCategory}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] text-[var(--atc-text)] font-bold">
                      SQK {selectedAc.squawk}
                    </span>
                  </div>
                </div>

                {/* FROM -> TO Airport Banner */}
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[var(--atc-surface-alt)] border border-[var(--atc-border)]">
                  <div className="min-w-0 flex-1">
                    <div className="text-[8px] font-mono uppercase tracking-wider text-[var(--atc-muted)]">
                      ORIGIN
                    </div>
                    <div className="text-sm font-extrabold font-mono text-[var(--atc-text)] leading-tight">
                      {resolved.originIcao}
                    </div>
                    <div className="text-[9px] text-[var(--atc-muted)] truncate">
                      {resolved.originName}
                    </div>
                  </div>

                  <div className="flex flex-col items-center shrink-0 px-2 text-[var(--atc-accent-text)]">
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-px bg-[var(--atc-border)]" />
                      <Plane className="w-3.5 h-3.5" />
                      <ArrowRight className="w-3 h-3" />
                    </div>
                    <span className="text-[8px] font-mono font-bold uppercase mt-0.5">
                      {selectedAc.flightKind}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 text-right">
                    <div className="text-[8px] font-mono uppercase tracking-wider text-[var(--atc-muted)]">
                      DESTINATION
                    </div>
                    <div className="text-sm font-extrabold font-mono text-[var(--atc-text)] leading-tight">
                      {resolved.destinationIcao}
                    </div>
                    <div className="text-[9px] text-[var(--atc-muted)] truncate">
                      {resolved.destinationName}
                    </div>
                  </div>
                </div>

                {/* Gate / Runway / SID-STAR / Cruise Footer */}
                <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                  <div className="px-2 py-1 rounded border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                    <span className="text-[var(--atc-muted)] block text-[8px]">STAND / RWY</span>
                    <span className="font-bold text-[var(--atc-text)] truncate block">
                      {selectedAc.gateId ?? "—"} / {selectedAc.assignedApproach ?? selectedAc.targetRunway}
                    </span>
                  </div>
                  <div className="px-2 py-1 rounded border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                    <span className="text-[var(--atc-muted)] block text-[8px]">SID / ROUTE</span>
                    <span className="font-bold text-[var(--atc-text)] truncate block">
                      {selectedAc.assignedDirectFix ??
                        selectedAc.assignedDepartureFix ??
                        selectedAc.assignedApproach ??
                        "VECTORS"}
                    </span>
                  </div>
                  <div className="px-2 py-1 rounded border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                    <span className="text-[var(--atc-muted)] block text-[8px]">CRUISE FL</span>
                    <span className="font-bold text-[var(--atc-text)] truncate block">
                      {resolved.cruiseFlightLevel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Column 3: Technical Airframe Specs, Payload, Fuel & Telemetry */}
              <div className="lg:col-span-4 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] p-2.5 shadow-[var(--atc-shadow)] flex flex-col justify-between gap-1.5 text-[10px] font-mono">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--atc-border)] pb-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--atc-muted)]">
                    {resolved.spec.manufacturer} Airframe Specs
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] text-[var(--atc-text-secondary)]">
                    CTL: {selectedAc.controller}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <div className="flex justify-between gap-1">
                    <span className="text-[var(--atc-muted)]">Engines</span>
                    <span className="font-semibold text-[var(--atc-text)] truncate">
                      {resolved.spec.engines}
                    </span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-[var(--atc-muted)]">MTOW</span>
                    <span className="font-semibold text-[var(--atc-text)]">
                      {resolved.spec.mtow}
                    </span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-[var(--atc-muted)]">Wingspan</span>
                    <span className="font-semibold text-[var(--atc-text)]">
                      {resolved.spec.wingspan}
                    </span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-[var(--atc-muted)]">Length</span>
                    <span className="font-semibold text-[var(--atc-text)]">
                      {resolved.spec.length}
                    </span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-[var(--atc-muted)]">Range</span>
                    <span className="font-semibold text-[var(--atc-text)]">
                      {resolved.spec.rangeNm}
                    </span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-[var(--atc-muted)]">Ceiling</span>
                    <span className="font-semibold text-[var(--atc-text)]">
                      {resolved.spec.ceiling}
                    </span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-[var(--atc-muted)]">Max Cruise</span>
                    <span className="font-semibold text-[var(--atc-text)]">
                      {resolved.spec.cruiseSpeed}
                    </span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-[var(--atc-muted)]">Capacity</span>
                    <span className="font-semibold text-[var(--atc-text)] truncate">
                      {resolved.spec.capacityPax}
                    </span>
                  </div>
                </div>

                <div className="pt-1.5 border-t border-[var(--atc-border)] flex flex-wrap items-center justify-between gap-2 text-[10px]">
                  <span className="inline-flex items-center gap-1 text-[var(--atc-text-secondary)]">
                    <Users className="w-3 h-3 text-[var(--atc-cyan)]" />
                    <span className="font-semibold">{resolved.soulsOnBoard}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-[var(--atc-text-secondary)]">
                    <Fuel className="w-3 h-3 text-[var(--atc-amber)]" />
                    <span className="font-semibold">{resolved.fuelRemainingPct}%</span>
                    <span className="w-8 h-1.5 rounded-full bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] overflow-hidden inline-block">
                      <span
                        className="block h-full bg-[var(--atc-amber)]"
                        style={{ width: `${Math.max(5, Math.min(100, resolved.fuelRemainingPct))}%` }}
                      />
                    </span>
                  </span>
                  <span
                    className="inline-flex items-center gap-1 text-[var(--atc-text-secondary)]"
                    title={formatAltitudeReadout(selectedAc, sim.airport.elevationFt).detailed}
                  >
                    <Gauge className="w-3 h-3 text-[var(--atc-emerald)]" />
                    <span className="font-semibold">
                      {formatAltitudeReadout(selectedAc, sim.airport.elevationFt).compact} •{" "}
                      {Math.round(selectedAc.speed)}kt •{" "}
                      {String(Math.round(selectedAc.heading)).padStart(3, "0")}° •{" "}
                      {Math.round(selectedAc.verticalSpeed) === 0
                        ? "LVL"
                        : `${selectedAc.verticalSpeed > 0 ? "+" : ""}${Math.round(selectedAc.verticalSpeed)}fpm`}{" "}
                      •{" "}
                      {(() => {
                        const p = computeAircraftPitchDeg(selectedAc, sim.airport.elevationFt);
                        return `${p > 0 ? `+${p}` : p}°`;
                      })()}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB BODY 3: MULTIPLAYER HANDOFFS & CONTROLLER CHAT */}
      {!collapsed && activeTab === "COORD" && roomState && (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 px-3 py-2 bg-[var(--atc-panel)] min-h-0 overflow-hidden font-mono text-[11px]">
          <div className="flex flex-col min-h-0 border border-[var(--atc-border)] rounded-lg bg-[var(--atc-surface)] p-2">
            <div className="text-[10px] font-bold uppercase text-[var(--atc-muted)] mb-1">
              Controller Handoff Queue ({roomState.handoffs.length})
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {roomState.handoffs.length === 0 ? (
                <div className="text-[var(--atc-muted)] text-[10px] py-2">
                  No active controller handoffs. Use HANDOFF buttons in the Control Deck.
                </div>
              ) : (
                [...roomState.handoffs].reverse().map((h) => (
                  <div
                    key={h.id}
                    className="px-2 py-1 rounded border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] flex items-center justify-between gap-2"
                  >
                    <div className="truncate">
                      <span className="font-bold">{h.callsign}</span> {h.fromController} → {h.toController}{" "}
                      <span
                        className={`text-[9px] px-1 rounded ${
                          h.status === "ACCEPTED"
                            ? "text-[var(--atc-emerald)]"
                            : h.status === "REJECTED"
                            ? "text-[var(--atc-red)]"
                            : "text-[var(--atc-amber)]"
                        }`}
                      >
                        [{h.status}]
                      </span>
                    </div>
                    {h.status === "PENDING" && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => respondToHandoff(h.id, true)}
                          className="px-2 py-0.5 rounded bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] border border-[var(--atc-emerald-border)] text-[10px] font-bold"
                          title="Accept Handoff"
                        >
                          ACCEPT
                        </button>
                        <button
                          onClick={() => respondToHandoff(h.id, false)}
                          className="px-2 py-0.5 rounded bg-[var(--atc-red-bg)] text-[var(--atc-red)] border border-[var(--atc-red-border)] text-[10px] font-bold"
                          title="Reject Handoff"
                        >
                          REJECT
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col min-h-0 border border-[var(--atc-border)] rounded-lg bg-[var(--atc-surface)] p-2">
            <div className="text-[10px] font-bold uppercase text-[var(--atc-muted)] mb-1">
              Sector Coordination Chat ({roomState.roomCode})
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {roomState.chat.slice(-20).map((m) => (
                <div key={m.id} className="text-[10px] leading-tight">
                  <span className="font-bold text-[var(--atc-cyan)]">[{m.senderRole} · {m.senderName}]: </span>
                  <span>{m.text}</span>
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!chatText.trim()) return;
                sendMultiplayerChat(chatText);
                setChatText("");
              }}
              className="mt-1.5 flex gap-1"
            >
              <input
                type="text"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="Coord message..."
                className="flex-1 px-2 py-1 text-[11px] rounded border border-[var(--atc-border)] bg-[var(--atc-panel)]"
              />
              <button
                type="submit"
                className="px-2 py-1 rounded bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)] border border-[var(--atc-cyan-border)]"
              >
                <Send className="w-3 h-3" />
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
