import test from "node:test";
import assert from "node:assert/strict";
import {
  AIRCRAFT_TYPE_SPECS,
  getAircraftTypeSpec,
  getAirlineLivery,
  getResolvedAircraftDetails,
} from "../src/data/aircraftCatalog.ts";
import { createScenarioSimulation } from "../src/engine/simulation.ts";

test("Every simulator fleet aircraft type has rich model & performance specs", () => {
  const requiredTypes = [
    "B738",
    "B737",
    "B739",
    "B38M",
    "B752",
    "B763",
    "B772",
    "A319",
    "A320",
    "A321",
    "A220",
    "MD11",
  ];
  for (const t of requiredTypes) {
    assert.ok(AIRCRAFT_TYPE_SPECS[t], `Missing spec for ${t}`);
    const spec = getAircraftTypeSpec(t);
    assert.ok(spec.model.length > 5);
    assert.ok(spec.engines.length > 4);
    assert.ok(spec.wingspan.length > 2);
    assert.ok(spec.rangeNm.length > 2);
  }
});

test("Departures originate at current airport and arrivals terminate at current airport with distinct remote hub", () => {
  const sim = createScenarioSimulation("NORMAL_OPS", "ALL", "KAST");
  const ual = sim.aircraft["UAL452"];
  const dal = sim.aircraft["DAL814"];
  assert.ok(ual && dal);

  const ualDetails = getResolvedAircraftDetails(ual, sim.airport);
  assert.equal(ualDetails.originIcao, "KAST");
  assert.notEqual(ualDetails.destinationIcao, "KAST");
  assert.equal(ualDetails.spec.model, "Boeing 737-800 Next Gen");
  assert.equal(ualDetails.livery.airlineName, "United Airlines");
  assert.ok(ualDetails.registration.startsWith("N"));

  const dalDetails = getResolvedAircraftDetails(dal, sim.airport);
  assert.equal(dalDetails.destinationIcao, "KAST");
  assert.notEqual(dalDetails.originIcao, "KAST");
  assert.equal(dalDetails.livery.airlineName, "Delta Air Lines");
});

test("Cargo tri-jet and airline livery detection handles FedEx MD-11F", () => {
  const sim = createScenarioSimulation("EMERGENCY_AND_NORDO", "ALL", "KMRD");
  const fdx = sim.aircraft["FDX901"];
  assert.ok(fdx);
  const fdxDetails = getResolvedAircraftDetails(fdx, sim.airport);
  assert.equal(fdxDetails.spec.airframeStyle, "TRIJET_MD11");
  assert.equal(fdxDetails.spec.isCargoOnly, true);
  assert.equal(fdxDetails.livery.isCargo, true);
  assert.equal(fdxDetails.destinationIcao, "KMRD");
  const liv = getAirlineLivery(fdx);
  assert.equal(liv.title, "FedEx");
});

