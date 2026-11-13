import {
  submitClearanceDecision,
  controllerFrequency,
  addRadioMessage,
  controllerCallsign,
} from "../../src/engine/decisionEngine.ts";
import { runwaySpokenName } from "../../src/data/asteriaAirport.ts";
import { nextId } from "../../src/engine/clearanceEngine.ts";
import { createScenarioSimulation, stepSimulation } from "../../src/engine/simulation.ts";
import type {
  AirportLayout,
  ClearanceCommandInput,
  ControllerRole,
  DifficultyLevel,
  LiveAdsbTrack,
  MultiplayerRoomState,
  ScenarioId,
  SimulationState,
} from "../../src/types/atc.ts";
import { convertLiveTracksToSimulation } from "../../src/utils/liveToSim.ts";
import { convertAirportBundleToLayout } from "../../src/utils/osmToAirport.ts";
import { DatabaseService } from "../db/DatabaseService.ts";
import { AirportGeometryService } from "./AirportGeometryService.ts";
import { CommunicationService } from "./CommunicationService.ts";
import { HandoffService } from "./HandoffService.ts";
import { ScoringService, type RoomScoreTracker } from "./ScoringService.ts";

export interface ConnectedClient {
  clientId: string;
  playerId: string;
  roomCode: string | null;
  send: (payload: unknown) => void;
}

interface InternalRoom {
  room: MultiplayerRoomState;
  sim: SimulationState;
  tracker: RoomScoreTracker;
  seenCommandIds: Set<string>;
  airportLayout: AirportLayout;
  clients: Map<string, ConnectedClient>; // clientId -> ConnectedClient
}

const ROLES: ControllerRole[] = ["GROUND", "TOWER", "DEPARTURE"];

function generateRoomCode(existing: Map<string, InternalRoom>): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 25; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!existing.has(code)) return code;
  }
  return `AC${Date.now().toString().slice(-4)}`;
}

function applyDifficultyToSim(sim: SimulationState, difficulty: DifficultyLevel): void {
  switch (difficulty) {
    case "EASY":
      sim.config.readbackErrorProbability = 0;
      sim.config.autoMinimumsGoAround = true;
      break;
    case "STANDARD":
      sim.config.readbackErrorProbability = 0.04;
      break;
    case "CHALLENGING":
      sim.config.readbackErrorProbability = 0.09;
      break;
    case "EXPERT":
      sim.config.readbackErrorProbability = 0.14;
      break;
  }
}

export class MultiplayerRoomService {
  private rooms = new Map<string, InternalRoom>();
  private db: DatabaseService;
  private geomService: AirportGeometryService;
  private handoffs = new HandoffService();
  private comms = new CommunicationService();
  private scoring = new ScoringService();
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(db: DatabaseService, geomService: AirportGeometryService) {
    this.db = db;
    this.geomService = geomService;
  }

