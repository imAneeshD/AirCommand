import http from "node:http";
import { WebSocketServer } from "ws";
import type { AirportDataQuality, AirportGeoJsonCollection, ClearanceCommandInput, ControllerRole, DifficultyLevel, ScenarioId } from "../src/types/atc.ts";
import { DatabaseService } from "./db/DatabaseService.ts";
import { ADSBProviderService } from "./services/ADSBProviderService.ts";
import { AirportGeometryService } from "./services/AirportGeometryService.ts";
import { AirportImportService } from "./services/AirportImportService.ts";
import { AirportService } from "./services/AirportService.ts";
import { MultiplayerRoomService, type ConnectedClient } from "./services/MultiplayerRoomService.ts";

const PORT = Number(process.env.PORT ?? 3001);

const db = new DatabaseService();
const importer = new AirportImportService(db);
const seedInfo = importer.ensureGlobalCatalogLoaded();
console.log(`[AirCommand Server] Catalog initialized: ${seedInfo.count} airports (${seedInfo.source})`);

const airportService = new AirportService(db);
const geomService = new AirportGeometryService(db, importer);
const adsbService = new ADSBProviderService();
const roomService = new MultiplayerRoomService(db, geomService);
roomService.startClockLoop();

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const reqUrl = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const pathname = reqUrl.pathname;

  try {
    if (pathname === "/api/health" && req.method === "GET") {
      sendJson(res, 200, { ok: true, airports: db.getAirportCount(), serverTime: Date.now() });
      return;
    }

    if (pathname === "/api/airports" && req.method === "GET") {
      const q = reqUrl.searchParams.get("q") ?? undefined;
      const country = reqUrl.searchParams.get("country") ?? undefined;
      const category = reqUrl.searchParams.get("category") ?? undefined;
      const nearLatRaw = reqUrl.searchParams.get("nearLat");
      const nearLonRaw = reqUrl.searchParams.get("nearLon");
      const radiusRaw = reqUrl.searchParams.get("radiusNm");
      const limitRaw = reqUrl.searchParams.get("limit");

      const results = airportService.searchAirports({
        q,
        country,
        category,
        nearLat: nearLatRaw !== null ? Number(nearLatRaw) : undefined,
        nearLon: nearLonRaw !== null ? Number(nearLonRaw) : undefined,
        radiusNm: radiusRaw !== null ? Number(radiusRaw) : undefined,
        limit: limitRaw !== null ? Number(limitRaw) : undefined,
      });
      sendJson(res, 200, { count: results.length, airports: results });
      return;
    }

    const airportMatch = /^\/api\/airports\/([A-Za-z0-9]{3,6})$/.exec(pathname);
    if (airportMatch && req.method === "GET") {
      const icao = airportMatch[1].toUpperCase();
      const fetchOsm = reqUrl.searchParams.get("osm") !== "0";
      const refresh = reqUrl.searchParams.get("refresh") === "1";
      const data = await geomService.getOrImportGeometry(icao, fetchOsm, refresh);
      if (!data.airport) {
        sendJson(res, 404, { error: `Airport ${icao} not found` });
        return;
      }
      sendJson(res, 200, data);
      return;
    }

    const geomEditMatch = /^\/api\/airports\/([A-Za-z0-9]{3,6})\/geometry$/.exec(pathname);
    if (geomEditMatch && req.method === "PUT") {
      const icao = geomEditMatch[1].toUpperCase();
      const body = await readJsonBody(req);
      const geojson = body.geojson as AirportGeoJsonCollection;
      const dataQuality = (body.dataQuality as AirportDataQuality | undefined) ?? "Manually edited";
      const out = geomService.saveEditedGeometry(icao, geojson, dataQuality);
      sendJson(res, out.ok ? 200 : 400, out);
      return;
    }

    if (pathname === "/api/adsb/live" && req.method === "GET") {
      const lat = Number(reqUrl.searchParams.get("lat") ?? "28.5562");
      const lon = Number(reqUrl.searchParams.get("lon") ?? "77.1000");
      const radiusDeg = Number(reqUrl.searchParams.get("radiusDeg") ?? "1.5");
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        sendJson(res, 400, { error: "Valid lat and lon required" });
        return;
      }
      const snap = await adsbService.getLiveTraffic(lat, lon, radiusDeg);
      sendJson(res, 200, snap);
      return;
    }

    if (pathname === "/api/rooms" && req.method === "POST") {
      const body = await readJsonBody(req);
      const airportIcao = String(body.airportIcao ?? "VIDP").toUpperCase();
      let liveTracks = undefined;
      if (body.seedFromLive) {
        const ap = airportService.getAirport(airportIcao);
        if (ap) {
          const snap = await adsbService.getLiveTraffic(ap.lat, ap.lon, 1.8);
          liveTracks = snap.tracks;
        }
      }
      const created = await roomService.createRoom({
        hostPlayerId: String(body.hostPlayerId ?? `p_${Date.now()}`),
        hostName: String(body.hostName ?? "Host Controller"),
        airportIcao,
        scenarioId: body.scenarioId as ScenarioId | undefined,
        difficulty: body.difficulty as DifficultyLevel | undefined,
        preferredRole: body.preferredRole as ControllerRole | undefined,
        liveTracks,
      });
      sendJson(res, created.ok ? 200 : 400, created);
      return;
    }

    const roomReportMatch = /^\/api\/rooms\/([A-Za-z0-9]{4,10})\/report$/.exec(pathname);
    if (roomReportMatch && req.method === "GET") {
      const report = roomService.getLiveReport(roomReportMatch[1]);
      sendJson(res, report ? 200 : 404, report ? { report } : { error: "Room not found" });
      return;
    }

    sendJson(res, 404, { error: "Endpoint not found" });
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

