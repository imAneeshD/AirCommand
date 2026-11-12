import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  alongRunwayNm,
  getRunwayExitOptions,
  getSuggestedTaxiRoutes,
  runwayPoint,
} from "../src/data/asteriaAirport.ts";
import { submitClearanceDecision } from "../src/engine/decisionEngine.ts";
import {
  createArrivalAircraft,
  createDepartureAircraft,
  createScenarioSimulation,
  getAircraftPhaseLabel,
  stepSimulation,
} from "../src/engine/simulation.ts";
import type { AircraftState, AirportGeoJsonCollection, LiveAdsbTrack } from "../src/types/atc.ts";
import { formatUserDateTime, formatWallClockAtSimOffset } from "../src/utils/dateTime.ts";
import { convertLiveTracksToSimulation } from "../src/utils/liveToSim.ts";
import { hitTestAircraftOrLabel, placeAircraftLabels } from "../src/utils/labelLayout.ts";
import { convertAirportBundleToLayout } from "../src/utils/osmToAirport.ts";
import { loadSavedVoiceEnabled, saveVoiceEnabled } from "../src/utils/storage.ts";
import { computeAircraftPitchDeg, formatAltitudeReadout } from "../src/utils/telemetry.ts";
import { DatabaseService } from "../server/db/DatabaseService.ts";
import { ADSBProviderService, type ADSBProvider } from "../server/services/ADSBProviderService.ts";
import { AirportGeometryService } from "../server/services/AirportGeometryService.ts";
import { AirportImportService } from "../server/services/AirportImportService.ts";
import { AirportService } from "../server/services/AirportService.ts";
import { MultiplayerRoomService } from "../server/services/MultiplayerRoomService.ts";

function createTempTestEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aircommand-p2-"));
  const dbPath = path.join(tmpDir, "test.db");
  const db = new DatabaseService(dbPath);
  const importer = new AirportImportService(db);
  importer.ensureGlobalCatalogLoaded();
  const airportService = new AirportService(db);
  const geomService = new AirportGeometryService(db, importer);
  const rooms = new MultiplayerRoomService(db, geomService);

  return {
    db,
    importer,
    airportService,
    geomService,
    rooms,
    cleanup: () => {
      rooms.stopClockLoop();
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

test("Real global airport catalog contains major Indian hubs and handles VOGA/VAGO honestly", () => {
  const env = createTempTestEnv();
  try {
    const requiredIndia = ["VIDP", "VABB", "VOBL", "VOMM", "VOHS", "VECC", "VOCI", "VOGA", "VAAH"];
    for (const icao of requiredIndia) {
      const rec = env.airportService.getAirport(icao);
      assert.ok(rec, `Missing priority Indian airport ${icao}`);
      assert.equal(rec.isoCountry, "IN");
      assert.ok(rec.runways.length >= 1, `${icao} should have real runway metadata`);
    }

    const goaSearch = env.airportService.searchAirports({ q: "VAGO" });
    assert.ok(goaSearch.some((a) => a.icao === "VOGA" || a.icao === "VOGO"), "VAGO alias surfaces real VOGA/VOGO records");

    const nearbyDel = env.airportService.searchAirports({ nearLat: 28.5556, nearLon: 77.0952, radiusNm: 100 });
    assert.equal(nearbyDel[0]?.icao, "VIDP");
  } finally {
    env.cleanup();
  }
});

test("Real airport OurAirports + OSM/manual GeoJSON converts to connected simulation layout and persists edits", () => {
  const env = createTempTestEnv();
  try {
    const vidp = env.airportService.getAirport("VIDP");
    assert.ok(vidp);

    const editedGeoJson: AirportGeoJsonCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "manual_twy_N1",
          properties: { aeroway: "taxiway", ref: "N1", source: "ManualEditor" },
          geometry: {
            type: "LineString",
            coordinates: [
              [vidp.lon - 0.01, vidp.lat + 0.002],
              [vidp.lon + 0.01, vidp.lat + 0.002],
            ],
          },
        },
        {
          type: "Feature",
          id: "manual_gate_G1",
          properties: { aeroway: "gate", ref: "G1", source: "ManualEditor" },
          geometry: {
            type: "Point",
            coordinates: [vidp.lon, vidp.lat + 0.003],
          },
        },
        {
          type: "Feature",
          id: "manual_hp_1",
          properties: { aeroway: "holding_position", ref: "HP1", source: "ManualEditor" },
          geometry: {
            type: "Point",
            coordinates: [vidp.lon - 0.008, vidp.lat + 0.001],
          },
        },
      ],
    };

    const saveRes = env.geomService.saveEditedGeometry("VIDP", editedGeoJson, "Manually edited");
    assert.equal(saveRes.ok, true);

    const reloaded = env.airportService.getAirport("VIDP");
    assert.ok(reloaded);
    assert.equal(reloaded.dataQuality, "Manually edited");
    assert.equal(reloaded.hasOsmGeometry, true);
    assert.equal(reloaded.geoJson?.features.length, 3);

    const layout = convertAirportBundleToLayout(reloaded);
    assert.equal(layout.isRealWorld, true);
    assert.ok(layout.gateIds.length >= 1);
    assert.ok(layout.runwayIds.length >= 1);

    const depRwy = layout.primaryDepartureRunway;
    const gateId = layout.gateIds[0];
    const startGateNode = `GATE_${gateId}`;
    const routes = getSuggestedTaxiRoutes(layout, startGateNode, depRwy, gateId, false);
    assert.ok(routes.length >= 1 && routes[0].nodeIds.length >= 2, "Connected taxi route must exist from gate to primary runway");

    const sim = createScenarioSimulation("MEDIUM", "ALL", "VIDP", layout);
    for (let i = 0; i < 60; i++) {
      stepSimulation(sim, 0.5);
    }
    const firstAc = sim.aircraft[sim.aircraftOrder[0]];
    assert.ok(firstAc);
    const label = getAircraftPhaseLabel(firstAc);
    assert.ok(label.length > 0);
  } finally {
    env.cleanup();
  }
});

