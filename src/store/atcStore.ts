import { create } from "zustand";
import {
  addRadioMessage,
  clearCrashSite,
  clearStoppedRunwayEmergency,
  controllerCallsign,
  dispatchCrashRescue,
  haltRunwayOperations,
  requestMedicalEvacuation,
  submitClearanceDecision,
  triggerEmergency,
  triggerRadioFailure,
} from "../engine/decisionEngine.ts";
import { runwaySpokenName } from "../data/asteriaAirport.ts";
import { nextId } from "../engine/clearanceEngine.ts";
import {
  createScenarioSimulation,
  setStationAutoAssist,
  shouldHearControllerAudio,
  spawnRandomTraffic,
  stepSimulation,
  switchPlayerStation,
  transitionScenarioSimulation,
} from "../engine/simulation.ts";
import { apiClient, MultiplayerWsClient } from "../services/apiClient.ts";
import type {
  AirportGeoJsonCollection,
  AirportId,
  AirportLayout,
  AirportRecord,
  ClearanceCommandInput,
  ControllerRole,
  DifficultyLevel,
  LiveAdsbTrack,
  MultiplayerRoomState,
  PlayerRoleMode,
  ScenarioId,
  SessionPerformanceReport,
  SimulationState,
} from "../types/atc.ts";
import {
  convertLiveTracksToSimulation,
  mergeLiveTracksIntoSimulation,
} from "../utils/liveToSim.ts";
import { offlineDb } from "../utils/offlineDb.ts";
import { convertAirportBundleToLayout } from "../utils/osmToAirport.ts";
import { radioAudio } from "../utils/radioAudio.ts";
import { speechPtt } from "../utils/speechRecognitionPtt.ts";
import type {
  CockpitControls,
  PilotChecklistItem,
  PilotConfig,
  PilotRadioRequestType,
} from "../types/pilot.ts";
import {
  DEFAULT_COCKPIT_CONTROLS,
  INITIAL_CHECKLIST_ITEMS,
  initializePilotSimulation,
  stepPilotFlightDeck,
} from "../engine/pilotEngine.ts";
import {
  clearSavedAirportId,
  loadSavedAirportId,
  loadSavedMinimizedPanels,
  loadSavedScenarioId,
  loadSavedSfxEnabled,
  loadSavedTheme,
  loadSavedVoiceEnabled,
  saveMinimizedPanels,
  saveSelectedAirportId,
  saveSelectedScenarioId,
  saveSfxEnabled,
  saveTheme,
  saveVoiceEnabled,
  type MinimizedPanelsState,
  type ThemeMode,
  type WorkbenchPanelKey,
} from "../utils/storage.ts";

export type AppMode =
  | "LANDING"
  | "GLOBAL_MAP"
  | "SIMULATION"
  | "LIVE_OBSERVATION"
  | "AIRPORT_EDITOR"
  | "MULTIPLAYER_LOBBY"
  | "PILOT_SETUP"
  | "PILOT_COCKPIT";

export type MobileViewTab = "RADAR" | "STRIPS" | "CLEARANCE" | "COMMS";

export interface CameraState {
  centerX: number;
  centerY: number;
  pixelsPerNm: number;
}

export function getPresetCameraForStation(
  role: PlayerRoleMode,
  layout?: AirportLayout
): CameraState {
  let minX = -0.5;
  let maxX = 0.5;
  let minY = -0.5;
  let maxY = 0.5;
  if (layout) {
    for (const r of Object.values(layout.runways)) {
      minX = Math.min(minX, r.thresholdX, r.endX);
      maxX = Math.max(maxX, r.thresholdX, r.endX);
      minY = Math.min(minY, r.thresholdY, r.endY);
      maxY = Math.max(maxY, r.thresholdY, r.endY);
    }
  }
  const hasRunways = Boolean(layout && Object.keys(layout.runways).length > 0);
  const midX = hasRunways ? (minX + maxX) / 2 : 0.02;
  const midY = hasRunways ? (minY + maxY) / 2 : 0.01;
  const span = layout ? Math.max(0.7, maxX - minX, maxY - minY) : 1.4;
  const scaleFactor = span > 1.8 ? 1.5 / span : 1;

  switch (role) {
    case "DELIVERY":
    case "GROUND":
      return {
        centerX: midX,
        centerY: midY,
        pixelsPerNm: Math.max(90, Math.round(260 * scaleFactor)),
      };
    case "TOWER":
      return {
        centerX: midX,
        centerY: midY,
        pixelsPerNm: Math.max(70, Math.round(190 * scaleFactor)),
      };
    case "DEPARTURE":
      return {
        centerX: midX,
        centerY: midY,
        pixelsPerNm: Math.max(24, Math.round(36 * scaleFactor)),
      };
    case "CENTER":
      return {
        centerX: midX,
        centerY: midY,
        pixelsPerNm: Math.max(16, Math.round(20 * scaleFactor)),
      };
    case "ALL":
    default:
      return {
        centerX: midX,
        centerY: midY,
        pixelsPerNm: Math.max(65, Math.round(180 * scaleFactor)),
      };
  }
}

export interface GlobalLoadingState {
  active: boolean;
  message?: string;
  submessage?: string;
}

interface AtcStore {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  globalLoading: GlobalLoadingState | null;
  setGlobalLoading: (active: boolean, message?: string, submessage?: string) => void;
  isOnline: boolean;
  setOnline: (online: boolean) => void;

  sim: SimulationState;
  tickVersion: number;
  lastSpokenRadioId: string | null;
  savedAirportId: AirportId | null;
  hasActiveSession: boolean;
  showAirportSelector: boolean;
  camera: CameraState;
  hoverPreviewRoute: string[] | null;
  lastFeedback: { ok: boolean; text: string; at: number } | null;
  showVerificationModal: boolean;
  showEmailModal: boolean;
  sfxEnabled: boolean;
  voiceEnabled: boolean;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  mobileTab: MobileViewTab;
  setMobileTab: (tab: MobileViewTab) => void;
  minimizedPanels: MinimizedPanelsState;
  togglePanelMinimized: (panel: WorkbenchPanelKey) => void;
  setPanelMinimized: (panel: WorkbenchPanelKey, minimized: boolean) => void;

  // Phase 2 Real Airport & OSM Data
  selectedAirportRecord: AirportRecord | null;
  selectedAirportGeoJson: AirportGeoJsonCollection | null;
  airportDetailLoading: boolean;
  airportDetailError: string | null;
  hydrateSavedRealAirport: () => Promise<void>;
  inspectGlobalAirport: (record: AirportRecord) => Promise<void>;
  resyncAirportOsmGeometry: (icao: string) => Promise<{ ok: boolean; featureCount: number; error?: string }>;
  launchRealAirportSimulation: (
    record: AirportRecord,
    scenarioId?: ScenarioId,
    initialRole?: PlayerRoleMode,
    switchToSimulation?: boolean
  ) => Promise<void>;
  launchSimulationFromLiveTraffic: (
    record: AirportRecord,
    providedTracks?: LiveAdsbTrack[],
    initialRole?: PlayerRoleMode
  ) => Promise<{ ok: boolean; count: number; error?: string }>;
  liveTrafficLoading: boolean;
  toggleLiveTraffic: (forceEnable?: boolean) => Promise<void>;
  pollLiveTraffic: () => Promise<void>;
  saveEditedAirportGeometry: (
    icao: string,
    geojson: AirportGeoJsonCollection
  ) => Promise<{ ok: boolean; error?: string }>;
  syncPendingOfflineEdits: () => Promise<void>;

  // Phase 2 Multiplayer State & Actions
  playerId: string;
  playerName: string;
  setPlayerName: (name: string) => void;
  multiplayerConnected: boolean;
  roomState: MultiplayerRoomState | null;
  assignedRole: ControllerRole | null;
  multiplayerError: string | null;
  postSessionReport: SessionPerformanceReport | null;
  clearPostSessionReport: () => void;
  createMultiplayerRoom: (params: {
    airportIcao: string;
    scenarioId: ScenarioId;
    difficulty: DifficultyLevel;
    preferredRole?: ControllerRole;
    seedFromLive?: boolean;
  }) => Promise<string | null>;
  joinMultiplayerRoom: (roomCode: string, preferredRole?: ControllerRole) => void;
  claimMultiplayerRole: (role: ControllerRole) => void;
  setMultiplayerReady: (ready: boolean) => void;
  updateMultiplayerConfig: (cfg: {
    airportIcao?: string;
    scenarioId?: ScenarioId;
    difficulty?: DifficultyLevel;
  }) => void;
  startMultiplayerRoom: () => void;
  claimAircraftStation: (aircraftId: string, targetController: ControllerRole) => void;
  respondToHandoff: (handoffId: string, accept: boolean) => void;
  sendMultiplayerChat: (text: string) => void;
  endMultiplayerSession: () => void;
  leaveMultiplayerRoom: () => void;

  // Phase 1 Core Simulation Actions (preserved)
  tick: (realDtSeconds: number) => void;
  selectAircraft: (id: string | null) => void;
  focusAircraft: (id: string) => void;
  switchStation: (role: PlayerRoleMode) => void;
  toggleAutoAssist: () => void;
  loadScenario: (scenarioId: ScenarioId) => void;
  selectAndSaveAirport: (
    airportId: AirportId,
    scenarioId?: ScenarioId,
    initialRole?: PlayerRoleMode
  ) => void;
  openAirportSelector: () => void;
  forgetSavedAirport: () => void;
  removeLocalOfflineMap: (icao?: string) => Promise<void>;
  togglePause: () => void;
  setTimeScale: (scale: 1 | 2 | 4) => void;
  issueClearance: (
    cmd: Omit<ClearanceCommandInput, "controller"> & { controller?: ControllerRole },
    override?: boolean,
    isVoice?: boolean
  ) => { ok: boolean; reason?: string };
  armReadbackError: (aircraftId: string) => void;
  causeRadioFailure: (aircraftId: string) => void;
  causeEmergency: (
    aircraftId: string,
    type: "ENGINE_FAILURE" | "REJECTED_TAKEOFF_ABORT" | "MEDICAL"
  ) => void;
  towDisabledAircraft: (aircraftId: string) => void;
  dispatchCrashRescue: (aircraftId: string) => void;
  haltRunwayOperations: (runwayId: string, aircraftId?: string) => void;
  requestMedicalEvacuation: (aircraftId: string) => void;
  clearCrashSite: (aircraftId: string) => void;
  spawnFlight: (kind: "DEPARTURE" | "ARRIVAL") => void;
  setCamera: (cam: Partial<CameraState>) => void;
  zoomAtPoint: (factor: number, worldX?: number, worldY?: number) => void;
  resetCameraForStation: (role?: PlayerRoleMode) => void;
  setHoverPreviewRoute: (nodeIds: string[] | null) => void;
  setShowVerificationModal: (open: boolean) => void;
  setShowEmailModal: (open: boolean) => void;
  toggleSfx: () => void;
  toggleVoice: () => void;
  setVoiceEnabled: (enabled: boolean) => void;

