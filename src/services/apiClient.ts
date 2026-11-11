import type {
  AirportCategory,
  AirportDataQuality,
  AirportGeoJsonCollection,
  AirportRecord,
  ClearanceCommandInput,
  ControllerRole,
  DifficultyLevel,
  LiveTrafficSnapshot,
  MultiplayerRoomState,
  ScenarioId,
  SessionPerformanceReport,
  SimulationState,
} from "../types/atc.ts";

export interface SearchAirportsQuery {
  q?: string;
  country?: string;
  category?: AirportCategory | "All";
  nearLat?: number;
  nearLon?: number;
  radiusNm?: number;
  limit?: number;
}

export interface AirportDetailResponse {
  airport: AirportRecord;
  geojson: AirportGeoJsonCollection | null;
  error: string | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data;
}

export const apiClient = {
  async checkHealth(): Promise<{ ok: boolean; airports: number; serverTime: string }> {
    return fetchJson("/api/health");
  },

  async searchAirports(query: SearchAirportsQuery): Promise<{ count: number; airports: AirportRecord[] }> {
    const sp = new URLSearchParams();
    if (query.q) sp.set("q", query.q);
    if (query.country) sp.set("country", query.country);
    if (query.category && query.category !== "All") sp.set("category", query.category);
    if (query.nearLat !== undefined && query.nearLon !== undefined) {
      sp.set("nearLat", String(query.nearLat));
      sp.set("nearLon", String(query.nearLon));
      if (query.radiusNm !== undefined) sp.set("radiusNm", String(query.radiusNm));
    }
    if (query.limit !== undefined) sp.set("limit", String(query.limit));
    return fetchJson(`/api/airports?${sp.toString()}`);
  },

  async getAirportDetail(
    icao: string,
    fetchOsm = true,
    refresh = false
  ): Promise<AirportDetailResponse> {
    const sp = new URLSearchParams({ osm: fetchOsm ? "1" : "0" });
    if (refresh) sp.set("refresh", "1");
    return fetchJson(`/api/airports/${encodeURIComponent(icao)}?${sp.toString()}`);
  },

  async saveAirportGeometry(
    icao: string,
    geojson: AirportGeoJsonCollection,
    dataQuality: AirportDataQuality = "Manually edited"
  ): Promise<{ ok: boolean; version: number; updatedAt: string; error?: string }> {
    return fetchJson(`/api/airports/${encodeURIComponent(icao)}/geometry`, {
      method: "PUT",
      body: JSON.stringify({ geojson, dataQuality }),
    });
  },

  async getLiveAdsb(lat: number, lon: number, radiusDeg = 2.5): Promise<LiveTrafficSnapshot> {
    const sp = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      radiusDeg: String(radiusDeg),
    });
    return fetchJson(`/api/adsb/live?${sp.toString()}`);
  },

  async createRoom(payload: {
    hostPlayerId: string;
    hostName: string;
    airportIcao: string;
    scenarioId: ScenarioId;
    difficulty: DifficultyLevel;
    preferredRole?: ControllerRole;
    seedFromLive?: boolean;
  }): Promise<{ ok: boolean; room: MultiplayerRoomState }> {
    return fetchJson("/api/rooms", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getRoomReport(roomCode: string): Promise<{ report: SessionPerformanceReport }> {
    return fetchJson(`/api/rooms/${encodeURIComponent(roomCode)}/report`);
  },
};

export interface WsClientHandlers {
  onOpen?: () => void;
  onClose?: () => void;
  onRoomSync?: (room: MultiplayerRoomState, sim: SimulationState) => void;
  onJoinResult?: (payload: { ok: boolean; error?: string; role?: ControllerRole | null; room?: MultiplayerRoomState }) => void;
  onCommandResult?: (payload: {
    ok: boolean;
    commandId: string;
    duplicate?: boolean;
    reason: string;
    role: ControllerRole;
    pendingHandoff?: boolean;
  }) => void;
  onActionResult?: (payload: { action: string; ok: boolean; reason?: string }) => void;
  onSessionEnded?: (report: SessionPerformanceReport) => void;
  onError?: (error: string) => void;
}

export class MultiplayerWsClient {
  private ws: WebSocket | null = null;
  private handlers: WsClientHandlers;
  private queue: string[] = [];
  private manualClose = false;

  constructor(handlers: WsClientHandlers) {
    this.handlers = handlers;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.manualClose = false;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    this.ws = socket;

    socket.onopen = () => {
      while (this.queue.length > 0 && socket.readyState === WebSocket.OPEN) {
        const msg = this.queue.shift()!;
        socket.send(msg);
      }
      this.handlers.onOpen?.();
    };

    socket.onclose = () => {
      this.ws = null;
      this.handlers.onClose?.();
    };

    socket.onerror = () => {
      this.handlers.onError?.("WebSocket transport error");
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
        const type = msg.type as string;
        if (type === "ROOM_SYNC") {
          this.handlers.onRoomSync?.(msg.room as MultiplayerRoomState, msg.sim as SimulationState);
        } else if (type === "JOIN_RESULT") {
          this.handlers.onJoinResult?.(msg as unknown as Parameters<NonNullable<WsClientHandlers["onJoinResult"]>>[0]);
        } else if (type === "COMMAND_RESULT") {
          this.handlers.onCommandResult?.(msg as unknown as Parameters<NonNullable<WsClientHandlers["onCommandResult"]>>[0]);
        } else if (type === "ACTION_RESULT") {
          this.handlers.onActionResult?.(msg as unknown as Parameters<NonNullable<WsClientHandlers["onActionResult"]>>[0]);
        } else if (type === "SESSION_ENDED") {
          this.handlers.onSessionEnded?.(msg.report as SessionPerformanceReport);
        } else if (type === "ERROR") {
          this.handlers.onError?.(String(msg.error ?? "Server error"));
        }
      } catch {
        // Ignore malformed packets
      }
    };
  }

  private send(payload: Record<string, unknown>): void {
    const raw = JSON.stringify(payload);
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.queue.push(raw);
      if (!this.manualClose && !this.ws) {
        this.connect();
      }
      return;
    }
    this.ws.send(raw);
  }

  joinRoom(payload: { roomCode: string; playerId: string; playerName: string; preferredRole?: ControllerRole }): void {
    this.send({ type: "JOIN_ROOM", ...payload });
  }

  claimRole(role: ControllerRole): void {
    this.send({ type: "CLAIM_ROLE", role });
  }

  setReady(ready: boolean): void {
    this.send({ type: "SET_READY", ready });
  }

  updateConfig(config: { airportIcao?: string; scenarioId?: ScenarioId; difficulty?: DifficultyLevel }): void {
    this.send({ type: "UPDATE_ROOM_CONFIG", ...config });
  }

  startRoom(): void {
    this.send({ type: "START_ROOM" });
  }

  sendCommand(roomCode: string, cmd: ClearanceCommandInput, override = false): string {
    const commandId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.send({ type: "COMMAND", roomCode, commandId, cmd, override });
    return commandId;
  }

  respondHandoff(handoffId: string, accept: boolean): void {
    this.send({ type: "RESPOND_HANDOFF", handoffId, accept });
  }

  sendChat(text: string): void {
    this.send({ type: "CHAT", text });
  }

  endSession(): void {
    this.send({ type: "END_SESSION" });
  }

  disconnect(): void {
    this.manualClose = true;
    this.queue = [];
    this.ws?.close();
    this.ws = null;
  }
}
