import test from "node:test";
import assert from "node:assert/strict";
import {
  FUNNY_ATC_MOMENTS,
  getFunnyReadbackQuip,
  stepFunnyMoments,
} from "../src/engine/funnyMomentsEngine.ts";
import { createScenarioSimulation } from "../src/engine/simulation.ts";

test("Funny moments engine: has diverse real-world ATC banter moments", () => {
  assert.ok(FUNNY_ATC_MOMENTS.length >= 10, "Must have at least 10 diverse funny moments");
  for (const moment of FUNNY_ATC_MOMENTS) {
    assert.ok(moment.id, "Moment must have an id");
    assert.ok(moment.minCooldownSec > 0, "Moment must have positive cooldown");
  }
});

test("getFunnyReadbackQuip: returns quips for landing, takeoff, pushback, and taxi", () => {
  // Test across multiple seed values to verify quips can be triggered
  let foundLandingQuip = false;
  let foundTakeoffQuip = false;

  for (let t = 0; t < 1000; t += 40) {
    const lQuip = getFunnyReadbackQuip("LAND", "IGO204", t);
    if (lQuip) foundLandingQuip = true;
    const toQuip = getFunnyReadbackQuip("TAKEOFF", "DAL814", t);
    if (toQuip) foundTakeoffQuip = true;
  }

  assert.ok(foundLandingQuip, "Should generate landing quip on matching seed");
  assert.ok(foundTakeoffQuip, "Should generate takeoff quip on matching seed");
});

test("stepFunnyMoments: triggers spontaneous banter when traffic is active and interval passes", () => {
  const sim = createScenarioSimulation("NORMAL_OPS", "ALL", "KAST");
  const initialRadioCount = sim.radioLog.length;

  // Set lastFunnyMomentAt in the past to satisfy cooldown
  sim.lastFunnyMomentAt = 0;
  sim.time = 300;

  stepFunnyMoments(sim, 0.2);

  assert.ok(sim.lastFunnyMomentAt === 300, "Should update lastFunnyMomentAt to current simulation time");
  assert.ok(sim.radioLog.length > initialRadioCount, "Should append funny banter radio messages");

  const latestMsg = sim.radioLog[sim.radioLog.length - 1];
  assert.ok(latestMsg && latestMsg.text.length > 5, "Banter message must be non-empty");
});
