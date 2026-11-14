import React, { useState } from "react";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Copy,
  Loader2,
  Lock,
  Plane,
  Play,
  Send,
  ShieldCheck,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useAtcStore } from "../store/atcStore.ts";
import type { ControllerRole, DifficultyLevel, ScenarioId } from "../types/atc.ts";

const ROLES: Array<{
  role: ControllerRole;
  step: number;
  title: string;
  subtitle: string;
  scope: string;
  short: string;
}> = [
  {
    role: "DELIVERY",
    step: 1,
    title: "Clearance Delivery",
    subtitle: "Clearance & Plans",
    scope: "IFR flight plans, CRAFT clearances & squawk beacons",
    short: "DEL",
  },
  {
    role: "GROUND",
    step: 2,
    title: "Ground Control",
    subtitle: "Taxiways & Aprons",
    scope: "Pushback, taxi routes, gate spots & hold-shorts",
    short: "GND",
  },
  {
    role: "TOWER",
    step: 3,
    title: "Tower Local Control",
    subtitle: "Runway Operations",
    scope: "Runway crossings, line up, takeoff & landing",
    short: "TWR",
  },
  {
    role: "DEPARTURE",
    step: 4,
    title: "Departure / TRACON",
    subtitle: "Initial Climb & Radar",
    scope: "Climb vectors, heading, altitude & TRACON radar",
    short: "DEP",
  },
  {
    role: "CENTER",
    step: 5,
    title: "Area Control / Center",
    subtitle: "Enroute Airspace",
    scope: "Enroute cruise sectors, high altitudes & handoffs",
    short: "CTR",
  },
];

