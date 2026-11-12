export type AirportId = string;

export type ControllerRole = "GROUND" | "TOWER" | "DEPARTURE";

export type PlayerRoleMode = ControllerRole | "ALL";

export type RunwayId = string;

export type TaxiwayName = string;

export type AircraftState =
  | "AT_GATE"
  | "PUSHBACK_APPROVED"
  | "PUSHING_BACK"
  | "PUSHBACK_COMPLETE"
  | "TAXIING"
  | "HOLDING_SHORT"
  | "CROSSING_RUNWAY"
  | "HOLD_POSITION"
  | "LINE_UP_WAIT"
  | "TAKEOFF_CLEARED"
  | "TAKEOFF_CANCELLED"
  | "TAKEOFF_ROLL"
  | "REJECTED_TAKEOFF"
  | "BRAKING"
  | "STOPPED_ON_RUNWAY"
  | "ROTATE"
  | "CLIMB"
  | "CRUISE_OUTBOUND"
  | "APPROACH"
  | "FINAL"
  | "CLEARED_TO_LAND"
  | "LANDING"
  | "TOUCHDOWN"
  | "ROLLOUT"
  | "VACATING_RUNWAY"
  | "GO_AROUND"
  | "MISSED_APPROACH"
  | "COMPLETED_DEPARTURE"
  | "COMPLETED_ARRIVAL";

export type ClearanceType =
  | "PUSHBACK"
  | "TAXI"
  | "HOLD_SHORT"
  | "CROSS_RUNWAY"
  | "LINE_UP"
  | "TAKEOFF"
  | "CANCEL_TAKEOFF"
  | "REJECT_TAKEOFF"
  | "LAND"
  | "GO_AROUND"
  | "VACATE_RUNWAY"
  | "APPROACH"
  | "HEADING"
  | "ALTITUDE"
  | "SPEED"
  | "DIRECT"
  | "HANDOFF"
  | "HOLD_POSITION"
  | "UNABLE"
  | "LIGHT_GUN";

export type ClearanceLifecycle =
  | "ISSUED"
  | "READBACK_PENDING"
  | "READBACK_ERROR"
  | "ACTIVE"
  | "EXECUTED"
  | "COMPLETED"
  | "CANCELLED"
  | "SUPERSEDED"
  | "EXPIRED";

export interface ATCClearance {
  id: string;
  aircraftId: string;
  controller: ControllerRole;
  issuedBy: "PLAYER" | "AUTONOMOUS";
  type: ClearanceType;
  parameters: Record<string, unknown>;
  issuedAt: number;
  readbackDueAt: number;
  acknowledged: boolean;
  active: boolean;
  cancelled: boolean;
  lifecycle: ClearanceLifecycle;
  phraseology: string;
  expectedReadbackText: string;
  actualReadbackText?: string;
}

export type OperationalAction =
  | "PUSHBACK"
  | "TAXI"
  | "CROSS_RUNWAY"
  | "ENTER_RUNWAY_LINE_UP"
  | "TAKEOFF_ROLL"
  | "LAND"
  | "GO_AROUND"
  | "CHANGE_HEADING"
  | "CHANGE_ALTITUDE"
  | "CHANGE_SPEED"
  | "FLY_APPROACH"
  | "DIRECT_FIX"
  | "VACATE_RUNWAY";

export interface ValidationResult {
  allowed: boolean;
  reason: string;
  clearanceId?: string;
}

export type OperationMode = "NORMAL_OPERATION" | "EMERGENCY_OPERATION";
export type EmergencyType =
  | "NONE"
  | "ENGINE_FAILURE"
  | "REJECTED_TAKEOFF_ABORT"
  | "MEDICAL"
  | "LOW_FUEL";

export type CommStatus = "NORMAL" | "RADIO_FAILURE";
export type NordoBehaviorMode = "LIGHT_GUN_SIGNALS" | "PREDEFINED_LOST_COMM";

