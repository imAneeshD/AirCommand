export interface PilotConfig {
  airportIcao: string;
  airportName: string;
  modelCode: string;
  modelName: string;
  airlineCode: string;
  airlineName: string;
  callsign: string;
  flightNumber: string;
  registration: string;
  gateId: string;
  targetRunway: string;
  destinationIcao: string;
  destinationName: string;
  v1Speed: number;
  vrSpeed: number;
  v2Speed: number;
  cruiseAltitude: number;
}

export type ThrottleDetent = "IDLE" | "CLB" | "FLEX" | "TOGA";

export interface CockpitControls {
  battery1: boolean;
  battery2: boolean;
  apuMaster: boolean;
  apuStart: boolean;
  apuAvail: boolean;
  beaconLights: boolean;
  strobeLights: boolean;
  landingLights: boolean;
  engine1Master: boolean;
  engine2Master: boolean;
  engine1N1: number;
  engine2N1: number;
  engine1N2: number;
  engine2N2: number;
  engine1Egt: number;
  engine2Egt: number;
  parkingBrake: boolean; // default true
  flaps: 0 | 1 | 2 | 3; // 0=0, 1=1+F, 2=2, 3=FULL
  throttle: ThrottleDetent;
  throttlePercent: number; // 0 - 100%
  tillerAngle: number; // -30 to +30 deg
  pitchAngle: number; // -10 to +25 deg
  gearLever: "UP" | "DOWN";
  autopilot: boolean;
}

export const DEFAULT_COCKPIT_CONTROLS: CockpitControls = {
  battery1: false,
  battery2: false,
  apuMaster: false,
  apuStart: false,
  apuAvail: false,
  beaconLights: false,
  strobeLights: false,
  landingLights: false,
  engine1Master: false,
  engine2Master: false,
  engine1N1: 0,
  engine2N1: 0,
  engine1N2: 0,
  engine2N2: 0,
  engine1Egt: 24,
  engine2Egt: 24,
  parkingBrake: true,
  flaps: 0,
  throttle: "IDLE",
  throttlePercent: 0,
  tillerAngle: 0,
  pitchAngle: 0,
  gearLever: "DOWN",
  autopilot: false,
};

export interface PilotChecklistItem {
  id: string;
  phase: "COCKPIT_PREP" | "BEFORE_PUSHBACK" | "TAXI" | "BEFORE_TAKEOFF";
  title: string;
  actionRequired: string;
  completed: boolean;
}

export const INITIAL_CHECKLIST_ITEMS: PilotChecklistItem[] = [
  // Phase 1: Cockpit Preparation
  { id: "bat", phase: "COCKPIT_PREP", title: "Battery 1 & 2", actionRequired: "ON", completed: false },
  { id: "apu", phase: "COCKPIT_PREP", title: "APU Master & Generator", actionRequired: "AVAIL", completed: false },
  { id: "pbrake", phase: "COCKPIT_PREP", title: "Parking Brake", actionRequired: "SET", completed: true },
  
  // Phase 2: Before Pushback & Start
  { id: "ifr", phase: "BEFORE_PUSHBACK", title: "ATC IFR Clearance", actionRequired: "RECEIVED", completed: false },
  { id: "beacon", phase: "BEFORE_PUSHBACK", title: "Beacon Light", actionRequired: "ON", completed: false },
  { id: "pb_clear", phase: "BEFORE_PUSHBACK", title: "Pushback Clearance", actionRequired: "OBTAINED", completed: false },
  
  // Phase 3: Taxi
  { id: "eng_start", phase: "TAXI", title: "Engine 1 & 2 Master", actionRequired: "RUNNING", completed: false },
  { id: "flaps_taxi", phase: "TAXI", title: "Flaps Lever", actionRequired: "SET 1+F", completed: false },
  { id: "taxi_clear", phase: "TAXI", title: "Taxi Clearance", actionRequired: "ACKNOWLEDGED", completed: false },
  
  // Phase 4: Before Takeoff
  { id: "strobes", phase: "BEFORE_TAKEOFF", title: "Strobe Lights", actionRequired: "ON", completed: false },
  { id: "to_clear", phase: "BEFORE_TAKEOFF", title: "Takeoff Clearance", actionRequired: "CLEARED", completed: false },
  { id: "thrust", phase: "BEFORE_TAKEOFF", title: "Thrust Levers", actionRequired: "TOGA", completed: false },
];
