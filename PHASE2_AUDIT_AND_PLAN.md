# AirCommand Phase 2 — Initial Codebase Audit & Implementation Plan

## 1. Existing Architecture & Dependency Stack

- **Frontend Stack** (`package.json`):
  - React `18.3.1` + React DOM `18.3.1`
  - TypeScript `5.4.5` (`strict: true`, `allowImportingTsExtensions: true`, `noEmit: true`)
  - Vite `5.2.11` (`vite.config.ts`, dev server on port `3000`)
  - Zustand `4.5.2` (`src/store/atcStore.ts`)
  - Tailwind CSS `3.4.3` + PostCSS + `lucide-react` `0.344.0`
- **Simulation & Core Engine Architecture (`src/engine/*`)**:
  - **Single Authoritative Entrypoint**: `submitClearanceDecision` (`src/engine/decisionEngine.ts`, 1,005 lines) accepts every instruction from both the Player UI and Autonomous Controllers (`GROUND`, `TOWER`, `DEPARTURE`).
  - **Lifecycle State Manager**: `src/engine/clearanceEngine.ts` (216 lines) creates structured `ATCClearance` records (`ISSUED` → `READBACK_PENDING` → `ACTIVE` → `EXECUTED` → `COMPLETED` / `READBACK_ERROR` / `CANCELLED` / `SUPERSEDED`).
  - **Hard Safety Guard**: `src/engine/validationEngine.ts` (543 lines) exposes `canAircraftMove(aircraft, simulationState)` and `canAircraftExecuteAction(aircraft, action, simulationState)` checking clearances, taxi route validity, runway crossings, line-up/takeoff, landing, vectors, and NORDO `RADIO_FAILURE` light-gun overrides.
  - **Pilot Requests & State Machine**: `src/engine/aircraftEngine.ts` (487 lines) manages state transitions (`AT_GATE`, `PUSHBACK_APPROVED`, `PUSHING_BACK`, `PUSHBACK_COMPLETE`, `TAXIING`, `HOLDING_SHORT`, `CROSSING_RUNWAY`, `LINE_UP_WAIT`, `TAKEOFF_CLEARED`, `TAKEOFF_ROLL`, `REJECTED_TAKEOFF`, `BRAKING`, `STOPPED_ON_RUNWAY`, `ROTATE`, `CLIMB`, `CRUISE_OUTBOUND`, `APPROACH`, `FINAL`, `CLEARED_TO_LAND`, `LANDING`, `TOUCHDOWN`, `ROLLOUT`, `VACATING_RUNWAY`, `GO_AROUND`, `MISSED_APPROACH`, `COMPLETED_*`).
  - **Kinematics Integration**: `src/engine/movementEngine.ts` (479 lines) consults `canAircraftMove` every tick, advancing ground aircraft along `assignedRouteNodeIds` (in local airport NM coordinates centered at `(0,0)`) and airborne aircraft via heading/vertical/speed integration.
  - **Autonomous Controllers**: `src/engine/autonomousControllers.ts` (573 lines) operates un-owned stations (`GROUND`, `TOWER`, `DEPARTURE`) through the exact same `submitClearanceDecision` pipeline.
  - **Simulation Lifecycle & Scenarios**: `src/engine/simulation.ts` (761 lines) creates scenario states (`NORMAL_OPS`, `CROSSINGS_AND_READBACK`, `EMERGENCY_AND_NORDO`, `RUSH_HOUR`, `SANDBOX`), spawns aircraft, and detects separation violations and runway incursions.
  - **Verification**: `src/engine/verificationSuite.ts` (689 lines) + `tests/*.test.ts` (31 passing automated tests executed natively via Node.js v22 `node --test`).
- **Existing Airport Map, Audio, & UI**:
  - **World/Coordinate System**: Local Cartesian `(x, y)` in nautical miles around airport center `(0, 0)`, with custom vector runway helpers (`alongRunwayNm`, `crossTrackRunwayNm`, `runwayPoint`, `headingDiffDeg`) in `src/data/asteriaAirport.ts` (1,333 lines). Contains 4 hardcoded airports (`KAST`, `KMRD`, `KVEL`, `KSOL`).
  - **Rendering**: HTML5 `<canvas>` 2D chart/radar renderer (`src/components/RadarScopeCanvas.tsx`, 1,365 lines) supporting pan, zoom, `chartRotationDeg`, topographic contours, realistic runway markings, rounded taxiways, Light Chart / Dark Radar theme, and clickable aircraft datablocks.
  - **UI Panels**: `TopBar`, `FlightStripRack`, `ClearanceControlDeck`, `RadioCommsLog` (tabbed with `AircraftSideProfile`), `RadioVoiceMenu`, `AirportLandingScreen`, `VerificationModal`.
  - **Audio**: `src/utils/natoPhonetics.ts` + `src/utils/radioAudio.ts` (Web Speech API + Web Audio API VHF radio static/squelch with per-station frequency isolation).
  - **Storage**: `localStorage` helpers in `src/utils/storage.ts` (`asteria_atc_selected_airport_v1`, `asteria_atc_selected_scenario_v1`, `asteria_atc_theme_v1`).
  - **Networking / Multiplayer**: None currently (`client-only` Vite SPA). No backend server or WebSocket protocol yet.

