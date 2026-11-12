import { shouldHearControllerAudio } from "../engine/simulation.ts";
import type { ControllerRole, RadioMessage, SimulationState } from "../types/atc.ts";

export interface ActiveRadioTransmission {
  speakerKey: string;
  role: "CONTROLLER" | "PILOT";
  rawText: string;
  startedAtMs: number;
}

export interface ActiveCallerSignal {
  aircraftId: string;
  callsign: string;
  controller: ControllerRole;
  category: RadioMessage["category"];
  text: string;
  isLiveTts: boolean;
  /** 0 (just started) to 1 (about to fade out) */
  progress01: number;
}

const PILOT_VOICE_CATEGORIES = new Set<RadioMessage["category"]>([
  "PILOT_REQUEST",
  "PILOT_READBACK",
  "READBACK_ERROR",
  "EMERGENCY",
]);

function resolveAircraftFromMessage(sim: SimulationState, msg: RadioMessage) {
  if (msg.aircraftId && sim.aircraft[msg.aircraftId]) {
    return sim.aircraft[msg.aircraftId];
  }
  const byCallsign = Object.values(sim.aircraft).find((ac) => ac.callsign === msg.sender);
  return byCallsign ?? null;
}

/**
 * Resolves which aircraft are actively producing radio voice transmissions right now
 * (combining real-time Web Speech TTS playback when active with recent pilot radio
 * log broadcasts so callers remain visible both with voice ON and when MUTED).
 */
export function getActiveCallingSignals(
  sim: SimulationState,
  activeTts: ActiveRadioTransmission | null,
  maxAgeSimSec = 5.5
): ActiveCallerSignal[] {
  const byAircraft = new Map<string, ActiveCallerSignal>();

  // 1. Exact real-time speaker from SpeechSynthesis when audio is actively playing
  if (activeTts && activeTts.role === "PILOT") {
    const ac =
      sim.aircraft[activeTts.speakerKey] ??
      Object.values(sim.aircraft).find((a) => a.callsign === activeTts.speakerKey);
    if (ac && ac.state !== "COMPLETED_ARRIVAL" && ac.state !== "COMPLETED_DEPARTURE") {
      // Match latest message metadata if available
      let latestCat: RadioMessage["category"] = "PILOT_REQUEST";
      for (let i = sim.radioLog.length - 1; i >= Math.max(0, sim.radioLog.length - 12); i--) {
        const m = sim.radioLog[i];
        if ((m.aircraftId === ac.id || m.sender === ac.callsign) && PILOT_VOICE_CATEGORIES.has(m.category)) {
          latestCat = m.category;
          break;
        }
      }
      byAircraft.set(ac.id, {
        aircraftId: ac.id,
        callsign: ac.callsign,
        controller: ac.controller,
        category: latestCat,
        text: activeTts.rawText,
        isLiveTts: true,
        progress01: 0,
      });
    }
  }

  // 2. Recent heard pilot transmissions from sim.radioLog (covers muted mode & visual tail)
  for (let i = sim.radioLog.length - 1; i >= 0 && sim.radioLog.length - i <= 18; i--) {
    const msg = sim.radioLog[i];
    if (!PILOT_VOICE_CATEGORIES.has(msg.category)) continue;
    if (!shouldHearControllerAudio(sim.config.activePlayerStation, msg.controller)) continue;

    const ac = resolveAircraftFromMessage(sim, msg);
    if (!ac || ac.state === "COMPLETED_ARRIVAL" || ac.state === "COMPLETED_DEPARTURE") continue;
    if (byAircraft.has(ac.id)) continue;

    const ageSec = sim.time - msg.timestamp;
    const windowSec = Math.min(maxAgeSimSec, Math.max(3.2, msg.text.length * 0.06));
    if (ageSec < -0.25 || ageSec > windowSec) continue;

    byAircraft.set(ac.id, {
      aircraftId: ac.id,
      callsign: ac.callsign,
      controller: msg.controller,
      category: msg.category,
      text: msg.text,
      isLiveTts: false,
      progress01: Math.max(0, Math.min(1, ageSec / windowSec)),
    });

    if (byAircraft.size >= 3) break;
  }

  return Array.from(byAircraft.values());
}