test("ADSBProviderService caches backend queries, preserves read-only tracks, marks stale aircraft, and backs off on 429", async () => {
  let upstreamCalls = 0;
  let shouldRateLimit = false;
  const now = Date.now();

  const mockProvider: ADSBProvider = {
    name: "MockADSB",
    async fetchRegion(): Promise<LiveAdsbTrack[]> {
      upstreamCalls += 1;
      if (shouldRateLimit) {
        const err = new Error("429 Too Many Requests");
        (err as { status?: number }).status = 429;
        throw err;
      }
      return [
        {
          readonly: true,
          icao24: "abc123",
          callsign: "AIC401",
          registration: null,
          aircraftType: null,
          originCountry: "India",
          lat: 28.56,
          lon: 77.11,
          baroAltFt: 12500,
          geoAltFt: 13000,
          groundSpeedKts: 310,
          trackDeg: 285,
          verticalRateFpm: -900,
          onGround: false,
          lastUpdatedMs: now - 5_000,
          stale: false,
          trail: [],
        },
        {
          readonly: true,
          icao24: "def456",
          callsign: "IGO882",
          registration: null,
          aircraftType: null,
          originCountry: "India",
          lat: 28.61,
          lon: 77.22,
          baroAltFt: 4200,
          geoAltFt: null,
          groundSpeedKts: 195,
          trackDeg: 110,
          verticalRateFpm: 1400,
          onGround: false,
          lastUpdatedMs: now - 90_000,
          stale: true,
          trail: [],
        },
      ];
    },
  };

  const svc = new ADSBProviderService(mockProvider);

  const s1 = await svc.getLiveTraffic(28.55, 77.1, 1.5);
  assert.equal(upstreamCalls, 1);
  assert.equal(s1.cached, false);
  assert.equal(s1.tracks.length, 2);
  assert.equal(s1.tracks[0].readonly, true);
  assert.equal(s1.tracks[0].registration, null);
  assert.equal(s1.tracks[1].stale, true);

  // Second call from another client on same sector uses backend cache instead of upstream polling
  const s2 = await svc.getLiveTraffic(28.56, 77.11, 1.5);
  assert.equal(upstreamCalls, 1);
  assert.equal(s2.cached, true);

  // New uncached sector triggers rate limit backoff cleanly
  shouldRateLimit = true;
  const s3 = await svc.getLiveTraffic(19.08, 72.86, 1.5);
  assert.equal(s3.rateLimited, true);
});