  // Pilot Simulator State & Actions
  pilotConfig: PilotConfig | null;
  cockpitControls: CockpitControls;
  cockpitChecklist: PilotChecklistItem[];
  pilotAircraftId: string | null;
  setPilotConfig: (config: PilotConfig | null) => void;
  launchPilotFlight: (config: PilotConfig) => Promise<void>;
  updateCockpitControls: (patch: Partial<CockpitControls>) => void;
  toggleChecklistItem: (id: string) => void;
  transmitPilotRadioRequest: (requestType: PilotRadioRequestType) => void;
}

export function collectNewMessagesSince(
  radioLog: SimulationState["radioLog"],
  prevLastId: string | null
): SimulationState["radioLog"] {
  if (radioLog.length === 0) return [];
  if (!prevLastId) return radioLog;
  for (let i = radioLog.length - 1; i >= 0; i--) {
    if (radioLog[i].id === prevLastId) {
      return radioLog.slice(i + 1);
    }
  }
  return radioLog;
}

const spokenRadioMsgIds = new Set<string>();

function dispatchRadioMessagesAudio(
  sim: SimulationState,
  messages: SimulationState["radioLog"],
  onUpdate?: () => void,
  skipAtcClearanceSpeech = false
): void {
  // Sync radio audio mode: single role mode is synchronous, ALL mode is async with ducking
  radioAudio.syncMode = sim.config.activePlayerStation !== "ALL";

  for (const msg of messages) {
    if (spokenRadioMsgIds.has(msg.id)) {
      continue;
    }
    // Never speak system messages, inter-controller coordination, handoff requests, or auto transmission notices
    if (
      msg.category === "SYSTEM" ||
      msg.sender === "SYSTEM" ||
      msg.sender === "CONSOLE" ||
      /\[(?:HANDOFF REQUEST|AUTO|SYSTEM|INTERCOM|COORDINATION)\]/i.test(msg.text) ||
      /\b(?:Awaiting acceptance|Transfer from .* to .*)\b/i.test(msg.text) ||
      /\bPlayer assumed\b/i.test(msg.text)
    ) {
      spokenRadioMsgIds.add(msg.id);
      continue;
    }
    if (!shouldHearControllerAudio(sim.config.activePlayerStation, msg.controller)) {
      continue;
    }
    spokenRadioMsgIds.add(msg.id);

    if (msg.category === "READBACK_ERROR") {
      radioAudio.speakRadio(msg.text, "PILOT", msg.aircraftId ?? msg.sender, true, undefined, "ERROR");
    } else if (msg.category === "EMERGENCY") {
      radioAudio.speakRadio(msg.text, "PILOT", msg.aircraftId ?? msg.sender, true, undefined, "ALERT");
    } else if (msg.category === "PILOT_READBACK") {
      const ac = msg.aircraftId ? sim.aircraft[msg.aircraftId] : undefined;
      radioAudio.speakRadio(msg.text, "PILOT", msg.aircraftId ?? msg.sender, true, () => {
        if (ac) {
          ac.voiceGated = false;
        }
        if (onUpdate) onUpdate();
        else useAtcStore.setState((s) => ({ tickVersion: s.tickVersion + 1 }));
      }, "PILOT");
    } else if (msg.category === "PILOT_REQUEST") {
      radioAudio.speakRadio(msg.text, "PILOT", msg.aircraftId ?? msg.sender, false, undefined, "PILOT");
    } else if (msg.category === "ATC_CLEARANCE") {
      const ac = msg.aircraftId ? sim.aircraft[msg.aircraftId] : undefined;
      const clr = ac?.clearances.find((c) => c.syncGated && c.lifecycle === "READBACK_PENDING");

      if (skipAtcClearanceSpeech) {
        // Voice command was spoken directly by the human user — do NOT repeat controller speech out loud!
        // Release the sync gate immediately so the pilot reads back directly from the aircraft.
        if (clr && ac) {
          clr.syncGated = false;
          clr.readbackDueAt = sim.time;
          if (onUpdate) onUpdate();
          else useAtcStore.setState((s) => ({ tickVersion: s.tickVersion + 1 }));
        } else if (ac) {
          ac.voiceGated = false;
          if (onUpdate) onUpdate();
          else useAtcStore.setState((s) => ({ tickVersion: s.tickVersion + 1 }));
        }
      } else {
        if (clr && ac) {
          // Speak ATC command synchronously: when controller finishes speaking,
          // release the sync gate so the pilot reads back AFTER the controller!
          radioAudio.speakRadio(msg.text, "CONTROLLER", msg.controller, true, () => {
            clr.syncGated = false;
            clr.readbackDueAt = sim.time;
            if (onUpdate) onUpdate();
            else useAtcStore.setState((s) => ({ tickVersion: s.tickVersion + 1 }));
          }, "ATC");
        } else {
          radioAudio.speakRadio(msg.text, "CONTROLLER", msg.controller, true, () => {
            // If no pending pilot readback to follow, release aircraft voice gate upon ATC speech completion
            if (ac && (!clr || clr.lifecycle !== "READBACK_PENDING")) {
              ac.voiceGated = false;
              if (onUpdate) onUpdate();
              else useAtcStore.setState((s) => ({ tickVersion: s.tickVersion + 1 }));
            }
          }, "ATC");
        }
      }
    }
  }
}

