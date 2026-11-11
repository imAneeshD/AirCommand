import { create } from "zustand";
import {
  clearStoppedRunwayEmergency,
  submitClearanceDecision,
  triggerEmergency,
  triggerRadioFailure,
} from "../engine/decisionEngine.ts";
import {
  createScenarioSimulation,
  setStationAutoAssist,
  shouldHearControllerAudio,
  spawnRandomTraffic,
  stepSimulation,
  switchPlayerStation,
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
import { convertLiveTracksToSimulation } from "../utils/liveToSim.ts";
import { offlineDb } from "../utils/offlineDb.ts";
import { convertAirportBundleToLayout } from "../utils/osmToAirport.ts";
import { radioAudio } from "../utils/radioAudio.ts";
import {
  clearSavedAirportId,
  loadSavedAirportId,
  loadSavedScenarioId,
  loadSavedSfxEnabled,
  loadSavedTheme,
  loadSavedVoiceEnabled,
  saveSelectedAirportId,
  saveSelectedScenarioId,
  saveSfxEnabled,
  saveTheme,
  saveVoiceEnabled,
  type ThemeMode,
} from "../utils/storage.ts";

export type AppMode =
  | "GLOBAL_MAP"
  | "SIMULATION"
  | "LIVE_OBSERVATION"
  | "AIRPORT_EDITOR"
  | "MULTIPLAYER_LOBBY";

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
  const span = layout ? Math.max(0.7, maxX - minX, maxY - minY) : 1.4;
  const scaleFactor = span > 1.8 ? 1.5 / span : 1;

  switch (role) {
    case "GROUND":
      return {
        centerX: 0.02,
        centerY: 0.02,
        pixelsPerNm: Math.max(90, Math.round(300 * scaleFactor)),
      };
    case "TOWER":
      return {
        centerX: -0.05,
        centerY: 0.01,
        pixelsPerNm: Math.max(70, Math.round(220 * scaleFactor)),
      };
    case "DEPARTURE":
      return {
        centerX: -0.25,
        centerY: 0,
        pixelsPerNm: Math.max(24, Math.round(36 * scaleFactor)),
      };
    case "ALL":
      return {
        centerX: 0.02,
        centerY: 0.01,
        pixelsPerNm: Math.max(75, Math.round(230 * scaleFactor)),
      };
  }
}

interface AtcStore {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  isOnline: boolean;
  setOnline: (online: boolean) => void;

  sim: SimulationState;
  tickVersion: number;
  lastSpokenRadioId: string | null;
  savedAirportId: AirportId | null;
  showAirportSelector: boolean;
  camera: CameraState;
  hoverPreviewRoute: string[] | null;
  lastFeedback: { ok: boolean; text: string; at: number } | null;
  showVerificationModal: boolean;
  sfxEnabled: boolean;
  voiceEnabled: boolean;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;

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
    initialRole?: PlayerRoleMode
  ) => Promise<void>;
  launchSimulationFromLiveTraffic: (
    record: AirportRecord,
    providedTracks?: LiveAdsbTrack[],
    initialRole?: PlayerRoleMode
  ) => Promise<{ ok: boolean; count: number; error?: string }>;
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
  respondToHandoff: (handoffId: string, accept: boolean) => void;
  sendMultiplayerChat: (text: string) => void;
  endMultiplayerSession: () => void;
  leaveMultiplayerRoom: () => void;

  // Phase 1 Core Simulation Actions (preserved)
  tick: (realDtSeconds: number) => void;
  selectAircraft: (id: string | null) => void;
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
  togglePause: () => void;
  setTimeScale: (scale: 1 | 2 | 4) => void;
  issueClearance: (
    cmd: Omit<ClearanceCommandInput, "controller"> & { controller?: ControllerRole },
    override?: boolean
  ) => void;
  armReadbackError: (aircraftId: string) => void;
  causeRadioFailure: (aircraftId: string) => void;
  causeEmergency: (
    aircraftId: string,
    type: "ENGINE_FAILURE" | "REJECTED_TAKEOFF_ABORT" | "MEDICAL"
  ) => void;
  towDisabledAircraft: (aircraftId: string) => void;
  spawnFlight: (kind: "DEPARTURE" | "ARRIVAL") => void;
  setCamera: (cam: Partial<CameraState>) => void;
  zoomAtPoint: (factor: number, worldX?: number, worldY?: number) => void;
  resetCameraForStation: (role?: PlayerRoleMode) => void;
  setHoverPreviewRoute: (nodeIds: string[] | null) => void;
  setShowVerificationModal: (open: boolean) => void;
  toggleSfx: () => void;
  toggleVoice: () => void;
  setVoiceEnabled: (enabled: boolean) => void;
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