## 2. Reusable Components & Technical Limitations Identified

### Directly Reusable (Preserve & Extend)
1. **Pure Node-Compatible Simulation Core (`src/engine/*`)**: Zero DOM/React dependencies — every file already uses standard ES imports with `.ts` extensions and runs identically in Node.js v22 and the browser! This enables **true shared TypeScript engine execution on both offline single-player clients AND the authoritative multiplayer backend**.
2. **Clearance Validation & Lifecycle Model**: `ATCClearance`, `canAircraftMove`, `canAircraftExecuteAction`, `submitClearanceDecision`, `processPilotReadbacks`, `isRunwayOccupied`.
3. **UI Components**: `Accordion`, `AircraftSideProfile`, `aircraftCatalog`, `VerificationModal`, `FlightStripRack` strip cards, `ClearanceControlDeck` command buttons (extended with role-permission checks & multi-user lock feedback), `RadioCommsLog` (extended with Controller Chat & Handoff notifications), `RadioVoiceMenu`, Light/Dark theme CSS variable architecture.
4. **Vector Runway & Graph Pathfinding Math**: `alongRunwayNm`, `crossTrackRunwayNm`, `runwayPoint`, `findRouteAlongTaxiways` / shortest-path fallback.

### Key Limitations Requiring Phase 2 Refactoring
1. **Hardcoded Fictional `AirportId` Union (`"KAST" | "KMRD" | "KVEL" | "KSOL"`)**: Must widen `AirportId` / `icao` to `string` so real global airports (`VIDP`, `VABB`, `VOBL`, etc.) load identically alongside legacy airports.
2. **Fixed Taxiway Letter Union (`TaxiwayName = "A" | ... | "APRON"`)**: Real airports (OSM/AIP) have taxiways like `"N"`, `"M"`, `"W1"`, `"E4"`, `"Z"`, `"P"`, `"TWY1"`, `"Q"`, etc. Must widen `TaxiwayName` to `string`.
3. **Rigid Exit Node String Parsing**: `movementEngine.ts` line 232 (`nextNode.id.split("_")[2]`) and `verificationSuite.ts` use suffix conventions. Real OSM graphs have arbitrary node IDs — we will preserve Phase 1 ID conventions for `KAST..KSOL` and use adjacency-based runway entry lookup for imported real airports.
4. **Local NM vs Geodetic WGS84 Coordinates**: Simulation engine operates cleanly in flat local `(x, y)` NM around airport ARP `(lat0, lon0)`. By adding an exact bidirectional tangent-plane projection (`latLonToLocalNm`, `localNmToLatLon`), real OurAirports + OSM GeoJSON convert into native playable `AirportLayout` graphs cleanly!
5. **Controller Handoffs & Permissions**: Currently `GROUND → TOWER → DEPARTURE` handoffs occur in single-player `submitClearanceDecision`. In multiplayer, `HandoffService` must track `pendingHandoff` (source, destination, timestamp, `ACCEPTED/PENDING/REJECTED`), prevent duplicate/cross-role commands unless explicit override/owner matches, and record individual + team scores.
6. **Radio Speech Hardcoding**: `radioAudio.ts` hardcoded `KAST/KMRD/KVEL/KSOL` and `08/09/26/27` runways; must generalize runway/ICAO pronunciation cleanly for any real ICAO (`VIDP`, `VABB`, etc.) and any runway designator (`29R`, `14L`, `09/27`, `11/29`, `34`).
7. **Environment Reality Check**: `psql` / Docker PostgreSQL daemon is currently unavailable on this Windows host, whereas Node.js `v22.18.0` includes native `node:sqlite`, and outbound HTTPS to OurAirports (`davidmegginson.github.io`) and OpenSky Network (`opensky-network.org`) returns HTTP `200`. We will implement the full PostgreSQL+PostGIS SQL schema (`server/db/schema.sql`) + repository interface, backed by embedded SQLite (`node:sqlite`) locally so the server persists data out-of-the-box without external setup AND swaps cleanly to Postgres/PostGIS via `DATABASE_URL`.

## 3. Component Audit Matrix