function getOrCreatePlayerId(): string {
  if (typeof window === "undefined") return `ctrl_${Math.random().toString(36).slice(2, 8)}`;
  try {
    // Use sessionStorage so multiple tabs in the same browser represent distinct controllers,
    // while refreshing the same tab preserves the playerId for seamless seat reconnection.
    const key = "aircommand_tab_player_id_v1";
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const generated = `ctrl_${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(key, generated);
    return generated;
  } catch {
    return `ctrl_${Math.random().toString(36).slice(2, 8)}`;
  }
}

function getOrCreatePlayerName(): string {
  if (typeof window === "undefined") return "Controller 1";
  try {
    return window.localStorage.getItem("aircommand_player_name_v1") || "Controller 1";
  } catch {
    return "Controller 1";
  }
}

const initialSavedAirport = loadSavedAirportId();
const initialSavedScenario = loadSavedScenarioId();
const initialSavedTheme = loadSavedTheme();
const initialSavedVoice = loadSavedVoiceEnabled();
const initialSavedSfx = loadSavedSfxEnabled();
const initialMinimizedPanels = loadSavedMinimizedPanels();
radioAudio.voiceEnabled = initialSavedVoice;
radioAudio.sfxEnabled = initialSavedSfx;
const LEGACY_IDS = new Set(["KAST", "KMRD", "KVEL", "KSOL"]);

let wsClientSingleton: MultiplayerWsClient | null = null;

function ensureWsClient(set: (fn: (s: AtcStore) => Partial<AtcStore>) => void, get: () => AtcStore): MultiplayerWsClient {
  if (wsClientSingleton) return wsClientSingleton;

  wsClientSingleton = new MultiplayerWsClient({
    onOpen: () => {
      set(() => ({ multiplayerConnected: true, multiplayerError: null }));
    },
    onClose: () => {
      set(() => ({ multiplayerConnected: false }));
    },
    onError: (error) => {
      set(() => ({ multiplayerError: error }));
    },
    onJoinResult: (payload) => {
      if (!payload.ok) {
        set(() => ({ multiplayerError: payload.error ?? "Failed to join room" }));
        return;
      }
      const curState = get();
      const joinedRole = payload.assignedRole ?? payload.role ?? curState.assignedRole;
      const incomingSim = payload.sim;
      if (incomingSim) {
        if (!incomingSim.airport && curState.sim.airport.icao === payload.room?.airportIcao) {
          incomingSim.airport = curState.sim.airport;
        }
        if (joinedRole) {
          incomingSim.config.activePlayerStation = joinedRole;
        }
      }
      const isNowActive = payload.room?.status === "ACTIVE";
      set((s) => ({
        multiplayerError: null,
        roomState: payload.room ?? s.roomState,
        assignedRole: joinedRole,
        sim: incomingSim ?? s.sim,
        tickVersion: incomingSim ? s.tickVersion + 1 : s.tickVersion,
        appMode: isNowActive ? "SIMULATION" : "MULTIPLAYER_LOBBY",
        camera:
          isNowActive && (incomingSim ?? s.sim).airport
            ? getPresetCameraForStation(joinedRole ?? "TOWER", (incomingSim ?? s.sim).airport)
            : s.camera,
      }));
    },
    onActionResult: (payload) => {
      const errText = payload.error ?? payload.reason;
      if (!payload.ok && errText) {
        radioAudio.playRadioClick("ERROR");
        set((s) => ({
          multiplayerError: errText,
          lastFeedback: { ok: false, text: errText, at: s.sim.time },
        }));
      }
    },
    onCommandResult: (payload) => {
      if (!payload.ok) {
        radioAudio.playRadioClick("ERROR");
      }
      set((s) => ({
        lastFeedback: { ok: payload.ok, text: payload.reason, at: s.sim.time },
      }));
    },
    onRoomSync: (room, remoteSim) => {
      const state = get();
      const prevSelected = state.sim.selectedAircraftId;
      const prevLastMsg = state.sim.radioLog[state.sim.radioLog.length - 1]?.id ?? null;

      // Merge cached static airport layout when 5 Hz tick deltas omit unchanged geometry
      if (!remoteSim.airport) {
        remoteSim.airport = state.sim.airport;
      }

      // Determine this client's role in the multiplayer room
      const myRole =
        (["DELIVERY", "GROUND", "TOWER", "DEPARTURE", "CENTER"] as ControllerRole[]).find(
          (r) => room.slots[r].playerId === state.playerId
        ) ?? state.assignedRole;

      // Preserve user's locally selected aircraft unless it disappeared
      if (prevSelected && remoteSim.aircraft[prevSelected]) {
        remoteSim.selectedAircraftId = prevSelected;
      }

      if (myRole) {
        remoteSim.config.activePlayerStation = myRole;
      }

      // Play only NEW radio messages filtered to this controller's frequency
      const newMessages = collectNewMessagesSince(remoteSim.radioLog, prevLastMsg);
      if (room.status === "ACTIVE") {
        dispatchRadioMessagesAudio(remoteSim, newMessages);
      }

      const switchedToActive = room.status === "ACTIVE" && state.appMode === "MULTIPLAYER_LOBBY";
      const sessionCompleted = room.status === "COMPLETED" && Boolean(room.report);
      if (sessionCompleted) {
        radioAudio.stopAllSpeech();
      }
      set((s) => ({
        roomState: room,
        assignedRole: myRole ?? null,
        sim: remoteSim,
        tickVersion: s.tickVersion + 1,
        postSessionReport: sessionCompleted ? room.report : s.postSessionReport,
        appMode: sessionCompleted
          ? "MULTIPLAYER_LOBBY"
          : switchedToActive
          ? "SIMULATION"
          : s.appMode,
        camera: switchedToActive
          ? getPresetCameraForStation(myRole ?? "TOWER", remoteSim.airport)
          : s.camera,
        lastSpokenRadioId:
          remoteSim.radioLog[remoteSim.radioLog.length - 1]?.id ?? s.lastSpokenRadioId,
      }));
    },
    onSessionEnded: (report, error) => {
      if (error && !report) {
        radioAudio.playRadioClick("ERROR");
        set((s) => ({
          multiplayerError: error,
          lastFeedback: { ok: false, text: error, at: s.sim.time },
        }));
        return;
      }
      radioAudio.stopAllSpeech();
      set(() => ({
        postSessionReport: report ?? null,
        appMode: "MULTIPLAYER_LOBBY",
      }));
    },
  });

  return wsClientSingleton;
}

async function tryLoadStaticOsmPack(icao: string): Promise<AirportGeoJsonCollection | null> {
  if (typeof fetch === "undefined") return null;
  try {
    const res = await fetch(`/data/osm/${icao.toUpperCase()}.geojson`);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.trim().length === 0) return null;
    const parsed = JSON.parse(text) as AirportGeoJsonCollection;
    if (
      parsed &&
      parsed.type === "FeatureCollection" &&
      Array.isArray(parsed.features) &&
      parsed.features.length > 0
    ) {
      return parsed;
    }
  } catch {
    // Offline or bundled pack not present for this ICAO
  }
  return null;
}

async function resolveAirportBundle(
  record: AirportRecord,
  isOnline: boolean,
  forceRefresh = false
): Promise<{
  airport: AirportRecord;
  geojson: AirportGeoJsonCollection | null;
  error: string | null;
}> {
  const icao = record.icao.toUpperCase();
  const cachedGeom = !forceRefresh ? await offlineDb.getCachedGeometry(icao) : undefined;

  if (
    cachedGeom &&
    ((cachedGeom.dataQuality === "Manually edited" && cachedGeom.geojson.features.length >= 20) ||
      !isOnline)
  ) {
    return {
      airport: {
        ...record,
        dataQuality: cachedGeom.dataQuality,
        hasOsmGeometry: cachedGeom.geojson.features.length > 0,
        geoJson: cachedGeom.geojson,
      },
      geojson: cachedGeom.geojson,
      error: null,
    };
  }

  let activeRecord = record;
  let geojson: AirportGeoJsonCollection | null = record.geoJson ?? cachedGeom?.geojson ?? null;
  let detailError: string | null = null;

  if (isOnline) {
    try {
      const detail = await apiClient.getAirportDetail(icao, true, forceRefresh);
      activeRecord = detail.airport;
      geojson = detail.geojson ?? geojson;
      detailError = detail.error;
      await offlineDb.cacheAirports([detail.airport]);
    } catch (err) {
      detailError = (err as Error).message;
    }
  }

  if (!geojson || geojson.features.length < 15 || forceRefresh) {
    const pack = await tryLoadStaticOsmPack(icao);
    if (pack && (!geojson || pack.features.length > geojson.features.length || forceRefresh)) {
      geojson = pack;
      const quality: AirportRecord["dataQuality"] = pack.features.some(
        (f) => f.properties.aeroway === "taxiway"
      )
        ? "Imported"
        : activeRecord.dataQuality;
      activeRecord = {
        ...activeRecord,
        dataQuality: quality,
        hasOsmGeometry: true,
        geoJson: pack,
      };
      detailError = null;
    }
  }

  if (geojson && geojson.features.length > 0) {
    await offlineDb.cacheGeometry({
      icao,
      geojson,
      dataQuality: activeRecord.dataQuality,
      updatedAt: new Date().toISOString(),
      pendingSync: false,
    });
    detailError = null;
  } else if (activeRecord.runways && activeRecord.runways.length > 0) {
    // If OurAirports has verified runways, layout builds cleanly without error
    detailError = null;
  } else if (!isOnline && !detailError) {
    detailError =
      "Offline mode — using OurAirports runway metadata (OSM geometry cached when online).";
  }

  return {
    airport: activeRecord,
    geojson,
    error: detailError,
  };
}

export const useAtcStore = create<AtcStore>((set, get) => ({
  appMode: "LANDING",
  globalLoading: null,
  setGlobalLoading: (active, message, submessage) => {
    if (!active) {
      set({ globalLoading: null });
    } else {
      set({ globalLoading: { active: true, message, submessage } });
    }
  },
  setAppMode: (mode) => {
    radioAudio.stopAllSpeech();
    speechPtt.cancel();
    if (mode === "SIMULATION") {
      get().sim.paused = false;
    }
    const modeInfo: Record<AppMode, { msg: string; sub: string }> = {
      LANDING: {
        msg: "Returning to Operations Terminal",
        sub: "TRANSITING AIRSPACE · DISCONNECTING SCOPES",
      },
      GLOBAL_MAP: {
        msg: "Loading Global Airspace & FIR Charts",
        sub: "PARSING AIRFIELD VECTORS & RUNWAY GEOMETRY",
      },
      SIMULATION: {
        msg: "Establishing Radar Control Scope",
        sub: "CALIBRATING AIRSPACE SECTORS & FREQUENCIES",
      },
      LIVE_OBSERVATION: {
        msg: "Synchronizing Global ADS-B Traffic",
        sub: "STREAMING LIVE TRANSPONDER TELEMETRY",
      },
      AIRPORT_EDITOR: {
        msg: "Loading Airport CAD Suite",
        sub: "INITIALIZING VECTOR SURFACE LAYERS",
      },
      MULTIPLAYER_LOBBY: {
        msg: "Connecting to ATC Relay Center",
        sub: "DISCOVERING MULTIPLAYER CONTROL TOWERS",
      },
      PILOT_SETUP: {
        msg: "Opening Flight Dispatch & Briefing",
        sub: "SELECTING AIRFRAME, AIRLINE & DISPATCH ROUTE",
      },
      PILOT_COCKPIT: {
        msg: "Powering Flight Deck Avionics",
        sub: "CALIBRATING PFD, ND & VHF TRANSCEIVER",
      },
    };
    const info = modeInfo[mode] || {
      msg: "Loading Airspace Data...",
      sub: "CRUISING FLIGHT LEVEL",
    };

    set({
      appMode: mode,
      showAirportSelector: mode === "GLOBAL_MAP",
      globalLoading: { active: true, message: info.msg, submessage: info.sub },
    });

    setTimeout(() => {
      const cur = get().globalLoading;
      if (cur?.message === info.msg) {
        set({ globalLoading: null });
      }
    }, 450);
  },
  isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
  setOnline: (online) => set({ isOnline: online }),

  sim: createScenarioSimulation(
    initialSavedScenario,
    "ALL",
    initialSavedAirport ?? "KAST",
    undefined,
    { randomize: true }
  ),
  tickVersion: 0,
  lastSpokenRadioId: null,
  savedAirportId: initialSavedAirport,
  hasActiveSession: Boolean(initialSavedAirport),
  showAirportSelector: initialSavedAirport === null,
  camera: getPresetCameraForStation("ALL"),
  hoverPreviewRoute: null,
  lastFeedback: null,
  showVerificationModal: false,
  showEmailModal: false,
  sfxEnabled: initialSavedSfx,
  voiceEnabled: initialSavedVoice,
  theme: initialSavedTheme,
  mobileTab: "RADAR",
  setMobileTab: (tab) => set({ mobileTab: tab }),
  minimizedPanels: initialMinimizedPanels,

  // Pilot Simulator Initial State
  pilotConfig: null,
  cockpitControls: DEFAULT_COCKPIT_CONTROLS,
  cockpitChecklist: INITIAL_CHECKLIST_ITEMS,
  pilotAircraftId: null,

  selectedAirportRecord: null,
  selectedAirportGeoJson: null,
  airportDetailLoading: false,
  airportDetailError: null,
  liveTrafficLoading: false,

  playerId: getOrCreatePlayerId(),
  playerName: getOrCreatePlayerName(),
  setPlayerName: (name) => {
    const clean = name.trim() || "Controller 1";
    try {
      window.localStorage.setItem("aircommand_player_name_v1", clean);
    } catch {
      // ignore
    }
    set({ playerName: clean });
  },
  multiplayerConnected: false,
  roomState: null,
  assignedRole: null,
  multiplayerError: null,
  postSessionReport: null,
  clearPostSessionReport: () => set({ postSessionReport: null }),

  setTheme: (theme: ThemeMode) => {
    saveTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next: ThemeMode = get().theme === "light" ? "dark" : "light";
    saveTheme(next);
    set({ theme: next });
  },
  togglePanelMinimized: (panel: WorkbenchPanelKey) => {
    const prev = get().minimizedPanels;
    const next: MinimizedPanelsState = { ...prev, [panel]: !prev[panel] };
    saveMinimizedPanels(next);
    set({ minimizedPanels: next });
  },
  setPanelMinimized: (panel: WorkbenchPanelKey, minimized: boolean) => {
    const prev = get().minimizedPanels;
    if (prev[panel] === minimized) return;
    const next: MinimizedPanelsState = { ...prev, [panel]: minimized };
    saveMinimizedPanels(next);
    set({ minimizedPanels: next });
  },

  hydrateSavedRealAirport: async () => {
    const saved = get().savedAirportId;
    if (!saved || LEGACY_IDS.has(saved)) return;
    const bundled = offlineDb.getBundledFallbackAirport(saved);
    const cachedGeom = await offlineDb.getCachedGeometry(saved);
    if (bundled) {
      // Background cache hydration must NEVER force redirection away from LANDING/home
      await get().launchRealAirportSimulation(
        bundled,
        get().sim.scenarioId,
        get().sim.config.activePlayerStation,
        false
      );
      return;
    }
    try {
      const detail = await apiClient.getAirportDetail(saved, !cachedGeom);
      await offlineDb.cacheAirports([detail.airport]);
      if (detail.geojson) {
        await offlineDb.cacheGeometry({
          icao: detail.airport.icao,
          geojson: detail.geojson,
          dataQuality: detail.airport.dataQuality,
          updatedAt: new Date().toISOString(),
          pendingSync: false,
        });
      }
      // Background cache hydration must NEVER force redirection away from LANDING/home
      await get().launchRealAirportSimulation(
        detail.airport,
        get().sim.scenarioId,
        get().sim.config.activePlayerStation,
        false
      );
    } catch {
      // Keep fallback cleanly if both cache & server unavailable
    }
  },

  inspectGlobalAirport: async (record) => {
    set({
      selectedAirportRecord: record,
      selectedAirportGeoJson: record.geoJson ?? null,
      airportDetailLoading: true,
      airportDetailError: null,
    });

    const resolved = await resolveAirportBundle(record, get().isOnline, false);
    set({
      selectedAirportRecord: resolved.airport,
      selectedAirportGeoJson: resolved.geojson,
      airportDetailLoading: false,
      airportDetailError: resolved.error,
    });
  },

  resyncAirportOsmGeometry: async (icaoInput) => {
    const icao = icaoInput.trim().toUpperCase();
    const fallback = get().selectedAirportRecord ?? offlineDb.getBundledFallbackAirport(icao);
    if (!fallback) {
      return { ok: false, featureCount: 0, error: `Airport ${icao} metadata not loaded.` };
    }
    set({ airportDetailLoading: true, airportDetailError: null });
    const resolved = await resolveAirportBundle(fallback, get().isOnline, true);
    const featureCount = resolved.geojson?.features.length ?? 0;

    set({
      selectedAirportRecord: resolved.airport,
      selectedAirportGeoJson: resolved.geojson,
      airportDetailLoading: false,
      airportDetailError: resolved.error,
      lastFeedback: {
        ok: featureCount > 0,
        text:
          featureCount > 0
            ? `Synchronized real OpenStreetMap layout for ${icao} (${featureCount} features).`
            : resolved.error ?? `No OpenStreetMap geometry available for ${icao}.`,
        at: get().sim.time,
      },
    });

    if (featureCount > 0 && get().sim.airport.icao === icao) {
      const customLayout = convertAirportBundleToLayout({
        ...resolved.airport,
        geoJson: resolved.geojson,
      });
      const fresh = createScenarioSimulation(
        get().sim.scenarioId,
        get().sim.config.activePlayerStation,
        icao,
        customLayout,
        { randomize: true }
      );
      set({
        sim: fresh,
        camera: getPresetCameraForStation(fresh.config.activePlayerStation, fresh.airport),
      });
    }

    return { ok: featureCount > 0, featureCount, error: resolved.error ?? undefined };
  },

  launchRealAirportSimulation: async (
    record,
    scenarioId,
    initialRole = "ALL",
    switchToSimulation = true
  ) => {
    if (switchToSimulation) {
      radioAudio.stopAllSpeech();
      set({
        globalLoading: {
          active: true,
          message: `Entering ${record.icao} Radar Control`,
          submessage: "RESOLVING AIRFIELD GEOMETRY & RUNWAY VECTORS",
        },
      });
    }
    set({ airportDetailLoading: true, airportDetailError: null });

    const resolved = await resolveAirportBundle(record, get().isOnline, false);
    const activeRecord = resolved.airport;
    const geojson = resolved.geojson;

    const customLayout = convertAirportBundleToLayout({
      ...activeRecord,
      geoJson: geojson ?? activeRecord.geoJson,
    });
    const scen = scenarioId ?? get().sim.scenarioId;
    saveSelectedAirportId(activeRecord.icao);
    saveSelectedScenarioId(scen);

    // Fetch live ADS-B traffic snapshot if online
    let liveTracks: LiveAdsbTrack[] = [];
    let fetchedAtMs = Date.now();
    if (get().isOnline) {
      try {
        const snap = await apiClient.getLiveAdsb(activeRecord.lat, activeRecord.lon, 1.8);
        if (snap.tracks && snap.tracks.length > 0) {
          liveTracks = snap.tracks;
          fetchedAtMs = snap.fetchedAtMs;
        }
      } catch {
        // Fall back gracefully to scenario if network/cooldown occurs
      }
    }

    let fresh: SimulationState;
    let feedbackText: string;

    if (liveTracks.length > 0) {
      const conv = convertLiveTracksToSimulation({
        airportRecord: activeRecord,
        customLayout,
        tracks: liveTracks,
        activeStation: initialRole,
        scenarioId: scen,
        fetchedAtMs,
      });
      fresh = conv.sim;
      fresh.liveSnapshotMeta = {
        ...fresh.liveSnapshotMeta!,
        liveSyncEnabled: true,
        lastSyncStatus: "SYNCED",
        lastLivePollAtMs: fetchedAtMs,
        activeLiveCount: conv.convertedCount,
      };
      feedbackText = `Loaded ${activeRecord.name} (${activeRecord.icao}) with ${conv.convertedCount} real live ADS-B flights (${conv.groundCount} ground, ${conv.airborneCount} airborne).`;
    } else {
      fresh = createScenarioSimulation(scen, initialRole, activeRecord.icao, customLayout, { randomize: true });
      feedbackText = `Loaded ${activeRecord.name} (${activeRecord.icao}) [${activeRecord.dataQuality}] in ${
        initialRole === "ALL" ? "ALL AUTO" : initialRole
      } mode.`;
    }

    if (!switchToSimulation) {
      fresh.paused = true;
    }

    const currentMode = get().appMode;
    set({
      appMode: switchToSimulation ? "SIMULATION" : currentMode,
      showAirportSelector: false,
      savedAirportId: activeRecord.icao,
      hasActiveSession: true,
      selectedAirportRecord: activeRecord,
      selectedAirportGeoJson: geojson,
      airportDetailLoading: false,
      sim: fresh,
      tickVersion: 0,
      lastSpokenRadioId: null,
      roomState: null,
      assignedRole: null,
      camera: getPresetCameraForStation(initialRole, fresh.airport),
      hoverPreviewRoute: null,
      lastFeedback: {
        ok: true,
        text: feedbackText,
        at: 0,
      },
    });

    if (switchToSimulation) {
      setTimeout(() => {
        set({ globalLoading: null });
      }, 450);
    }
  },

  pollLiveTraffic: async () => {
    const { sim, selectedAirportRecord, isOnline, roomState, appMode } = get();
    if (!isOnline || appMode !== "SIMULATION" || (roomState && roomState.status === "ACTIVE")) return;
    if (!sim.liveSnapshotMeta?.liveSyncEnabled) return;
    const targetRecord = selectedAirportRecord || offlineDb.getBundledFallbackAirport(sim.airport.icao);
    if (!targetRecord || !targetRecord.lat || !targetRecord.lon) return;

    try {
      const snap = await apiClient.getLiveAdsb(targetRecord.lat, targetRecord.lon, 1.8);
      if (!snap || !snap.tracks) return;

      const { addedCount, updatedCount } = mergeLiveTracksIntoSimulation({
        sim,
        airportRecord: targetRecord,
        tracks: snap.tracks,
      });

      if (addedCount > 0 || updatedCount > 0) {
        set((s) => ({ tickVersion: s.tickVersion + 1 }));
      }
    } catch {
      // OpenSky cooldown or transient network error
    }
  },

  toggleLiveTraffic: async (forceEnable?: boolean) => {
    const { sim, selectedAirportRecord, isOnline, liveTrafficLoading } = get();
    if (liveTrafficLoading) return;

    const currentlyActive = Boolean(sim.liveSnapshotMeta?.liveSyncEnabled);
    const shouldEnable = forceEnable !== undefined ? forceEnable : !currentlyActive;

    if (!shouldEnable) {
      set({ liveTrafficLoading: true });
      radioAudio.stopAllSpeech();

      // Seamlessly disable live ADS-B sync while keeping all active aircraft and simulation clock intact
      sim.liveSnapshotMeta = {
        airportIcao: sim.airport.icao,
        fetchedAtMs: Date.now(),
        convertedCount: 0,
        source: "Simulated Traffic (Live ADS-B Off)",
        lastLivePollAtMs: 0,
        activeLiveCount: 0,
        liveSyncEnabled: false,
        lastSyncStatus: "OFFLINE",
        cachedTracks: [],
      };
      sim.config.autoSpawnTraffic = sim.scenarioId !== "SANDBOX";

      set({
        liveTrafficLoading: false,
        tickVersion: get().tickVersion + 1,
        lastFeedback: {
          ok: true,
          text: `Live traffic turned OFF at ${sim.airport.icao}. Operations continuing from current traffic state.`,
          at: sim.time,
        },
      });
      return;
    }

    set({ liveTrafficLoading: true });
    radioAudio.stopAllSpeech();

    const activeRecord = selectedAirportRecord || offlineDb.getBundledFallbackAirport(sim.airport.icao);
    if (!activeRecord) {
      set({ liveTrafficLoading: false });
      return;
    }

    let tracks: LiveAdsbTrack[] = [];
    let fetchedAtMs = Date.now();

    if (isOnline && activeRecord.lat && activeRecord.lon) {
      try {
        let snap = await apiClient.getLiveAdsb(activeRecord.lat, activeRecord.lon, 2.0);
        if (!snap.tracks || snap.tracks.length === 0) {
          snap = await apiClient.getLiveAdsb(activeRecord.lat, activeRecord.lon, 4.0);
        }
        if (snap.tracks && snap.tracks.length > 0) {
          tracks = snap.tracks;
          fetchedAtMs = snap.fetchedAtMs;
        }
      } catch {
        // Fall back gracefully
      }
    }

    const customLayout = sim.airport;
    const conv = convertLiveTracksToSimulation({
      airportRecord: activeRecord,
      customLayout,
      tracks,
      activeStation: sim.config.activePlayerStation,
      scenarioId: "MIXED",
      fetchedAtMs,
    });

    conv.sim.liveSnapshotMeta = {
      ...conv.sim.liveSnapshotMeta!,
      liveSyncEnabled: true,
      lastSyncStatus: "SYNCED",
      lastLivePollAtMs: fetchedAtMs,
      activeLiveCount: conv.sim.aircraftOrder.length,
    };

    set({
      sim: conv.sim,
      tickVersion: 0,
      liveTrafficLoading: false,
      lastFeedback: {
        ok: true,
        text: `Live traffic active at ${activeRecord.icao}: Populated ${conv.sim.aircraftOrder.length} real live flights (${conv.groundCount} on ground/taxiways, ${conv.airborneCount} airborne).`,
        at: 0,
      },
    });
  },

  launchSimulationFromLiveTraffic: async (record, providedTracks, initialRole = "ALL") => {
    radioAudio.stopAllSpeech();
    set({ airportDetailLoading: true, airportDetailError: null });

    const resolved = await resolveAirportBundle(record, get().isOnline, false);
    const activeRecord = resolved.airport;
    const geojson = resolved.geojson;

    let tracks = providedTracks ?? [];
    let fetchedAtMs = Date.now();
    if (tracks.length === 0 && get().isOnline) {
      try {
        const snap = await apiClient.getLiveAdsb(activeRecord.lat, activeRecord.lon, 1.8);
        tracks = snap.tracks;
        fetchedAtMs = snap.fetchedAtMs;
      } catch (err) {
        // Fall back gracefully to local scenario traffic if live ADS-B network request fails
        tracks = [];
      }
    }

    const customLayout = convertAirportBundleToLayout({
      ...activeRecord,
      geoJson: geojson ?? activeRecord.geoJson,
    });

    const conv = convertLiveTracksToSimulation({
      airportRecord: activeRecord,
      customLayout,
      tracks,
      activeStation: initialRole,
      scenarioId: "MIXED",
      fetchedAtMs,
    });

    saveSelectedAirportId(activeRecord.icao);
    saveSelectedScenarioId("MIXED");

    set({
      appMode: "SIMULATION",
      showAirportSelector: false,
      savedAirportId: activeRecord.icao,
      hasActiveSession: true,
      selectedAirportRecord: activeRecord,
      selectedAirportGeoJson: geojson,
      airportDetailLoading: false,
      sim: conv.sim,
      tickVersion: 0,
      lastSpokenRadioId: null,
      roomState: null,
      assignedRole: null,
      camera: getPresetCameraForStation(initialRole, conv.sim.airport),
      hoverPreviewRoute: null,
      lastFeedback: {
        ok: true,
        text:
          conv.convertedCount > 0
            ? `Converted ${conv.convertedCount} real ADS-B flights (${conv.groundCount} ground, ${conv.airborneCount} airborne) at ${activeRecord.icao} into active ATC simulation!`
            : `No live ADS-B traffic reported near ${activeRecord.icao} right now — airfield opened ready for spawned traffic.`,
        at: 0,
      },
    });

    return { ok: true, count: conv.convertedCount };
  },

  saveEditedAirportGeometry: async (icaoInput, geojson) => {
    const icao = icaoInput.toUpperCase();
    const now = new Date().toISOString();
    let syncedOnline = false;
    let errorMsg: string | undefined;

    if (get().isOnline) {
      try {
        const res = await apiClient.saveAirportGeometry(icao, geojson, "Manually edited");
        syncedOnline = Boolean(res.ok);
      } catch (err) {
        errorMsg = (err as Error).message;
      }
    }

    await offlineDb.cacheGeometry({
      icao,
      geojson,
      dataQuality: "Manually edited",
      updatedAt: now,
      pendingSync: !syncedOnline,
    });

    const curRec = get().selectedAirportRecord;
    if (curRec && curRec.icao === icao) {
      const updatedRecord: AirportRecord = {
        ...curRec,
        dataQuality: "Manually edited",
        hasOsmGeometry: true,
        geoJson: geojson,
      };
      set({
        selectedAirportRecord: updatedRecord,
        selectedAirportGeoJson: geojson,
        lastFeedback: {
          ok: true,
          text: syncedOnline
            ? `Saved geometry edits for ${icao} (server + offline cache).`
            : `Saved geometry edits for ${icao} locally (will sync when online).`,
          at: get().sim.time,
        },
      });

      // If currently loaded in simulation for this ICAO, refresh airport layout in-place safely
      if (get().sim.airport.icao === icao) {
        const customLayout = convertAirportBundleToLayout({
          ...updatedRecord,
          geoJson: geojson,
        });
        const fresh = createScenarioSimulation(
          get().sim.scenarioId,
          get().sim.config.activePlayerStation,
          icao,
          customLayout,
          { randomize: true }
        );
        set({
          sim: fresh,
          camera: getPresetCameraForStation(fresh.config.activePlayerStation, fresh.airport),
        });
      }
    }

    return syncedOnline ? { ok: true } : { ok: true, error: errorMsg ?? "Saved offline pending sync" };
  },

  syncPendingOfflineEdits: async () => {
    if (!get().isOnline) return;
    const pending = await offlineDb.getPendingGeometrySyncs();
    for (const item of pending) {
      try {
        await apiClient.saveAirportGeometry(item.icao, item.geojson, item.dataQuality);
        await offlineDb.cacheGeometry({ ...item, pendingSync: false });
      } catch {
        // Retry later
      }
    }
  },

  createMultiplayerRoom: async (params) => {
    if (!get().isOnline) {
      set({ multiplayerError: "Internet & AirCommand server required for online multiplayer." });
      return null;
    }
    try {
      set({ multiplayerError: null });
      const { playerId, playerName } = get();
      const res = await apiClient.createRoom({
        hostPlayerId: playerId,
        hostName: playerName,
        airportIcao: params.airportIcao,
        scenarioId: params.scenarioId,
        difficulty: params.difficulty,
        preferredRole: params.preferredRole,
        seedFromLive: params.seedFromLive,
      });
      const ws = ensureWsClient(set, get);
      ws.connect();
      ws.joinRoom({
        roomCode: res.room.roomCode,
        playerId,
        playerName,
        preferredRole: params.preferredRole,
      });
      set({ roomState: res.room, appMode: "MULTIPLAYER_LOBBY", postSessionReport: null });
      return res.room.roomCode;
    } catch (err) {
      set({ multiplayerError: (err as Error).message });
      return null;
    }
  },

  joinMultiplayerRoom: (roomCode, preferredRole) => {
    if (!get().isOnline) {
      set({ multiplayerError: "Internet & AirCommand server required for online multiplayer." });
      return;
    }
    const code = roomCode.trim().toUpperCase();
    if (!code) return;
    const ws = ensureWsClient(set, get);
    ws.connect();
    ws.joinRoom({
      roomCode: code,
      playerId: get().playerId,
      playerName: get().playerName,
      preferredRole,
    });
    set({ appMode: "MULTIPLAYER_LOBBY", multiplayerError: null, postSessionReport: null });
  },

  claimMultiplayerRole: (role) => {
    radioAudio.stopAllSpeech();
    speechPtt.cancel();
    ensureWsClient(set, get).claimRole(role, get().playerName);
  },

  setMultiplayerReady: (ready) => {
    ensureWsClient(set, get).setReady(ready);
  },

  updateMultiplayerConfig: (cfg) => {
    ensureWsClient(set, get).updateConfig(cfg);
  },

  startMultiplayerRoom: () => {
    ensureWsClient(set, get).startRoom();
  },

  respondToHandoff: (handoffId, accept) => {
    const { roomState, sim } = get();

    // If in multiplayer room, always notify the server via WebSocket
    if (roomState && roomState.status === "ACTIVE") {
      ensureWsClient(set, get).respondHandoff(handoffId, accept);
    }

    const allHandoffs = [
      ...(sim.handoffs ?? []),
      ...(roomState?.handoffs ?? []),
    ];

    const h =
      allHandoffs.find((item) => item.id === handoffId && item.status === "PENDING") ??
      allHandoffs.find((item) => item.aircraftId === handoffId && item.status === "PENDING");
    if (!h) return;

    h.respondedAt = sim.time;
    if (!accept) {
      h.status = "REJECTED";
      radioAudio.playRadioClick("ERROR");
      set((s) => ({
        tickVersion: s.tickVersion + 1,
        lastFeedback: {
          ok: false,
          text: `Handoff rejected. ${h.callsign} remains with ${h.fromController}.`,
          at: sim.time,
        },
      }));
      return;
    }

    h.status = "ACCEPTED";
    radioAudio.playRadioClick("ATC");

    // Immediately transfer aircraft controller locally so UI unlocks without waiting
    const ac = sim.aircraft[h.aircraftId];
    if (ac) {
      if (h.toController === "ACC") {
        ac.state = "COMPLETED_DEPARTURE";
        ac.stateEnteredAt = sim.time;
        ac.lastTransmissionAt = sim.time;
        sim.metrics.departuresCompleted += 1;
        if (ac.pendingRequest) {
          ac.pendingRequest.resolved = true;
        }
      } else {
        ac.controller = h.toController;
        ac.lastTransmissionAt = sim.time;

        if (h.toController === "TOWER") {
          if (ac.flightKind === "ARRIVAL") {
            const rwy = ac.assignedApproach ?? ac.targetRunway;
            const msgText = `${controllerCallsign("TOWER", sim.airport)}, ${ac.spokenCallsign}, inbound ILS runway ${runwaySpokenName(rwy)}, request landing clearance.`;
            ac.pendingRequest = {
              id: nextId(sim, "req"),
              type: "LANDING",
              controller: "TOWER",
              message: msgText,
              requestedAt: sim.time,
              runway: rwy,
              resolved: false,
            };
            addRadioMessage(sim, {
              sender: ac.callsign,
              recipient: controllerCallsign("TOWER", sim.airport),
              controller: "TOWER",
              aircraftId: ac.id,
              category: "PILOT_REQUEST",
              text: msgText,
            });
          } else if (ac.flightKind === "DEPARTURE") {
            const msgText = `${controllerCallsign("TOWER", sim.airport)}, ${ac.spokenCallsign}, holding short runway ${runwaySpokenName(ac.targetRunway)}, ready for departure.`;
            ac.pendingRequest = {
              id: nextId(sim, "req"),
              type: "TAKEOFF",
              controller: "TOWER",
              message: msgText,
              requestedAt: sim.time,
              runway: ac.targetRunway,
              resolved: false,
            };
            addRadioMessage(sim, {
              sender: ac.callsign,
              recipient: controllerCallsign("TOWER", sim.airport),
              controller: "TOWER",
              aircraftId: ac.id,
              category: "PILOT_REQUEST",
              text: msgText,
            });
          }
        } else if (h.toController === "GROUND") {
          const msgText = `${controllerCallsign("GROUND", sim.airport)}, ${ac.spokenCallsign}, clear of runway, request taxi to gate.`;
          ac.pendingRequest = {
            id: nextId(sim, "req"),
            type: "TAXI",
            controller: "GROUND",
            message: msgText,
            requestedAt: sim.time,
            resolved: false,
          };
          addRadioMessage(sim, {
            sender: ac.callsign,
            recipient: controllerCallsign("GROUND", sim.airport),
            controller: "GROUND",
            aircraftId: ac.id,
            category: "PILOT_REQUEST",
            text: msgText,
          });
        }
      }
    }

    if (sim.handoffs) {
      sim.handoffs = [...sim.handoffs];
    }

    set((s) => ({
      tickVersion: s.tickVersion + 1,
      lastFeedback: {
        ok: true,
        text: `Handoff accepted. ${h.callsign} transferred to ${h.toController}.`,
        at: sim.time,
      },
    }));
  },

  claimAircraftStation: (aircraftId, targetController) => {
    radioAudio.stopAllSpeech();
    speechPtt.cancel();
    const { sim, roomState } = get();
    const ac = sim.aircraft[aircraftId];
    if (!ac) return;

    if (roomState && roomState.status === "ACTIVE") {
      ensureWsClient(set, get).claimAircraft(aircraftId, targetController);
    }

    const fromRole = ac.controller;
    ac.controller = targetController;
    ac.lastTransmissionAt = sim.time;

    // Resolve any existing pending handoff for this aircraft
    if (sim.handoffs) {
      for (const h of sim.handoffs) {
        if (h.aircraftId === aircraftId && h.status === "PENDING") {
          h.status = "ACCEPTED";
          h.respondedAt = sim.time;
        }
      }
      sim.handoffs = [...sim.handoffs];
    }

    if (targetController === "TOWER" && ac.flightKind === "ARRIVAL") {
      const rwy = ac.assignedApproach ?? ac.targetRunway;
      const msgText = `${controllerCallsign("TOWER", sim.airport)}, ${ac.spokenCallsign}, inbound ILS runway ${runwaySpokenName(rwy)}, request landing clearance.`;
      ac.pendingRequest = {
        id: nextId(sim, "req"),
        type: "LANDING",
        controller: "TOWER",
        message: msgText,
        requestedAt: sim.time,
        runway: rwy,
        resolved: false,
      };
      addRadioMessage(sim, {
        sender: ac.callsign,
        recipient: controllerCallsign("TOWER", sim.airport),
        controller: "TOWER",
        aircraftId: ac.id,
        category: "PILOT_REQUEST",
        text: msgText,
      });
    } else if (targetController === "GROUND" && ac.flightKind === "ARRIVAL") {
      const msgText = `${controllerCallsign("GROUND", sim.airport)}, ${ac.spokenCallsign}, clear of runway, request taxi to gate.`;
      ac.pendingRequest = {
        id: nextId(sim, "req"),
        type: "TAXI",
        controller: "GROUND",
        message: msgText,
        requestedAt: sim.time,
        resolved: false,
      };
      addRadioMessage(sim, {
        sender: ac.callsign,
        recipient: controllerCallsign("GROUND", sim.airport),
        controller: "GROUND",
        aircraftId: ac.id,
        category: "PILOT_REQUEST",
        text: msgText,
      });
    }

    addRadioMessage(sim, {
      sender: "CONSOLE",
      recipient: "ATC",
      controller: targetController,
      aircraftId: ac.id,
      category: "SYSTEM",
      text: `Frequency transfer complete for ${ac.callsign} from ${fromRole} to ${targetController}. Ready for clearance.`,
    });

    radioAudio.playRadioClick("ATC");

    set((s) => ({
      tickVersion: s.tickVersion + 1,
      lastFeedback: {
        ok: true,
        text: `Assumed control of ${ac.callsign} on ${targetController}.`,
        at: sim.time,
      },
    }));
  },

  sendMultiplayerChat: (text) => {
    if (!text.trim()) return;
    ensureWsClient(set, get).sendChat(text);
  },

  endMultiplayerSession: () => {
    ensureWsClient(set, get).endSession();
  },

  leaveMultiplayerRoom: () => {
    wsClientSingleton?.disconnect();
    wsClientSingleton = null;
    set({
      roomState: null,
      assignedRole: null,
      multiplayerConnected: false,
      multiplayerError: null,
      appMode: "GLOBAL_MAP",
    });
  },

  tick: (realDtSeconds) => {
    const { sim, roomState } = get();
    // In active multiplayer, the server steps physics at 5 Hz and pushes ROOM_SYNC
    if (roomState && roomState.status === "ACTIVE") return;
    if (sim.paused) return;

    const prevLastMsg = sim.radioLog[sim.radioLog.length - 1]?.id ?? null;
    const clamped = Math.min(0.1, Math.max(0, realDtSeconds));
    stepSimulation(sim, clamped * sim.timeScale);

    // If active in pilot flight deck, step pilot flight systems, avionics & kinematics
    if (get().appMode === "PILOT_COCKPIT" && get().pilotAircraftId) {
      const pId = get().pilotAircraftId!;
      const cfg = get().pilotConfig;
      const v1 = cfg?.v1Speed || 135;
      const vr = cfg?.vrSpeed || 142;
      const v2 = cfg?.v2Speed || 148;
      const res = stepPilotFlightDeck({
        sim,
        playerAircraftId: pId,
        controls: get().cockpitControls,
        checklist: get().cockpitChecklist,
        v1Speed: v1,
        vrSpeed: vr,
        v2Speed: v2,
        dt: clamped * sim.timeScale,
        voiceEnabled: get().voiceEnabled,
      });
      set({
        cockpitControls: res.controls,
        cockpitChecklist: res.checklist,
      });
    }

    const newMessages = collectNewMessagesSince(sim.radioLog, prevLastMsg);
    dispatchRadioMessagesAudio(sim, newMessages);

    set((s) => ({
      tickVersion: s.tickVersion + 1,
      lastSpokenRadioId: sim.radioLog[sim.radioLog.length - 1]?.id ?? s.lastSpokenRadioId,
    }));
  },

  selectAircraft: (id) => {
    const { sim } = get();
    if (sim.selectedAircraftId !== id) {
      radioAudio.stopAllSpeech();
    }
    sim.selectedAircraftId = id;
    set((s) => ({ tickVersion: s.tickVersion + 1, hoverPreviewRoute: null }));
  },

  focusAircraft: (id) => {
    const { sim, camera } = get();
    sim.selectedAircraftId = id;
    const ac = sim.aircraft[id];
    set((s) => ({
      tickVersion: s.tickVersion + 1,
      hoverPreviewRoute: null,
      camera: ac
        ? {
            ...camera,
            centerX: ac.x,
            centerY: ac.y,
          }
        : camera,
    }));
  },

  switchStation: (role) => {
    const { sim, roomState, assignedRole } = get();
    if (roomState && roomState.status === "ACTIVE" && assignedRole && role !== assignedRole) {
      radioAudio.playRadioClick("ERROR");
      set({
        lastFeedback: {
          ok: false,
          text: `Multiplayer role locked to ${assignedRole}. Coordinate handoffs in the Handoffs & Chat panel.`,
          at: sim.time,
        },
      });
      return;
    }

    radioAudio.stopAllSpeech();
    speechPtt.cancel();
    radioAudio.syncMode = role !== "ALL";
    switchPlayerStation(sim, role);
    set((s) => ({
      tickVersion: s.tickVersion + 1,
      camera: s.camera,
      lastFeedback: {
        ok: true,
        text:
          role === "ALL"
            ? "Switched to ALL NEUTRAL (Auto-All) — all stations automated, hearing all frequencies."
            : `Switched role to ${role} (hearing ${role} frequency only; other roles automated).`,
        at: sim.time,
      },
    }));
  },

  toggleAutoAssist: () => {
    const { sim, roomState } = get();
    if (roomState && roomState.status === "ACTIVE") return;
    setStationAutoAssist(sim, !sim.config.autoManageOtherStations);
    set((s) => ({ tickVersion: s.tickVersion + 1 }));
  },

  loadScenario: (scenarioId) => {
    const { sim, roomState } = get();
    if (roomState && roomState.status === "ACTIVE") return;
    radioAudio.stopAllSpeech();
    saveSelectedScenarioId(scenarioId);

    // Seamlessly transition the active simulation to the new traffic scenario/model
    // without wiping active aircraft, without resetting simulation time, and preserving telemetry
    transitionScenarioSimulation(sim, scenarioId);

    const mins = Math.floor(sim.time / 60);
    const secs = Math.floor(sim.time % 60);
    const timeStr = `T+${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    set((s) => ({
      tickVersion: s.tickVersion + 1,
      lastFeedback: {
        ok: true,
        text: `Scenario transitioned to ${scenarioId} — operations continuing at ${sim.airport.icao} (${timeStr}).`,
        at: sim.time,
      },
    }));
  },

  selectAndSaveAirport: (airportId, scenarioId, initialRole = "ALL") => {
    const { sim, hasActiveSession } = get();
    radioAudio.stopAllSpeech();
    saveSelectedAirportId(airportId);
    const scen = scenarioId ?? sim.scenarioId;
    saveSelectedScenarioId(scen);

    // If user is already running this airport, don't restart — resume seamlessly from current state!
    if (hasActiveSession && (airportId === sim.airport.id || airportId === sim.airport.icao)) {
      if (initialRole && initialRole !== sim.config.activePlayerStation) {
        switchPlayerStation(sim, initialRole);
      }
      if (scen && scen !== sim.scenarioId) {
        transitionScenarioSimulation(sim, scen);
      }
      sim.paused = false;
      const mins = Math.floor(sim.time / 60);
      const secs = Math.floor(sim.time % 60);
      const timeStr = `T+${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      set((s) => ({
        appMode: "SIMULATION",
        showAirportSelector: false,
        tickVersion: s.tickVersion + 1,
        globalLoading: {
          active: true,
          message: `Resuming ${sim.airport.icao} Radar Control`,
          submessage: "SYNCHRONIZING ACTIVE FLIGHT STRIPS",
        },
        lastFeedback: {
          ok: true,
          text: `Resumed session at ${sim.airport.name} (${sim.airport.icao}) in ${
            initialRole === "ALL" ? "ALL AUTO" : initialRole
          } mode (${timeStr}).`,
          at: sim.time,
        },
      }));
      setTimeout(() => {
        set({ globalLoading: null });
      }, 450);
      return;
    }

    if (!LEGACY_IDS.has(airportId)) {
      const bundled = offlineDb.getBundledFallbackAirport(airportId);
      if (bundled) {
        void get().launchRealAirportSimulation(bundled, scen, initialRole);
        return;
      }
    }

    const fresh = createScenarioSimulation(scen, initialRole, airportId, undefined, { randomize: true });
    set({
      appMode: "SIMULATION",
      sim: fresh,
      tickVersion: 0,
      lastSpokenRadioId: null,
      savedAirportId: airportId,
      hasActiveSession: true,
      showAirportSelector: false,
      roomState: null,
      assignedRole: null,
      selectedAirportRecord: LEGACY_IDS.has(airportId) ? null : get().selectedAirportRecord,
      camera: getPresetCameraForStation(initialRole, fresh.airport),
      hoverPreviewRoute: null,
      globalLoading: {
        active: true,
        message: `Establishing ${airportId} Radar Control`,
        submessage: "CALIBRATING RUNWAYS & APPROACH CORRIDORS",
      },
      lastFeedback: {
        ok: true,
        text: `Loaded ${fresh.airport.name} (${fresh.airport.icao}) in ${
          initialRole === "ALL" ? "ALL AUTO" : initialRole
        } mode.`,
        at: 0,
      },
    });
    setTimeout(() => {
      set({ globalLoading: null });
    }, 450);
  },

  openAirportSelector: () => {
    const { sim } = get();
    radioAudio.stopAllSpeech();
    speechPtt.cancel();
    sim.paused = true;
    set((s) => ({
      appMode: "GLOBAL_MAP",
      showAirportSelector: true,
      tickVersion: s.tickVersion + 1,
      globalLoading: {
        active: true,
        message: "Opening World Airport Catalog",
        submessage: "MAPPING GLOBAL AIRPORTS & AIRWAYS",
      },
    }));
    setTimeout(() => {
      set({ globalLoading: null });
    }, 450);
  },

  forgetSavedAirport: () => {
    void get().removeLocalOfflineMap();
  },

  removeLocalOfflineMap: async (icaoInput?: string) => {
    const targetIcao = (icaoInput || get().savedAirportId || get().sim.airport.icao || "").toUpperCase();
    if (targetIcao) {
      await offlineDb.removeCachedGeometry(targetIcao);
    }
    clearSavedAirportId();
    radioAudio.stopAllSpeech();
    speechPtt.cancel();

    const isCurrent = get().sim.airport.icao.toUpperCase() === targetIcao;
    set((s) => ({
      savedAirportId: null,
      hasActiveSession: false,
      selectedAirportGeoJson: null,
      sim: isCurrent
        ? createScenarioSimulation("NORMAL_OPS", "ALL", "KAST", undefined, { randomize: true })
        : s.sim,
      tickVersion: s.tickVersion + 1,
      lastFeedback: {
        ok: true,
        text: targetIcao
          ? `Removed local offline map cache for ${targetIcao}. Reverted to clean configuration.`
          : "Removed local offline map cache.",
        at: s.sim.time,
      },
    }));
  },

  togglePause: () => {
    const { sim, roomState } = get();
    if (roomState && roomState.status === "ACTIVE") return;
    sim.paused = !sim.paused;
    if (sim.paused) radioAudio.stopAllSpeech();
    set((s) => ({ tickVersion: s.tickVersion + 1 }));
  },

  setTimeScale: (scale) => {
    const { sim, roomState } = get();
    if (roomState && roomState.status === "ACTIVE") return;
    sim.timeScale = scale;
    set((s) => ({ tickVersion: s.tickVersion + 1 }));
  },

  issueClearance: (cmd, override = false, isVoice = false) => {
    const { sim, roomState, assignedRole } = get();
    const ac = sim.aircraft[cmd.aircraftId];

    // Active multiplayer routes command strictly to backend room service
    if (roomState && roomState.status === "ACTIVE") {
      if (!assignedRole) {
        radioAudio.playRadioClick("ERROR");
        const msg = "No multiplayer controller role assigned.";
        set({
          lastFeedback: {
            ok: false,
            text: msg,
            at: sim.time,
          },
        });
        return { ok: false, reason: msg };
      }
      ensureWsClient(set, get).sendCommand(
        roomState.roomCode,
        {
          aircraftId: cmd.aircraftId,
          controller: assignedRole,
          type: cmd.type,
          parameters: cmd.parameters,
        },
        override
      );
      return { ok: true };
    }

    const fallbackCtrl: ControllerRole =
      sim.config.activePlayerStation === "ALL"
        ? ac?.controller ?? "TOWER"
        : sim.config.activePlayerStation;
    const controller: ControllerRole = cmd.controller ?? fallbackCtrl;

    if (
      !override &&
      sim.config.activePlayerStation !== "ALL" &&
      sim.config.autoManageOtherStations &&
      controller !== sim.config.activePlayerStation &&
      cmd.type !== "HANDOFF"
    ) {
      const msg = `${controller} is automated while you are on ${sim.config.activePlayerStation}. Switch to ${controller} to issue this clearance manually.`;
      radioAudio.playRadioClick("ERROR");
      set((s) => ({
        tickVersion: s.tickVersion + 1,
        lastFeedback: { ok: false, text: msg, at: sim.time },
      }));
      return { ok: false, reason: msg };
    }

    // When override is true (e.g. from Voice PTT command across stations),
    // automatically sync the active station to the commanded controller so the UI deck opens
    if (
      override &&
      sim.config.activePlayerStation !== "ALL" &&
      controller !== sim.config.activePlayerStation
    ) {
      sim.config.activePlayerStation = controller;
    }

    const movementTypes = new Set(["PUSHBACK", "TAXI", "CROSS_RUNWAY", "LINE_UP", "TAKEOFF"]);
    if (
      radioAudio.voiceEnabled &&
      movementTypes.has(cmd.type) &&
      ac &&
      controller === sim.config.activePlayerStation
    ) {
      ac.voiceGated = true;
      // Safety release fallback in case browser speech synthesis hangs or fails
      setTimeout(() => {
        if (ac.voiceGated) {
          ac.voiceGated = false;
          useAtcStore.setState((s) => ({ tickVersion: s.tickVersion + 1 }));
        }
      }, 5500);
    }

    const prevLastMsg = sim.radioLog[sim.radioLog.length - 1]?.id ?? null;
    const res = submitClearanceDecision(
      sim,
      {
        aircraftId: cmd.aircraftId,
        controller,
        type: cmd.type,
        parameters: cmd.parameters,
      },
      "PLAYER"
    );

    if (res.ok) {
      const newMessages = collectNewMessagesSince(sim.radioLog, prevLastMsg);
      dispatchRadioMessagesAudio(
        sim,
        newMessages,
        () => {
          set((s) => ({ tickVersion: s.tickVersion + 1 }));
        },
        isVoice
      );
    } else {
      radioAudio.playRadioClick("ERROR");
    }

    set((s) => ({
      tickVersion: s.tickVersion + 1,
      lastSpokenRadioId: sim.radioLog[sim.radioLog.length - 1]?.id ?? s.lastSpokenRadioId,
      lastFeedback: { ok: res.ok, text: res.reason, at: sim.time },
    }));

    return { ok: res.ok, reason: res.reason };
  },

  armReadbackError: (aircraftId) => {
    const { sim } = get();
    const ac = sim.aircraft[aircraftId];
    if (!ac) return;
    ac.armNextReadbackError = !ac.armNextReadbackError;
    set((s) => ({
      tickVersion: s.tickVersion + 1,
      lastFeedback: {
        ok: true,
        text: ac.armNextReadbackError
          ? `Armed readback error on next clearance for ${ac.callsign}.`
          : `Disarmed readback error for ${ac.callsign}.`,
        at: sim.time,
      },
    }));
  },

  causeRadioFailure: (aircraftId) => {
    const { sim } = get();
    const ok = triggerRadioFailure(sim, aircraftId);
    if (ok) radioAudio.playRadioClick("ALERT");
    set((s) => ({
      tickVersion: s.tickVersion + 1,
      lastFeedback: {
        ok,
        text: ok
          ? `Triggered RADIO_FAILURE (NORDO 7600) on ${aircraftId}.`
          : "Could not trigger radio failure.",
        at: sim.time,
      },
    }));
  },

  causeEmergency: (aircraftId, type) => {
    const { sim } = get();
    const ok = triggerEmergency(sim, aircraftId, type);
    if (ok) radioAudio.playRadioClick("ALERT");
    set((s) => ({
      tickVersion: s.tickVersion + 1,
      lastFeedback: {
        ok,
        text: ok
          ? `Emergency ${type} triggered on ${aircraftId}.`
          : `Cannot trigger ${type} in current aircraft state.`,
        at: sim.time,
      },
    }));
  },

  towDisabledAircraft: (aircraftId) => {
    const { sim } = get();
    const ok = clearStoppedRunwayEmergency(sim, aircraftId);
    set((s) => ({
      tickVersion: s.tickVersion + 1,
      lastFeedback: {
        ok,
        text: ok ? `Emergency tug cleared ${aircraftId} off runway.` : "Not stopped on runway.",
        at: sim.time,
      },
    }));
  },

  dispatchCrashRescue: (aircraftId) => {
    const { sim } = get();
    const ok = dispatchCrashRescue(sim, aircraftId);
    if (ok) radioAudio.playRadioClick("ALERT");
    set((s) => ({
      tickVersion: s.tickVersion + 1,
      lastFeedback: {
        ok,
        text: ok ? `Crash Tender & ARFF dispatched to ${aircraftId}.` : "Cannot dispatch ARFF.",
        at: sim.time,
      },
    }));
  },

  haltRunwayOperations: (runwayId, aircraftId) => {
    const { sim } = get();
    const ac = aircraftId ? sim.aircraft[aircraftId] : undefined;
    const ok = haltRunwayOperations(sim, runwayId, aircraftId);
    if (ok) radioAudio.playRadioClick("ALERT");
    const locKind = ac?.crashDetails?.locationKind ?? (ac?.crashDetails?.runwayId ? "RUNWAY" : "APRON");
    const locText =
      locKind === "APRON"
        ? "Apron & Ramp operations halted. Sector isolated."
        : locKind === "TAXIWAY"
        ? "Taxiway operations halted. Sector closed."
        : `Runway ${runwayId} closed. Operations halted.`;
    set((s) => ({
      tickVersion: s.tickVersion + 1,
      lastFeedback: {
        ok,
        text: ok ? locText : "Cannot halt operations.",
        at: sim.time,
      },
    }));
  },

  requestMedicalEvacuation: (aircraftId) => {
    const { sim } = get();
    const ok = requestMedicalEvacuation(sim, aircraftId);
    if (ok) radioAudio.playRadioClick("ALERT");
    set((s) => ({
      tickVersion: s.tickVersion + 1,
      lastFeedback: {
        ok,
        text: ok ? `Mass casualty & medical evacuation requested for ${aircraftId}.` : "Cannot request medical.",
        at: sim.time,
      },
    }));
  },

  clearCrashSite: (aircraftId) => {
    const { sim } = get();
    const ok = clearCrashSite(sim, aircraftId);
    set((s) => ({
      tickVersion: s.tickVersion + 1,
      lastFeedback: {
        ok,
        text: ok ? `Crash wreckage cleared and airfield operations restored.` : "Cannot clear crash site.",
        at: sim.time,
      },
    }));
  },

  spawnFlight: (kind) => {
    const { sim, roomState } = get();
    if (roomState && roomState.status === "ACTIVE") return;
    const ac = spawnRandomTraffic(sim, kind);
    if (ac) sim.selectedAircraftId = ac.id;
    set((s) => ({
      tickVersion: s.tickVersion + 1,
      lastFeedback: {
        ok: Boolean(ac),
        text: ac ? `Spawned ${kind.toLowerCase()} ${ac.callsign}.` : "Traffic capacity or gates full.",
        at: sim.time,
      },
    }));
  },

  setCamera: (cam) =>
    set((s) => ({
      camera: { ...s.camera, ...cam },
    })),

  zoomAtPoint: (factor, worldX, worldY) =>
    set((s) => {
      const prev = s.camera;
      const nextZoom = Math.max(18, Math.min(900, prev.pixelsPerNm * factor));
      const actualFactor = nextZoom / prev.pixelsPerNm;
      if (worldX === undefined || worldY === undefined) {
        return { camera: { ...prev, pixelsPerNm: nextZoom } };
      }
      const nextCenterX = worldX - (worldX - prev.centerX) / actualFactor;
      const nextCenterY = worldY - (worldY - prev.centerY) / actualFactor;
      return {
        camera: {
          centerX: nextCenterX,
          centerY: nextCenterY,
          pixelsPerNm: nextZoom,
        },
      };
    }),

  resetCameraForStation: (role) => {
    const { sim } = get();
    set({
      camera: getPresetCameraForStation(role ?? sim.config.activePlayerStation, sim.airport),
    });
  },

  setHoverPreviewRoute: (nodeIds) => set({ hoverPreviewRoute: nodeIds }),

  setShowVerificationModal: (open) => set({ showVerificationModal: open }),
  setShowEmailModal: (open) => set({ showEmailModal: open }),

  toggleSfx: () =>
    set((s) => {
      const next = !s.sfxEnabled;
      radioAudio.sfxEnabled = next;
      saveSfxEnabled(next);
      return { sfxEnabled: next };
    }),

  toggleVoice: () =>
    set((s) => {
      const next = !s.voiceEnabled;
      radioAudio.voiceEnabled = next;
      saveVoiceEnabled(next);
      if (!next) {
        radioAudio.stopAllSpeech();
        Object.values(s.sim.aircraft).forEach((ac) => {
          ac.voiceGated = false;
        });
      }
      return { voiceEnabled: next, tickVersion: s.tickVersion + 1 };
    }),

  setVoiceEnabled: (enabled: boolean) =>
    set((s) => {
      radioAudio.voiceEnabled = enabled;
      saveVoiceEnabled(enabled);
      if (!enabled) {
        radioAudio.stopAllSpeech();
        Object.values(s.sim.aircraft).forEach((ac) => {
          ac.voiceGated = false;
        });
      }
      return { voiceEnabled: enabled, tickVersion: s.tickVersion + 1 };
    }),

  // Pilot Simulator Actions
  setPilotConfig: (config) => set({ pilotConfig: config }),

  updateCockpitControls: (patch) =>
    set((s) => ({
      cockpitControls: { ...s.cockpitControls, ...patch },
      tickVersion: s.tickVersion + 1,
    })),

  toggleChecklistItem: (id) =>
    set((s) => ({
      cockpitChecklist: s.cockpitChecklist.map((it) =>
        it.id === id ? { ...it, completed: !it.completed } : it
      ),
      tickVersion: s.tickVersion + 1,
    })),

  launchPilotFlight: async (config: PilotConfig) => {
    radioAudio.stopAllSpeech();
    set({
      globalLoading: {
        active: true,
        message: `Boarding ${config.callsign} at ${config.airportIcao}`,
        submessage: "INITIALIZING FLIGHT DECK SYSTEMS & CLEARANCES",
      },
    });

    const bundled = offlineDb.getBundledFallbackAirport(config.airportIcao);
    let targetLayout: AirportLayout = get().sim.airport;
    let targetRecord: AirportRecord | undefined = bundled ?? undefined;

    if (bundled) {
      targetLayout = convertAirportBundleToLayout(bundled);
    } else {
      try {
        const cachedAll = await offlineDb.getAllCachedAirports();
        const found = cachedAll.find(
          (a) => a.icao.toUpperCase() === config.airportIcao.toUpperCase()
        );
        if (found) {
          targetRecord = found;
          targetLayout = convertAirportBundleToLayout(found);
        }
      } catch {
        // Fall back cleanly to existing layout
      }
    }

    const { sim: pilotSim, playerAircraftId } = initializePilotSimulation(
      targetLayout,
      targetRecord,
      config
    );

    set({
      appMode: "PILOT_COCKPIT",
      sim: pilotSim,
      pilotAircraftId: playerAircraftId,
      pilotConfig: config,
      cockpitControls: { ...DEFAULT_COCKPIT_CONTROLS },
      cockpitChecklist: [...INITIAL_CHECKLIST_ITEMS],
      tickVersion: 0,
    });

    setTimeout(() => {
      set({ globalLoading: null });
    }, 600);
  },

  transmitPilotRadioRequest: (requestType: PilotRadioRequestType) => {
    const { sim, pilotAircraftId, issueClearance, updateCockpitControls } = get();
    if (!pilotAircraftId) return;
    const ac = sim.aircraft[pilotAircraftId];
    if (!ac) return;

    const rwySpec = sim.airport.runways[ac.targetRunway];
    const rwyHeading = rwySpec ? rwySpec.heading : 90;
    const dest = ac.destinationName || ac.destinationIcao || "destination";

    if (requestType === "IFR_CLEARANCE") {
      // 1. Delivery CRAFT clearance
      if (ac.flightPlan) {
        ac.flightPlan.clearanceStatus = "CLEARED";
      }
      ac.controller = "GROUND";
      ac.squawk = "7321";

      addRadioMessage(sim, {
        sender: ac.callsign,
        recipient: "DELIVERY",
        controller: "DELIVERY",
        aircraftId: ac.id,
        category: "PILOT_REQUEST",
        text: `Asteria Delivery, ${ac.spokenCallsign} at gate ${ac.gateId || "T1_1"}, request IFR clearance to ${dest}.`,
      });

      const atcClearanceText = `${ac.spokenCallsign}, Delivery, cleared to ${dest} via flight planned route, maintain 5,000 ft, expect FL340 10 minutes after departure, departure frequency 119.50, squawk 7321.`;
      addRadioMessage(sim, {
        sender: "DELIVERY",
        recipient: ac.callsign,
        controller: "DELIVERY",
        aircraftId: ac.id,
        category: "ATC_CLEARANCE",
        text: atcClearanceText,
      });

      radioAudio.speakRadio(atcClearanceText, "CONTROLLER", "DELIVERY", true);

      set((s) => ({
        cockpitChecklist: s.cockpitChecklist.map((it) =>
          it.id === "ifr" ? { ...it, completed: true } : it
        ),
        tickVersion: s.tickVersion + 1,
      }));
    } else if (requestType === "PUSHBACK") {
      // 2. Ground Pushback & Start
      ac.state = "PUSHING_BACK";
      ac.requiresPushback = false;
      ac.controller = "GROUND";
      updateCockpitControls({ parkingBrake: false });

      addRadioMessage(sim, {
        sender: ac.callsign,
        recipient: "GROUND",
        controller: "GROUND",
        aircraftId: ac.id,
        category: "PILOT_REQUEST",
        text: `Asteria Ground, ${ac.spokenCallsign} at gate ${ac.gateId || "T1_1"}, request pushback facing runway ${ac.targetRunway}.`,
      });

      const atcPbText = `${ac.spokenCallsign}, Ground, pushback approved facing runway ${ac.targetRunway}, tail south, report ready to taxi.`;
      addRadioMessage(sim, {
        sender: "GROUND",
        recipient: ac.callsign,
        controller: "GROUND",
        aircraftId: ac.id,
        category: "ATC_CLEARANCE",
        text: atcPbText,
      });

      radioAudio.speakRadio(atcPbText, "CONTROLLER", "GROUND", true);

      set((s) => ({
        cockpitChecklist: s.cockpitChecklist.map((it) =>
          it.id === "pb_clear" ? { ...it, completed: true } : it
        ),
        tickVersion: s.tickVersion + 1,
      }));
    } else if (requestType === "TAXI") {
      // 3. Ground Taxi to Runway
      const wasAtGateOrPushback = ac.speed === 0 || ac.state === "PUSHBACK_COMPLETE" || ac.state === "AT_GATE";
      ac.state = "TAXIING";
      ac.controller = "GROUND";
      updateCockpitControls({ parkingBrake: false });

      // Align cleanly onto taxiway if still at gate
      const taxiNode = Object.values(sim.airport.nodes).find(
        (n) => n.kind === "TAXIWAY" || n.kind === "HOLD_SHORT"
      );
      if (taxiNode && wasAtGateOrPushback) {
        ac.x = taxiNode.x;
        ac.y = taxiNode.y;
      }

      addRadioMessage(sim, {
        sender: ac.callsign,
        recipient: "GROUND",
        controller: "GROUND",
        aircraftId: ac.id,
        category: "PILOT_REQUEST",
        text: `Asteria Ground, ${ac.spokenCallsign}, request taxi to runway ${ac.targetRunway}.`,
      });

      const atcTaxiText = `${ac.spokenCallsign}, Ground, taxi to runway ${ac.targetRunway} via taxiway LINK, hold short runway ${ac.targetRunway}.`;
      addRadioMessage(sim, {
        sender: "GROUND",
        recipient: ac.callsign,
        controller: "GROUND",
        aircraftId: ac.id,
        category: "ATC_CLEARANCE",
        text: atcTaxiText,
      });

      radioAudio.speakRadio(atcTaxiText, "CONTROLLER", "GROUND", true);

      set((s) => ({
        cockpitChecklist: s.cockpitChecklist.map((it) =>
          it.id === "taxi_clear" ? { ...it, completed: true } : it
        ),
        tickVersion: s.tickVersion + 1,
      }));
    } else if (requestType === "LINE_UP") {
      // 4. Tower Line Up & Wait
      ac.state = "LINE_UP_WAIT";
      ac.controller = "TOWER";
      ac.speed = 0;
      updateCockpitControls({ parkingBrake: false });

      if (rwySpec) {
        ac.x = rwySpec.thresholdX;
        ac.y = rwySpec.thresholdY;
        ac.heading = rwyHeading;
      }

      addRadioMessage(sim, {
        sender: ac.callsign,
        recipient: "TOWER",
        controller: "TOWER",
        aircraftId: ac.id,
        category: "PILOT_REQUEST",
        text: `Asteria Tower, ${ac.spokenCallsign}, holding short runway ${ac.targetRunway}, ready for departure.`,
      });

      const atcLuText = `${ac.spokenCallsign}, Tower, runway ${ac.targetRunway}, line up and wait. Traffic on two-mile final.`;
      addRadioMessage(sim, {
        sender: "TOWER",
        recipient: ac.callsign,
        controller: "TOWER",
        aircraftId: ac.id,
        category: "ATC_CLEARANCE",
        text: atcLuText,
      });

      radioAudio.speakRadio(atcLuText, "CONTROLLER", "TOWER", true);
      set((s) => ({ tickVersion: s.tickVersion + 1 }));
    } else if (requestType === "TAKEOFF") {
      // 5. Tower Takeoff Clearance
      ac.state = "TAKEOFF_CLEARED";
      ac.controller = "TOWER";

      if (rwySpec && ac.altitude <= sim.airport.elevationFt + 10) {
        if (
          Math.abs(ac.x - rwySpec.thresholdX) > 0.05 ||
          Math.abs(ac.y - rwySpec.thresholdY) > 0.05
        ) {
          ac.x = rwySpec.thresholdX;
          ac.y = rwySpec.thresholdY;
          ac.heading = rwyHeading;
        }
      }

      updateCockpitControls({ throttle: "TOGA", parkingBrake: false });

      addRadioMessage(sim, {
        sender: ac.callsign,
        recipient: "TOWER",
        controller: "TOWER",
        aircraftId: ac.id,
        category: "PILOT_REQUEST",
        text: `Asteria Tower, ${ac.spokenCallsign}, runway ${ac.targetRunway}, ready for takeoff.`,
      });

      const atcToText = `${ac.spokenCallsign}, Tower, wind 270 at 10, runway ${ac.targetRunway}, cleared for takeoff.`;
      addRadioMessage(sim, {
        sender: "TOWER",
        recipient: ac.callsign,
        controller: "TOWER",
        aircraftId: ac.id,
        category: "ATC_CLEARANCE",
        text: atcToText,
      });

      radioAudio.speakRadio(atcToText, "CONTROLLER", "TOWER", true);

      set((s) => ({
        cockpitChecklist: s.cockpitChecklist.map((it) =>
          it.id === "to_clear" || it.id === "thrust" ? { ...it, completed: true } : it
        ),
        tickVersion: s.tickVersion + 1,
      }));
    } else if (requestType === "CLIMB") {
      // 6. Departure Airborne & Fly
      ac.state = "CLIMB";
      ac.controller = "DEPARTURE";
      ac.altitude = sim.airport.elevationFt + 2500;
      ac.verticalSpeed = 2200;
      ac.speed = 220;
      updateCockpitControls({ pitchAngle: 12, throttle: "CLB", gearLever: "UP" });

      addRadioMessage(sim, {
        sender: ac.callsign,
        recipient: "DEPARTURE",
        controller: "DEPARTURE",
        aircraftId: ac.id,
        category: "PILOT_REQUEST",
        text: `Asteria Departure, ${ac.spokenCallsign}, passing 2,500 ft climbing flight level three four zero.`,
      });

      const atcDepText = `${ac.spokenCallsign}, Departure, radar contact, climb and maintain flight level three four zero, resume own navigation.`;
      addRadioMessage(sim, {
        sender: "DEPARTURE",
        recipient: ac.callsign,
        controller: "DEPARTURE",
        aircraftId: ac.id,
        category: "ATC_CLEARANCE",
        text: atcDepText,
      });

      radioAudio.speakRadio(atcDepText, "CONTROLLER", "DEPARTURE", true);
      set((s) => ({ tickVersion: s.tickVersion + 1 }));
    }
  },
}));