export type LightGunSignal =
  | "STEADY_GREEN"
  | "FLASHING_GREEN"
  | "STEADY_RED"
  | "FLASHING_RED";

export type PilotRequestType =
  | "PUSHBACK"
  | "TAXI"
  | "CROSS_RUNWAY"
  | "TAKEOFF"
  | "LANDING"
  | "CLIMB_HIGHER"
  | "APPROACH_CLEARANCE"
  | "APPROACH_VECTORS"
  | "GATE_TAXI"
  | "EMERGENCY_PRIORITY";

export interface PilotRequest {
  id: string;
  type: PilotRequestType;
  controller: ControllerRole;
  message: string;
  requestedAt: number;
  runway?: RunwayId;
  gate?: string;
  resolved: boolean;
}

export type FlightKind = "DEPARTURE" | "ARRIVAL";

export interface Aircraft {
  id: string;
  callsign: string;
  spokenCallsign: string;
  airline: string;
  aircraftType: string;
  wakeCategory: "MEDIUM" | "HEAVY";
  flightKind: FlightKind;
  squawk: string;
  originIcao?: string;
  originName?: string;
  destinationIcao?: string;
  destinationName?: string;
  registration?: string;
  icao24?: string;
  cruiseFlightLevel?: string;
  soulsOnBoard?: string;
  fuelRemainingPct?: number;

  state: AircraftState;
  controller: ControllerRole;
  operationMode: OperationMode;
  emergencyType: EmergencyType;
  commStatus: CommStatus;
  nordoMode: NordoBehaviorMode;

  // Position & Kinematics (World coordinates in NM; +x East, +y North)
  x: number;
  y: number;
  heading: number; // degrees 0-360 (0=N, 90=E, 180=S, 270=W)
  altitude: number; // feet MSL
  speed: number; // knots (groundspeed on ground, IAS/TAS in air)
  verticalSpeed: number; // feet per minute

  // Ground route & assignments (only populated/changed via validated clearances!)
  gateId?: string;
  pushbackSpotId?: string;
  targetRunway: RunwayId;
  assignedDepartureFix?: string;
  currentNodeId?: string;
  assignedRouteNodeIds: string[];
  assignedRouteTaxiways: TaxiwayName[];
  routeStepIndex: number;
  holdingAtRunway?: RunwayId;
  holdingShortReason?: "DEPARTURE_RUNWAY" | "CROSSING_REQUIRED" | "ATC_INSTRUCTION" | "ROUTE_END" | "TRAFFIC";
  yieldToAircraftId?: string;
  stepBackTargetNodeId?: string;
  crossRunwayCleared: Record<string, boolean>;
  lightGunAuthorized?: LightGunSignal;
  vacatingExitNodeId?: string;
  vacateAssignedRwyNodeId?: string;
  vacateAssignedHoldShortId?: string;
  vacateAssignedTaxiway?: TaxiwayName;
  expediteVacate?: boolean;
  pushbackTargetHeading?: number;
  requiresPushback: boolean;

  // Airborne assigned clearances (only set after readback & validation!)
  assignedHeading: number | null;
  assignedTurnDirection: "LEFT" | "RIGHT" | "NEAREST";
  assignedAltitude: number | null;
  assignedSpeed: number | null;
  assignedApproach: RunwayId | null;
  assignedDirectFix: string | null;

  // Clearances & requests
  clearances: ATCClearance[];
  pendingRequest: PilotRequest | null;
  hasReadbackError: boolean;
  readbackErrorClearanceId?: string;
  armNextReadbackError: boolean;

  // Tracking & metrics
  spawnedAt: number;
  stateEnteredAt: number;
  lastTransmissionAt: number;
  trail: Array<{ x: number; y: number }>;
  minimumsGoAroundTriggered?: boolean;
}

export type TaxiNodeKind =
  | "GATE"
  | "PUSHBACK_SPOT"
  | "TAXIWAY"
  | "HOLD_SHORT"
  | "RUNWAY_CROSSING"
  | "RUNWAY_ENTRY"
  | "RUNWAY_EXIT";

