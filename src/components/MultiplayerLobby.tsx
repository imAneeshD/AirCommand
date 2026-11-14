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

const ROLES: Array<{ role: ControllerRole; title: string; scope: string; short: string }> = [
  { role: "DELIVERY", title: "Clearance Delivery", scope: "IFR Flight Plans, CRAFT Clearances & Squawk Beacons", short: "DEL" },
  { role: "GROUND", title: "Ground Control", scope: "Pushback, Taxi Routes, Gates & Hold-Shorts", short: "GND" },
  { role: "TOWER", title: "Tower Local Control", scope: "Runway Crossings, Line Up, Takeoff & Landing", short: "TWR" },
  { role: "DEPARTURE", title: "Departure / TRACON", scope: "Initial Climb, Heading Vectors & Airspeed", short: "DEP" },
  { role: "CENTER", title: "Area Control / Center", scope: "Enroute Cruise, High Altitudes & Handoffs", short: "CTR" },
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
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left/Center: Room Info + 3 ATC Seats */}
            <div className="lg:col-span-2 space-y-4">
              <div className="p-4 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-panel)] flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--atc-muted)]">
                    Active Room · {roomState.status}
                  </div>
                  <div className="flex items-center gap-2.5 mt-0.5">
                    <span className="font-mono text-2xl font-extrabold tracking-widest text-[var(--atc-accent)]">
                      {roomState.roomCode}
                    </span>
                    <button
                      onClick={() => void handleCopyCode()}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]"
                    >
                      <Copy className="w-3 h-3" />
                      {copied ? "Copied!" : "Copy Code"}
                    </button>
                  </div>
                  <div className="text-xs text-[var(--atc-muted)] mt-1 flex items-center gap-1.5">
                    <Plane className="w-3.5 h-3.5" />
                    <span className="font-mono font-bold text-[var(--atc-text)]">{roomState.airportIcao}</span> ·{" "}
                    {roomState.airportName}
                  </div>
                </div>

                {/* Host Config Controls */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div>
                    <label className="text-[10px] text-[var(--atc-muted)] block">Scenario</label>
                    <select
                      value={roomState.scenarioId}
                      disabled={!isHost || roomState.status === "ACTIVE"}
                      onChange={(e) => updateMultiplayerConfig({ scenarioId: e.target.value as ScenarioId })}
                      className="px-2 py-1 text-xs rounded border border-[var(--atc-border)] bg-[var(--atc-surface)] disabled:opacity-60"
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

                  <div>
                    <label className="text-[10px] text-[var(--atc-muted)] block">Difficulty</label>
                    <select
                      value={roomState.difficulty}
                      disabled={!isHost || roomState.status === "ACTIVE"}
                      onChange={(e) => updateMultiplayerConfig({ difficulty: e.target.value as DifficultyLevel })}
                      className="px-2 py-1 text-xs rounded border border-[var(--atc-border)] bg-[var(--atc-surface)] disabled:opacity-60"
                    >
                      <option value="EASY">Easy</option>
                      <option value="STANDARD">Standard</option>
                      <option value="CHALLENGING">Challenging</option>
                      <option value="EXPERT">Expert</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* All 5 Role Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                {ROLES.map(({ role, title, scope, short }) => {
                  const slot = roomState.slots[role];
                  const isMine = slot.playerId === playerId;
                  const occupiedByOther = Boolean(slot.playerId && slot.playerId !== playerId);

                  return (
                    <div
                      key={role}
                      className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 transition-all ${
                        isMine
                          ? "border-[var(--atc-accent-border)] bg-[var(--atc-accent-soft)] ring-2 ring-[var(--atc-accent)]/50 shadow-md"
                          : "border-[var(--atc-border)] bg-[var(--atc-panel)] hover:border-[var(--atc-border-strong)]"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-xs tracking-wider flex items-center gap-1">
                            <span className="px-1 py-0.2 rounded bg-[var(--atc-surface)] border border-[var(--atc-border)] text-[9px]">
                              {short}
                            </span>
                            {role}
                          </span>
                          {slot.playerId ? (
                            slot.connected ? (
                              <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] border border-[var(--atc-emerald-border)] font-semibold">
                                <UserCheck className="w-2.5 h-2.5" /> Human
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-[var(--atc-amber-bg)] text-[var(--atc-amber)] border border-[var(--atc-amber-border)] font-semibold">
                                <Bot className="w-2.5 h-2.5" /> Disconnected (AI)
                              </span>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)] border border-[var(--atc-cyan-border)] font-semibold">
                              <Bot className="w-2.5 h-2.5" /> AI Automated
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-xs mt-1.5 leading-snug">{title}</h3>
                        <p className="text-[10px] text-[var(--atc-muted)] mt-0.5 leading-tight">{scope}</p>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-[var(--atc-border)]">
                        <div className="text-[11px] font-medium truncate">
                          {slot.playerId ? slot.playerName : "Autonomous Controller"}
                        </div>
                        {isMine ? (
                          <button
                            onClick={() => setMultiplayerReady(!slot.ready)}
                            className={`w-full py-1.5 rounded text-xs font-semibold border flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                              slot.ready
                                ? "bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] border-[var(--atc-emerald-border)]"
                                : "bg-[var(--atc-surface)] text-[var(--atc-text)] border-[var(--atc-border-strong)]"
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {slot.ready ? "Ready" : "Mark Ready"}
                          </button>
                        ) : (
                          <button
                            onClick={() => claimMultiplayerRole(role)}
                            disabled={occupiedByOther && slot.connected}
                            title={
                              occupiedByOther && slot.connected
                                ? `${role} is already taken by ${slot.playerName}`
                                : `Switch to ${role}`
                            }
                            className="w-full py-1.5 rounded text-xs font-semibold border border-[var(--atc-border-strong)] bg-[var(--atc-surface)] hover:border-[var(--atc-accent-border)] disabled:opacity-55 disabled:cursor-not-allowed flex items-center justify-center gap-1 cursor-pointer transition-colors"
                          >
                            {occupiedByOther && slot.connected ? (
                              <>
                                <Lock className="w-3 h-3 shrink-0" />
                                <span>Taken ({slot.playerName})</span>
                              </>
                            ) : (
                              <span>Claim {role}</span>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Start / Enter Simulation Bar */}
              <div className="p-4 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-panel)] flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-[var(--atc-muted)] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[var(--atc-emerald)] shrink-0" />
                  <span>
                    Crew:{" "}
                    <strong className="font-mono text-[var(--atc-text)]">
                      {connectedPlayerCount}/5 Humans
                    </strong>{" "}
                    ({aiSlotCount} AI Backup) · Your Position:{" "}
                    <strong className="font-mono text-[var(--atc-text)]">{assignedRole ?? "Unassigned"}</strong>
                  </span>
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
                      className="px-5 py-2.5 rounded-lg bg-[var(--atc-accent)] text-stone-950 font-bold text-xs flex items-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed shadow-sm cursor-pointer"
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

            {/* Right Column: Controller Chat */}
            <div className="p-4 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-panel)] flex flex-col min-h-[340px]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--atc-muted)] mb-2">
                Controller Interphone Chat
              </h3>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
                {roomState.chat.length === 0 ? (
                  <p className="text-[var(--atc-muted)]">No messages yet. Coordinate runway assignments here.</p>
                ) : (
                  roomState.chat.map((c) => (
                    <div key={c.id} className="p-2 rounded bg-[var(--atc-surface)] border border-[var(--atc-border)]">
                      <div className="flex items-center justify-between text-[10px] text-[var(--atc-muted)]">
                        <span className="font-mono font-bold text-[var(--atc-cyan)]">
                          [{c.senderRole}] {c.senderName}
                        </span>
                      </div>
                      <p className="mt-0.5">{c.text}</p>
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
                  className="flex-1 px-2.5 py-1.5 text-xs rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)] border border-[var(--atc-cyan-border)]"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