function dispatchRadioMessagesAudio(
  sim: SimulationState,
  messages: SimulationState["radioLog"]
): void {
  for (const msg of messages) {
    if (!shouldHearControllerAudio(sim.config.activePlayerStation, msg.controller)) {
      continue;
    }

    if (msg.category === "READBACK_ERROR") {
      radioAudio.playRadioClick("ERROR");
      radioAudio.speakRadio(msg.text, "PILOT", msg.aircraftId ?? msg.sender, true);
    } else if (msg.category === "EMERGENCY") {
      radioAudio.playRadioClick("ALERT");
      radioAudio.speakRadio(msg.text, "PILOT", msg.aircraftId ?? msg.sender, true);
    } else if (msg.category === "PILOT_READBACK") {
      radioAudio.playRadioClick("PILOT");
      radioAudio.speakRadio(msg.text, "PILOT", msg.aircraftId ?? msg.sender, true);
    } else if (msg.category === "PILOT_REQUEST") {
      radioAudio.playRadioClick("PILOT");
      radioAudio.speakRadio(msg.text, "PILOT", msg.aircraftId ?? msg.sender, false);
    } else if (msg.category === "ATC_CLEARANCE") {
      radioAudio.playRadioClick("ATC");
      radioAudio.speakRadio(msg.text, "CONTROLLER", msg.controller, true);
    }
  }
}