test("MultiplayerRoomService enforces role lock, command dedup, explicit handoffs, disconnect AI takeover & scoring report", async () => {
  const env = createTempTestEnv();
  try {
    const vidp = env.airportService.getAirport("VIDP")!;
    const fallbackLayout = convertAirportBundleToLayout(vidp);

    const created = await env.rooms.createRoom({
      hostPlayerId: "p_tower",
      hostName: "TowerHost",
      airportIcao: "VIDP",
      scenarioId: "MEDIUM",
      difficulty: "STANDARD",
      preferredRole: "TOWER",
      fallbackLayout,
    });
    assert.equal(created.ok, true);
    const code = created.room!.roomCode;

    // Ground player joins with mock socket client
    let groundPackets = 0;
    const groundTypes: string[] = [];
    const groundClient = {
      clientId: "sock_g1",
      playerId: "p_ground",
      roomCode: null as string | null,
      send: (payload: unknown) => {
        groundPackets += 1;
        const p = payload as { type?: string };
        if (p?.type) groundTypes.push(p.type);
      },
    };
    const joinG = env.rooms.joinRoom({
      roomCode: code,
      playerId: "p_ground",
      playerName: "GroundCtrl",
      preferredRole: "GROUND",
      client: groundClient,
    });
    assert.equal(joinG.ok, true);
    assert.equal(joinG.assignedRole, "GROUND");
    assert.ok(groundPackets >= 1);

    const startRes = env.rooms.startRoom(code, "p_tower");
    assert.equal(startRes.ok, true);

    const snap = env.rooms.getRoomSnapshot(code)!;
    assert.equal(snap.sim.config.stationControl.GROUND, "PLAYER");
    assert.equal(snap.sim.config.stationControl.TOWER, "PLAYER");
    assert.equal(snap.sim.config.stationControl.DEPARTURE, "AUTONOMOUS");

    const depAcId = snap.sim.aircraftOrder.find((id) => snap.sim.aircraft[id]?.controller === "GROUND")!;
    assert.ok(depAcId);

    // 1. Role restriction: Ground player cannot issue TOWER takeoff commands
    const forbidden = env.rooms.handleCommand({
      roomCode: code,
      playerId: "p_ground",
      commandId: "cmd_forb_1",
      cmd: {
        aircraftId: depAcId,
        controller: "TOWER",
        type: "TAKEOFF",
        parameters: { runway: snap.sim.airport.primaryDepartureRunway },
      },
    });
    assert.equal(forbidden.ok, false);
    assert.match(forbidden.reason, /Role restriction/i);

    // 2. Duplicate command rejection
    const pushCmd = env.rooms.handleCommand({
      roomCode: code,
      playerId: "p_ground",
      commandId: "cmd_dup_check",
      cmd: {
        aircraftId: depAcId,
        controller: "GROUND",
        type: "PUSHBACK",
      },
    });
    assert.equal(pushCmd.ok, true);

    const dupRetry = env.rooms.handleCommand({
      roomCode: code,
      playerId: "p_ground",
      commandId: "cmd_dup_check",
      cmd: {
        aircraftId: depAcId,
        controller: "GROUND",
        type: "PUSHBACK",
      },
    });
    assert.equal(dupRetry.ok, false);
    assert.match(dupRetry.reason, /Duplicate/i);

    // 3. Explicit Handoff from GROUND to TOWER + TOWER Acceptance
    const hoInit = env.rooms.handleCommand({
      roomCode: code,
      playerId: "p_ground",
      commandId: "cmd_ho_1",
      cmd: {
        aircraftId: depAcId,
        controller: "GROUND",
        type: "HANDOFF",
        parameters: { targetController: "TOWER" },
      },
    });
    assert.equal(hoInit.ok, true);
    assert.equal(snap.room.handoffs.length, 1);
    assert.equal(snap.room.handoffs[0].status, "PENDING");
    assert.equal(snap.sim.aircraft[depAcId].controller, "GROUND");

    const hoAccept = env.rooms.respondHandoff({
      roomCode: code,
      playerId: "p_tower",
      handoffId: snap.room.handoffs[0].id,
      accept: true,
    });
    assert.equal(hoAccept.ok, true);
    assert.equal(snap.room.handoffs[0].status, "ACCEPTED");
    assert.equal(snap.sim.aircraft[depAcId].controller, "TOWER");

    // 4. Disconnect AI takeover + reconnect control restoration
    env.rooms.handleClientDisconnect(groundClient);
    assert.equal(snap.room.slots.GROUND.connected, false);
    assert.equal(snap.room.slots.GROUND.aiTakeover, true);
    assert.equal(snap.sim.config.stationControl.GROUND, "AUTONOMOUS");

    env.rooms.joinRoom({
      roomCode: code,
      playerId: "p_ground",
      playerName: "GroundCtrl",
      client: groundClient,
    });
    assert.equal(snap.room.slots.GROUND.connected, true);
    assert.equal(snap.room.slots.GROUND.aiTakeover, false);
    assert.equal(snap.sim.config.stationControl.GROUND, "PLAYER");

    // 4b. Switching roles without resending playerName preserves existing callsign
    const switchedDep = env.rooms.claimRole(code, "p_ground", "", "DEPARTURE");
    assert.equal(switchedDep.ok, true);
    assert.equal(snap.room.slots.DEPARTURE.playerName, "GroundCtrl");
    assert.equal(env.rooms.claimRole(code, "p_ground", "", "GROUND").ok, true);
    assert.equal(snap.room.slots.GROUND.playerName, "GroundCtrl");

    // 5. Post-session performance report generation & broadcast to all connected clients
    const ended = env.rooms.endSession(code, "p_tower");
    assert.equal(ended.ok, true);
    assert.ok(ended.report);
    assert.equal(ended.report.airportIcao, "VIDP");
    assert.ok(ended.report.roleScores.GROUND.clearancesIssued >= 1);
    assert.ok(groundTypes.includes("SESSION_ENDED"), "Non-host client must receive SESSION_ENDED broadcast");
  } finally {
    env.cleanup();
  }
});

