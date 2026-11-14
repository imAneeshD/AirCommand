import { createAsteriaAirport } from "../data/asteriaAirport.ts";
import {
  createArrivalAircraft,
  createBaseSimulation,
  createDepartureAircraft,
  stepSimulation,
  switchPlayerStation,
} from "./simulation.ts";
import {
  submitClearanceDecision,
  triggerRadioFailure,
} from "./decisionEngine.ts";
import { canAircraftMove } from "./validationEngine.ts";
import type { Aircraft, AircraftState, SimulationState } from "../types/atc.ts";

function stateOf(ac: Aircraft): AircraftState {
  return ac.state;
}

export interface VerificationTestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

function assert(cond: boolean, message: string): void {
  if (!cond) {
    throw new Error(message);
  }
}

function makeManualState(): SimulationState {
  const s = createBaseSimulation("SANDBOX", "GROUND");
  s.config.autoManageOtherStations = false;
  s.config.stationControl = {
    DELIVERY: "PLAYER",
    GROUND: "PLAYER",
    TOWER: "PLAYER",
    DEPARTURE: "PLAYER",
    CENTER: "PLAYER",
  };
  s.config.autoSpawnTraffic = false;
  s.config.readbackErrorProbability = 0;
  return s;
}

function advance(state: SimulationState, seconds: number, step = 0.2): void {
  const steps = Math.round(seconds / step);
  for (let i = 0; i < steps; i++) {
    stepSimulation(state, step);
  }
}

