import React, { useState } from "react";
import {
  Bot,
  Flag,
  Globe2,
  Lock,
  Moon,
  Pause,
  Play,
  Radio,
  Settings2,
  ShieldCheck,
  Sun,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useAtcStore } from "../store/atcStore.ts";
import type { ControllerRole, PlayerRoleMode, ScenarioId } from "../types/atc.ts";
import { Accordion } from "./Accordion.tsx";
import { RadioVoiceMenu } from "./RadioVoiceMenu.tsx";

const STATIONS: Array<{
  role: PlayerRoleMode;
  code: string;
  label: string;
  freq: string;
}> = [
  { role: "GROUND", code: "G", label: "GROUND", freq: "121.90" },
  { role: "TOWER", code: "T", label: "TOWER", freq: "118.70" },
  { role: "DEPARTURE", code: "D", label: "DEP/APP", freq: "124.35" },
  { role: "ALL", code: "N", label: "ALL AUTO", freq: "ALL" },
];

const SCENARIOS: Array<{ id: ScenarioId; label: string }> = [
  { id: "NORMAL_OPS", label: "Normal Operations" },
  { id: "LIGHT", label: "Light Traffic" },
  { id: "MEDIUM", label: "Medium Traffic" },
  { id: "HEAVY", label: "Heavy Traffic" },
  { id: "RUSH_HOUR", label: "Peak Rush Hour" },
  { id: "ARRIVAL_HEAVY", label: "Arrival Heavy" },
  { id: "DEPARTURE_HEAVY", label: "Departure Heavy" },
  { id: "MIXED", label: "Mixed Ops" },
  { id: "EMERGENCY", label: "Emergency Ops" },
  { id: "CROSSINGS_AND_READBACK", label: "Crossings & Readback Errors" },
  { id: "EMERGENCY_AND_NORDO", label: "Emergency & NORDO 7600" },
  { id: "SANDBOX", label: "Clean Sandbox" },
];

function formatSimClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `T+${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export const TopBar: React.FC = () => {
  const sim = useAtcStore((s) => s.sim);
  useAtcStore((s) => s.tickVersion);
  const sfxEnabled = useAtcStore((s) => s.sfxEnabled);
  const theme = useAtcStore((s) => s.theme);
  const roomState = useAtcStore((s) => s.roomState);
  const assignedRole = useAtcStore((s) => s.assignedRole);
  const isOnline = useAtcStore((s) => s.isOnline);
  const setAppMode = useAtcStore((s) => s.setAppMode);
  const endMultiplayerSession = useAtcStore((s) => s.endMultiplayerSession);

  const switchStation = useAtcStore((s) => s.switchStation);
  const toggleAutoAssist = useAtcStore((s) => s.toggleAutoAssist);
  const loadScenario = useAtcStore((s) => s.loadScenario);
  const togglePause = useAtcStore((s) => s.togglePause);
  const setTimeScale = useAtcStore((s) => s.setTimeScale);
  const setShowVerificationModal = useAtcStore((s) => s.setShowVerificationModal);
  const openAirportSelector = useAtcStore((s) => s.openAirportSelector);
  const toggleSfx = useAtcStore((s) => s.toggleSfx);
  const toggleTheme = useAtcStore((s) => s.toggleTheme);

  const isMpActive = Boolean(roomState && roomState.status === "ACTIVE");

  const [settingsOpen, setSettingsOpen] = useState(false);

  const pendingCounts: Record<ControllerRole, number> = {
    GROUND: 0,
    TOWER: 0,
    DEPARTURE: 0,
  };

  for (const id of sim.aircraftOrder) {
    const ac = sim.aircraft[id];
    if (!ac) continue;
    if (ac.state === "COMPLETED_ARRIVAL" || ac.state === "COMPLETED_DEPARTURE") continue;
    if ((ac.pendingRequest && !ac.pendingRequest.resolved) || ac.hasReadbackError) {
      pendingCounts[ac.controller] += 1;
    }
  }

  return (
    <header className="min-h-[52px] bg-[var(--atc-panel)] border-b border-[var(--atc-border)] px-3 py-1.5 flex items-center justify-between gap-3 shrink-0 transition-colors">
      {/* Left: Brand & Switch Airport */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--atc-accent-bg)] border border-[var(--atc-accent-border)] flex items-center justify-center text-[var(--atc-accent-text)] shrink-0">
            <Radio className="w-4 h-4" />
          </div>
          <div className="leading-tight whitespace-nowrap">
            <div className="text-xs font-extrabold tracking-wider text-[var(--atc-text)] uppercase">
              AirCommand
            </div>
            <div className="text-[10px] font-mono text-[var(--atc-muted)] flex items-center gap-1.5">
              <span>
                {sim.airport.icao} • {sim.airport.controllerPrefix} • {sim.airport.runwayIds.join("/")}
              </span>
              {sim.liveSnapshotMeta && (
                <span
                  title={`Imported ${sim.liveSnapshotMeta.convertedCount} real ADS-B flights (${sim.liveSnapshotMeta.source})`}
                  className="px-1.5 py-0.2 rounded bg-[var(--atc-emerald-bg)] border border-[var(--atc-emerald-border)] text-[var(--atc-emerald)] text-[9px] font-bold"
                >
                  LIVE SEEDED ({sim.liveSnapshotMeta.convertedCount})
                </span>
              )}
            </div>
          </div>
          <button
            onClick={openAirportSelector}
            title="Open Global Airport Map & Discovery"
            className="px-2 py-1 rounded-md border border-[var(--atc-border)] hover:border-[var(--atc-border-strong)] bg-[var(--atc-surface)] text-[10px] font-mono text-[var(--atc-text-secondary)] hover:text-[var(--atc-text)] flex items-center gap-1 whitespace-nowrap shadow-sm transition-colors"
          >
            <Globe2 className="w-3 h-3 text-[var(--atc-cyan)]" />
            <span className="hidden 2xl:inline">GLOBAL MAP</span>
          </button>

          {roomState && (
            <button
              onClick={() => setAppMode("MULTIPLAYER_LOBBY")}
              title="Open Multiplayer Lobby & Room Status"
              className="px-2 py-1 rounded-md border border-[var(--atc-cyan-border)] bg-[var(--atc-cyan-bg)] text-[10px] font-mono font-bold text-[var(--atc-cyan)] flex items-center gap-1 whitespace-nowrap"
            >
              <Users className="w-3 h-3" />
              <span>{roomState.roomCode}</span>
              {assignedRole && <span>· {assignedRole}</span>}
            </button>
          )}
        </div>

        {/* Minimal Segmented Role Switcher: G | T | D | ALL AUTO */}
        <div className="flex items-center bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] rounded-lg p-0.5 gap-0.5">
          {STATIONS.map((st) => {
            const active = sim.config.activePlayerStation === st.role;
            const isAll = st.role === "ALL";
            const mpLocked = isMpActive && assignedRole !== null && st.role !== assignedRole;
            const count = isAll
              ? pendingCounts.GROUND + pendingCounts.TOWER + pendingCounts.DEPARTURE
              : pendingCounts[st.role as ControllerRole];
            return (
              <button
                key={st.role}
                disabled={mpLocked}
                onClick={() => switchStation(st.role)}
                title={
                  mpLocked
                    ? `Multiplayer role locked to ${assignedRole}`
                    : isAll
                    ? "ALL AUTO: All 3 stations automated & hear all frequencies [Key: N / A / 4]"
                    : `Switch role to ${st.label} (${st.freq}) — hear only ${st.label}; other roles auto-managed [Key: ${st.code}]`
                }
                className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all flex items-center gap-1.5 whitespace-nowrap disabled:opacity-35 disabled:cursor-not-allowed ${
                  active
                    ? "bg-[var(--atc-surface)] text-[var(--atc-text)] border border-[var(--atc-accent-border)] shadow-sm font-bold"
                    : "text-[var(--atc-muted)] hover:text-[var(--atc-text)] border border-transparent"
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold ${
                    active
                      ? "bg-[var(--atc-accent)] text-slate-950"
                      : "bg-[var(--atc-border)] text-[var(--atc-text-secondary)]"
                  }`}
                >
                  {st.code}
                </span>
                <span className="hidden xl:inline">{st.label}</span>
                {count > 0 && (
                  <span className="px-1 min-w-[16px] text-center rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Center: Clean Sim Clock & Speed */}
      <div className="flex items-center gap-2">
        <div className="px-2.5 py-1 rounded-md bg-[var(--atc-surface)] border border-[var(--atc-border)] font-mono text-xs font-bold text-[var(--atc-text)] shadow-sm">
          {formatSimClock(sim.time)}
        </div>

        <div className="flex items-center bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] rounded-md p-0.5">
          {([1, 2, 4] as const).map((spd) => (
            <button
              key={spd}
              onClick={() => setTimeScale(spd)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                sim.timeScale === spd
                  ? "bg-[var(--atc-surface)] text-[var(--atc-text)] font-bold shadow-sm border border-[var(--atc-border)]"
                  : "text-[var(--atc-muted)] hover:text-[var(--atc-text)]"
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>

      {/* Right: Metrics, Theme Toggle, Voice, Operations Settings Popover, Pause/Live */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--atc-surface)] border border-[var(--atc-border)] text-[11px] font-mono shadow-sm">
          <span className="text-[var(--atc-emerald)] font-semibold" title="Departures Completed">
            DEP {sim.metrics.departuresCompleted}
          </span>
          <span className="text-[var(--atc-border-strong)]">|</span>
          <span className="text-[var(--atc-cyan)] font-semibold" title="Arrivals Completed">
            ARR {sim.metrics.arrivalsCompleted}
          </span>
          <span className="text-[var(--atc-border-strong)]">|</span>
          <span
            className={`font-bold ${
              sim.metrics.safetyScore >= 90 ? "text-[var(--atc-emerald)]" : "text-[var(--atc-amber)]"
            }`}
            title="Safety Compliance Score"
          >
            SAFE {sim.metrics.safetyScore}%
          </span>
        </div>

        {/* Light / Dark Theme Toggle */}
        <button
          onClick={toggleTheme}
          title={theme === "light" ? "Switch to Dark Radar Theme" : "Switch to Light Chart Theme"}
          aria-label="Toggle Light/Dark Theme"
          className="px-2 py-1.5 rounded-md border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:border-[var(--atc-border-strong)] text-[var(--atc-text)] flex items-center gap-1.5 text-[11px] font-mono shadow-sm transition-colors"
        >
          {theme === "light" ? (
            <Moon className="w-3.5 h-3.5 text-indigo-600" />
          ) : (
            <Sun className="w-3.5 h-3.5 text-amber-400" />
          )}
          <span className="hidden lg:inline">{theme === "light" ? "LIGHT" : "DARK"}</span>
        </button>

        <RadioVoiceMenu />

        {/* Workstation Settings Popover (Scenario, AI Auto-Assist, SFX, Verify) */}
        <div className="relative">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            title="Scenario, Automation & Verification Options"
            className={`p-1.5 rounded-md border shadow-sm transition-colors ${
              settingsOpen
                ? "bg-[var(--atc-accent-bg)] border-[var(--atc-accent-border)] text-[var(--atc-accent-text)]"
                : "bg-[var(--atc-surface)] border-[var(--atc-border)] text-[var(--atc-text-secondary)] hover:text-[var(--atc-text)]"
            }`}
          >
            <Settings2 className="w-4 h-4" />
          </button>

          {settingsOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 z-50 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-surface)] shadow-2xl p-3 space-y-2.5 text-xs font-mono">
              <div className="flex items-center justify-between border-b border-[var(--atc-border)] pb-2">
                <span className="font-bold text-[var(--atc-text)]">WORKSTATION SETTINGS</span>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="text-[10px] text-[var(--atc-muted)] hover:text-[var(--atc-text)]"
                >
                  CLOSE
                </button>
              </div>

              <Accordion title="Traffic Scenario" defaultOpen={true}>
                <select
                  value={sim.scenarioId}
                  onChange={(e) => loadScenario(e.target.value as ScenarioId)}
                  className="w-full bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] rounded px-2 py-1.5 text-xs text-[var(--atc-text)] focus:outline-none"
                >
                  {SCENARIOS.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.label}
                    </option>
                  ))}
                </select>
              </Accordion>

              <Accordion title="Automation & Audio" defaultOpen={true} bodyClassName="space-y-1.5">
                <button
                  onClick={toggleAutoAssist}
                  disabled={sim.config.activePlayerStation === "ALL"}
                  className={`w-full px-2.5 py-1.5 rounded border text-[11px] flex items-center justify-between disabled:opacity-50 ${
                    sim.config.activePlayerStation === "ALL" || sim.config.autoManageOtherStations
                      ? "bg-[var(--atc-emerald-bg)] border-[var(--atc-emerald-border)] text-[var(--atc-emerald)]"
                      : "bg-[var(--atc-surface-alt)] border-[var(--atc-border)] text-[var(--atc-muted)]"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Bot className="w-3.5 h-3.5" />
                    AI Other Roles
                  </span>
                  <span className="font-bold">
                    {sim.config.activePlayerStation === "ALL"
                      ? "ALL AUTO"
                      : sim.config.autoManageOtherStations
                      ? "ON"
                      : "MANUAL"}
                  </span>
                </button>

                <button
                  onClick={toggleSfx}
                  className="w-full px-2.5 py-1.5 rounded border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] text-[var(--atc-text)] text-[11px] flex items-center justify-between"
                >
                  <span className="flex items-center gap-1.5 font-semibold">
                    {sfxEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                    Radio Squelch SFX
                  </span>
                  <span className="font-bold">{sfxEnabled ? "ON" : "OFF"}</span>
                </button>
              </Accordion>

              <button
                onClick={() => {
                  setSettingsOpen(false);
                  setShowVerificationModal(true);
                }}
                className="w-full py-2 px-3 rounded-md bg-[var(--atc-emerald-bg)] hover:opacity-90 border border-[var(--atc-emerald-border)] text-[var(--atc-emerald)] text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                OPEN RULE VERIFIER
              </button>
            </div>
          )}
        </div>

        {/* Verify Quick Button (compact) */}
        {!isMpActive ? (
          <>
            <button
              onClick={() => setAppMode("LIVE_OBSERVATION")}
              disabled={!isOnline}
              title="Open Read-Only Live ADS-B Radar"
              className="hidden md:flex px-2 py-1.5 rounded-md border border-[var(--atc-border)] bg-[var(--atc-surface)] text-[var(--atc-cyan)] text-xs font-mono font-semibold items-center gap-1 whitespace-nowrap disabled:opacity-40"
            >
              <Radio className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden 2xl:inline">LIVE ADS-B</span>
            </button>
            <button
              onClick={() => setShowVerificationModal(true)}
              title="Run Mandatory ATC Rules Verification Suite"
              className="px-2 py-1.5 rounded-md bg-[var(--atc-emerald-bg)] hover:opacity-90 border border-[var(--atc-emerald-border)] text-[var(--atc-emerald)] text-xs font-mono font-semibold flex items-center gap-1 whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden 2xl:inline">VERIFY</span>
            </button>
          </>
        ) : (
          <button
            onClick={endMultiplayerSession}
            title="Finish Multiplayer Session & Generate Performance Report"
            className="px-2.5 py-1.5 rounded-md bg-[var(--atc-red-bg)] border border-[var(--atc-red-border)] text-[var(--atc-red)] text-xs font-mono font-bold flex items-center gap-1 whitespace-nowrap"
          >
            <Flag className="w-3.5 h-3.5 shrink-0" />
            <span>END SHIFT</span>
          </button>
        )}

        {/* Primary Play / Pause Control */}
        <button
          disabled={isMpActive}
          onClick={togglePause}
          title={isMpActive ? "Multiplayer clock synchronized by server" : "Play / Pause [Space]"}
          className={`px-3 py-1.5 rounded-md border text-xs font-mono font-bold flex items-center gap-1.5 transition-colors disabled:opacity-60 ${
            sim.paused
              ? "bg-[var(--atc-surface-alt)] border-[var(--atc-border-strong)] text-[var(--atc-text)]"
              : "bg-[var(--atc-accent)] border-[var(--atc-accent-border)] text-slate-950 shadow-sm"
          }`}
        >
          {isMpActive ? <Lock className="w-3.5 h-3.5" /> : sim.paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isMpActive ? "SYNCED" : sim.paused ? "PAUSED" : "LIVE"}</span>
        </button>
      </div>
    </header>
  );
};