test("convertLiveTracksToSimulation maps real ADS-B flights onto real airport into clearance-gated ATC gameplay", () => {
  const env = createTempTestEnv();
  try {
    const vidp = env.airportService.getAirport("VIDP")!;
    assert.ok(vidp);

    const liveTracks: LiveAdsbTrack[] = [
      {
        readonly: true,
        icao24: "800a01",
        callsign: "IGO1471",
        registration: null,
        aircraftType: "A20N",
        originCountry: "India",
        lat: vidp.lat + 0.002,
        lon: vidp.lon - 0.002,
        baroAltFt: 777,
        geoAltFt: null,
        groundSpeedKts: 0,
        trackDeg: 90,
        verticalRateFpm: 0,
        onGround: true,
        lastUpdatedMs: Date.now(),
        stale: false,
        trail: [],
      },
      {
        readonly: true,
        icao24: "800a02",
        callsign: "AIC401",
        registration: null,
        aircraftType: "B77W",
        originCountry: "India",
        lat: vidp.lat + 0.08,
        lon: vidp.lon + 0.09,
        baroAltFt: 3800,
        geoAltFt: 4000,
        groundSpeedKts: 225,
        trackDeg: 85,
        verticalRateFpm: 1600,
        onGround: false,
        lastUpdatedMs: Date.now(),
        stale: false,
        trail: [],
      },
      {
        readonly: true,
        icao24: "896101",
        callsign: "UAE804",
        registration: null,
        aircraftType: null,
        originCountry: "United Arab Emirates",
        lat: vidp.lat - 0.14,
        lon: vidp.lon - 0.12,
        baroAltFt: 6500,
        geoAltFt: 6800,
        groundSpeedKts: 215,
        trackDeg: 40,
        verticalRateFpm: -900,
        onGround: false,
        lastUpdatedMs: Date.now(),
        stale: false,
        trail: [],
      },
    ];

    const converted = convertLiveTracksToSimulation({
      airportRecord: vidp,
      tracks: liveTracks,
      activeStation: "ALL",
      scenarioId: "MIXED",
    });

    assert.equal(converted.convertedCount, 3);
    assert.equal(converted.groundCount, 1);
    assert.equal(converted.airborneCount, 2);
    assert.equal(converted.sim.airport.icao, "VIDP");
    assert.equal(converted.sim.liveSnapshotMeta?.airportIcao, "VIDP");
    assert.equal(converted.sim.liveSnapshotMeta?.convertedCount, 3);

    const gnd = converted.sim.aircraft["IGO1471"];
    assert.ok(gnd);
    assert.equal(gnd.flightKind, "DEPARTURE");
    assert.equal(gnd.aircraftType, "A320");
    assert.equal(gnd.state, "AT_GATE");

    const depClimb = converted.sim.aircraft["AIC401"];
    assert.ok(depClimb);
    assert.equal(depClimb.state, "CLIMB");
    assert.equal(depClimb.controller, "DEPARTURE");

    const arr = converted.sim.aircraft["UAE804"];
    assert.ok(arr);
    assert.equal(arr.flightKind, "ARRIVAL");
    assert.equal(arr.state, "APPROACH");
    assert.equal(arr.airline, "Emirates");

    for (let i = 0; i < 40; i++) {
      stepSimulation(converted.sim, 0.5);
    }
    assert.ok(converted.sim.time >= 19.5);
  } finally {
    env.cleanup();
  }
});