export interface TaxiNode {
  id: string;
  x: number;
  y: number;
  kind: TaxiNodeKind;
  label?: string;
  gateId?: string;
  runwayId?: RunwayId;
  holdShortForRunway?: RunwayId;
  pairedSpotId?: string;
  isNorthSide?: boolean;
}

export interface TaxiEdge {
  id: string;
  from: string;
  to: string;
  taxiway: TaxiwayName;
  runwayCrossing?: RunwayId;
}

export interface RunwaySpec {
  id: RunwayId;
  oppositeId: string;
  heading: number;
  thresholdX: number;
  thresholdY: number;
  endX: number;
  endY: number;
  ux: number;
  uy: number;
  lengthNm: number;
  widthNm: number;
  elevationFt: number;
  entryNodeIds: string[];
  exitNodeIds: string[];
  crossingNodeIds: string[];
  holdShortNodeIds: string[];
}

export interface NavFix {
  id: string;
  x: number;
  y: number;
  kind: "ARRIVAL" | "DEPARTURE" | "IAF" | "MISSED";
  label: string;
}

export interface AirportTerminalBuilding {
  name?: string;
  kind: "TERMINAL" | "CARGO" | "TOWER" | "HANGAR";
  polygon: Array<{ x: number; y: number }>;
  label?: string;
  labelX?: number;
  labelY?: number;
  jetbridges?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
}

export interface AirportTaxiwayChain {
  taxiway: TaxiwayName;
  nodeIds: string[];
  dashed?: boolean;
}

export interface AirportVisualTaxiway {
  taxiway: TaxiwayName;
  points: Array<{ x: number; y: number }>;
}

export interface AirportLayout {
  id: AirportId;
  icao: AirportId;
  name: string;
  city: string;
  controllerPrefix: string;
  difficulty: "STANDARD" | "INTERMEDIATE" | "CHALLENGING" | "EXPERT";
  description: string;
  windText: string;
  windLabel: string;
  elevationFt: number;
  runwayIds: RunwayId[];
  primaryDepartureRunway: RunwayId;
  primaryArrivalRunway: RunwayId;
  runways: Record<string, RunwaySpec>;
  nodes: Record<string, TaxiNode>;
  edges: TaxiEdge[];
  fixes: Record<string, NavFix>;
  gateIds: string[];
  arrivalFixIds: string[];
  departureFixIds: string[];
  iafByRunway: Record<string, string>;
  terminalZones: Array<{ label: string; x1: number; y1: number; x2: number; y2: number; angleDeg?: number }>;
  taxiwayLabels: Array<{ label: string; x: number; y: number }>;
  chartRotationDeg?: number;
  apronPolygons?: Array<Array<{ x: number; y: number }>>;
  terminalBuildings?: AirportTerminalBuilding[];
  taxiwayChains?: AirportTaxiwayChain[];
  visualTaxiways?: AirportVisualTaxiway[];
  controlTower?: { x: number; y: number };
  // Phase 2 Real-World Geodetic & Infrastructure Fields
  lat?: number;
  lon?: number;
  iata?: string;
  country?: string;
  timezone?: string;
  category?: AirportCategory;
  dataQuality?: AirportDataQuality;
  isRealWorld?: boolean;
  frequencies?: AirportFrequency[];
  navaids?: AirportNavaid[];
  rawRunways?: RawRunwayMetadata[];
  geoJson?: AirportGeoJsonCollection;
}

export interface RadioMessage {
  id: string;
  timestamp: number;
  sender: string;
  recipient: string;
  controller: ControllerRole;
  aircraftId?: string;
  category: "PILOT_REQUEST" | "ATC_CLEARANCE" | "PILOT_READBACK" | "READBACK_ERROR" | "EMERGENCY" | "SYSTEM";
  text: string;
}

