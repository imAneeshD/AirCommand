import React, { useEffect, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  Flag,
  Globe2,
  Home,
  Lock,
  Moon,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sun,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useAtcStore } from "../store/atcStore.ts";
import type { ControllerRole, PlayerRoleMode, ScenarioId } from "../types/atc.ts";
import { LocalClockBadge } from "./LocalClockBadge.tsx";
import { RadioVoiceMenu } from "./RadioVoiceMenu.tsx";
import { VoicePttButton } from "./VoicePttButton.tsx";

const STATIONS: Array<{
  role: PlayerRoleMode;
  code: string;
  label: string;
  freq: string;
}> = [
  { role: "DELIVERY", code: "CD", label: "DEL", freq: "121.75" },
  { role: "GROUND", code: "G", label: "GND", freq: "121.90" },
  { role: "TOWER", code: "T", label: "TWR", freq: "119.10" },
  { role: "DEPARTURE", code: "D", label: "DEP", freq: "124.70" },
  { role: "CENTER", code: "C", label: "CTR", freq: "127.50" },
  { role: "ALL", code: "ALL", label: "AUTO", freq: "ALL" },
];

const SCENARIOS: Array<{ id: ScenarioId; label: string }> = [
  { id: "LOW_TRAFFIC", label: "Low Traffic (Very Few Planes)" },
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

export const TopBar: React.FC = () => {
  const sim = useAtcStore((s) => s.sim);
  useAtcStore((s) => s.tickVersion);
  const sfxEnabled = useAtcStore((s) => s.sfxEnabled);
  const voiceEnabled = useAtcStore((s) => s.voiceEnabled);
  const theme = useAtcStore((s) => s.theme);
  const playerId = useAtcStore((s) => s.playerId);
  const roomState = useAtcStore((s) => s.roomState);
  const assignedRole = useAtcStore((s) => s.assignedRole);
  const isOnline = useAtcStore((s) => s.isOnline);
  const setAppMode = useAtcStore((s) => s.setAppMode);
  const endMultiplayerSession = useAtcStore((s) => s.endMultiplayerSession);
  const leaveMultiplayerRoom = useAtcStore((s) => s.leaveMultiplayerRoom);
  const claimMultiplayerRole = useAtcStore((s) => s.claimMultiplayerRole);

  const switchStation = useAtcStore((s) => s.switchStation);
  const toggleAutoAssist = useAtcStore((s) => s.toggleAutoAssist);
  const loadScenario = useAtcStore((s) => s.loadScenario);
  const togglePause = useAtcStore((s) => s.togglePause);
  const setTimeScale = useAtcStore((s) => s.setTimeScale);
  const setShowVerificationModal = useAtcStore((s) => s.setShowVerificationModal);
  const openAirportSelector = useAtcStore((s) => s.openAirportSelector);
  const toggleSfx = useAtcStore((s) => s.toggleSfx);
  const toggleVoice = useAtcStore((s) => s.toggleVoice);
  const toggleTheme = useAtcStore((s) => s.toggleTheme);
  const minimizedPanels = useAtcStore((s) => s.minimizedPanels);
  const togglePanelMinimized = useAtcStore((s) => s.togglePanelMinimized);
  const liveTrafficLoading = useAtcStore((s) => s.liveTrafficLoading);
  const toggleLiveTraffic = useAtcStore((s) => s.toggleLiveTraffic);

  const isLiveActive = Boolean(sim.liveSnapshotMeta?.liveSyncEnabled);
  const liveAircraftCount = sim.aircraftOrder.filter((id) => Boolean(sim.aircraft[id])).length;

  const isMpActive = Boolean(roomState && roomState.status === "ACTIVE");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileStationOpen, setMobileStationOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  // Close tools popover when clicking outside
  useEffect(() => {
    if (!settingsOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [settingsOpen]);

  const pendingCounts: Record<ControllerRole, number> = {
    DELIVERY: 0,
    GROUND: 0,
    TOWER: 0,
    DEPARTURE: 0,
    CENTER: 0,
  };

  for (const id of sim.aircraftOrder) {
    const ac = sim.aircraft[id];
    if (!ac) continue;
    if (ac.state === "COMPLETED_ARRIVAL" || ac.state === "COMPLETED_DEPARTURE") continue;
    if ((ac.pendingRequest && !ac.pendingRequest.resolved) || ac.hasReadbackError) {
      pendingCounts[ac.controller] += 1;
    }
  }

  const currentStation =
    STATIONS.find((s) => s.role === sim.config.activePlayerStation) ?? STATIONS[5];
  const currentStationPending =
    sim.config.activePlayerStation === "ALL"
      ? Object.values(pendingCounts).reduce((a, b) => a + b, 0)
      : pendingCounts[sim.config.activePlayerStation as ControllerRole] ?? 0;

  return (
    <>
      {/* DESKTOP HEADER (hidden on mobile, lg:flex) */}
      <header className="hidden lg:flex min-h-[50px] bg-[var(--atc-panel)] border-b border-[var(--atc-border)] px-3 py-1.5 items-center justify-between gap-3 shrink-0 select-none transition-colors">
      {/* LEFT SECTION: Operational Identity & Station Switcher */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Return to Landing Page */}
        <button
          onClick={() => setAppMode("LANDING")}
          title="Return to Landing Page & Airport Catalog"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:bg-[var(--atc-surface-alt)] hover:border-[var(--atc-accent-border)] transition-all shadow-sm group cursor-pointer text-xs font-mono font-bold text-[var(--atc-text)]"
        >
          <Home className="w-3.5 h-3.5 text-[var(--atc-accent)]" />
          <span className="hidden xl:inline text-[11px] font-mono tracking-wider">HOME</span>
        </button>

        {/* Unified Airport Badge + Quick Switcher */}
        <button
          onClick={openAirportSelector}
          title="Click to Switch Airport (Global Airport Map)"
          className="flex items-center gap-2 px-2.5 py-1 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:bg-[var(--atc-surface-alt)] hover:border-[var(--atc-border-strong)] transition-all shadow-sm group cursor-pointer"
        >
          <div className="w-6 h-6 rounded bg-[var(--atc-accent-bg)] border border-[var(--atc-accent-border)] flex items-center justify-center text-[var(--atc-accent-text)] shrink-0">
            <Radio className="w-3.5 h-3.5" />
          </div>
          <div className="text-left leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black tracking-wider text-[var(--atc-text)] uppercase">
                AIRCOMMAND
              </span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--atc-surface-alt)] text-[var(--atc-cyan)] border border-[var(--atc-border)]">
                {sim.airport.icao}
              </span>
              {sim.liveSnapshotMeta && (
                <span
                  title={`Live ADS-B Traffic Active (${sim.liveSnapshotMeta.activeLiveCount ?? sim.liveSnapshotMeta.convertedCount} real aircraft)`}
                  className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"
                />
              )}
              <ChevronDown className="w-3 h-3 text-[var(--atc-muted)] group-hover:text-[var(--atc-text)] transition-colors" />
            </div>
          </div>
        </button>

        {/* Station Role Segmented Switcher */}
        <div className="flex items-center bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] rounded-lg p-0.5 gap-0.5 shadow-sm">
          {STATIONS.map((st) => {
            const active = sim.config.activePlayerStation === st.role;
            const isAll = st.role === "ALL";
            const isOtherHuman =
              isMpActive &&
              !isAll &&
              Boolean(
                roomState?.slots[st.role as ControllerRole]?.playerId &&
                roomState?.slots[st.role as ControllerRole]?.playerId !== playerId &&
                roomState?.slots[st.role as ControllerRole]?.connected &&
                !roomState?.slots[st.role as ControllerRole]?.aiTakeover
              );
            const mpLocked = isMpActive && (isAll || isOtherHuman);
            const count = isAll
              ? Object.values(pendingCounts).reduce((a, b) => a + b, 0)
              : pendingCounts[st.role as ControllerRole];
            return (
              <button
                key={st.role}
                disabled={mpLocked}
                onClick={() => {
                  if (isMpActive && !isAll) {
                    claimMultiplayerRole(st.role as ControllerRole);
                  } else {
                    switchStation(st.role);
                  }
                }}
                title={
                  mpLocked
                    ? isAll
                      ? "Multiplayer mode: select an operational station"
                      : `Staffed by ${roomState?.slots[st.role as ControllerRole]?.playerName ?? "another controller"}`
                    : isMpActive
                    ? active
                      ? `Your active station: ${st.label}`
                      : `Take over ${st.label} (currently automated AI backup)`
                    : isAll
                    ? "ALL AUTO: All stations automated & hear all frequencies [Key: N / A / 4]"
                    : `Switch role to ${st.label} (${st.freq} MHz) — hear only ${st.label}; other roles auto-managed [Key: ${st.code}]`
                }
                className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                  active
                    ? "bg-[var(--atc-surface)] text-[var(--atc-text)] border border-[var(--atc-accent-border)] shadow-sm font-extrabold"
                    : "text-[var(--atc-muted)] hover:text-[var(--atc-text)] border border-transparent font-medium"
                }`}
              >
                <span>{st.label}</span>
                {count > 0 && (
                  <span className="px-1 min-w-[15px] text-center rounded-full bg-amber-500 text-slate-950 text-[9px] font-bold leading-tight">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Multiplayer Active Session Pill (if in room) */}
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

      {/* CENTER SECTION: Simulation State & Clock Cluster */}
      <div className="flex items-center gap-2 shrink-0">
        <LocalClockBadge simTimeSec={sim.time} compact={true} />

        {/* Primary Play / Pause Control */}
        <button
          disabled={isMpActive}
          onClick={togglePause}
          title={isMpActive ? "Multiplayer clock synchronized by server" : "Play / Pause [Space]"}
          className={`px-3 py-1 rounded-md border text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-60 ${
            sim.paused
              ? "bg-[var(--atc-surface-alt)] border-[var(--atc-border-strong)] text-[var(--atc-text)] hover:bg-[var(--atc-surface)]"
              : "bg-[var(--atc-accent)] border-[var(--atc-accent-border)] text-slate-950 hover:opacity-90"
          }`}
        >
          {isMpActive ? (
            <Lock className="w-3.5 h-3.5" />
          ) : sim.paused ? (
            <Play className="w-3.5 h-3.5" />
          ) : (
            <Pause className="w-3.5 h-3.5" />
          )}
          <span>{isMpActive ? "SYNCED" : sim.paused ? "PAUSED" : "RUNNING"}</span>
        </button>

        {/* Simulation Speed Pill: 1x | 2x | 4x */}
        <div className="flex items-center bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] rounded-md p-0.5 shadow-sm">
          {([1, 2, 4] as const).map((spd) => (
            <button
              key={spd}
              onClick={() => setTimeScale(spd)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                sim.timeScale === spd
                  ? "bg-[var(--atc-surface)] text-[var(--atc-text)] font-bold shadow-sm border border-[var(--atc-border)]"
                  : "text-[var(--atc-muted)] hover:text-[var(--atc-text)]"
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>

        {/* Live Traffic Option & Sync Control */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => void toggleLiveTraffic()}
            disabled={liveTrafficLoading}
            title={
              isLiveActive
                ? `Live ADS-B Traffic is ON (${liveAircraftCount} active flights). Click to turn OFF and switch back to simulated planes.`
                : "Live Traffic is OFF. Click to turn ON and populate real flights directly from live APIs."
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-bold border transition-all cursor-pointer shadow-sm disabled:opacity-60 ${
              isLiveActive
                ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/25 shadow-emerald-500/10"
                : "bg-[var(--atc-surface-alt)] border-[var(--atc-border)] text-[var(--atc-muted)] hover:text-[var(--atc-text)] hover:border-[var(--atc-border-strong)]"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full transition-all ${
                isLiveActive ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" : "bg-slate-500"
              }`}
            />
            {liveTrafficLoading ? (
              <span className="flex items-center gap-1 text-amber-400">
                <span className="w-2.5 h-2.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <span>SYNCING...</span>
              </span>
            ) : (
              <span className="tracking-wide">
                {isLiveActive ? `LIVE TRAFFIC (${liveAircraftCount})` : "LIVE TRAFFIC: OFF"}
              </span>
            )}
          </button>

          {/* Sync icon next to live traffic button */}
          <button
            onClick={() => void toggleLiveTraffic(true)}
            disabled={liveTrafficLoading}
            title={
              isLiveActive
                ? "Re-sync live ADS-B traffic feed from live APIs"
                : "Sync and enable live traffic directly from live APIs"
            }
            className={`p-1.5 rounded-md border text-xs transition-all cursor-pointer shadow-sm disabled:opacity-50 ${
              liveTrafficLoading
                ? "border-amber-400/60 text-amber-400 bg-amber-500/10"
                : isLiveActive
                ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 hover:border-emerald-500/60"
                : "border-[var(--atc-border)] bg-[var(--atc-surface-alt)] text-[var(--atc-muted)] hover:text-[var(--atc-text)] hover:border-[var(--atc-border-strong)]"
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${liveTrafficLoading ? "animate-spin text-amber-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* RIGHT SECTION: Communications, Layout & Consolidated Tools */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Voice Communications (PTT + Voice output settings) */}
        <div className="flex items-center gap-1 bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] rounded-lg p-0.5 shadow-sm">
          <VoicePttButton />
          <RadioVoiceMenu />
        </div>

        {/* Panel Layout Drawer Toggles (Left / Bottom / Right) */}
        <div
          className="flex items-center bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] rounded-md p-0.5 gap-0.5 shadow-sm"
          title="Toggle workspace side and bottom panels"
        >
          <button
            type="button"
            onClick={() => togglePanelMinimized("left")}
            aria-label={minimizedPanels.left ? "Show Flight Strips panel" : "Minimize Flight Strips panel"}
            title={minimizedPanels.left ? "Show Flight Strips panel" : "Minimize Flight Strips panel"}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              !minimizedPanels.left
                ? "bg-[var(--atc-surface)] text-[var(--atc-text)] shadow-sm border border-[var(--atc-border)]"
                : "text-[var(--atc-muted)] hover:text-[var(--atc-text)] border border-transparent"
            }`}
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => togglePanelMinimized("bottom")}
            aria-label={minimizedPanels.bottom ? "Show Radio Log panel" : "Minimize Radio Log panel"}
            title={minimizedPanels.bottom ? "Show Radio Log panel" : "Minimize Radio Log panel"}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              !minimizedPanels.bottom
                ? "bg-[var(--atc-surface)] text-[var(--atc-text)] shadow-sm border border-[var(--atc-border)]"
                : "text-[var(--atc-muted)] hover:text-[var(--atc-text)] border border-transparent"
            }`}
          >
            <PanelBottom className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => togglePanelMinimized("right")}
            aria-label={minimizedPanels.right ? "Show Flight Deck panel" : "Minimize Flight Deck panel"}
            title={minimizedPanels.right ? "Show Flight Deck panel" : "Minimize Flight Deck panel"}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              !minimizedPanels.right
                ? "bg-[var(--atc-surface)] text-[var(--atc-text)] shadow-sm border border-[var(--atc-border)]"
                : "text-[var(--atc-muted)] hover:text-[var(--atc-text)] border border-transparent"
            }`}
          >
            <PanelRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Theme Toggle (Sun / Moon) */}
        <button
          onClick={toggleTheme}
          title={theme === "light" ? "Switch to Dark Radar Theme" : "Switch to Light Chart Theme"}
          aria-label="Toggle Light/Dark Theme"
          className="p-1.5 rounded-md border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:border-[var(--atc-border-strong)] text-[var(--atc-text)] shadow-sm transition-colors cursor-pointer"
        >
          {theme === "light" ? (
            <Moon className="w-3.5 h-3.5 text-indigo-600" />
          ) : (
            <Sun className="w-3.5 h-3.5 text-amber-400" />
          )}
        </button>

        {/* Consolidated Tools & Settings Popover */}
        <div ref={settingsRef} className="relative">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            title="Workstation Tools, Scenarios & Simulation Settings"
            className={`px-2.5 py-1.5 rounded-md border text-xs font-mono font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer ${
              settingsOpen
                ? "bg-[var(--atc-accent-bg)] border-[var(--atc-accent-border)] text-[var(--atc-accent-text)]"
                : "bg-[var(--atc-surface)] border-[var(--atc-border)] text-[var(--atc-text-secondary)] hover:text-[var(--atc-text)] hover:border-[var(--atc-border-strong)]"
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">TOOLS</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {settingsOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 z-50 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-surface)] shadow-2xl p-3.5 space-y-3 text-xs font-mono animate-in fade-in zoom-in-95 duration-100">
              {/* Popover Header with Shift Metrics */}
              <div className="flex items-center justify-between border-b border-[var(--atc-border)] pb-2.5">
                <div>
                  <div className="font-extrabold text-[var(--atc-text)] tracking-wider">WORKSTATION TOOLS</div>
                  <div className="text-[10px] text-[var(--atc-muted)]">Operations, Modes &amp; Setup</div>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] bg-[var(--atc-surface-alt)] px-2 py-0.5 rounded border border-[var(--atc-border)]">
                  <span className="text-[var(--atc-emerald)] font-bold" title="Departures Completed">
                    DEP {sim.metrics.departuresCompleted}
                  </span>
                  <span className="text-[var(--atc-border-strong)]">•</span>
                  <span className="text-[var(--atc-cyan)] font-bold" title="Arrivals Completed">
                    ARR {sim.metrics.arrivalsCompleted}
                  </span>
                  <span className="text-[var(--atc-border-strong)]">•</span>
                  <span
                    className={`font-extrabold ${
                      sim.metrics.safetyScore >= 90 ? "text-[var(--atc-emerald)]" : "text-[var(--atc-amber)]"
                    }`}
                    title="Safety Compliance Score"
                  >
                    {sim.metrics.safetyScore}%
                  </span>
                </div>
              </div>

              {/* Traffic Scenario Picker */}
              <div>
                <label className="text-[10px] font-bold text-[var(--atc-text-secondary)] uppercase block mb-1">
                  Traffic Scenario
                </label>
                <select
                  value={sim.scenarioId}
                  onChange={(e) => {
                    loadScenario(e.target.value as ScenarioId);
                    setSettingsOpen(false);
                  }}
                  className="w-full bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] rounded-md px-2.5 py-1.5 text-xs text-[var(--atc-text)] focus:outline-none focus:border-[var(--atc-accent)]"
                >
                  {SCENARIOS.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Specialized Modes & Facilities */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[var(--atc-text-secondary)] uppercase block mb-1">
                  Specialized Modes &amp; Tools
                </label>

                {/* Global Map & Discovery */}
                <button
                  onClick={() => {
                    setSettingsOpen(false);
                    openAirportSelector();
                  }}
                  className="w-full px-2.5 py-2 rounded-md border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] hover:bg-[var(--atc-surface)] text-[var(--atc-text)] text-xs flex items-center justify-between font-semibold transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Globe2 className="w-3.5 h-3.5 text-[var(--atc-cyan)]" />
                    Global Airport Discovery Map
                  </span>
                  <span className="text-[10px] text-[var(--atc-muted)]">Browse</span>
                </button>

                {/* Live ADS-B Traffic Toggle */}
                <button
                  onClick={() => {
                    setSettingsOpen(false);
                    void toggleLiveTraffic();
                  }}
                  disabled={!isOnline || liveTrafficLoading}
                  className={`w-full px-2.5 py-2 rounded-md border text-xs flex items-center justify-between font-semibold transition-colors cursor-pointer disabled:opacity-40 ${
                    isLiveActive
                      ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-400"
                      : "border-[var(--atc-border)] bg-[var(--atc-surface-alt)] hover:bg-[var(--atc-surface)] text-[var(--atc-text)]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5" />
                    Live ADS-B Flight Feed
                  </span>
                  <span className="text-[10px] font-mono font-bold">
                    {liveTrafficLoading ? "SYNCING..." : isLiveActive ? `LIVE (${liveAircraftCount} AC)` : "ENABLE"}
                  </span>
                </button>

                {/* Live ADS-B Radar View */}
                <button
                  onClick={() => {
                    setSettingsOpen(false);
                    setAppMode("LIVE_OBSERVATION");
                  }}
                  disabled={!isOnline}
                  className="w-full px-2.5 py-2 rounded-md border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] hover:bg-[var(--atc-surface)] text-[var(--atc-cyan)] text-xs flex items-center justify-between font-semibold transition-colors cursor-pointer disabled:opacity-40"
                >
                  <span className="flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5" />
                    Live ADS-B Radar View
                  </span>
                  <span className="text-[10px] text-[var(--atc-muted)]">
                    {sim.liveSnapshotMeta ? `${sim.liveSnapshotMeta.activeLiveCount ?? sim.liveSnapshotMeta.convertedCount} acft` : "Open"}
                  </span>
                </button>

                {/* Multiplayer Hub */}
                <button
                  onClick={() => {
                    setSettingsOpen(false);
                    setAppMode("MULTIPLAYER_LOBBY");
                  }}
                  disabled={!isOnline}
                  className="w-full px-2.5 py-2 rounded-md border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] hover:bg-[var(--atc-surface)] text-[var(--atc-accent-text)] text-xs flex items-center justify-between font-semibold transition-colors cursor-pointer disabled:opacity-40"
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" />
                    Multiplayer Hub (2-5 Players)
                  </span>
                  <span className="text-[10px] text-[var(--atc-muted)]">
                    {isMpActive ? roomState?.roomCode : "Lobby"}
                  </span>
                </button>

                {/* ATC Rule Verification Suite */}
                <button
                  onClick={() => {
                    setSettingsOpen(false);
                    setShowVerificationModal(true);
                  }}
                  className="w-full px-2.5 py-2 rounded-md border border-[var(--atc-emerald-border)] bg-[var(--atc-emerald-bg)] hover:opacity-90 text-[var(--atc-emerald)] text-xs font-bold flex items-center justify-between transition-opacity cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Mandatory Rule Verifier
                  </span>
                  <span className="text-[10px] font-mono">Run Tests</span>
                </button>
              </div>

              {/* Automation & Sound Options */}
              <div className="pt-2 border-t border-[var(--atc-border)] space-y-1.5">
                <button
                  onClick={toggleAutoAssist}
                  disabled={sim.config.activePlayerStation === "ALL"}
                  className={`w-full px-2.5 py-1.5 rounded border text-[11px] flex items-center justify-between transition-colors disabled:opacity-50 cursor-pointer ${
                    sim.config.activePlayerStation === "ALL" || sim.config.autoManageOtherStations
                      ? "bg-[var(--atc-emerald-bg)] border-[var(--atc-emerald-border)] text-[var(--atc-emerald)]"
                      : "bg-[var(--atc-surface-alt)] border-[var(--atc-border)] text-[var(--atc-muted)]"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Bot className="w-3.5 h-3.5" />
                    AI Auto-Manage Other Roles
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
                  onClick={toggleVoice}
                  className={`w-full px-2.5 py-1.5 rounded border text-[11px] flex items-center justify-between transition-colors cursor-pointer ${
                    voiceEnabled
                      ? "border-[var(--atc-border)] bg-[var(--atc-surface-alt)] text-[var(--atc-text)]"
                      : "border-[var(--atc-red-border)] bg-[var(--atc-red-bg)] text-[var(--atc-red)]"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-semibold">
                    {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                    Voice Output (TTS)
                  </span>
                  <span className="font-bold">{voiceEnabled ? "ON" : "MUTED"}</span>
                </button>

                <button
                  onClick={toggleSfx}
                  className="w-full px-2.5 py-1.5 rounded border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] text-[var(--atc-text)] text-[11px] flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 font-semibold">
                    {sfxEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                    Radio Squelch SFX
                  </span>
                  <span className="font-bold">{sfxEnabled ? "ON" : "OFF"}</span>
                </button>
              </div>

              {/* Multiplayer In-Session Action (Host End / Peer Leave) */}
              {isMpActive && (
                <div className="pt-2 border-t border-[var(--atc-border)]">
                  {roomState?.hostPlayerId === playerId ? (
                    <button
                      onClick={() => {
                        setSettingsOpen(false);
                        endMultiplayerSession();
                      }}
                      className="w-full py-2 px-3 rounded-md bg-[var(--atc-red-bg)] border border-[var(--atc-red-border)] text-[var(--atc-red)] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      END MULTIPLAYER SHIFT
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setSettingsOpen(false);
                        leaveMultiplayerRoom();
                      }}
                      className="w-full py-2 px-3 rounded-md bg-[var(--atc-surface-alt)] border border-[var(--atc-border-strong)] text-[var(--atc-text)] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5" />
                      LEAVE MULTIPLAYER ROOM
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>

      {/* MOBILE PHONE HEADER (flex on mobile, lg:hidden) */}
      <header className="flex lg:hidden h-12 bg-[var(--atc-panel)] border-b border-[var(--atc-border)] px-2.5 items-center justify-between gap-1.5 shrink-0 select-none transition-colors">
        {/* Left: Home + Airport Picker */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setAppMode("LANDING")}
            title="Return to Landing Page"
            className="p-1.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] text-[var(--atc-text)] cursor-pointer hover:bg-[var(--atc-surface-alt)]"
          >
            <Home className="w-3.5 h-3.5 text-[var(--atc-accent)]" />
          </button>

          <button
            onClick={openAirportSelector}
            title="Switch Airport"
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] text-xs font-mono font-bold text-[var(--atc-text)] cursor-pointer hover:bg-[var(--atc-surface-alt)]"
          >
            <Radio className="w-3.5 h-3.5 text-[var(--atc-cyan)]" />
            <span>{sim.airport.icao}</span>
            {isLiveActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
            <ChevronDown className="w-3 h-3 text-[var(--atc-muted)]" />
          </button>
        </div>

        {/* Center: Station Switcher + Play/Pause */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setMobileStationOpen((v) => !v)}
            title="Switch Active Controller Station"
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-[var(--atc-accent-border)] bg-[var(--atc-surface)] text-[11px] font-mono font-extrabold text-[var(--atc-text)] shadow-xs cursor-pointer hover:bg-[var(--atc-surface-alt)]"
          >
            <span>{currentStation.label}</span>
            {currentStationPending > 0 && (
              <span className="px-1 min-w-[14px] text-center rounded-full bg-amber-500 text-slate-950 text-[9px] font-bold">
                {currentStationPending}
              </span>
            )}
            <ChevronDown className="w-3 h-3 text-[var(--atc-muted)]" />
          </button>

          <button
            disabled={isMpActive}
            onClick={togglePause}
            className={`px-2 py-1.5 rounded-lg border text-[11px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-colors ${
              sim.paused
                ? "bg-[var(--atc-surface-alt)] border-[var(--atc-border-strong)] text-[var(--atc-text)]"
                : "bg-[var(--atc-accent)] border-[var(--atc-accent-border)] text-slate-950"
            }`}
          >
            {sim.paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            <span>{sim.paused ? "PAUSE" : "RUN"}</span>
          </button>
        </div>

        {/* Right: Voice PTT + Settings Menu */}
        <div className="flex items-center gap-1.5 shrink-0">
          <VoicePttButton />

          <button
            onClick={() => setMobileToolsOpen(true)}
            title="Open Simulation Settings & Tools"
            className="p-1.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] text-[var(--atc-text)] cursor-pointer hover:bg-[var(--atc-surface-alt)]"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Mobile Station Picker Modal */}
      {mobileStationOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--atc-surface)] border border-[var(--atc-border)] shadow-2xl p-4 space-y-3 font-mono">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--atc-border)]">
              <span className="font-extrabold text-xs text-[var(--atc-text)] uppercase tracking-wider">
                Select Controller Station
              </span>
              <button
                onClick={() => setMobileStationOpen(false)}
                className="p-1 rounded-md text-[var(--atc-muted)] hover:text-[var(--atc-text)] cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {STATIONS.map((st) => {
                const active = sim.config.activePlayerStation === st.role;
                const isAll = st.role === "ALL";
                const count = isAll
                  ? Object.values(pendingCounts).reduce((a, b) => a + b, 0)
                  : pendingCounts[st.role as ControllerRole];
                return (
                  <button
                    key={st.role}
                    onClick={() => {
                      switchStation(st.role);
                      setMobileStationOpen(false);
                    }}
                    className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      active
                        ? "bg-[var(--atc-accent-bg)] border-[var(--atc-accent-border)] text-[var(--atc-accent-text)] ring-1 ring-[var(--atc-accent)]"
                        : "bg-[var(--atc-surface-alt)] border-[var(--atc-border)] text-[var(--atc-text)] hover:bg-[var(--atc-surface)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs">{st.label}</span>
                      {count > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[9px] font-bold">
                          {count}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-[var(--atc-muted)] mt-1">
                      {st.freq === "ALL" ? "All Frequencies" : `${st.freq} MHz`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Tools & Settings Drawer Modal */}
      {mobileToolsOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--atc-surface)] border border-[var(--atc-border)] shadow-2xl p-4 space-y-3 font-mono text-xs max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--atc-border)]">
              <div>
                <div className="font-extrabold text-sm text-[var(--atc-text)]">SIMULATION TOOLS</div>
                <div className="text-[10px] text-[var(--atc-muted)]">Workstation Controls & Setup</div>
              </div>
              <button
                onClick={() => setMobileToolsOpen(false)}
                className="p-1 rounded-md text-[var(--atc-muted)] hover:text-[var(--atc-text)] text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Sim Speed */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[var(--atc-text-secondary)] uppercase">
                Simulation Speed
              </label>
              <div className="grid grid-cols-3 gap-1 bg-[var(--atc-surface-alt)] p-1 rounded-lg border border-[var(--atc-border)]">
                {([1, 2, 4] as const).map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setTimeScale(spd)}
                    className={`py-1.5 text-center rounded font-bold transition-all cursor-pointer ${
                      sim.timeScale === spd
                        ? "bg-[var(--atc-accent)] text-slate-950 shadow-sm"
                        : "text-[var(--atc-muted)] hover:text-[var(--atc-text)]"
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            {/* Live Traffic */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[var(--atc-text-secondary)] uppercase">
                Real-World Traffic
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => void toggleLiveTraffic()}
                  disabled={liveTrafficLoading}
                  className={`flex-1 py-2 px-3 rounded-lg border font-bold flex items-center justify-between cursor-pointer ${
                    isLiveActive
                      ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                      : "bg-[var(--atc-surface-alt)] border-[var(--atc-border)] text-[var(--atc-muted)]"
                  }`}
                >
                  <span>{isLiveActive ? `LIVE TRAFFIC (${liveAircraftCount})` : "LIVE TRAFFIC: OFF"}</span>
                  <span className={`w-2 h-2 rounded-full ${isLiveActive ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
                </button>
                <button
                  onClick={() => void toggleLiveTraffic(true)}
                  disabled={liveTrafficLoading}
                  className="p-2 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] text-[var(--atc-muted)] cursor-pointer"
                  title="Resync live traffic"
                >
                  <RefreshCw className={`w-4 h-4 ${liveTrafficLoading ? "animate-spin text-amber-400" : ""}`} />
                </button>
              </div>
            </div>

            {/* Traffic Scenario Picker */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[var(--atc-text-secondary)] uppercase">
                Traffic Scenario
              </label>
              <select
                value={sim.scenarioId}
                onChange={(e) => {
                  loadScenario(e.target.value as ScenarioId);
                  setMobileToolsOpen(false);
                }}
                className="w-full bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] rounded-lg px-2.5 py-2 text-xs font-mono font-semibold text-[var(--atc-text)] focus:border-[var(--atc-accent-border)]"
              >
                {SCENARIOS.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Theme & Audio Toggles */}
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                onClick={toggleTheme}
                className="py-2 px-2.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] text-[var(--atc-text)] flex items-center justify-center gap-1.5 font-bold cursor-pointer"
              >
                {theme === "dark" ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-600" />}
                <span>{theme === "dark" ? "LIGHT" : "DARK"}</span>
              </button>

              <button
                onClick={toggleVoice}
                className={`py-2 px-2.5 rounded-lg border font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                  voiceEnabled
                    ? "border-[var(--atc-border)] bg-[var(--atc-surface-alt)] text-[var(--atc-text)]"
                    : "border-red-500/50 bg-red-500/20 text-red-400"
                }`}
              >
                {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                <span>{voiceEnabled ? "VOICE ON" : "MUTED"}</span>
              </button>
            </div>

            {/* Verification Modal Link */}
            <button
              onClick={() => {
                setMobileToolsOpen(false);
                setShowVerificationModal(true);
              }}
              className="w-full py-2 px-3 rounded-lg border border-[var(--atc-emerald-border)] bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Mandatory Rule Verifier</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
