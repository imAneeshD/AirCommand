import type { SimulationState } from "../types/atc.ts";
import { loadSavedUserEmail } from "./storage.ts";

export interface SessionStatsPayload {
  id?: string;
  sessionId: string;
  email: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  airportIcao: string;
  airportName: string;
  scenario: string;
  role: string;
  departuresCompleted: number;
  arrivalsCompleted: number;
  clearancesIssued: number;
  safetyScore: number;
  conflicts: number;
}

class SessionTrackerService {
  private currentSessionId: string | null = null;
  private sessionStartTimeMs = 0;
  private lastReportedDuration = 0;
  private heartbeatTimer: number | null = null;
  private currentSimRef: (() => SimulationState | null) | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => {
        this.flushCurrentSession();
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          this.flushCurrentSession();
        }
      });
    }
  }

  public startSession(sim: SimulationState, simProvider?: () => SimulationState | null): string {
    // If a session is already running, flush it before starting the new one
    if (this.currentSessionId) {
      this.flushCurrentSession();
    }

    const sessionId = `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.currentSessionId = sessionId;
    this.sessionStartTimeMs = Date.now();
    this.lastReportedDuration = 0;
    if (simProvider) {
      this.currentSimRef = simProvider;
    }

    // Set up periodic heartbeat every 60 seconds so duration is tracked incrementally
    if (this.heartbeatTimer !== null && typeof window !== "undefined") {
      window.clearInterval(this.heartbeatTimer);
    }
    if (typeof window !== "undefined") {
      this.heartbeatTimer = window.setInterval(() => {
        this.flushCurrentSession(true);
      }, 60000);
    }

    return sessionId;
  }

  public getSessionId(): string | null {
    return this.currentSessionId;
  }

  public flushCurrentSession(isHeartbeat = false): void {
    if (!this.currentSessionId || this.sessionStartTimeMs === 0) return;

    const email = loadSavedUserEmail();
    if (!email) return; // Only track for users who provided email

    const durationSeconds = Math.max(1, Math.round((Date.now() - this.sessionStartTimeMs) / 1000));
    // Don't spam tiny heartbeats if no progress made
    if (isHeartbeat && durationSeconds - this.lastReportedDuration < 20) return;
    this.lastReportedDuration = durationSeconds;

    const sim = this.currentSimRef ? this.currentSimRef() : null;
    const airportIcao = sim?.airport?.icao ?? "UNKNOWN";
    const airportName = sim?.airport?.name ?? airportIcao;
    const scenario = sim?.scenarioId ?? "NORMAL_OPS";
    const role = sim?.config?.activePlayerStation ?? "ALL";

    const payload: SessionStatsPayload = {
      id: this.currentSessionId,
      sessionId: this.currentSessionId,
      email,
      startedAt: new Date(this.sessionStartTimeMs).toISOString(),
      endedAt: new Date().toISOString(),
      durationSeconds,
      airportIcao,
      airportName,
      scenario,
      role,
      departuresCompleted: sim?.metrics?.departuresCompleted ?? 0,
      arrivalsCompleted: sim?.metrics?.arrivalsCompleted ?? 0,
      clearancesIssued: sim?.metrics?.clearancesIssued ?? 0,
      safetyScore: sim?.metrics?.safetyScore ?? 100,
      conflicts: sim?.metrics?.conflictsDetected ?? 0,
    };

    const endpoint = "/api/sessions/record";
    const bodyStr = JSON.stringify(payload);

    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon && !isHeartbeat) {
        const blob = new Blob([bodyStr], { type: "application/json" });
        navigator.sendBeacon(endpoint, blob);
      } else if (typeof fetch !== "undefined") {
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: bodyStr,
          keepalive: true,
        }).catch(() => {
          // Fire and forget, ignore offline errors
        });
      }
    } catch {
      // Ignore
    }
  }

  public endSession(): void {
    this.flushCurrentSession();
    if (this.heartbeatTimer !== null && typeof window !== "undefined") {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.currentSessionId = null;
    this.sessionStartTimeMs = 0;
  }
}

export const sessionTracker = new SessionTrackerService();
