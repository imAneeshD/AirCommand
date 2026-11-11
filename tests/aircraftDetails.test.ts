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