export const MultiplayerLobby: React.FC = () => {
  const roomState = useAtcStore((s) => s.roomState);
  const playerId = useAtcStore((s) => s.playerId);
  const playerName = useAtcStore((s) => s.playerName);
  const setPlayerName = useAtcStore((s) => s.setPlayerName);
  const assignedRole = useAtcStore((s) => s.assignedRole);
  const multiplayerConnected = useAtcStore((s) => s.multiplayerConnected);
  const multiplayerError = useAtcStore((s) => s.multiplayerError);
  const selectedAirportRecord = useAtcStore((s) => s.selectedAirportRecord);
  const setAppMode = useAtcStore((s) => s.setAppMode);
  const createMultiplayerRoom = useAtcStore((s) => s.createMultiplayerRoom);
  const joinMultiplayerRoom = useAtcStore((s) => s.joinMultiplayerRoom);
  const claimMultiplayerRole = useAtcStore((s) => s.claimMultiplayerRole);
  const setMultiplayerReady = useAtcStore((s) => s.setMultiplayerReady);
  const updateMultiplayerConfig = useAtcStore((s) => s.updateMultiplayerConfig);
  const startMultiplayerRoom = useAtcStore((s) => s.startMultiplayerRoom);
  const sendMultiplayerChat = useAtcStore((s) => s.sendMultiplayerChat);
  const leaveMultiplayerRoom = useAtcStore((s) => s.leaveMultiplayerRoom);
  const isOnline = useAtcStore((s) => s.isOnline);

  const [joinCode, setJoinCode] = useState("");
  const [hostRole, setHostRole] = useState<ControllerRole>("TOWER");
  const [joinRole, setJoinRole] = useState<ControllerRole | "AUTO">("AUTO");
  const [chatDraft, setChatDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);

  const isHost = Boolean(roomState && roomState.hostPlayerId === playerId);
  const connectedPlayerCount = roomState
    ? ROLES.filter((r) => {
        const s = roomState.slots[r.role];
        return Boolean(s.playerId && s.connected);
      }).length
    : 0;
  const aiSlotCount = roomState ? 5 - connectedPlayerCount : 0;
  const canStartSession = connectedPlayerCount >= 2;

  const handleCopyCode = async () => {
    if (!roomState) return;
    try {
      await navigator.clipboard.writeText(roomState.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked in some contexts
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--atc-bg)] text-[var(--atc-text)] overflow-hidden">
      <header className="h-14 shrink-0 border-b border-[var(--atc-border)] bg-[var(--atc-panel)] px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => (roomState ? leaveMultiplayerRoom() : setAppMode("GLOBAL_MAP"))}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {roomState ? "Leave Room" : "Global Map"}
          </button>
          <div>
            <div className="font-bold text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--atc-cyan)]" />
              ATC MULTIPLAYER CO-OP OPERATIONS (2-5 PLAYERS)
            </div>
            <p className="text-[11px] text-[var(--atc-muted)]">
              Delivery + Ground + Tower + Departure + Center shared room · Min 2 players to start · Unclaimed seats run AI backup
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border ${
              multiplayerConnected
                ? "bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] border-[var(--atc-emerald-border)]"
                : "bg-[var(--atc-amber-bg)] text-[var(--atc-amber)] border-[var(--atc-amber-border)]"
            }`}
          >
            {multiplayerConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {multiplayerConnected ? "WebSocket Connected" : isOnline ? "Idle / Connecting" : "Offline"}
          </span>
        </div>
      </header>

      <div className="flex-1 min-h-0 p-4 lg:p-6 overflow-y-auto">
        {multiplayerError && (
          <div className="max-w-5xl mx-auto mb-4 p-3 rounded-lg border border-[var(--atc-red-border)] bg-[var(--atc-red-bg)] text-[var(--atc-red)] text-xs font-medium">
            {multiplayerError}
          </div>
        )}

        {!roomState ? (
          <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="p-5 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-panel)] space-y-3">
              <h2 className="font-bold text-sm">Create New Control Room</h2>
              <p className="text-xs text-[var(--atc-muted)]">
                Host an authoritative 2-5 player ATC session at{" "}
                <strong className="font-mono text-[var(--atc-text)]">
                  {selectedAirportRecord?.icao ?? "VIDP"}
                </strong>{" "}
                and share the 6-character code.
              </p>
              <div>
                <label className="text-[10px] uppercase text-[var(--atc-muted)] block mb-1">Your Callsign</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-[var(--atc-muted)] block mb-1">Your Starting Role</label>
                <div className="grid grid-cols-5 gap-1">
                  {ROLES.map((r) => (
                    <button
                      key={r.role}
                      type="button"
                      onClick={() => setHostRole(r.role)}
                      className={`py-1.5 rounded text-[10px] font-mono font-bold border transition-colors ${
                        hostRole === r.role
                          ? "bg-[var(--atc-accent-bg)] text-[var(--atc-accent-text)] border-[var(--atc-accent-border)]"
                          : "bg-[var(--atc-surface)] text-[var(--atc-muted)] border-[var(--atc-border)] hover:text-[var(--atc-text)]"
                      }`}
                    >
                      {r.short}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={async () => {
                  if (isCreating) return;
                  setIsCreating(true);
                  try {
                    await createMultiplayerRoom({
                      airportIcao: selectedAirportRecord?.icao ?? "VIDP",
                      scenarioId: "MEDIUM",
                      difficulty: "STANDARD",
                      preferredRole: hostRole,
                    });
                  } finally {
                    setIsCreating(false);
                  }
                }}
                disabled={!isOnline || isCreating}
                className="w-full py-2.5 rounded-lg bg-[var(--atc-accent)] text-stone-950 font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating Room &amp; Entering Lobby...</span>
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4" />
                    <span>Host Room as {hostRole} ({selectedAirportRecord?.icao ?? "VIDP"})</span>
                  </>
                )}
              </button>
            </div>

            <div className="p-5 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-panel)] space-y-3">
              <h2 className="font-bold text-sm">Join Room by Code</h2>
              <p className="text-xs text-[var(--atc-muted)]">
                Enter the 6-character code shared by your host (min 2 players to start; unclaimed roles run AI backup).
              </p>
              <div>
                <label className="text-[10px] uppercase text-[var(--atc-muted)] block mb-1">Your Callsign</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-[var(--atc-muted)] block mb-1">Room Code</label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && joinCode.trim() && isOnline && !isJoining) {
                      setIsJoining(true);
                      joinMultiplayerRoom(joinCode, joinRole === "AUTO" ? undefined : joinRole);
                      setTimeout(() => setIsJoining(false), 2000);
                    }
                  }}
                  placeholder="e.g. A7K92M"
                  maxLength={8}
                  className="w-full px-3 py-1.5 text-sm font-mono uppercase rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-[var(--atc-muted)] block mb-1">Preferred Role</label>
                <div className="grid grid-cols-6 gap-1">
                  {(["AUTO", "DELIVERY", "GROUND", "TOWER", "DEPARTURE", "CENTER"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setJoinRole(r)}
                      className={`py-1.5 rounded text-[9px] font-mono font-bold border transition-colors ${
                        joinRole === r
                          ? "bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)] border-[var(--atc-cyan-border)]"
                          : "bg-[var(--atc-surface)] text-[var(--atc-muted)] border-[var(--atc-border)] hover:text-[var(--atc-text)]"
                      }`}
                    >
                      {r === "DELIVERY" ? "DEL" : r === "DEPARTURE" ? "DEP" : r === "CENTER" ? "CTR" : r === "GROUND" ? "GND" : r === "TOWER" ? "TWR" : "AUTO"}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => {
                  if (!joinCode.trim() || !isOnline || isJoining) return;
                  setIsJoining(true);
                  joinMultiplayerRoom(joinCode, joinRole === "AUTO" ? undefined : joinRole);
                  setTimeout(() => setIsJoining(false), 2000);
                }}
                disabled={!joinCode.trim() || !isOnline || isJoining}
                className="w-full py-2.5 rounded-lg bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)] border border-[var(--atc-cyan-border)] font-bold text-xs disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isJoining ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Connecting to Room...</span>
                  </>
                ) : (
                  <span>Join Session</span>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto space-y-4">
            {/* Top Bar: Room Code & Status + Host Settings */}
            <div className="p-4 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-panel)] flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] border border-[var(--atc-emerald-border)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--atc-emerald)] animate-pulse" />
                    Active Room · {roomState.status}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 mt-1.5">
                  <span className="font-mono text-2xl font-extrabold tracking-widest text-[var(--atc-accent)]">
                    {roomState.roomCode}
                  </span>
                  <button
                    onClick={() => void handleCopyCode()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:border-[var(--atc-border-strong)] transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copied ? "Copied!" : "Copy Code"}
                  </button>
                </div>
                <div className="text-xs text-[var(--atc-muted)] mt-1 flex items-center gap-1.5">
                  <Plane className="w-3.5 h-3.5 text-[var(--atc-cyan)]" />
                  <span className="font-mono font-bold text-[var(--atc-text)]">{roomState.airportIcao}</span> ·{" "}
                  <span>{roomState.airportName}</span>
                </div>
              </div>

              {/* Host Config Controls */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-semibold tracking-wider text-[var(--atc-muted)] block">
                    Traffic Scenario
                  </label>
                  <select
                    value={roomState.scenarioId}
                    disabled={!isHost || roomState.status === "ACTIVE"}
                    onChange={(e) => updateMultiplayerConfig({ scenarioId: e.target.value as ScenarioId })}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] disabled:opacity-60 cursor-pointer"
                  >
                    <option value="LOW_TRAFFIC">Low Traffic (Few Planes)</option>
                    <option value="NORMAL_OPS">Normal Ops</option>
                    <option value="LIGHT">Light Traffic</option>
                    <option value="MEDIUM">Medium Traffic</option>
                    <option value="HEAVY">Heavy Traffic</option>
                    <option value="RUSH_HOUR">Rush Hour</option>
                    <option value="ARRIVAL_HEAVY">Arrival Heavy</option>
                    <option value="DEPARTURE_HEAVY">Departure Heavy</option>
                    <option value="MIXED">Mixed Ops</option>
                    <option value="EMERGENCY">Emergency</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-semibold tracking-wider text-[var(--atc-muted)] block">
                    Simulation Difficulty
                  </label>
                  <select
                    value={roomState.difficulty}
                    disabled={!isHost || roomState.status === "ACTIVE"}
                    onChange={(e) => updateMultiplayerConfig({ difficulty: e.target.value as DifficultyLevel })}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] disabled:opacity-60 cursor-pointer"
                  >
                    <option value="EASY">Easy</option>
                    <option value="STANDARD">Standard</option>
                    <option value="CHALLENGING">Challenging</option>
                    <option value="EXPERT">Expert</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Pipeline Header */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1 text-xs text-[var(--atc-muted)]">
                <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 text-[var(--atc-cyan)]" />
                  <span>ATC Pipeline Stations</span>
                  <span className="text-[11px] font-normal lowercase text-[var(--atc-muted)]">
                    (Pilot ↓ Delivery ↓ Ground ↓ Tower ↓ Departure ↓ Center)
                  </span>
                </div>
                <div className="text-[11px]">
                  <span>Claim a station · 2 human minimum to launch</span>
                </div>
              </div>

              {/* All 5 Role Cards Spanning Full Width */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
                {ROLES.map(({ role, step, title, subtitle, scope, short }) => {
                  const slot = roomState.slots[role];
                  const isMine = slot.playerId === playerId;
                  const occupiedByOther = Boolean(slot.playerId && slot.playerId !== playerId);

                  return (
                    <div
                      key={role}
                      className={`relative p-3.5 rounded-xl border flex flex-col justify-between transition-all min-w-0 ${
                        isMine
                          ? "border-[var(--atc-accent-border)] bg-[var(--atc-accent-soft)] ring-2 ring-[var(--atc-accent)]/50 shadow-md"
                          : "border-[var(--atc-border)] bg-[var(--atc-panel)] hover:border-[var(--atc-border-strong)]"
                      }`}
                    >
                      <div>
                        {/* Top row: step number + role callsign + status badge (tight, no overflow) */}
                        <div className="flex items-center justify-between gap-1.5 mb-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--atc-surface)] border border-[var(--atc-border)] text-[var(--atc-accent)] shrink-0">
                              #{step}
                            </span>
                            <span className="font-mono font-bold text-xs tracking-wide uppercase truncate text-[var(--atc-text)]">
                              {short} · {role}
                            </span>
                          </div>

                          {slot.playerId ? (
                            slot.connected ? (
                              <span className="shrink-0 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] border border-[var(--atc-emerald-border)] font-semibold">
                                <UserCheck className="w-2.5 h-2.5 shrink-0" />
                                <span>{isMine ? "You" : "Human"}</span>
                              </span>
                            ) : (
                              <span className="shrink-0 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[var(--atc-amber-bg)] text-[var(--atc-amber)] border border-[var(--atc-amber-border)] font-semibold">
                                <Bot className="w-2.5 h-2.5 shrink-0" />
                                <span>AI Disconnected</span>
                              </span>
                            )
                          ) : (
                            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[var(--atc-surface)] text-[var(--atc-muted)] border border-[var(--atc-border)] font-medium">
                              <Bot className="w-2.5 h-2.5 text-[var(--atc-cyan)] shrink-0" />
                              <span>AI Backup</span>
                            </span>
                          )}
                        </div>

                        {/* Role Title & Subtitle */}
                        <h3 className="font-bold text-xs leading-snug text-[var(--atc-text)] truncate">{title}</h3>
                        <div className="text-[10px] text-[var(--atc-cyan)] font-medium mt-0.5 truncate">{subtitle}</div>
                        <p className="text-[10px] text-[var(--atc-muted)] mt-1 leading-tight line-clamp-2 min-h-[24px]">
                          {scope}
                        </p>
                      </div>

                      {/* Card Footer: Controller Assignment + Action */}
                      <div className="pt-2.5 mt-2.5 border-t border-[var(--atc-border)] space-y-2">
                        <div className="flex items-center justify-between text-[11px] gap-1">
                          <span className="text-[10px] text-[var(--atc-muted)] uppercase tracking-wider shrink-0">Operator</span>
                          <span className="font-semibold text-xs truncate text-right text-[var(--atc-text)]">
                            {slot.playerId
                              ? slot.playerId === playerId
                                ? `${slot.playerName} (You)`
                                : slot.playerName
                              : "AI Automated"}
                          </span>
                        </div>

                        {isMine ? (
                          <button
                            onClick={() => setMultiplayerReady(!slot.ready)}
                            className={`w-full py-2 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm ${
                              slot.ready
                                ? "bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] border-[var(--atc-emerald-border)]"
                                : "bg-[var(--atc-accent)] text-stone-950 border-[var(--atc-accent-border)] hover:brightness-105"
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{slot.ready ? "Position Ready" : "Confirm Ready"}</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => claimMultiplayerRole(role)}
                            disabled={occupiedByOther && slot.connected}
                            className="w-full py-1.5 rounded-lg text-xs font-semibold border border-[var(--atc-border-strong)] bg-[var(--atc-surface)] hover:border-[var(--atc-accent-border)] hover:text-[var(--atc-accent)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                          >
                            {occupiedByOther && slot.connected ? (
                              <>
                                <Lock className="w-3 h-3 shrink-0" />
                                <span className="truncate">Taken by {slot.playerName}</span>
                              </>
                            ) : (
                              <span>Claim Station</span>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Row: Crew Readiness / Start Session (Left 7 cols) & Interphone Chat (Right 5 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1">
              {/* Left Column: Readiness Summary & Start Session */}
              <div className="lg:col-span-7 p-4 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-panel)] flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--atc-border)]">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[var(--atc-emerald)] shrink-0" />
                      <span className="font-bold text-xs uppercase tracking-wider text-[var(--atc-text)]">
                        Crew Readiness
                      </span>
                    </div>
                    <span className="font-mono text-xs font-bold text-[var(--atc-text)]">
                      {connectedPlayerCount}/5 Humans Active · {aiSlotCount} AI Backup
                    </span>
                  </div>

                  {/* 5 Slot Status Indicators */}
                  <div className="grid grid-cols-5 gap-2 mt-3">
                    {ROLES.map(({ role, short }) => {
                      const s = roomState.slots[role];
                      const isHuman = Boolean(s.playerId && s.connected);
                      const isMe = s.playerId === playerId;
                      return (
                        <div
                          key={role}
                          className={`p-2 rounded-lg border text-center transition-all ${
                            isHuman
                              ? isMe
                                ? "border-[var(--atc-accent-border)] bg-[var(--atc-accent-soft)]"
                                : "border-[var(--atc-emerald-border)] bg-[var(--atc-emerald-bg)]"
                              : "border-[var(--atc-border)] bg-[var(--atc-surface)] opacity-75"
                          }`}
                        >
                          <div className="text-[10px] font-mono font-bold text-[var(--atc-text)]">{short}</div>
                          <div
                            className={`text-[9px] mt-0.5 font-medium truncate ${
                              isHuman
                                ? isMe
                                  ? "text-[var(--atc-accent-text)]"
                                  : "text-[var(--atc-emerald)]"
                                : "text-[var(--atc-muted)]"
                            }`}
                          >
                            {isHuman ? (isMe ? "You" : s.playerName) : "AI Backup"}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[11px] text-[var(--atc-muted)] mt-3 leading-relaxed">
                    Unclaimed roles are operated by autonomous AI controllers that automatically handle flight plan clearances, taxiing, takeoff rolls, climb vectors, and handoffs with human controllers.
                  </p>
                </div>

                {/* Action Bar */}
                <div className="pt-3 border-t border-[var(--atc-border)] flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-[var(--atc-muted)]">
                    Your Station:{" "}
                    <strong className="font-mono font-bold text-[var(--atc-text)]">
                      {assignedRole ?? "Unassigned"}
                    </strong>
                  </div>

                  {roomState.status === "ACTIVE" ? (
                    <button
                      onClick={() => setAppMode("SIMULATION")}
                      className="px-4 py-2 rounded-lg bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] border border-[var(--atc-emerald-border)] font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-4 h-4" />
                      Re-enter Active Control Scope
                    </button>
                  ) : isHost ? (
                    <div className="flex flex-col items-end gap-1">
                      <button
                        onClick={() => {
                          if (!canStartSession || isStartingSession) return;
                          setIsStartingSession(true);
                          startMultiplayerRoom();
                        }}
                        disabled={!canStartSession || isStartingSession}
                        className="px-5 py-2.5 rounded-lg bg-[var(--atc-accent)] text-stone-950 font-bold text-xs flex items-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed shadow-sm cursor-pointer transition-transform active:scale-95"
                      >
                        {isStartingSession ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Starting Session &amp; Synchronizing Scope...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 fill-current" />
                            <span>
                              {canStartSession
                                ? "Start Multiplayer ATC Session"
                                : `Waiting for Player 2 (${connectedPlayerCount}/2 min)`}
                            </span>
                          </>
                        )}
                      </button>
                      {!canStartSession && (
                        <span className="text-[10px] text-[var(--atc-amber)] font-mono">
                          At least 2 human players required (unclaimed roles auto-fill with AI)
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--atc-cyan)] font-medium">
                      Waiting for host (
                      {Object.values(roomState.slots).find((s) => s.playerId === roomState.hostPlayerId)
                        ?.playerName ?? "Host"}
                      ) to start...
                    </span>
                  )}
                </div>
              </div>

              {/* Right Column: Controller Interphone Chat */}
              <div className="lg:col-span-5 p-4 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-panel)] flex flex-col min-h-[260px] max-h-[340px]">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--atc-muted)]">
                    Controller Interphone Chat
                  </h3>
                  <span className="text-[10px] font-mono text-[var(--atc-muted)]">
                    {roomState.chat.length} msgs
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
                  {roomState.chat.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center p-4">
                      <p className="text-[var(--atc-muted)] text-[11px]">
                        No interphone messages yet. Coordinate frequencies, active runways, and handoffs here.
                      </p>
                    </div>
                  ) : (
                    roomState.chat.map((c) => (
                      <div key={c.id} className="p-2 rounded-lg bg-[var(--atc-surface)] border border-[var(--atc-border)]">
                        <div className="flex items-center justify-between text-[10px] text-[var(--atc-muted)]">
                          <span className="font-mono font-bold text-[var(--atc-cyan)]">
                            [{c.senderRole}] {c.senderName}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--atc-text)]">{c.text}</p>
                      </div>
                    ))
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!chatDraft.trim()) return;
                    sendMultiplayerChat(chatDraft);
                    setChatDraft("");
                  }}
                  className="mt-3 flex gap-1.5"
                >
                  <input
                    type="text"
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    placeholder="Coord message..."
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)] border border-[var(--atc-cyan-border)] hover:bg-[var(--atc-cyan)]/20 transition-colors cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
