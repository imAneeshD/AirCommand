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
import type {
  AirportId,
  ClearanceCommandInput,
  ControllerRole,
  PlayerRoleMode,
  ScenarioId,
  SimulationState,
} from "../types/atc.ts";
import { radioAudio } from "../utils/radioAudio.ts";
import {
  clearSavedAirportId,
  loadSavedAirportId,
  loadSavedScenarioId,
  loadSavedTheme,
  saveSelectedAirportId,
  saveSelectedScenarioId,
  saveTheme,
  type ThemeMode,
} from "../utils/storage.ts";

export interface CameraState {
  centerX: number;
  centerY: number;
  pixelsPerNm: number;
}

export function getPresetCameraForStation(role: PlayerRoleMode): CameraState {
  switch (role) {
    case "GROUND":
      return { centerX: 0.05, centerY: 0.03, pixelsPerNm: 320 };
    case "TOWER":
      return { centerX: -0.08, centerY: 0.02, pixelsPerNm: 225 };
    case "DEPARTURE":
      return { centerX: -0.45, centerY: 0, pixelsPerNm: 36 };
    case "ALL":
      return { centerX: 0.05, centerY: 0.02, pixelsPerNm: 240 };
  }
}

interface AtcStore {
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
    cmd: Omit<ClearanceCommandInput, "controller"> & { controller?: ControllerRole }
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

const initialSavedAirport = loadSavedAirportId();
const initialSavedScenario = loadSavedScenarioId();
const initialSavedTheme = loadSavedTheme();

export const useAtcStore = create<AtcStore>((set, get) => ({
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
  sfxEnabled: true,
  voiceEnabled: true,
  theme: initialSavedTheme,
  setTheme: (theme: ThemeMode) => {
    saveTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next: ThemeMode = get().theme === "light" ? "dark" : "light";
    saveTheme(next);
    set({ theme: next });
  },

  tick: (realDtSeconds) => {
    const { sim } = get();
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
    const { sim } = get();
    radioAudio.stopAllSpeech();
    switchPlayerStation(sim, role);
    set((s) => ({
      tickVersion: s.tickVersion + 1,
      camera: getPresetCameraForStation(role),
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
    const { sim } = get();
    setStationAutoAssist(sim, !sim.config.autoManageOtherStations);
    set((s) => ({ tickVersion: s.tickVersion + 1 }));
  },

  loadScenario: (scenarioId) => {
    const { sim } = get();
    radioAudio.stopAllSpeech();
    saveSelectedScenarioId(scenarioId);
    const fresh = createScenarioSimulation(
      scenarioId,
      sim.config.activePlayerStation,
      sim.airport.id
    );
    set({
      sim: fresh,
      tickVersion: 0,
      lastSpokenRadioId: null,
      camera: getPresetCameraForStation(fresh.config.activePlayerStation),
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
      sim: fresh,
      tickVersion: 0,
      lastSpokenRadioId: null,
      savedAirportId: airportId,
      showAirportSelector: false,
      camera: getPresetCameraForStation(initialRole),
      hoverPreviewRoute: null,
      lastFeedback: {
        ok: true,
        text: `Loaded ${fresh.airport.name} (${fresh.airport.icao}) in ${initialRole === "ALL" ? "ALL AUTO" : initialRole} mode.`,
        at: 0,
      },
    });
  },

  openAirportSelector: () => {
    const { sim } = get();
    radioAudio.stopAllSpeech();
    sim.paused = true;
    set((s) => ({
      showAirportSelector: true,
      tickVersion: s.tickVersion + 1,
    }));
  },

  forgetSavedAirport: () => {
    clearSavedAirportId();
    set({ savedAirportId: null });
  },

  togglePause: () => {
    const { sim } = get();
    sim.paused = !sim.paused;
    if (sim.paused) radioAudio.stopAllSpeech();
    set((s) => ({ tickVersion: s.tickVersion + 1 }));
  },

  setTimeScale: (scale) => {
    const { sim } = get();
    sim.timeScale = scale;
    set((s) => ({ tickVersion: s.tickVersion + 1 }));
  },

  issueClearance: (cmd) => {
    const { sim } = get();
    const ac = sim.aircraft[cmd.aircraftId];
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
    const { sim } = get();
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
      camera: getPresetCameraForStation(role ?? sim.config.activePlayerStation),
    });
  },

  setHoverPreviewRoute: (nodeIds) => set({ hoverPreviewRoute: nodeIds }),

  setShowVerificationModal: (open) => set({ showVerificationModal: open }),

  toggleSfx: () =>
    set((s) => {
      radioAudio.sfxEnabled = !s.sfxEnabled;
      return { sfxEnabled: !s.sfxEnabled };
    }),

  toggleVoice: () =>
    set((s) => {
      const next = !s.voiceEnabled;
      radioAudio.voiceEnabled = next;
      if (!next) radioAudio.stopAllSpeech();
      return { voiceEnabled: next };
    }),
}));