test("International aircraft registrations at Indian airports use correct country prefixes, not VT-", () => {
  const airport = { id: "VOBL" as const, icao: "VOBL", name: "Kempegowda Intl", city: "Bengaluru" } as unknown as import("../src/types/atc.ts").AirportLayout;

  // Qatar Airways QTR must have A7- registration and OTHH origin
  const qtr = getResolvedAircraftDetails(
    {
      id: "QTR417",
      callsign: "QTR417",
      spokenCallsign: "Qatar 417",
      airline: "Qatar Airways",
      aircraftType: "A359",
      wakeCategory: "HEAVY",
      flightKind: "ARRIVAL",
      squawk: "3100",
      state: "CRUISE_OUTBOUND",
      controller: "DEPARTURE",
      operationMode: "NORMAL_OPERATION",
      emergencyType: "NONE",
      commStatus: "NORMAL",
      nordoMode: "LIGHT_GUN_SIGNALS",
      x: 0,
      y: 0,
      heading: 90,
      altitude: 10000,
      speed: 250,
      verticalSpeed: 0,
      targetRunway: "27L",
      assignedRouteNodeIds: [],
      assignedRouteTaxiways: [],
      routeStepIndex: 0,
      crossRunwayCleared: {},
      requiresPushback: false,
      assignedHeading: null,
      assignedTurnDirection: "NEAREST",
      assignedAltitude: null,
      assignedSpeed: null,
      assignedApproach: null,
      assignedDirectFix: null,
      clearances: [],
      pendingRequest: null,
      hasReadbackError: false,
      armNextReadbackError: false,
      spawnedAt: 0,
      stateEnteredAt: 0,
      lastTransmissionAt: 0,
      trail: [],
    },
    airport
  );

  assert.equal(qtr.livery.airlineName, "Qatar Airways");
  assert.ok(qtr.registration.startsWith("A7-"), `Expected A7- prefix for Qatar Airways, got ${qtr.registration}`);
  assert.notEqual(qtr.registration.slice(0, 3), "VT-", "Qatar Airways must not receive Indian VT- registration");
  assert.equal(qtr.originIcao, "OTHH");

  // Emirates UAE must have A6- registration
  const uae = getResolvedAircraftDetails(
    {
      id: "UAE504",
      callsign: "UAE504",
      spokenCallsign: "Emirates 504",
      airline: "Emirates",
      aircraftType: "B77W",
      wakeCategory: "HEAVY",
      flightKind: "ARRIVAL",
      squawk: "3200",
      state: "CRUISE_OUTBOUND",
      controller: "DEPARTURE",
      operationMode: "NORMAL_OPERATION",
      emergencyType: "NONE",
      commStatus: "NORMAL",
      nordoMode: "LIGHT_GUN_SIGNALS",
      x: 0,
      y: 0,
      heading: 90,
      altitude: 10000,
      speed: 250,
      verticalSpeed: 0,
      targetRunway: "27L",
      assignedRouteNodeIds: [],
      assignedRouteTaxiways: [],
      routeStepIndex: 0,
      crossRunwayCleared: {},
      requiresPushback: false,
      assignedHeading: null,
      assignedTurnDirection: "NEAREST",
      assignedAltitude: null,
      assignedSpeed: null,
      assignedApproach: null,
      assignedDirectFix: null,
      clearances: [],
      pendingRequest: null,
      hasReadbackError: false,
      armNextReadbackError: false,
      spawnedAt: 0,
      stateEnteredAt: 0,
      lastTransmissionAt: 0,
      trail: [],
    },
    airport
  );
  assert.ok(uae.registration.startsWith("A6-"), `Expected A6- prefix for Emirates, got ${uae.registration}`);

  // Domestic carrier (IndiGo) must have VT- registration
  const igo = getResolvedAircraftDetails(
    {
      id: "IGO101",
      callsign: "IGO101",
      spokenCallsign: "IndiGo 101",
      airline: "IndiGo",
      aircraftType: "A320",
      wakeCategory: "MEDIUM",
      flightKind: "DEPARTURE",
      squawk: "2100",
      state: "AT_GATE",
      controller: "GROUND",
      operationMode: "NORMAL_OPERATION",
      emergencyType: "NONE",
      commStatus: "NORMAL",
      nordoMode: "LIGHT_GUN_SIGNALS",
      x: 0,
      y: 0,
      heading: 90,
      altitude: 3000,
      speed: 0,
      verticalSpeed: 0,
      targetRunway: "27L",
      assignedRouteNodeIds: [],
      assignedRouteTaxiways: [],
      routeStepIndex: 0,
      crossRunwayCleared: {},
      requiresPushback: false,
      assignedHeading: null,
      assignedTurnDirection: "NEAREST",
      assignedAltitude: null,
      assignedSpeed: null,
      assignedApproach: null,
      assignedDirectFix: null,
      clearances: [],
      pendingRequest: null,
      hasReadbackError: false,
      armNextReadbackError: false,
      spawnedAt: 0,
      stateEnteredAt: 0,
      lastTransmissionAt: 0,
      trail: [],
    },
    airport
  );
  assert.ok(igo.registration.startsWith("VT-"), `Expected VT- prefix for IndiGo, got ${igo.registration}`);
});