test("Real bundled OpenStreetMap VIDP GeoJSON converts to connected curved airport layout", () => {
  const env = createTempTestEnv();
  try {
    const vidp = env.airportService.getAirport("VIDP")!;
    assert.ok(vidp);

    const osmPackPath = path.join(process.cwd(), "public", "data", "osm", "VIDP.geojson");
    assert.ok(fs.existsSync(osmPackPath), "public/data/osm/VIDP.geojson must exist");

    const geoJson = JSON.parse(fs.readFileSync(osmPackPath, "utf8")) as AirportGeoJsonCollection;
    assert.ok(geoJson.features.length > 500);

    const layout = convertAirportBundleToLayout({
      ...vidp,
      dataQuality: "Imported",
      hasOsmGeometry: true,
      geoJson,
    });

    assert.ok(layout.runwayIds.length >= 4, `Expected >= 4 runways at VIDP, got ${layout.runwayIds.length}`);
    assert.ok(layout.gateIds.length >= 20, `Expected >= 20 real gates/stands at VIDP, got ${layout.gateIds.length}`);
    assert.ok((layout.taxiwayChains?.length ?? 0) >= 50, "Expected rich curved taxiway chains");
    assert.ok((layout.visualTaxiways?.length ?? 0) >= 50, "Expected lossless visualTaxiways for VIDP");
    const totalVisualVertices = (layout.visualTaxiways ?? []).reduce((sum, seg) => sum + seg.points.length, 0);
    assert.ok(
      totalVisualVertices > 5000,
      `Expected lossless VIDP visualTaxiways (>5000 vertices from 5789 OSM verts), got ${totalVisualVertices}`
    );
    const curvedMultiVertPolylines = (layout.visualTaxiways ?? []).filter((seg) => seg.points.length >= 10).length;
    assert.ok(
      curvedMultiVertPolylines >= 20,
      `Expected >= 20 multi-vertex (>=10 pts) curved OSM taxiway polylines at VIDP, got ${curvedMultiVertPolylines}`
    );
    assert.ok((layout.apronPolygons?.length ?? 0) >= 10, "Expected real OSM apron polygons");
    assert.ok((layout.terminalBuildings?.length ?? 0) >= 5, "Expected real OSM terminal buildings");

    // Verify stitched graph finds valid ground taxi routes from real gates to primary departure runway
    const routes = getSuggestedTaxiRoutes(
      layout,
      `GATE_${layout.gateIds[0]}`,
      layout.primaryDepartureRunway
    );
    assert.ok(routes.length >= 1, `Expected valid route from gate ${layout.gateIds[0]} to ${layout.primaryDepartureRunway}`);

    const sim = createScenarioSimulation("MIXED", "ALL", "VIDP", layout);
    for (let i = 0; i < 30; i++) {
      stepSimulation(sim, 0.5);
    }
    assert.ok(sim.time >= 14.5);
  } finally {
    env.cleanup();
  }
});