function getOrCreatePlayerId(): string {
  if (typeof window === "undefined") return `ctrl_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const key = "aircommand_player_id_v1";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const generated = `ctrl_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(key, generated);
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
      set((s) => ({
        multiplayerError: null,
        roomState: payload.room ?? s.roomState,
        assignedRole: payload.role ?? s.assignedRole,
        appMode: payload.room?.status === "ACTIVE" ? "SIMULATION" : "MULTIPLAYER_LOBBY",
      }));
    },
    onActionResult: (payload) => {
      if (!payload.ok && payload.reason) {
        set((s) => ({
          multiplayerError: payload.reason ?? null,
          lastFeedback: { ok: false, text: payload.reason!, at: s.sim.time },
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

      // Determine this client's role in the multiplayer room
      const myRole =
        (["GROUND", "TOWER", "DEPARTURE"] as ControllerRole[]).find(
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
      set((s) => ({
        roomState: room,
        assignedRole: myRole ?? null,
        sim: remoteSim,
        tickVersion: s.tickVersion + 1,
        appMode: switchedToActive ? "SIMULATION" : s.appMode,
        camera: switchedToActive
          ? getPresetCameraForStation(myRole ?? "TOWER", remoteSim.airport)
          : s.camera,
        lastSpokenRadioId:
          remoteSim.radioLog[remoteSim.radioLog.length - 1]?.id ?? s.lastSpokenRadioId,
      }));
    },
    onSessionEnded: (report) => {
      radioAudio.stopAllSpeech();
      set(() => ({
        postSessionReport: report,
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
    const parsed = (await res.json()) as AirportGeoJsonCollection;
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

  if (cachedGeom && (cachedGeom.dataQuality === "Manually edited" || !isOnline)) {
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
  appMode: initialSavedAirport ? "SIMULATION" : "GLOBAL_MAP",
  setAppMode: (mode) => {
    if (mode !== "SIMULATION") {
      radioAudio.stopAllSpeech();
    }
    set({ appMode: mode, showAirportSelector: mode === "GLOBAL_MAP" });
  },
  isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
  setOnline: (online) => set({ isOnline: online }),

  sim: createScenarioSimulation(
    initialSavedScenario,
    "ALL",
    initialSavedAirport ?? "KAST"
  ),
  tickVersion: 0,
  lastSpokenRadioId: null,
  savedAirportId: initialSavedAirport,
  showAirportSelector: initialSavedAirport === null,
  camera: getPresetCameraForStation("ALL"),
  hoverPreviewRoute: null,
  lastFeedback: null,
  showVerificationModal: false,
  sfxEnabled: initialSavedSfx,
  voiceEnabled: initialSavedVoice,
  theme: initialSavedTheme,

  selectedAirportRecord: null,
  selectedAirportGeoJson: null,
  airportDetailLoading: false,
  airportDetailError: null,

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

  hydrateSavedRealAirport: async () => {
    const saved = get().savedAirportId;
    if (!saved || LEGACY_IDS.has(saved)) return;
    const bundled = offlineDb.getBundledFallbackAirport(saved);
    const cachedGeom = await offlineDb.getCachedGeometry(saved);
    if (bundled) {
      await get().launchRealAirportSimulation(bundled, get().sim.scenarioId, get().sim.config.activePlayerStation);
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
      await get().launchRealAirportSimulation(detail.airport, get().sim.scenarioId, get().sim.config.activePlayerStation);
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
        customLayout
      );
      set({
        sim: fresh,
        camera: getPresetCameraForStation(fresh.config.activePlayerStation, fresh.airport),
      });
    }

    return { ok: featureCount > 0, featureCount, error: resolved.error ?? undefined };
  },

  launchRealAirportSimulation: async (record, scenarioId, initialRole = "ALL") => {
    radioAudio.stopAllSpeech();
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

    const fresh = createScenarioSimulation(scen, initialRole, activeRecord.icao, customLayout);
    set({
      appMode: "SIMULATION",
      showAirportSelector: false,
      savedAirportId: activeRecord.icao,
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
        text: `Loaded ${activeRecord.name} (${activeRecord.icao}) [${activeRecord.dataQuality}] in ${
          initialRole === "ALL" ? "ALL AUTO" : initialRole
        } mode.`,
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
        set({ airportDetailLoading: false });
        return { ok: false, count: 0, error: (err as Error).message };
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
          customLayout
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
    ensureWsClient(set, get).claimRole(role);
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
    ensureWsClient(set, get).respondHandoff(handoffId, accept);
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

    const newMessages = collectNewMessagesSince(sim.radioLog, prevLastMsg);
    dispatchRadioMessagesAudio(sim, newMessages);

    set((s) => ({
      tickVersion: s.tickVersion + 1,
      lastSpokenRadioId: sim.radioLog[sim.radioLog.length - 1]?.id ?? s.lastSpokenRadioId,
    }));
  },

  selectAircraft: (id) => {
    const { sim } = get();
    sim.selectedAircraftId = id;
    set((s) => ({ tickVersion: s.tickVersion + 1, hoverPreviewRoute: null }));
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
    switchPlayerStation(sim, role);
    set((s) => ({
      tickVersion: s.tickVersion + 1,
      camera: getPresetCameraForStation(role, sim.airport),
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
    const { sim, selectedAirportRecord, selectedAirportGeoJson, roomState } = get();
    if (roomState && roomState.status === "ACTIVE") return;
    radioAudio.stopAllSpeech();
    saveSelectedScenarioId(scenarioId);

    const customLayout =
      selectedAirportRecord && selectedAirportRecord.icao === sim.airport.icao
        ? convertAirportBundleToLayout({
            ...selectedAirportRecord,
            geoJson: selectedAirportGeoJson ?? selectedAirportRecord.geoJson,
          })
        : !LEGACY_IDS.has(sim.airport.id)
        ? sim.airport
        : undefined;

    const fresh = createScenarioSimulation(
      scenarioId,
      sim.config.activePlayerStation,
      sim.airport.id,
      customLayout
    );
    set({
      sim: fresh,
      tickVersion: 0,
      lastSpokenRadioId: null,
      camera: getPresetCameraForStation(fresh.config.activePlayerStation, fresh.airport),
      hoverPreviewRoute: null,
      lastFeedback: {
        ok: true,
        text: `Loaded scenario: ${scenarioId} at ${fresh.airport.icao}.`,
        at: 0,
      },
    });
  },

  selectAndSaveAirport: (airportId, scenarioId, initialRole = "ALL") => {
    const { sim } = get();
    radioAudio.stopAllSpeech();
    saveSelectedAirportId(airportId);
    const scen = scenarioId ?? sim.scenarioId;
    saveSelectedScenarioId(scen);
    const fresh = createScenarioSimulation(scen, initialRole, airportId);
    set({
      appMode: "SIMULATION",
      sim: fresh,
      tickVersion: 0,
      lastSpokenRadioId: null,
      savedAirportId: airportId,
      showAirportSelector: false,
      roomState: null,
      assignedRole: null,
      selectedAirportRecord: LEGACY_IDS.has(airportId) ? null : get().selectedAirportRecord,
      camera: getPresetCameraForStation(initialRole, fresh.airport),
      hoverPreviewRoute: null,
      lastFeedback: {
        ok: true,
        text: `Loaded ${fresh.airport.name} (${fresh.airport.icao}) in ${
          initialRole === "ALL" ? "ALL AUTO" : initialRole
        } mode.`,
        at: 0,
      },
    });
  },

  openAirportSelector: () => {
    const { sim } = get();
    radioAudio.stopAllSpeech();
    sim.paused = true;
    set((s) => ({
      appMode: "GLOBAL_MAP",
      showAirportSelector: true,
      tickVersion: s.tickVersion + 1,
    }));
  },

  forgetSavedAirport: () => {
    clearSavedAirportId();
    set({ savedAirportId: null });
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

  issueClearance: (cmd, override = false) => {
    const { sim, roomState, assignedRole } = get();
    const ac = sim.aircraft[cmd.aircraftId];

    // Active multiplayer routes command strictly to backend room service
    if (roomState && roomState.status === "ACTIVE") {
      if (!assignedRole) {
        radioAudio.playRadioClick("ERROR");
        set({
          lastFeedback: {
            ok: false,
            text: "No multiplayer controller role assigned.",
            at: sim.time,
          },
        });
        return;
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
      return;
    }

    const fallbackCtrl: ControllerRole =
      sim.config.activePlayerStation === "ALL"
        ? ac?.controller ?? "TOWER"
        : sim.config.activePlayerStation;
    const controller: ControllerRole = cmd.controller ?? fallbackCtrl;

    if (
      sim.config.activePlayerStation !== "ALL" &&
      sim.config.autoManageOtherStations &&
      controller !== sim.config.activePlayerStation
    ) {
      const msg = `${controller} is automated while you are on ${sim.config.activePlayerStation}. Switch to ${controller} to issue this clearance manually.`;
      radioAudio.playRadioClick("ERROR");
      set((s) => ({
        tickVersion: s.tickVersion + 1,
        lastFeedback: { ok: false, text: msg, at: sim.time },
      }));
      return;
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
      dispatchRadioMessagesAudio(sim, newMessages);
    } else {
      radioAudio.playRadioClick("ERROR");
    }

    set((s) => ({
      tickVersion: s.tickVersion + 1,
      lastSpokenRadioId: sim.radioLog[sim.radioLog.length - 1]?.id ?? s.lastSpokenRadioId,
      lastFeedback: { ok: res.ok, text: res.reason, at: sim.time },
    }));
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
      if (!next) radioAudio.stopAllSpeech();
      return { voiceEnabled: next };
    }),

  setVoiceEnabled: (enabled: boolean) =>
    set(() => {
      radioAudio.voiceEnabled = enabled;
      saveVoiceEnabled(enabled);
      if (!enabled) radioAudio.stopAllSpeech();
      return { voiceEnabled: enabled };
    }),
}));