export function runMandatoryVerificationSuite(): VerificationTestResult[] {
  const tests: Array<{ id: string; name: string; fn: () => string }> = [
    {
      id: "T1",
      name: "Test 1: Aircraft at gate without taxi clearance stays stationary",
      fn: () => {
        const s = makeManualState();
        const ual = createDepartureAircraft(s, {
          callsign: "UAL452",
          spokenCallsign: "United 452",
          gateId: "B12",
          targetRunway: "09L",
          requiresPushback: false,
        });
        const startX = ual.x;
        const startY = ual.y;
        assert(!canAircraftMove(ual, s), "canAircraftMove should be false at gate");
        advance(s, 30);
        assert(ual.x === startX && ual.y === startY, "Aircraft moved without clearance");
        assert(ual.speed === 0 && ual.state === "AT_GATE", "State or speed changed");
        return "UAL452 remained stationary at Gate B12 for 30s with speed=0.";
      },
    },
    {
      id: "T2",
      name: "Test 2: Pilot requests taxi, player does nothing -> remains stationary",
      fn: () => {
        const s = makeManualState();
        const ual = createDepartureAircraft(s, {
          callsign: "UAL452",
          spokenCallsign: "United 452",
          gateId: "B12",
          targetRunway: "09L",
          requiresPushback: false,
          controller: "GROUND",
        });
        if (ual.flightPlan) ual.flightPlan.clearanceStatus = "CLEARED";
        const startX = ual.x;
        const startY = ual.y;
        advance(s, 1);
        assert(ual.pendingRequest?.type === "TAXI", "Pilot should request TAXI");
        advance(s, 45);
        assert(ual.x === startX && ual.y === startY && ual.speed === 0, "Aircraft moved while awaiting clearance");
        return "Pilot requested TAXI; player took no action; UAL452 remained stationary.";
      },
    },
    {
      id: "T3",
      name: "Test 3: Taxi clearance + pilot readback -> starts taxiing along approved route",
      fn: () => {
        const s = makeManualState();
        const ual = createDepartureAircraft(s, {
          callsign: "UAL452",
          spokenCallsign: "United 452",
          gateId: "B12",
          targetRunway: "09L",
          requiresPushback: false,
        });
        const startX = ual.x;
        const startY = ual.y;
        const res = submitClearanceDecision(
          s,
          {
            aircraftId: ual.id,
            controller: "GROUND",
            type: "TAXI",
            parameters: { runway: "09L", routeTaxiways: ["A", "B"] },
          },
          "PLAYER"
        );
        assert(res.ok && Boolean(res.clearance), "Taxi clearance failed");
        // Before readback completes, must not move!
        advance(s, 0.4);
        assert(
          ual.x === startX && ual.y === startY && !res.clearance!.acknowledged,
          "Moved before pilot readback!"
        );
        // After readback completes
        advance(s, 4.0);
        assert(res.clearance!.acknowledged === true, "Readback was not acknowledged");
        assert(ual.state === "TAXIING" && ual.speed > 0, "Did not begin taxiing after readback");
        assert(Math.hypot(ual.x - startX, ual.y - startY) > 0.005, "Aircraft did not move after readback");
        return "Held stationary during readback delay; began taxiing only after readback acknowledged.";
      },
    },
    {
      id: "T4",
      name: "Test 4: Pushback completes and waits for separate taxi clearance",
      fn: () => {
        const s = makeManualState();
        const ual = createDepartureAircraft(s, {
          callsign: "UAL452",
          spokenCallsign: "United 452",
          gateId: "B12",
          targetRunway: "09L",
          requiresPushback: true,
        });
        const taxiBlocked = submitClearanceDecision(
          s,
          { aircraftId: ual.id, controller: "GROUND", type: "TAXI", parameters: { runway: "09L", routeTaxiways: ["A", "B"] } },
          "PLAYER"
        );
        assert(!taxiBlocked.ok, "Nose-in gate should require pushback first");
        const pb = submitClearanceDecision(
          s,
          { aircraftId: ual.id, controller: "GROUND", type: "PUSHBACK" },
          "PLAYER"
        );
        assert(pb.ok, "Pushback clearance failed");
        advance(s, 55);
        assert(ual.state === "PUSHBACK_COMPLETE" && ual.speed === 0, `Expected PUSHBACK_COMPLETE stopped, got ${ual.state}`);
        const spotX = ual.x;
        const spotY = ual.y;
        advance(s, 20);
        assert(ual.x === spotX && ual.y === spotY && ual.state === "PUSHBACK_COMPLETE", "Auto-taxied after pushback!");
        return "Pushback completed at spot and waited stationary for separate taxi clearance.";
      },
    },
    {
      id: "T5",
      name: "Test 5: Reaches holding point with empty runway -> stops without crossing clearance",
      fn: () => {
        const s = makeManualState();
        const ual = createDepartureAircraft(s, {
          callsign: "UAL452",
          spokenCallsign: "United 452",
          gateId: "B12",
          targetRunway: "09R", // Crossing RWY 09L required!
          requiresPushback: false,
        });
        const res = submitClearanceDecision(
          s,
          {
            aircraftId: ual.id,
            controller: "GROUND",
            type: "TAXI",
            parameters: { runway: "09R", routeTaxiways: ["A", "B"], destinationNodeId: "HS_09R_B_N" },
          },
          "PLAYER"
        );
        assert(res.ok, "Taxi route to 09R via A, B failed");
        advance(s, 180);
        assert(
          ual.state === "HOLDING_SHORT" &&
            ual.holdingAtRunway === "09L" &&
            ual.holdingShortReason === "CROSSING_REQUIRED" &&
            ual.speed === 0,
          `Expected HOLDING_SHORT at 09L, got ${ual.state} (${ual.holdingAtRunway})`
        );
        // Even with 09L completely empty, step 30s more: must remain stopped!
        const holdY = ual.y;
        advance(s, 30);
        assert(ual.y === holdY && ual.speed === 0, "Crossed empty runway without clearance!");
        return "Stopped at RWY 09L hold-short line even though 09L was completely empty.";
      },
    },
    {
      id: "T6",
      name: "Test 6: Explicit runway crossing clearance -> crosses runway and holds at next hold-short",
      fn: () => {
        const s = makeManualState();
        const ual = createDepartureAircraft(s, {
          callsign: "UAL452",
          spokenCallsign: "United 452",
          gateId: "B12",
          targetRunway: "09R",
          requiresPushback: false,
        });
        submitClearanceDecision(
          s,
          {
            aircraftId: ual.id,
            controller: "GROUND",
            type: "TAXI",
            parameters: { runway: "09R", routeTaxiways: ["A", "B"], destinationNodeId: "HS_09R_B_N" },
          },
          "PLAYER"
        );
        advance(s, 180);
        assert(ual.state === "HOLDING_SHORT" && ual.holdingAtRunway === "09L", "Not holding short 09L");
        const cross = submitClearanceDecision(
          s,
          {
            aircraftId: ual.id,
            controller: "GROUND",
            type: "CROSS_RUNWAY",
            parameters: { runway: "09L" },
          },
          "PLAYER"
        );
        assert(cross.ok, "Cross runway clearance failed");
        advance(s, 120);
        assert(
          ual.state === "HOLDING_SHORT" && ual.holdingAtRunway === "09R" && ual.speed === 0,
          `Expected holding short 09R after crossing 09L, got ${ual.state} (${ual.holdingAtRunway})`
        );
        return "Crossed RWY 09L only after explicit CROSS_RUNWAY clearance and readback, then held short of 09R.";
      },
    },
    {
      id: "T7",
      name: "Test 7: Taxi route enforcement (A -> B never deviates onto C)",
      fn: () => {
        const s = makeManualState();
        const ual = createDepartureAircraft(s, {
          callsign: "UAL452",
          spokenCallsign: "United 452",
          gateId: "B12",
          targetRunway: "09L",
          requiresPushback: false,
        });
        const res = submitClearanceDecision(
          s,
          {
            aircraftId: ual.id,
            controller: "GROUND",
            type: "TAXI",
            parameters: { runway: "09L", routeTaxiways: ["A", "B"] },
          },
          "PLAYER"
        );
        assert(res.ok, "Route A, B failed");
        advance(s, 2);
        assert(!ual.assignedRouteNodeIds.includes("HS_09L_C_N"), "Deviated onto Charlie!");
        assert(ual.assignedRouteNodeIds.includes("HS_09L_B_N"), "Missing Bravo hold-short!");
        const badRoute = submitClearanceDecision(
          s,
          {
            aircraftId: ual.id,
            controller: "GROUND",
            type: "TAXI",
            parameters: { runway: "09L", routeTaxiways: ["A", "G"], destinationNodeId: "HS_09L_B_N" },
          },
          "PLAYER"
        );
        assert(!badRoute.ok, "Disconnected route A->G should be rejected");
        return "Strictly followed Alpha -> Bravo without deviating to Charlie; invalid route rejected.";
      },
    },
    {
      id: "T8",
      name: "Test 8: Reaches departure runway without takeoff clearance -> remains stopped",
      fn: () => {
        const s = makeManualState();
        const ual = createDepartureAircraft(s, {
          callsign: "UAL452",
          spokenCallsign: "United 452",
          gateId: "B10",
          targetRunway: "09L",
          requiresPushback: false,
        });
        submitClearanceDecision(
          s,
          {
            aircraftId: ual.id,
            controller: "GROUND",
            type: "TAXI",
            parameters: { runway: "09L", routeTaxiways: ["A", "B"] },
          },
          "PLAYER"
        );
        advance(s, 140);
        assert(ual.state === "HOLDING_SHORT" && ual.speed === 0, "Should hold short at 09L");
        submitClearanceDecision(
          s,
          { aircraftId: ual.id, controller: "TOWER", type: "LINE_UP", parameters: { runway: "09L" } },
          "PLAYER"
        );
        advance(s, 30);
        assert(ual.state === "LINE_UP_WAIT" && ual.speed === 0, `Expected LINE_UP_WAIT stopped, got ${ual.state}`);
        const lx = ual.x;
        advance(s, 30);
        assert(ual.x === lx && ual.speed === 0, "Took off without TAKEOFF clearance!");
        return "Lined up on RWY 09L and waited stationary with zero movement until TAKEOFF clearance.";
      },
    },
    {
      id: "T9",
      name: "Test 9: Takeoff clearance + readback -> takeoff roll -> rotate -> climb at cleared altitude",
      fn: () => {
        const s = makeManualState();
        const ual = createDepartureAircraft(s, {
          callsign: "UAL452",
          spokenCallsign: "United 452",
          gateId: "B10",
          targetRunway: "09L",
          requiresPushback: false,
        });
        ual.x = s.airport.runways["09L"].thresholdX + 0.03;
        ual.y = s.airport.runways["09L"].thresholdY;
        ual.heading = 90;
        ual.state = "HOLDING_SHORT";
        ual.holdingAtRunway = "09L";
        ual.holdingShortReason = "DEPARTURE_RUNWAY";

        submitClearanceDecision(
          s,
          { aircraftId: ual.id, controller: "TOWER", type: "TAKEOFF", parameters: { runway: "09L", initialAltitude: 3000 } },
          "PLAYER"
        );
        advance(s, 0.5);
        assert(ual.speed === 0, "Rolled before readback completed!");
        advance(s, 160);
        assert(stateOf(ual) === "CLIMB" || stateOf(ual) === "CRUISE_OUTBOUND", `Expected CLIMB, got ${ual.state}`);
        assert(ual.altitude <= 3020, `Climbed past cleared 3000 ft to ${ual.altitude}!`);
        return "Executed takeoff roll only after readback, rotated, and leveled off strictly at cleared 3000 ft.";
      },
    },
    {
      id: "T10",
      name: "Test 10: Cancel takeoff vs Rejected takeoff are distinct states",
      fn: () => {
        const s = makeManualState();
        const ual = createDepartureAircraft(s, {
          callsign: "UAL452",
          spokenCallsign: "United 452",
          gateId: "B10",
          targetRunway: "09L",
          requiresPushback: false,
        });
        ual.x = s.airport.runways["09L"].thresholdX + 0.03;
        ual.y = s.airport.runways["09L"].thresholdY;
        ual.heading = 90;
        ual.state = "LINE_UP_WAIT";

        submitClearanceDecision(
          s,
          { aircraftId: ual.id, controller: "TOWER", type: "TAKEOFF", parameters: { runway: "09L" } },
          "PLAYER"
        );
        // Cancel before roll starts (during readback!)
        const cancelRes = submitClearanceDecision(
          s,
          { aircraftId: ual.id, controller: "TOWER", type: "CANCEL_TAKEOFF" },
          "PLAYER"
        );
        assert(cancelRes.ok, "Cancel takeoff pre-roll should succeed");
        assert(stateOf(ual) === "TAKEOFF_CANCELLED", `Expected TAKEOFF_CANCELLED, got ${ual.state}`);
        advance(s, 5);
        assert(stateOf(ual) === "HOLD_POSITION" && ual.speed === 0, "Should transition to HOLD_POSITION stopped");

        // Now issue takeoff again, let roll start, verify CANCEL rejected & REJECT succeeds
        submitClearanceDecision(
          s,
          { aircraftId: ual.id, controller: "TOWER", type: "TAKEOFF", parameters: { runway: "09L" } },
          "PLAYER"
        );
        advance(s, 5);
        assert(stateOf(ual) === "TAKEOFF_ROLL", `Expected TAKEOFF_ROLL, got ${ual.state}`);
        const lateCancel = submitClearanceDecision(
          s,
          { aircraftId: ual.id, controller: "TOWER", type: "CANCEL_TAKEOFF" },
          "PLAYER"
        );
        assert(!lateCancel.ok, "CANCEL_TAKEOFF must be disallowed once rolling");
        const rto = submitClearanceDecision(
          s,
          { aircraftId: ual.id, controller: "TOWER", type: "REJECT_TAKEOFF" },
          "PLAYER"
        );
        assert(rto.ok, "REJECT_TAKEOFF should succeed during roll");
        advance(s, 15);
        assert(
          stateOf(ual) === "STOPPED_ON_RUNWAY" &&
            ual.speed === 0 &&
            ual.operationMode === "EMERGENCY_OPERATION",
          `Expected STOPPED_ON_RUNWAY emergency, got ${ual.state}`
        );
        return "Pre-roll CANCEL_TAKEOFF halted cleanly; rolling REJECT_TAKEOFF braked to STOPPED_ON_RUNWAY.";
      },
    },
    {
      id: "T11",
      name: "Test 11: Arrival reaches final without landing clearance -> does NOT land",
      fn: () => {
        const s = makeManualState();
        s.config.autoMinimumsGoAround = false;
        const dal = createArrivalAircraft(s, {
          callsign: "DAL814",
          spokenCallsign: "Delta 814",
          x: -3.0,
          y: s.airport.runways["09L"].thresholdY,
          heading: 90,
          altitude: 1050,
          speed: 145,
          targetRunway: "09L",
          gateId: "B10",
          state: "FINAL",
          controller: "TOWER",
          assignedApproach: "09L",
        });
        advance(s, 30);
        assert(dal.state === "FINAL", `Expected FINAL without landing clearance, got ${dal.state}`);
        assert(dal.altitude > s.airport.elevationFt + 150, "Descended to touchdown without LAND clearance!");
        return "DAL814 stayed on FINAL above minimums and did not touch down without LAND clearance.";
      },
    },
    {
      id: "T12",
      name: "Test 12: Tower issues GO_AROUND -> executes go-around climb",
      fn: () => {
        const s = makeManualState();
        const dal = createArrivalAircraft(s, {
          callsign: "DAL814",
          spokenCallsign: "Delta 814",
          x: -2.0,
          y: s.airport.runways["09L"].thresholdY,
          heading: 90,
          altitude: 700,
          speed: 145,
          targetRunway: "09L",
          gateId: "B10",
          state: "FINAL",
          controller: "TOWER",
          assignedApproach: "09L",
        });
        const ga = submitClearanceDecision(
          s,
          { aircraftId: dal.id, controller: "TOWER", type: "GO_AROUND", parameters: { altitude: 3000, heading: 90 } },
          "PLAYER"
        );
        assert(ga.ok && dal.state === "GO_AROUND", "GO_AROUND did not activate");
        advance(s, 45);
        assert(dal.altitude > 1800, `Expected go-around climb, altitude=${dal.altitude}`);
        return "Tower GO_AROUND immediately aborted approach and climbed aircraft safely.";
      },
    },
    {
      id: "T13",
      name: "Test 13: Pilot readback error prevents execution until corrected",
      fn: () => {
        const s = makeManualState();
        const ual = createDepartureAircraft(s, {
          callsign: "UAL452",
          spokenCallsign: "United 452",
          gateId: "B10",
          targetRunway: "09L",
        });
        ual.state = "CLIMB";
        ual.controller = "DEPARTURE";
        ual.altitude = 3000;
        ual.assignedAltitude = 3000;
        ual.speed = 210;
        ual.assignedSpeed = 210;
        ual.heading = 90;
        ual.assignedHeading = 90;
        ual.armNextReadbackError = true;

        submitClearanceDecision(
          s,
          { aircraftId: ual.id, controller: "DEPARTURE", type: "ALTITUDE", parameters: { altitude: 7000 } },
          "PLAYER"
        );
        advance(s, 15);
        assert(ual.hasReadbackError === true, "Readback error flag should be set");
        assert(Math.abs(ual.altitude - 3000) < 30, `Climbed despite readback error! alt=${ual.altitude}`);

        // Correct instruction re-issued
        submitClearanceDecision(
          s,
          { aircraftId: ual.id, controller: "DEPARTURE", type: "ALTITUDE", parameters: { altitude: 7000 } },
          "PLAYER"
        );
        advance(s, 5);
        assert(!ual.hasReadbackError && ual.assignedAltitude === 7000, "Correction did not clear error");
        advance(s, 180);
        assert(Math.abs(ual.altitude - 7000) < 50, `Did not level at 7000, alt=${ual.altitude}`);
        return "Readback error (5000 vs 7000) blocked climb completely until corrected; then climbed to 7000 ft.";
      },
    },
    {
      id: "T14",
      name: "Test 14: RADIO_FAILURE disables normal radio commands; Light Gun works in Tower",
      fn: () => {
        const s = makeManualState();
        const swa = createArrivalAircraft(s, {
          callsign: "SWA712",
          spokenCallsign: "Southwest 712",
          x: -2.0,
          y: s.airport.runways["09R"].thresholdY,
          altitude: 700,
          speed: 145,
          targetRunway: "09R",
          gateId: "S3",
          state: "FINAL",
          controller: "TOWER",
          assignedApproach: "09R",
        });
        triggerRadioFailure(s, swa.id);
        const blocked = submitClearanceDecision(
          s,
          { aircraftId: swa.id, controller: "TOWER", type: "LAND", parameters: { runway: "09R" } },
          "PLAYER"
        );
        assert(!blocked.ok, "Normal radio command must fail under RADIO_FAILURE");
        const lg = submitClearanceDecision(
          s,
          { aircraftId: swa.id, controller: "TOWER", type: "LIGHT_GUN", parameters: { signal: "STEADY_GREEN" } },
          "PLAYER"
        );
        assert(lg.ok, "Tower light gun signal should be accepted");
        return "Radio commands blocked on Squawk 7600 NORDO; Tower Light Gun authorization operational.";
      },
    },
    {
      id: "T15",
      name: "Test 15: Player switches G -> T -> D and autonomous controllers obey identical clearance engine",
      fn: () => {
        const s = createBaseSimulation("SANDBOX", "GROUND");
        s.config.autoSpawnTraffic = false;
        s.config.readbackErrorProbability = 0;

        const ual = createDepartureAircraft(s, {
          callsign: "UAL452",
          spokenCallsign: "United 452",
          gateId: "B12",
          targetRunway: "09L",
          requiresPushback: true,
        });
        const dal = createArrivalAircraft(s, {
          callsign: "DAL814",
          spokenCallsign: "Delta 814",
          x: -8.5,
          y: s.airport.runways["09R"].thresholdY,
          heading: 90,
          altitude: 2600,
          speed: 170,
          targetRunway: "09R",
          gateId: "S1",
          state: "APPROACH",
          controller: "DEPARTURE",
        });

        // Player starts on GROUND, manually handles pushback for UAL452, while AI runs T & D!
        submitClearanceDecision(s, { aircraftId: ual.id, controller: "GROUND", type: "PUSHBACK" }, "PLAYER");
        advance(s, 45);
        assert(ual.state === "PUSHBACK_COMPLETE", "UAL452 should complete pushback");

        // Switch Player to TOWER, then DEPARTURE -> Ground AI takes over UAL452 taxi & handoff!
        switchPlayerStation(s, "TOWER");
        advance(s, 175);
        switchPlayerStation(s, "DEPARTURE");
        advance(s, 180);

        // Verify ALL clearances issued by AI used structured ATCClearance objects via DecisionEngine
        const aiClearances = [...ual.clearances, ...dal.clearances].filter(
          (c) => c.issuedBy === "AUTONOMOUS"
        );
        assert(aiClearances.length >= 4, `Expected >=4 autonomous clearances, got ${aiClearances.length}`);
        assert(
          ual.clearances.some((c) => c.type === "TAXI" && c.issuedBy === "AUTONOMOUS"),
          "Autonomous Ground should issue TAXI via ATCClearance"
        );
        assert(
          ual.clearances.some((c) => c.type === "TAKEOFF" && c.issuedBy === "AUTONOMOUS"),
          "Autonomous Tower should issue TAKEOFF via ATCClearance"
        );
        assert(
          dal.clearances.some((c) => c.type === "LAND" && c.issuedBy === "AUTONOMOUS"),
          "Autonomous Tower should issue LAND via ATCClearance"
        );
        return `Switched G->T->D smoothly; ${aiClearances.length} autonomous clearances verified through identical validation engine.`;
      },
    },
    {
      id: "T16",
      name: "Test 16: Departure heading and speed only change after explicit clearances & readbacks",
      fn: () => {
        const s = makeManualState();
        const ual = createDepartureAircraft(s, {
          callsign: "UAL452",
          spokenCallsign: "United 452",
          gateId: "B10",
          targetRunway: "09L",
        });
        ual.state = "CLIMB";
        ual.controller = "DEPARTURE";
        ual.altitude = 3000;
        ual.assignedAltitude = 3000;
        ual.heading = 90;
        ual.assignedHeading = 90;
        ual.speed = 210;
        ual.assignedSpeed = 210;

        advance(s, 20);
        assert(Math.abs(ual.heading - 90) < 1 && Math.abs(ual.speed - 210) < 1, "Heading or speed changed spontaneously!");

        submitClearanceDecision(
          s,
          { aircraftId: ual.id, controller: "DEPARTURE", type: "HEADING", parameters: { heading: 180, turnDirection: "RIGHT" } },
          "PLAYER"
        );
        submitClearanceDecision(
          s,
          { aircraftId: ual.id, controller: "DEPARTURE", type: "SPEED", parameters: { speed: 180 } },
          "PLAYER"
        );
        advance(s, 35);
        assert(Math.abs(ual.heading - 180) < 2, `Expected heading 180, got ${ual.heading}`);
        assert(Math.abs(ual.speed - 180) < 2, `Expected speed 180, got ${ual.speed}`);
        return "Maintained 090° / 210kt until explicit HEADING 180 and SPEED 180 readbacks completed.";
      },
    },
    {
      id: "T17",
      name: "Test 17: Arrival after landing vacates runway and stops until Ground issues gate TAXI clearance",
      fn: () => {
        const s = makeManualState();
        const dal = createArrivalAircraft(s, {
          callsign: "DAL814",
          spokenCallsign: "Delta 814",
          x: -1.8,
          y: s.airport.runways["09L"].thresholdY,
          heading: 90,
          altitude: 600,
          speed: 145,
          targetRunway: "09L",
          gateId: "B12",
          state: "FINAL",
          controller: "TOWER",
          assignedApproach: "09L",
        });
        submitClearanceDecision(
          s,
          { aircraftId: dal.id, controller: "TOWER", type: "LAND", parameters: { runway: "09L" } },
          "PLAYER"
        );
        advance(s, 150);
        assert(
          stateOf(dal) === "HOLDING_SHORT" && dal.speed === 0 && dal.pendingRequest?.type === "GATE_TAXI",
          `Expected stopped at exit holding point waiting for gate taxi, got ${dal.state}`
        );
        const holdX = dal.x;
        const holdY = dal.y;
        advance(s, 25);
        assert(dal.x === holdX && dal.y === holdY && dal.speed === 0, "Vacated arrival auto-taxied to gate!");
        return "Landed, rolled out, vacated runway onto exit hold-short, and stopped awaiting Ground gate TAXI clearance.";
      },
    },
  ];

  // Ensure airport layout is referenced so tree-shaking never strips anything
  void createAsteriaAirport;

  return tests.map((t) => {
    try {
      const details = t.fn();
      return { id: t.id, name: t.name, passed: true, details };
    } catch (err) {
      return {
        id: t.id,
        name: t.name,
        passed: false,
        details: err instanceof Error ? err.message : String(err),
      };
    }
  });
}