test("Ground AGL readout, takeoff climb acceleration/pitch, and 3-deg glideslope landing stay synchronized on elevated real airports (VIDP 777ft)", () => {
  const env = createTempTestEnv();
  try {
    const vidp = env.airportService.getAirport("VIDP")!;
    const osmPackPath = path.join(process.cwd(), "public", "data", "osm", "VIDP.geojson");
    const geoJson = JSON.parse(fs.readFileSync(osmPackPath, "utf8")) as AirportGeoJsonCollection;
    const layout = convertAirportBundleToLayout({
      ...vidp,
      dataQuality: "Imported",
      hasOsmGeometry: true,
      geoJson,
    });

    const sim = createScenarioSimulation("SANDBOX", "TOWER", "VIDP", layout);
    sim.config.autoSpawnTraffic = false;
    sim.config.readbackErrorProbability = 0;
    const elev = layout.elevationFt;
    const rwyId = layout.primaryDepartureRunway;
    const rwy = layout.runways[rwyId];

    // Verify threshold entries are strictly near departure threshold (< 0.45 * runway length)
    for (const eid of rwy.entryNodeIds) {
      const node = layout.nodes[eid];
      assert.ok(node);
      assert.ok(
        alongRunwayNm(rwy, node.x, node.y) < rwy.lengthNm * 0.45,
        `Runway entry ${eid} should be at departure threshold, not far end`
      );
    }

    // Ground telemetry: never show 777ft AGL on ground!
    const ual = sim.aircraft["UAL452"];
    assert.ok(ual);
    const groundInfo = formatAltitudeReadout(ual, elev);
    assert.equal(groundInfo.isGround, true);
    assert.equal(groundInfo.aglFt, 0);
    assert.match(groundInfo.compact, /0ft/);
    assert.equal(computeAircraftPitchDeg(ual, elev), 0);

    // Takeoff roll -> rotation -> climb sync on high-elevation runway
    const takeoffAc = createDepartureAircraft(sim, {
      callsign: "IGO999",
      spokenCallsign: "iFly 999",
      gateId: layout.gateIds[0],
      targetRunway: rwyId,
      requiresPushback: false,
    });
    const tPt = runwayPoint(rwy, 0.05, 0);
    takeoffAc.x = tPt.x;
    takeoffAc.y = tPt.y;
    takeoffAc.heading = rwy.heading;
    takeoffAc.state = "LINE_UP_WAIT";

    const toCmd = submitClearanceDecision(
      sim,
      { aircraftId: takeoffAc.id, controller: "TOWER", type: "TAKEOFF", parameters: { runway: rwyId, initialAltitude: 4000 } },
      "PLAYER"
    );
    assert.equal(toCmd.ok, true);

    const stateOf = (a: { state: string }) => a.state;
    let sawRotate = false;
    let maxPitchInClimb = 0;
    for (let i = 0; i < 240; i++) {
      stepSimulation(sim, 0.5);
      if (stateOf(takeoffAc) === "TAKEOFF_ROLL") {
        assert.equal(Math.round(takeoffAc.altitude), Math.round(elev));
        assert.equal(formatAltitudeReadout(takeoffAc, elev).aglFt, 0);
        assert.equal(computeAircraftPitchDeg(takeoffAc, elev), 0);
      }
      if (stateOf(takeoffAc) === "ROTATE") {
        sawRotate = true;
        assert.ok(computeAircraftPitchDeg(takeoffAc, elev) > 2, "Rotation pitch should nose up");
      }
      if (stateOf(takeoffAc) === "CLIMB") {
        maxPitchInClimb = Math.max(maxPitchInClimb, computeAircraftPitchDeg(takeoffAc, elev));
      }
    }
    assert.equal(sawRotate, true, "Should pass smoothly through ROTATE phase");
    assert.ok(maxPitchInClimb >= 5, `Expected positive climb pitch >= 5 deg, got ${maxPitchInClimb}`);
    assert.ok(takeoffAc.altitude >= elev + 1200, "Should climb positively");
    assert.ok(takeoffAc.speed >= 190, `Climb speed should accelerate smoothly past 190kt, got ${takeoffAc.speed}`);

    // Synchronized 3-deg glideslope landing -> flare -> rollout onto forward exit (0ft AGL)
    const finPt = runwayPoint(rwy, -2.5, 0);
    const landAc = createArrivalAircraft(sim, {
      callsign: "AIC777",
      spokenCallsign: "Air India 777",
      x: finPt.x,
      y: finPt.y,
      heading: rwy.heading,
      altitude: elev + 850,
      speed: 155,
      targetRunway: rwyId,
      gateId: layout.gateIds[0],
      state: "FINAL",
      controller: "TOWER",
      assignedApproach: rwyId,
    });
    const lndCmd = submitClearanceDecision(
      sim,
      { aircraftId: landAc.id, controller: "TOWER", type: "LAND", parameters: { runway: rwyId } },
      "PLAYER"
    );
    assert.equal(lndCmd.ok, true);

    let sawDescentPitch = false;
    for (let i = 0; i < 320; i++) {
      stepSimulation(sim, 0.5);
      if (landAc.state === "LANDING" && landAc.altitude > elev + 80) {
        if (computeAircraftPitchDeg(landAc, elev) < 0) sawDescentPitch = true;
      }
      if (landAc.state === "HOLDING_SHORT") break;
    }
    assert.equal(sawDescentPitch, true, "Landing descent should show negative glideslope angle prior to flare");
    assert.equal(formatAltitudeReadout(landAc, elev).aglFt, 0);
    assert.equal(Math.round(landAc.altitude), Math.round(elev));
    assert.ok(
      landAc.state === "HOLDING_SHORT" || landAc.state === "VACATING_RUNWAY" || landAc.state === "ROLLOUT",
      `Expected landed/vacated on VIDP, got ${landAc.state}`
    );
  } finally {
    env.cleanup();
  }
});

test("Voice mute persistence and user local date/time formatting work accurately", () => {
  const store = new Map<string, string>();
  const prevWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };

  try {
    assert.equal(loadSavedVoiceEnabled(), true);
    saveVoiceEnabled(false);
    assert.equal(loadSavedVoiceEnabled(), false);
    saveVoiceEnabled(true);
    assert.equal(loadSavedVoiceEnabled(), true);
  } finally {
    (globalThis as { window?: unknown }).window = prevWindow;
  }

  const fixed = new Date(2026, 10, 11, 23, 14, 4);
  const dt = formatUserDateTime(fixed);
  assert.match(dt.timeText, /^23:14:04$/);
  assert.match(dt.dateText, /2026/);
  assert.match(dt.shortDateText, /11/);

  const wallAt30 = formatWallClockAtSimOffset(fixed.getTime(), 0, 30);
  assert.match(wallAt30, /^23:14:34$/);
});