### Reuse Without Breaking
- `src/engine/clearanceEngine.ts`, `src/engine/validationEngine.ts`, `src/engine/verificationSuite.ts`
- `src/components/Accordion.tsx`, `src/components/AircraftSideProfile.tsx`, `src/components/VerificationModal.tsx`, `src/components/RadioVoiceMenu.tsx`
- `src/data/aircraftCatalog.ts`, `src/utils/natoPhonetics.ts`, `src/index.css` theme tokens

### Modify / Extend
- `src/types/atc.ts`: Generalize `AirportId`, `TaxiwayName`, add geo/metadata fields (`lat`, `lon`, `iata`, `country`, `dataQuality`, `geojson`), 16 Phase-2 aircraft phase labels mapped alongside engine states, multiplayer room/controller/handoff/scoring types, live ADS-B read-only track types.
- `src/data/asteriaAirport.ts`: Keep `KAST/KMRD/KVEL/KSOL` untouched for Phase 1 tests; generalize `findRouteAlongTaxiways` + add Dijkstra shortest-route builder for arbitrary OSM taxiway graphs + runway/navaid spoken formatters + geo projection utilities.
- `src/engine/decisionEngine.ts`, `aircraftEngine.ts`, `movementEngine.ts`, `simulation.ts`, `autonomousControllers.ts`: Support aircraft performance profiles per airframe type, arbitrary real airport graphs, multiplayer role ownership/handoff checks, scoring attribution, and configurable traffic scenarios (`LIGHT`, `MEDIUM`, `HEAVY`, `RUSH_HOUR`, `ARRIVAL_HEAVY`, `DEPARTURE_HEAVY`, `MIXED`, `EMERGENCY`).
- `src/utils/storage.ts` & `src/utils/offlineDb.ts` (new): IndexedDB caching + backward-compatible `localStorage` settings.
- `src/store/atcStore.ts`: Manage app view mode (`GLOBAL_MAP`, `LIVE_OBSERVATION`, `SIMULATION`, `MULTIPLAYER_LOBBY`, `AIRPORT_EDITOR`), authoritative WebSocket sync + local offline loop, ADS-B state store, and post-session stats.
- `src/components/*` (`App.tsx`, `TopBar.tsx`, `FlightStripRack.tsx`, `ClearanceControlDeck.tsx`, `RadarScopeCanvas.tsx`, `RadioCommsLog.tsx`): Wire real airport overlay switcher, MapLibre GL JS global/airport maps, controller handoff/coordination tabs, multiplayer room status, and offline/freshness badges while preserving all Phase 1 workflows and Light/Dark themes.

### New Frontend Modules
- `src/utils/geo.ts`: WGS84 ↔ Local NM tangent projection, haversine distance, bounding box helpers.
- `src/utils/osmToAirport.ts`: Client/shared GeoJSON parser converting OurAirports runways + OSM GeoJSON (runways, taxiways, aprons, gates, holding positions, terminals, tower, boundaries) into playable `AirportLayout` + quality report.
- `src/utils/offlineDb.ts`: IndexedDB (`OfflineDataService`) caching global airport index, airport GeoJSON & edits, scenarios, settings.
- `src/services/apiClient.ts`: REST + WebSocket (`socket.io-client` or typed native WebSocket client with auto-reconnect/interpolation) talking to the backend and cleanly falling back offline.
- `src/components/GlobalAirportMap.tsx`: **MapLibre GL JS** interactive world map with India-first dataset + global search (ICAO/IATA/name/country), clustering, category filters, nearby discovery, detailed preview card, Live Observation / Simulation / Multiplayer launch buttons.
- `src/components/AirportGeometryEditor.tsx`: Interactive editor allowing adding/editing taxiways, runways, gates, stands, holding points, and persisting edits cleanly to backend DB + IndexedDB.
- `src/components/LiveTrafficView.tsx`: **READ-ONLY** ADS-B live traffic map & inspector on MapLibre GL JS (OpenSky polling data via backend, trails, track rotation, freshness timestamps, zero ATC clearance buttons).
- `src/components/MultiplayerLobby.tsx`: Create/join room by code, choose airport & difficulty/scenario, claim `GROUND` / `TOWER` / `DEPARTURE`, ready toggle, connection monitoring, host launch.
- `src/components/PostSessionModal.tsx`: Individual & team ATC performance report upon session end or demand.

## 4. Database & Backend Design