export interface SafetyIncident {
  id: string;
  timestamp: number;
  severity: "WARNING" | "VIOLATION" | "CRITICAL";
  code: string;
  message: string;
  aircraftIds: string[];
}

export interface StationControlConfig {
  GROUND: "PLAYER" | "AUTONOMOUS";
  TOWER: "PLAYER" | "AUTONOMOUS";
  DEPARTURE: "PLAYER" | "AUTONOMOUS";
}

export type ScenarioId =
  | "LOW_TRAFFIC"
  | "NORMAL_OPS"
  | "RUSH_HOUR"
  | "CROSSINGS_AND_READBACK"
  | "EMERGENCY_AND_NORDO"
  | "SANDBOX"
  | "LIGHT"
  | "MEDIUM"
  | "HEAVY"
  | "ARRIVAL_HEAVY"
  | "DEPARTURE_HEAVY"
  | "MIXED"
  | "EMERGENCY";

export type DifficultyLevel = "EASY" | "STANDARD" | "CHALLENGING" | "EXPERT";

export type AirportCategory =
  | "INTERNATIONAL"
  | "DOMESTIC"
  | "REGIONAL"
  | "CARGO"
  | "MILITARY"
  | "GA";

export type AirportDataQuality =
  | "Verified"
  | "Imported"
  | "Manually edited"
  | "Incomplete"
  | "Needs review";

export type AircraftPhaseLabel =
  | "Parked"
  | "Pushback"
  | "Taxi-out"
  | "Holding short"
  | "Line-up"
  | "Takeoff"
  | "Initial climb"
  | "Departure"
  | "Cruise"
  | "Descent"
  | "Approach"
  | "Landing"
  | "Taxi-in"
  | "Parking"
  | "Go-around"
  | "Diversion";

export interface RawRunwayMetadata {
  id: string;
  leIdent: string;
  heIdent: string;
  lengthFt: number;
  widthFt: number;
  surface: string;
  lighted: boolean;
  closed: boolean;
  leLat?: number;
  leLon?: number;
  leHeadingDegT?: number;
  heLat?: number;
  heLon?: number;
  heHeadingDegT?: number;
}

export interface AirportFrequency {
  id: string;
  type: string;
  description: string;
  frequencyMhz: number;
}

export interface AirportNavaid {
  ident: string;
  name: string;
  type: string;
  frequencyKhz: number;
  lat: number;
  lon: number;
}

export interface AirportGeoJsonFeature {
  type: "Feature";
  id?: string;
  properties: Record<string, unknown>;
  geometry: {
    type: "Point" | "LineString" | "Polygon";
    coordinates: unknown;
  };
}

export interface AirportGeoJsonCollection {
  type: "FeatureCollection";
  features: AirportGeoJsonFeature[];
}

export interface AirportRecord {
  icao: string;
  iata: string | null;
  name: string;
  city: string;
  country: string;
  isoCountry: string;
  category: AirportCategory;
  lat: number;
  lon: number;
  elevationFt: number;
  timezone: string;
  dataQuality: AirportDataQuality;
  source: string;
  hasOsmGeometry?: boolean;
  runwayCount?: number;
  runways: RawRunwayMetadata[];
  frequencies: AirportFrequency[];
  navaids: AirportNavaid[];
  geoJson?: AirportGeoJsonCollection | null;
  updatedAt?: string;
}

export interface LiveAdsbTrack {
  readonly: true;
  icao24: string;
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  manufacturer?: string | null;
  model?: string | null;
  operator?: string | null;
  originCountry: string | null;
  lat: number;
  lon: number;
  baroAltFt: number | null;
  geoAltFt: number | null;
  groundSpeedKts: number | null;
  trackDeg: number | null;
  verticalRateFpm: number | null;
  onGround: boolean;
  lastUpdatedMs: number;
  stale: boolean;
  trail: Array<{ lat: number; lon: number; altFt: number | null; ts: number }>;
}

