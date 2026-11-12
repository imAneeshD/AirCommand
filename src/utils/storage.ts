import type { AirportId, ScenarioId } from "../types/atc.ts";

const AIRPORT_KEY = "asteria_atc_selected_airport_v1";
const SCENARIO_KEY = "asteria_atc_selected_scenario_v1";
const THEME_KEY = "asteria_atc_theme_v1";

export type ThemeMode = "light" | "dark";

export function loadSavedTheme(): ThemeMode {
  try {
    if (typeof window === "undefined" || !window.localStorage) return "light";
    const raw = window.localStorage.getItem(THEME_KEY);
    return raw === "dark" || raw === "light" ? raw : "light";
  } catch {
    return "light";
  }
}

export function saveTheme(theme: ThemeMode): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore storage quota / privacy mode failures
  }
}

const LEGACY_AIRPORTS = new Set<AirportId>(["KAST", "KMRD", "KVEL", "KSOL"]);

function isValidAirportId(raw: string | null): raw is AirportId {
  if (!raw) return false;
  return LEGACY_AIRPORTS.has(raw) || /^[A-Z0-9]{3,6}$/.test(raw);
}

export function loadSavedAirportId(): AirportId | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AIRPORT_KEY);
    if (isValidAirportId(raw)) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSelectedAirportId(airportId: AirportId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AIRPORT_KEY, airportId);
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function clearSavedAirportId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AIRPORT_KEY);
  } catch {
    // Ignore
  }
}

const VALID_SCENARIOS = new Set<ScenarioId>([
  "LOW_TRAFFIC",
  "NORMAL_OPS",
  "RUSH_HOUR",
  "CROSSINGS_AND_READBACK",
  "EMERGENCY_AND_NORDO",
  "SANDBOX",
  "LIGHT",
  "MEDIUM",
  "HEAVY",
  "ARRIVAL_HEAVY",
  "DEPARTURE_HEAVY",
  "MIXED",
  "EMERGENCY",
]);

export function loadSavedScenarioId(): ScenarioId {
  if (typeof window === "undefined") return "NORMAL_OPS";
  try {
    const raw = window.localStorage.getItem(SCENARIO_KEY) as ScenarioId | null;
    if (raw && VALID_SCENARIOS.has(raw)) {
      return raw;
    }
    return "NORMAL_OPS";
  } catch {
    return "NORMAL_OPS";
  }
}

export function saveSelectedScenarioId(scenarioId: ScenarioId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SCENARIO_KEY, scenarioId);
  } catch {
    // Ignore
  }
}

const VOICE_ENABLED_KEY = "aircommand_voice_enabled_v1";
const SFX_ENABLED_KEY = "aircommand_sfx_enabled_v1";

export function loadSavedVoiceEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(VOICE_ENABLED_KEY);
    if (raw === "false" || raw === "0") return false;
    return true;
  } catch {
    return true;
  }
}

export function saveVoiceEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VOICE_ENABLED_KEY, enabled ? "true" : "false");
  } catch {
    // Ignore
  }
}

export function loadSavedSfxEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(SFX_ENABLED_KEY);
    if (raw === "false" || raw === "0") return false;
    return true;
  } catch {
    return true;
  }
}

export function saveSfxEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SFX_ENABLED_KEY, enabled ? "true" : "false");
  } catch {
    // Ignore
  }
}

export type WorkbenchPanelKey = "left" | "right" | "bottom";
export type MinimizedPanelsState = Record<WorkbenchPanelKey, boolean>;

const MINIMIZED_PANELS_KEY = "aircommand_minimized_panels_v1";
const DEFAULT_MINIMIZED_PANELS: MinimizedPanelsState = {
  left: false,
  right: false,
  bottom: false,
};

export function loadSavedMinimizedPanels(): MinimizedPanelsState {
  if (typeof window === "undefined") return { ...DEFAULT_MINIMIZED_PANELS };
  try {
    const raw = window.localStorage.getItem(MINIMIZED_PANELS_KEY);
    if (!raw) return { ...DEFAULT_MINIMIZED_PANELS };
    const parsed = JSON.parse(raw) as Partial<Record<WorkbenchPanelKey, unknown>>;
    return {
      left: Boolean(parsed?.left),
      right: Boolean(parsed?.right),
      bottom: Boolean(parsed?.bottom),
    };
  } catch {
    return { ...DEFAULT_MINIMIZED_PANELS };
  }
}

export function saveMinimizedPanels(state: MinimizedPanelsState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MINIMIZED_PANELS_KEY, JSON.stringify(state));
  } catch {
    // Ignore
  }
}