  startClockLoop(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => {
      for (const ir of this.rooms.values()) {
        if (ir.room.status !== "ACTIVE" || ir.sim.paused) continue;
        const prevClearances = ir.sim.metrics.clearancesIssued;
        stepSimulation(ir.sim, 0.2 * ir.sim.timeScale);
        if (ir.sim.metrics.clearancesIssued !== prevClearances) {
          this.scoring.collectCompletedHandlingTimes(ir.tracker, ir.sim);
        }
        this.syncStationControlWithSlots(ir);
        // Omit static sim.airport on 5 Hz ticks to keep deltas tiny (~15 KB vs ~1.6 MB)
        this.broadcastRoomState(ir, false);
      }
    }, 200);
  }

  stopClockLoop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private syncStationControlWithSlots(ir: InternalRoom): void {
    for (const role of ROLES) {
      const slot = ir.room.slots[role];
      const humanActive = Boolean(slot.playerId && slot.connected && !slot.aiTakeover);
      ir.sim.config.stationControl[role] = humanActive ? "PLAYER" : "AUTONOMOUS";
    }
  }

  async createRoom(opts: {
    hostPlayerId: string;
    hostName: string;
    airportIcao: string;
    scenarioId?: ScenarioId;
    difficulty?: DifficultyLevel;
    preferredRole?: ControllerRole;
    fallbackLayout?: AirportLayout;
    liveTracks?: LiveAdsbTrack[];
  }): Promise<{ ok: boolean; room?: MultiplayerRoomState; error?: string }> {
    const icao = opts.airportIcao.trim().toUpperCase();
    let airportLayout = opts.fallbackLayout;
    let airportName = opts.fallbackLayout?.name ?? icao;

    const loaded = await this.geomService.getOrImportGeometry(icao, true);
    if (loaded.airport) {
      airportLayout = convertAirportBundleToLayout(loaded.airport);
      airportName = loaded.airport.name;
    }

    if (!airportLayout) {
      return { ok: false, error: `Airport ${icao} not available.` };
    }

    const roomCode = generateRoomCode(this.rooms);
    const scenarioId = opts.scenarioId ?? "MEDIUM";
    const difficulty = opts.difficulty ?? "STANDARD";
    const hostRole = opts.preferredRole ?? "TOWER";
    const now = Date.now();

    const makeSlot = (role: ControllerRole): MultiplayerRoomState["slots"][ControllerRole] => ({
      role,
      playerId: role === hostRole ? opts.hostPlayerId : null,
      playerName: role === hostRole ? opts.hostName : null,
      connected: role === hostRole,
      ready: role === hostRole,
      aiTakeover: role !== hostRole,
      lastSeenMs: now,
    });

    const room: MultiplayerRoomState = {
      roomCode,
      hostPlayerId: opts.hostPlayerId,
      airportIcao: icao,
      airportName,
      scenarioId,
      difficulty,
      status: "LOBBY",
      slots: {
        GROUND: makeSlot("GROUND"),
        TOWER: makeSlot("TOWER"),
        DEPARTURE: makeSlot("DEPARTURE"),
      },
      handoffs: [],
      chat: [],
      report: null,
      createdAtMs: now,
    };

    let sim: SimulationState | null = null;
    if (opts.liveTracks && opts.liveTracks.length > 0 && loaded.airport) {
      const conv = convertLiveTracksToSimulation({
        airportRecord: loaded.airport,
        customLayout: airportLayout,
        tracks: opts.liveTracks,
        activeStation: hostRole,
        scenarioId,
      });
      if (conv.convertedCount > 0) {
        sim = conv.sim;
      }
    }
    if (!sim) {
      sim = createScenarioSimulation(scenarioId, hostRole, icao, airportLayout);
    }
    applyDifficultyToSim(sim, difficulty);

    const ir: InternalRoom = {
      room,
      sim,
      tracker: this.scoring.createTracker(),
      seenCommandIds: new Set<string>(),
      airportLayout,
      clients: new Map(),
    };
    this.syncStationControlWithSlots(ir);
    this.comms.addMessage(room, {
      senderPlayerId: "SYSTEM",
      senderName: "SYSTEM",
      senderRole: "SYSTEM",
      text: `Room ${roomCode} created at ${icao} (${airportName}) by ${opts.hostName}.`,
    });

    this.rooms.set(roomCode, ir);
    this.db.saveRoomSession(room);
    return { ok: true, room };
  }

  getRoomSnapshot(roomCode: string): { room: MultiplayerRoomState; sim: SimulationState } | null {
    const ir = this.rooms.get(roomCode.toUpperCase());
    if (!ir) return null;
    return { room: ir.room, sim: ir.sim };
  }

  joinRoom(opts: {
    roomCode: string;
    playerId: string;
    playerName: string;
    preferredRole?: ControllerRole;
    client?: ConnectedClient;
  }): { ok: boolean; room?: MultiplayerRoomState; sim?: SimulationState; assignedRole?: ControllerRole | null; error?: string } {
    const code = opts.roomCode.trim().toUpperCase();
    const ir = this.rooms.get(code);
    if (!ir) return { ok: false, error: `Room ${code} not found.` };

    // Check reconnection first
    let assignedRole: ControllerRole | null = null;
    for (const r of ROLES) {
      if (ir.room.slots[r].playerId === opts.playerId) {
        const wasDisconnected = !ir.room.slots[r].connected || ir.room.slots[r].aiTakeover;
        ir.room.slots[r].connected = true;
        ir.room.slots[r].aiTakeover = false;
        ir.room.slots[r].lastSeenMs = Date.now();
        ir.room.slots[r].playerName = opts.playerName;
        assignedRole = r;
        if (wasDisconnected) {
          this.comms.addMessage(ir.room, {
            senderPlayerId: "SYSTEM",
            senderName: "SYSTEM",
            senderRole: "SYSTEM",
            text: `${opts.playerName} reconnected to ${r} (AI handed control back).`,
          });
        }
        break;
      }
    }

    if (!assignedRole) {
      if (opts.preferredRole) {
        const prefSlot = ir.room.slots[opts.preferredRole];
        if (prefSlot.playerId && prefSlot.playerId !== opts.playerId && prefSlot.connected) {
          return {
            ok: false,
            error: `${opts.preferredRole} is already taken by ${prefSlot.playerName}. Choose an open role or join with Auto-Assign.`,
          };
        }
      }

      const targetRoles = opts.preferredRole
        ? [opts.preferredRole, ...ROLES.filter((r) => r !== opts.preferredRole)]
        : ROLES;
      for (const r of targetRoles) {
        if (!ir.room.slots[r].playerId) {
          ir.room.slots[r] = {
            role: r,
            playerId: opts.playerId,
            playerName: opts.playerName,
            connected: true,
            ready: false,
            aiTakeover: false,
            lastSeenMs: Date.now(),
          };
          assignedRole = r;
          this.comms.addMessage(ir.room, {
            senderPlayerId: "SYSTEM",
            senderName: "SYSTEM",
            senderRole: "SYSTEM",
            text: `${opts.playerName} joined position ${r}.`,
          });
          break;
        }
      }

      if (!assignedRole) {
        return {
          ok: false,
          error: `Room ${code} is full — all 3 ATC roles (GROUND, TOWER, DEPARTURE) are already taken.`,
        };
      }
    }

    if (opts.client) {
      opts.client.roomCode = code;
      ir.clients.set(opts.client.clientId, opts.client);
    }

    this.syncStationControlWithSlots(ir);
    this.db.saveRoomSession(ir.room);
    this.broadcastRoomState(ir);
    return { ok: true, room: ir.room, sim: ir.sim, assignedRole };
  }

  handleClientDisconnect(client: ConnectedClient): void {
    if (!client.roomCode) return;
    const ir = this.rooms.get(client.roomCode);
    if (!ir) return;
    ir.clients.delete(client.clientId);

    for (const role of ROLES) {
      const slot = ir.room.slots[role];
      if (slot.playerId === client.playerId) {
        slot.connected = false;
        slot.aiTakeover = true;
        slot.lastSeenMs = Date.now();
        this.comms.addMessage(ir.room, {
          senderPlayerId: "SYSTEM",
          senderName: "SYSTEM",
          senderRole: "SYSTEM",
          text: `${slot.playerName ?? role} disconnected from ${role}. AI assumed temporary control.`,
        });
      }
    }
    this.syncStationControlWithSlots(ir);
    this.db.saveRoomSession(ir.room);
    this.broadcastRoomState(ir);
  }

  claimRole(roomCode: string, playerId: string, playerName: string, targetRole: ControllerRole): { ok: boolean; error?: string } {
    const ir = this.rooms.get(roomCode.toUpperCase());
    if (!ir) return { ok: false, error: "Room not found." };
    const slot = ir.room.slots[targetRole];
    if (slot.playerId && slot.playerId !== playerId && slot.connected) {
      return { ok: false, error: `${targetRole} is currently occupied by ${slot.playerName}.` };
    }

    let previousName: string | null = null;
    for (const r of ROLES) {
      if (ir.room.slots[r].playerId === playerId) {
        previousName = previousName ?? ir.room.slots[r].playerName;
        ir.room.slots[r] = {
          role: r,
          playerId: null,
          playerName: null,
          connected: false,
          ready: false,
          aiTakeover: true,
          lastSeenMs: Date.now(),
        };
      }
    }

    ir.room.slots[targetRole] = {
      role: targetRole,
      playerId,
      playerName: playerName.trim() || previousName || "Controller",
      connected: true,
      ready: ir.room.hostPlayerId === playerId,
      aiTakeover: false,
      lastSeenMs: Date.now(),
    };
    this.syncStationControlWithSlots(ir);
    this.broadcastRoomState(ir);
    return { ok: true };
  }

  setReady(roomCode: string, playerId: string, ready: boolean): { ok: boolean; error?: string } {
    const ir = this.rooms.get(roomCode.toUpperCase());
    if (!ir) return { ok: false, error: "Room not found." };
    for (const r of ROLES) {
      if (ir.room.slots[r].playerId === playerId) {
        ir.room.slots[r].ready = ready;
        this.broadcastRoomState(ir);
        return { ok: true };
      }
    }
    return { ok: false, error: "Player does not hold a controller slot." };
  }

  async updateRoomConfig(
    roomCode: string,
    playerId: string,
    updates: { airportIcao?: string; scenarioId?: ScenarioId; difficulty?: DifficultyLevel }
  ): Promise<{ ok: boolean; error?: string }> {
    const ir = this.rooms.get(roomCode.toUpperCase());
    if (!ir) return { ok: false, error: "Room not found." };
    if (ir.room.hostPlayerId !== playerId) {
      return { ok: false, error: "Only the room host can update room settings." };
    }
    if (ir.room.status !== "LOBBY") {
      return { ok: false, error: "Cannot reconfigure airport after simulation started." };
    }

    if (updates.airportIcao) {
      const icao = updates.airportIcao.toUpperCase();
      const loaded = await this.geomService.getOrImportGeometry(icao, true);
      if (loaded.airport) {
        ir.airportLayout = convertAirportBundleToLayout(loaded.airport);
        ir.room.airportIcao = icao;
        ir.room.airportName = loaded.airport.name;
      }
    }
    if (updates.scenarioId) ir.room.scenarioId = updates.scenarioId;
    if (updates.difficulty) ir.room.difficulty = updates.difficulty;

    ir.sim = createScenarioSimulation(
      ir.room.scenarioId,
      "TOWER",
      ir.room.airportIcao,
      ir.airportLayout
    );
    applyDifficultyToSim(ir.sim, ir.room.difficulty);
    this.syncStationControlWithSlots(ir);
    this.broadcastRoomState(ir);
    return { ok: true };
  }

  startRoom(roomCode: string, playerId: string): { ok: boolean; error?: string } {
    const ir = this.rooms.get(roomCode.toUpperCase());
    if (!ir) return { ok: false, error: "Room not found." };
    if (ir.room.hostPlayerId !== playerId) {
      return { ok: false, error: "Only the room host may start the session." };
    }
    const connectedRoles = ROLES.filter((r) => {
      const s = ir.room.slots[r];
      return Boolean(s.playerId && s.connected);
    });
    if (connectedRoles.length < 2) {
      return {
        ok: false,
        error: "Minimum 2 human players required to start multiplayer. Share the room code with a teammate (unclaimed 3rd station runs on AI).",
      };
    }

    ir.room.status = "ACTIVE";
    ir.sim.paused = false;
    this.syncStationControlWithSlots(ir);
    const aiRoles = ROLES.filter((r) => !connectedRoles.includes(r));
    this.comms.addMessage(ir.room, {
      senderPlayerId: "SYSTEM",
      senderName: "SYSTEM",
      senderRole: "SYSTEM",
      text: `Simulation started at ${ir.room.airportIcao} (${ir.room.scenarioId}). Humans: ${connectedRoles.join(", ")}${
        aiRoles.length > 0 ? ` · AI Backup: ${aiRoles.join(", ")}` : " · All 3 human seats staffed"
      }.`,
    });
    this.db.saveRoomSession(ir.room);
    this.broadcastRoomState(ir);
    return { ok: true };
  }

  handleCommand(opts: {
    roomCode: string;
    playerId: string;
    commandId: string;
    cmd: ClearanceCommandInput;
    override?: boolean;
  }): { ok: boolean; reason: string } {
    const ir = this.rooms.get(opts.roomCode.toUpperCase());
    if (!ir) return { ok: false, reason: "Room not found." };
    if (opts.commandId && ir.seenCommandIds.has(opts.commandId)) {
      return { ok: false, reason: "Duplicate command ignored." };
    }
    if (opts.commandId) {
      ir.seenCommandIds.add(opts.commandId);
      if (ir.seenCommandIds.size > 1500) {
        const first = ir.seenCommandIds.values().next().value;
        if (first) ir.seenCommandIds.delete(first);
      }
    }

    // Determine player's assigned role
    const playerRole = ROLES.find((r) => ir.room.slots[r].playerId === opts.playerId);
    if (!playerRole) {
      return { ok: false, reason: "Observer / unassigned players cannot issue ATC clearances." };
    }

    // Strict role permission enforcement unless explicit host override
    if (!opts.override && opts.cmd.controller !== playerRole) {
      return {
        ok: false,
        reason: `Role restriction: you are ${playerRole} and cannot issue ${opts.cmd.controller} commands.`,
      };
    }

    const ac = ir.sim.aircraft[opts.cmd.aircraftId];
    if (!ac) {
      return { ok: false, reason: `Unknown aircraft ${opts.cmd.aircraftId}` };
    }

    if (
      !opts.override &&
      ac.controller !== playerRole &&
      ir.room.slots[ac.controller].playerId &&
      ir.room.slots[ac.controller].connected &&
      !ir.room.slots[ac.controller].aiTakeover
    ) {
      return {
        ok: false,
        reason: `${ac.callsign} is currently owned by ${ac.controller}. Request a handoff first.`,
      };
    }

    // Flow: Ground Control initiates Handoff req -> Tower accepts/rejects ->
    // transfer req to the plane with the signal -> freq change from plane -> Tower gets the plane
    if (opts.cmd.type === "HANDOFF") {
      const targetCtrl = opts.cmd.parameters?.targetController as ControllerRole | undefined;
      if (targetCtrl) {
        const ho = this.handoffs.initiateHandoff({
          room: ir.room,
          sim: ir.sim,
          aircraftId: ac.id,
          fromController: playerRole,
          toController: targetCtrl,
        });
        if (!ho.ok) {
          this.scoring.recordCommandResult(ir.tracker, playerRole, false);
          return { ok: false, reason: ho.error ?? "Handoff failed." };
        }

        // If target position is automated AI, AI accepts automatically -> issue transfer command to plane
        if (ho.handoff?.status === "ACCEPTED") {
          this.scoring.recordHandoffCompleted(ir.tracker, playerRole);
          const res = submitClearanceDecision(ir.sim, { ...opts.cmd, parameters: { ...opts.cmd.parameters, bypassPending: true } }, "PLAYER");
          this.scoring.recordCommandResult(ir.tracker, playerRole, res.ok, 1.0);

          const targetFreq = controllerFrequency(targetCtrl, ir.sim.airport);
          this.comms.addMessage(ir.room, {
            senderPlayerId: opts.playerId,
            senderName: ir.room.slots[playerRole].playerName ?? playerRole,
            senderRole: playerRole,
            text: `Handoff accepted: ${ac.callsign} frequency transfer sent to plane (contact on ${targetFreq}).`,
          });
          this.broadcastRoomState(ir, false);
          return {
            ok: res.ok,
            reason: res.reason ?? `Transferred ${ac.callsign} to ${targetCtrl}.`,
          };
        } else {
          // Target position is staffed by a human controller -> handoff request pending, awaiting accept/reject
          this.comms.addMessage(ir.room, {
            senderPlayerId: opts.playerId,
            senderName: ir.room.slots[playerRole].playerName ?? playerRole,
            senderRole: playerRole,
            text: `Handoff request: ${ac.callsign} (${playerRole} → ${targetCtrl}). Awaiting ${targetCtrl} acceptance.`,
          });
          this.broadcastRoomState(ir, false);
          return {
            ok: true,
            reason: `Handoff request sent to ${targetCtrl}. Awaiting acceptance.`,
          };
        }
      }
    }

    const responseSec =
      ac.pendingRequest && !ac.pendingRequest.resolved
        ? Math.max(0, ir.sim.time - ac.pendingRequest.requestedAt)
        : undefined;

    const res = submitClearanceDecision(ir.sim, opts.cmd, "PLAYER");
    this.scoring.recordCommandResult(ir.tracker, playerRole, res.ok, responseSec);
    this.broadcastRoomState(ir, false);
    return { ok: res.ok, reason: res.reason };
  }

  respondHandoff(opts: {
    roomCode: string;
    playerId: string;
    handoffId: string;
    accept: boolean;
  }): { ok: boolean; error?: string } {
    const ir = this.rooms.get(opts.roomCode.toUpperCase());
    if (!ir) return { ok: false, error: "Room not found." };
    const role = ROLES.find((r) => ir.room.slots[r].playerId === opts.playerId);
    if (!role) return { ok: false, error: "Not in a controller slot." };

    const res = this.handoffs.respondHandoff({
      room: ir.room,
      sim: ir.sim,
      handoffId: opts.handoffId,
      responderRole: role,
      accept: opts.accept,
    });
    if (!res.ok) return { ok: false, error: res.error };

    const h = res.handoff;
    if (h) {
      if (opts.accept) {
        this.scoring.recordHandoffCompleted(ir.tracker, h.fromController);

        const ac = ir.sim.aircraft[h.aircraftId];
        if (ac) {
          ac.controller = h.toController;
          ac.lastTransmissionAt = ir.sim.time;

          if (h.toController === "TOWER") {
            if (ac.flightKind === "ARRIVAL") {
              const rwy = ac.assignedApproach ?? ac.targetRunway;
              const msgText = `${controllerCallsign("TOWER", ir.sim.airport)}, ${ac.spokenCallsign}, inbound ILS runway ${runwaySpokenName(rwy)}, request landing clearance.`;
              ac.pendingRequest = {
                id: nextId(ir.sim, "req"),
                type: "LANDING",
                controller: "TOWER",
                message: msgText,
                requestedAt: ir.sim.time,
                runway: rwy,
                resolved: false,
              };
              addRadioMessage(ir.sim, {
                sender: ac.callsign,
                recipient: controllerCallsign("TOWER", ir.sim.airport),
                controller: "TOWER",
                aircraftId: ac.id,
                category: "PILOT_REQUEST",
                text: msgText,
              });
            } else if (ac.flightKind === "DEPARTURE") {
              const msgText = `${controllerCallsign("TOWER", ir.sim.airport)}, ${ac.spokenCallsign}, holding short runway ${runwaySpokenName(ac.targetRunway)}, ready for departure.`;
              ac.pendingRequest = {
                id: nextId(ir.sim, "req"),
                type: "TAKEOFF",
                controller: "TOWER",
                message: msgText,
                requestedAt: ir.sim.time,
                runway: ac.targetRunway,
                resolved: false,
              };
              addRadioMessage(ir.sim, {
                sender: ac.callsign,
                recipient: controllerCallsign("TOWER", ir.sim.airport),
                controller: "TOWER",
                aircraftId: ac.id,
                category: "PILOT_REQUEST",
                text: msgText,
              });
            }
          } else if (h.toController === "GROUND") {
            const msgText = `${controllerCallsign("GROUND", ir.sim.airport)}, ${ac.spokenCallsign}, clear of runway, request taxi to gate.`;
            ac.pendingRequest = {
              id: nextId(ir.sim, "req"),
              type: "TAXI",
              controller: "GROUND",
              message: msgText,
              requestedAt: ir.sim.time,
              resolved: false,
            };
            addRadioMessage(ir.sim, {
              sender: ac.callsign,
              recipient: controllerCallsign("GROUND", ir.sim.airport),
              controller: "GROUND",
              aircraftId: ac.id,
              category: "PILOT_REQUEST",
              text: msgText,
            });
          }
        }
      }

      this.comms.addMessage(ir.room, {
        senderPlayerId: opts.playerId,
        senderName: ir.room.slots[role].playerName ?? role,
        senderRole: role,
        text: `${role} ${opts.accept ? "ACCEPTED" : "REJECTED"} handoff of ${h.callsign} from ${h.fromController}.`,
      });
    }

    this.broadcastRoomState(ir, false);
    return { ok: true };
  }

  postChat(opts: {
    roomCode: string;
    playerId: string;
    text: string;
  }): { ok: boolean; error?: string } {
    const ir = this.rooms.get(opts.roomCode.toUpperCase());
    if (!ir || !opts.text.trim()) return { ok: false, error: "Invalid chat message." };
    const role = ROLES.find((r) => ir.room.slots[r].playerId === opts.playerId);
    this.comms.addMessage(ir.room, {
      senderPlayerId: opts.playerId,
      senderName: (role ? ir.room.slots[role].playerName : null) ?? "Controller",
      senderRole: role ?? "SYSTEM",
      text: opts.text,
    });
    this.broadcastRoomState(ir, false);
    return { ok: true };
  }

  endSession(roomCode: string, playerId: string): { ok: boolean; report?: MultiplayerRoomState["report"]; error?: string } {
    const ir = this.rooms.get(roomCode.toUpperCase());
    if (!ir) return { ok: false, error: "Room not found." };
    if (ir.room.hostPlayerId !== playerId) {
      return { ok: false, error: "Only host can finish session." };
    }
    ir.sim.paused = true;
    ir.room.status = "COMPLETED";
    const report = this.scoring.buildReport(ir.room, ir.sim, ir.tracker);
    ir.room.report = report;
    this.db.saveRoomSession(ir.room);
    this.db.saveSessionScore(report);
    this.broadcastRoomState(ir, true);
    for (const client of ir.clients.values()) {
      try {
        client.send({ type: "SESSION_ENDED", ok: true, report });
      } catch {
        // Ignore broken sockets; close handler cleans up
      }
    }
    return { ok: true, report };
  }

  getLiveReport(roomCode: string): MultiplayerRoomState["report"] {
    const ir = this.rooms.get(roomCode.toUpperCase());
    if (!ir) return null;
    return this.scoring.buildReport(ir.room, ir.sim, ir.tracker);
  }

  private broadcastRoomState(ir: InternalRoom, includeAirport = true): void {
    const simPayload: SimulationState = includeAirport
      ? ir.sim
      : ({
          ...ir.sim,
          airport: undefined as unknown as AirportLayout,
        } as SimulationState);
    const payload = {
      type: "ROOM_SYNC",
      room: ir.room,
      sim: simPayload,
    };
    for (const client of ir.clients.values()) {
      try {
        client.send(payload);
      } catch {
        // Ignore broken sockets; close handler cleans up
      }
    }
  }
}