test("Tower VACATE_RUNWAY clearance guides landed arrival onto chosen exit taxiway and expedites runway clearing", () => {
  const sim = createScenarioSimulation("SANDBOX", "TOWER", "KAST");
  sim.config.autoSpawnTraffic = false;
  sim.config.autoManageOtherStations = false;
  sim.config.readbackErrorProbability = 0;

  const rwyId = sim.airport.primaryArrivalRunway;
  const rwy = sim.airport.runways[rwyId];
  const ptTouch = runwayPoint(rwy, 0.25, 0);
  const arr = createArrivalAircraft(sim, {
    callsign: "AIC302",
    spokenCallsign: "Air India 302",
    x: ptTouch.x,
    y: ptTouch.y,
    heading: rwy.heading,
    altitude: sim.airport.elevationFt + 400,
    speed: 135,
    targetRunway: rwyId,
    gateId: sim.airport.gateIds[0],
    state: "FINAL",
    controller: "TOWER",
    assignedApproach: rwyId,
  });

  // 1. Disallowed while still airborne
  const airReject = submitClearanceDecision(
    sim,
    { aircraftId: arr.id, controller: "TOWER", type: "VACATE_RUNWAY", parameters: { runway: rwyId } },
    "PLAYER"
  );
  assert.equal(airReject.ok, false);
  assert.match(airReject.reason, /landed on the runway/i);

  // Land aircraft legitimately onto ROLLOUT
  assert.equal(
    submitClearanceDecision(
      sim,
      { aircraftId: arr.id, controller: "TOWER", type: "LAND", parameters: { runway: rwyId } },
      "PLAYER"
    ).ok,
    true
  );
  arr.altitude = sim.airport.elevationFt;
  arr.verticalSpeed = 0;
  arr.speed = 65;
  arr.state = "ROLLOUT";

  // 2. Disallowed from GROUND controller (must be respective TOWER controller)
  const wrongRole = submitClearanceDecision(
    sim,
    { aircraftId: arr.id, controller: "GROUND", type: "VACATE_RUNWAY", parameters: { runway: rwyId } },
    "PLAYER"
  );
  assert.equal(wrongRole.ok, false);
  assert.match(wrongRole.reason, /Tower Control/i);

  // 3. TOWER issues VACATE_RUNWAY choosing a specific forward exit + expedite
  const exits = getRunwayExitOptions(sim.airport, arr, rwyId);
  assert.ok(exits.length >= 1, "Expected forward runway exits");
  const chosenExit = exits.length >= 2 ? exits[1] : exits[0];

  const vacateRes = submitClearanceDecision(
    sim,
    {
      aircraftId: arr.id,
      controller: "TOWER",
      type: "VACATE_RUNWAY",
      parameters: {
        runway: rwyId,
        exitRwyNodeId: chosenExit.exitRwyNodeId,
        holdShortNodeId: chosenExit.holdShortNodeId,
        taxiway: chosenExit.taxiway,
        expedite: true,
      },
    },
    "PLAYER"
  );
  assert.equal(vacateRes.ok, true);
  assert.match(vacateRes.clearance?.phraseology ?? "", /expedite vacating runway/i);
  assert.equal(arr.vacateAssignedHoldShortId, chosenExit.holdShortNodeId);

  let sawExpediteVacatingSpeed = false;
  for (let i = 0; i < 160; i++) {
    stepSimulation(sim, 0.5);
    const curState = arr.state as AircraftState;
    if (curState === "VACATING_RUNWAY" && arr.speed >= 29) {
      sawExpediteVacatingSpeed = true;
    }
    if (curState === "HOLDING_SHORT") break;
  }

  assert.equal(sawExpediteVacatingSpeed, true, "Expedited vacating should move at ~30 kt");
  assert.equal(arr.state, "HOLDING_SHORT");
  assert.equal(arr.currentNodeId, chosenExit.holdShortNodeId);
});

