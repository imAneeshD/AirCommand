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