const wss = new WebSocketServer({ server, path: "/ws" });
let nextClientSeq = 1;

wss.on("connection", (ws) => {
  const clientId = `ws_${nextClientSeq++}`;
  const client: ConnectedClient = {
    clientId,
    playerId: "",
    roomCode: null,
    send: (payload) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    },
  };

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as Record<string, unknown>;
      const type = String(msg.type ?? "");

      if (type === "JOIN_ROOM") {
        client.playerId = String(msg.playerId ?? clientId);
        const joined = roomService.joinRoom({
          roomCode: String(msg.roomCode ?? ""),
          playerId: client.playerId,
          playerName: String(msg.playerName ?? "Controller"),
          preferredRole: msg.preferredRole as ControllerRole | undefined,
          client,
        });
        client.send({ type: "JOIN_RESULT", ...joined });
        return;
      }

      if (type === "CLAIM_ROLE") {
        const res = roomService.claimRole(
          String(msg.roomCode ?? client.roomCode ?? ""),
          client.playerId,
          String(msg.playerName ?? "Controller"),
          msg.role as ControllerRole
        );
        client.send({ type: "ACTION_RESULT", action: "CLAIM_ROLE", ...res });
        return;
      }

      if (type === "SET_READY") {
        const res = roomService.setReady(
          String(msg.roomCode ?? client.roomCode ?? ""),
          client.playerId,
          Boolean(msg.ready)
        );
        client.send({ type: "ACTION_RESULT", action: "SET_READY", ...res });
        return;
      }

      if (type === "UPDATE_ROOM_CONFIG") {
        const res = await roomService.updateRoomConfig(
          String(msg.roomCode ?? client.roomCode ?? ""),
          client.playerId,
          {
            airportIcao: msg.airportIcao ? String(msg.airportIcao) : undefined,
            scenarioId: msg.scenarioId as ScenarioId | undefined,
            difficulty: msg.difficulty as DifficultyLevel | undefined,
          }
        );
        client.send({ type: "ACTION_RESULT", action: "UPDATE_ROOM_CONFIG", ...res });
        return;
      }

      if (type === "START_ROOM") {
        const res = roomService.startRoom(
          String(msg.roomCode ?? client.roomCode ?? ""),
          client.playerId
        );
        client.send({ type: "ACTION_RESULT", action: "START_ROOM", ...res });
        return;
      }

      if (type === "COMMAND") {
        const res = roomService.handleCommand({
          roomCode: String(msg.roomCode ?? client.roomCode ?? ""),
          playerId: client.playerId,
          commandId: String(msg.commandId ?? ""),
          cmd: msg.cmd as ClearanceCommandInput,
          override: Boolean(msg.override),
        });
        client.send({ type: "COMMAND_RESULT", commandId: msg.commandId, ...res });
        return;
      }

      if (type === "RESPOND_HANDOFF") {
        const res = roomService.respondHandoff({
          roomCode: String(msg.roomCode ?? client.roomCode ?? ""),
          playerId: client.playerId,
          handoffId: String(msg.handoffId ?? ""),
          accept: Boolean(msg.accept),
        });
        client.send({ type: "ACTION_RESULT", action: "RESPOND_HANDOFF", ...res });
        return;
      }

      if (type === "CHAT") {
        roomService.postChat({
          roomCode: String(msg.roomCode ?? client.roomCode ?? ""),
          playerId: client.playerId,
          text: String(msg.text ?? ""),
        });
        return;
      }

      if (type === "END_SESSION") {
        const res = roomService.endSession(
          String(msg.roomCode ?? client.roomCode ?? ""),
          client.playerId
        );
        client.send({ type: "SESSION_ENDED", ...res });
        return;
      }
    } catch (err) {
      client.send({
        type: "ERROR",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  ws.on("close", () => {
    roomService.handleClientDisconnect(client);
  });
});

server.listen(PORT, () => {
  console.log(`[AirCommand Server] Listening on http://localhost:${PORT} (WS /ws)`);
});