test("Taxi route planner warns on occupied/head-on route conflicts and generates CLEAR bypass alternatives", () => {
  const sim = createScenarioSimulation("SANDBOX", "GROUND", "VIDP", (() => {
    const osmPackPath = path.join(process.cwd(), "public", "data", "osm", "VIDP.geojson");
    const geoJson = JSON.parse(fs.readFileSync(osmPackPath, "utf8")) as AirportGeoJsonCollection;
    return convertAirportBundleToLayout({
      icao: "VIDP",
      iata: "DEL",
      name: "Indira Gandhi International Airport",
      city: "New Delhi",
      country: "India",
      isoCountry: "IN",
      category: "INTERNATIONAL",
      lat: 28.5556,
      lon: 77.0952,
      elevationFt: 777,
      timezone: "Asia/Kolkata",
      dataQuality: "Imported",
      source: "OurAirports",
      hasOsmGeometry: true,
      runwayCount: 4,
      runways: [],
      frequencies: [],
      navaids: [],
      geoJson,
    });
  })());
  sim.config.autoSpawnTraffic = false;
  sim.config.readbackErrorProbability = 0;

  const gateId = sim.airport.gateIds[0];
  const rwyId = sim.airport.primaryDepartureRunway;
  const ual = createDepartureAircraft(sim, {
    callsign: "IGO412",
    spokenCallsign: "IndiGo 412",
    gateId,
    targetRunway: rwyId,
    requiresPushback: false,
  });

  const baselineRoutes = getSuggestedTaxiRoutes(
    sim.airport,
    ual.currentNodeId ?? `GATE_${gateId}`,
    rwyId,
    gateId,
    false,
    sim,
    ual.id
  );
  assert.ok(baselineRoutes.length >= 2, `Expected multiple route alternatives on VIDP, got ${baselineRoutes.length}`);
  assert.equal(baselineRoutes[0].conflictLevel, "CLEAR");

  // Place a stopped/opposing blocker directly on the midpoint of baselineRoutes[0]
  const primary = baselineRoutes[0];
  const midNodeId = primary.nodeIds[Math.floor(primary.nodeIds.length / 2)];
  const midNode = sim.airport.nodes[midNodeId];
  assert.ok(midNode);

  const blocker = createArrivalAircraft(sim, {
    callsign: "DAL814",
    spokenCallsign: "Delta 814",
    x: midNode.x,
    y: midNode.y,
    heading: 270,
    altitude: sim.airport.elevationFt,
    speed: 0,
    targetRunway: rwyId,
    gateId,
    state: "FINAL",
    controller: "GROUND",
  });
  blocker.state = "HOLD_POSITION";
  blocker.currentNodeId = midNode.id;

  const deconflictedRoutes = getSuggestedTaxiRoutes(
    sim.airport,
    ual.currentNodeId ?? `GATE_${gateId}`,
    rwyId,
    gateId,
    false,
    sim,
    ual.id
  );
  const blockedEntry = deconflictedRoutes.find((r) => r.nodeIds.join(">") === primary.nodeIds.join(">"));
  assert.ok(blockedEntry);
  assert.equal(blockedEntry.conflictLevel, "BLOCKED");
  assert.ok(blockedEntry.conflictCallsigns.includes("DAL814"));
  assert.match(blockedEntry.conflictReason ?? "", /DAL814/);

  const clearBypass = deconflictedRoutes.find((r) => r.conflictLevel === "CLEAR");
  assert.ok(clearBypass, "Expected at least one CLEAR bypass route avoiding blocked midNode");
  assert.equal(deconflictedRoutes[0].conflictLevel, "CLEAR", "CLEAR bypass route must be ranked first");
});

test("Clustered ground aircraft labels fan out without overlap and each label is directly clickable", () => {
  const icons = [
    { id: "IGO412", ax: 400, ay: 300 },
    { id: "IGO188", ax: 424, ay: 312 },
    { id: "IGO586", ax: 446, ay: 320 },
    { id: "DAL814", ax: 468, ay: 308 },
  ];

  const placed = placeAircraftLabels(
    icons.map((ic) => ({
      id: ic.id,
      ax: ic.ax,
      ay: ic.ay,
      boxW: 72,
      boxH: 27,
      preferredAbove: ic.id === "DAL814",
      priority: 0,
    })),
    icons,
    1200,
    800
  );

  assert.equal(placed.length, 4);

  // Pairwise check: zero overlap between any two placed label rectangles
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i].rect;
    for (let j = i + 1; j < placed.length; j++) {
      const b = placed[j].rect;
      const xOverlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const yOverlap = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      assert.equal(
        xOverlap * yOverlap,
        0,
        `Labels ${placed[i].id} and ${placed[j].id} should not overlap`
      );
    }
    // Check inside viewport bounds
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= 1200 && a.y + a.h <= 800);
  }

  // Clicking center of each placed label pill resolves to that exact aircraft
  const hits = placed.map((p) => ({ id: p.id, rect: p.rect }));
  for (const p of placed) {
    const cx = p.rect.x + p.rect.w / 2;
    const cy = p.rect.y + p.rect.h / 2;
    const hitId = hitTestAircraftOrLabel(cx, cy, icons, hits);
    assert.equal(hitId, p.id, `Expected clicking label center of ${p.id} to select ${p.id}`);
  }

  // Clicking directly on an aircraft icon selects that exact aircraft
  assert.equal(hitTestAircraftOrLabel(424, 312, icons, hits), "IGO188");
});