### Database Schema (`server/db/schema.sql` — PostgreSQL/PostGIS Ready + SQLite Runtime)
- `airports`: `icao` (PK), `iata`, `name`, `city`, `country`, `category`, `lat`, `lon`, `elevation_ft`, `timezone`, `data_quality`, `source`, `has_osm_geometry`, `geom` (PostGIS `Point(4326)`), `updated_at`
- `airport_geometries`: `icao` (FK/PK), `geojson` (JSONB/TEXT — FeatureCollection with runways, taxiways, aprons, terminals, gates, stands, holding_points, tower, boundary), `runways_json`, `frequencies_json`, `navaids_json`, `data_quality`, `edited_by_user`, `version`, `updated_at`
- `room_sessions`: `room_code`, `host_player_id`, `airport_icao`, `scenario_id`, `difficulty`, `status`, `state_snapshot_json`, `created_at`, `updated_at`
- `session_scores`: `id`, `room_code`, `airport_icao`, `duration_sec`, `team_score`, `departures_completed`, `arrivals_completed`, `conflicts`, `incursions`, `player_breakdown_json`, `created_at`

### Backend Modules (`server/src/*` on Node.js + `ws` + HTTP REST)
- `server/index.ts`: HTTP REST + WebSocket upgrade server (port `3001`, proxied cleanly via `vite.config.ts` `/api` & `/ws`).
- `server/db/DatabaseService.ts`: Unified storage service using native `node:sqlite` (`server/data/aircommand.db`) + optional Postgres/PostGIS driver adapter when `DATABASE_URL` is configured.
- `server/services/AirportImportService.ts`: Fetches & parses authoritative OurAirports CSV records (`airports.csv`, `runways.csv`, `airport-frequencies.csv`, `navaids.csv`) — prioritizing verified India airports (`VIDP, VABB, VOBL, VOMM, VOHS, VECC, VOCI, VAGO, VAAH` + regional/domestic India) plus major worldwide airports — AND imports real Overpass OpenStreetMap infrastructure GeoJSON on demand cleanly respecting rate limits.
- `server/services/AirportService.ts` & `AirportGeometryService.ts`: Global airport search, filters, category classification, nearby radius search, GeoJSON CRUD, quality tagging (`Verified`, `Imported`, `Manually edited`, `Incomplete`, `Needs review`), and persistent editor updates.
- `server/services/ADSBProviderService.ts`: Pluggable ADS-B provider abstraction (`OpenSkyProvider`) with single backend poller, per-region TTL cache (10–15s), rate-limit/429 exponential backoff, data freshness tracking, and strict separation from simulation engine.
- `server/services/MultiplayerRoomService.ts`: Authoritative room lifecycle (unique 6-char room codes, host controls, role claiming for `GROUND` / `TOWER` / `DEPARTURE`, ready state, heartbeat, grace-window disconnect handling + automatic AI takeover + seamless player reconnect/handback).
- `server/services/SimulationHostService.ts`, `HandoffService.ts`, `CommunicationService.ts`, `ScoringService.ts`: Authoritative server tick running our shared `src/engine/*` simulation clock, validating per-role command permissions & duplicate command IDs, managing explicit handoffs & controller coordination messages, computing live individual/team ATC efficiency & penalty scores.

## 5. Phased Implementation Sequence

1. **Stage 1**: Codebase Audit & Plan (this document).
2. **Stage 2 & 3**: Dependencies (`maplibre-gl`, `ws`, `@types/ws`), backend database & `AirportImportService` / `AirportService` seeding India + global OurAirports records, MapLibre GL JS **Global Airport Map** UI (`GlobalAirportMap.tsx`) with search/filters/clusters/India priority.
3. **Stage 4**: Backend `AirportGeometryService` (OSM Overpass import + GeoJSON normalization) & interactive **`AirportGeometryEditor.tsx`** with database + local persistence.
4. **Stage 5 & 6**: Real-world geo-to-NM engine bridge (`src/utils/osmToAirport.ts`, `src/utils/geo.ts`), generalized adjacency & performance profiles across all aircraft types, all 16 aircraft phases, dynamic NATO speech generalization, and real-airport simulation mode inside `AirCommand`.
5. **Stage 7**: Backend `ADSBProviderService` (OpenSky integration + cache + rate-limit backoff) + **READ-ONLY Live Traffic Observation Mode (`LiveTrafficView.tsx`)**.
6. **Stages 8–12**: Node WebSocket **Multiplayer Server & Client Synchronization** (`MultiplayerRoomService`, `HandoffService`, `ScoringService`, `CommunicationService`, `MultiplayerLobby.tsx`, role-enforced `ClearanceControlDeck`, controller chat & handoff bar, traffic difficulty scenarios, and `PostSessionModal.tsx`).
7. **Stage 13**: **Offline Data Service (`offlineDb.ts` IndexedDB)** caching airport lists, GeoJSON geometry, custom edits, and offline solo simulation with clear online/offline network guards for ADS-B & Multiplayer.
8. **Stage 14**: Full End-to-End Integration Tests (`tests/*.test.ts`), production `npm run build`, and live browser verification across Global Map, Real Airport Ops, Live Traffic, Offline Mode, and 3-Player Multiplayer.