export interface LiveTrafficSnapshot {
  provider: string;
  fetchedAtMs: number;
  cached: boolean;
  rateLimited: boolean;
  staleThresholdMs: number;
  error: string | null;
  tracks: LiveAdsbTrack[];
}

export interface ControllerHandoff {
  id: string;
  aircraftId: string;
  callsign: string;
  fromController: ControllerRole;
  toController: ControllerRole;
  issuedAt: number;
  respondedAt?: number;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  note?: string;
}

export interface ControllerChatMessage {
  id: string;
  senderPlayerId: string;
  senderName: string;
  senderRole: ControllerRole | "SYSTEM";
  timestamp: number;
  text: string;
}

export interface RoomPlayerSlot {
  role: ControllerRole;
  playerId: string | null;
  playerName: string | null;
  connected: boolean;
  ready: boolean;
  aiTakeover: boolean;
  lastSeenMs: number;
}

export interface RoleScoreMetrics {
  role: ControllerRole;
  playerName: string | null;
  clearancesIssued: number;
  accurateClearances: number;
  handoffsCompleted: number;
  handoffsMissed: number;
  avgResponseTimeSec: number;
  penalties: number;
  score: number;
}

export interface SessionPerformanceReport {
  roomCode: string;
  airportIcao: string;
  airportName: string;
  scenarioId: ScenarioId;
  difficulty: DifficultyLevel;
  durationSeconds: number;
  teamScore: number;
  safetyScore: number;
  departuresCompleted: number;
  arrivalsCompleted: number;
  incursions: number;
  separationViolations: number;
  incorrectClearances: number;
  avgHandlingTimeSec: number;
  roleScores: Record<ControllerRole, RoleScoreMetrics>;
}

export interface MultiplayerRoomState {
  roomCode: string;
  hostPlayerId: string;
  airportIcao: string;
  airportName: string;
  scenarioId: ScenarioId;
  difficulty: DifficultyLevel;
  status: "LOBBY" | "ACTIVE" | "COMPLETED";
  slots: Record<ControllerRole, RoomPlayerSlot>;
  handoffs: ControllerHandoff[];
  chat: ControllerChatMessage[];
  report?: SessionPerformanceReport | null;
  createdAtMs: number;
}

export interface SimulationConfig {
  activePlayerStation: PlayerRoleMode;
  autoManageOtherStations: boolean;
  stationControl: StationControlConfig;
  readbackDelaySeconds: number;
  readbackErrorProbability: number;
  nordoMode: NordoBehaviorMode;
  autoSpawnTraffic: boolean;
  autoMinimumsGoAround: boolean;
  autonomousReactionInterval: number;
}

export interface SimulationMetrics {
  departuresCompleted: number;
  arrivalsCompleted: number;
  clearancesIssued: number;
  readbackErrorsCaught: number;
  goAroundsExecuted: number;
  safetyScore: number;
  conflictsDetected: number;
}

export interface SimulationState {
  scenarioId: ScenarioId;
  time: number; // simulation seconds
  paused: boolean;
  timeScale: 1 | 2 | 4;
  airport: AirportLayout;
  aircraft: Record<string, Aircraft>;
  aircraftOrder: string[];
  selectedAircraftId: string | null;
  radioLog: RadioMessage[];
  incidents: SafetyIncident[];
  config: SimulationConfig;
  metrics: SimulationMetrics;
  nextIdCounter: number;
  lastAutonomousRunAt: number;
  lastTrafficSpawnAt: number;
  liveSnapshotMeta?: {
    airportIcao: string;
    fetchedAtMs: number;
    convertedCount: number;
    source: string;
  };
}

export interface ClearanceCommandInput {
  aircraftId: string;
  controller: ControllerRole;
  type: ClearanceType;
  parameters?: Record<string, unknown>;
}

export interface DecisionResponse {
  ok: boolean;
  reason: string;
  clearance?: ATCClearance;
}
