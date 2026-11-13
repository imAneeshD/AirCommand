import test from "node:test";
import assert from "node:assert/strict";
import { createBaseSimulation, createDepartureAircraft, stepSimulation } from "../src/engine/simulation.ts";
import { submitClearanceDecision, acknowledgeSyncClearance } from "../src/engine/decisionEngine.ts";
import { collectNewMessagesSince } from "../src/store/atcStore.ts";
import {
  ICAO_PHONETIC_TABLE,
  formatCallsignIcao,
  formatFixIcao,
  formatGateIcao,
  spellLettersIcao,
} from "../src/utils/natoPhonetics.ts";
import { formatAtcSpeech, scoreSpeechVoice } from "../src/utils/radioAudio.ts";

test("ICAO_PHONETIC_TABLE contains all 26 NATO/ICAO phonetic alphabet letters A-Z", () => {
  assert.equal(ICAO_PHONETIC_TABLE.length, 26);
  const expected: Array<[string, string]> = [
    ["A", "Alfa"],
    ["B", "Bravo"],
    ["C", "Charlie"],
    ["D", "Delta"],
    ["E", "Echo"],
    ["F", "Foxtrot"],
    ["G", "Golf"],
    ["H", "Hotel"],
    ["I", "India"],
    ["J", "Juliett"],
    ["K", "Kilo"],
    ["L", "Lima"],
    ["M", "Mike"],
    ["N", "November"],
    ["O", "Oscar"],
    ["P", "Papa"],
    ["Q", "Quebec"],
    ["R", "Romeo"],
    ["S", "Sierra"],
    ["T", "Tango"],
    ["U", "Uniform"],
    ["V", "Victor"],
    ["W", "Whiskey"],
    ["X", "X-ray"],
    ["Y", "Yankee"],
    ["Z", "Zulu"],
  ];
  for (let i = 0; i < expected.length; i++) {
    assert.equal(ICAO_PHONETIC_TABLE[i].letter, expected[i][0]);
    assert.equal(ICAO_PHONETIC_TABLE[i].icao, expected[i][1]);
  }
  assert.equal(
    spellLettersIcao("KJZ"),
    "Kilo Juliett Zulu"
  );
});

test("formatAtcSpeech and ICAO helpers handle callsigns, taxiways, runways, gates, and waypoints", () => {
  assert.equal(formatCallsignIcao("UAL452"), "United Four Five Two");
  assert.equal(formatCallsignIcao("N732AB"), "November Seven Three Two Alpha Bravo");
  assert.equal(formatGateIcao("B12"), "Bravo One Two");
  assert.equal(formatFixIcao("ASTER1"), "ASTER One");
  assert.equal(formatFixIcao("IF09L"), "India Foxtrot Zero Niner Left");

  assert.equal(
    formatAtcSpeech("United 452, wind 090 at 8, runway zero nine left, cleared for takeoff."),
    "United four five two, wind zero niner zero at eight, runway zero niner left, cleared for takeoff."
  );

  assert.equal(
    formatAtcSpeech("UAL452, taxi via A, B to RWY 09L, direct ASTER1."),
    "United four five two, taxi via Alpha, Bravo to runway zero niner left, direct ASTER One."
  );

  assert.equal(
    formatAtcSpeech("Asteria Ground, United 452 at gate B12, request pushback."),
    "Asteria Ground, United four five two at gate Bravo one two, request pushback."
  );

  assert.equal(
    formatAtcSpeech("Climb and maintain 7000, reduce speed to 180 kts. [READBACK ERROR]"),
    "Climb and maintain seven thousand, reduce speed to one eight zero knots."
  );

  assert.equal(
    formatAtcSpeech("Cleared ILS RWY 09R, squawk 7600, Taxiway K, Gate Z9."),
    "Cleared I L S runway zero niner right, squawk seven six zero zero, Taxiway Kilo, Gate Zulu niner."
  );
});

test("scoreSpeechVoice prioritizes neural/cloud English voices above legacy local SAPI voices", () => {
  const neural = scoreSpeechVoice({
    name: "Microsoft Guy Online (Natural) - English (United States)",
    lang: "en-US",
    localService: false,
    default: false,
    voiceURI: "guy-neural",
  } as SpeechSynthesisVoice);

  const google = scoreSpeechVoice({
    name: "Google UK English Male",
    lang: "en-GB",
    localService: false,
    default: false,
    voiceURI: "google-uk-male",
  } as SpeechSynthesisVoice);

  const david = scoreSpeechVoice({
    name: "Microsoft David - English (United States)",
    lang: "en-US",
    localService: true,
    default: true,
    voiceURI: "ms-david",
  } as SpeechSynthesisVoice);

  assert.equal(neural.quality, "NEURAL");
  assert.equal(google.quality, "CLOUD");
  assert.equal(david.quality, "LOCAL");
  assert.ok(neural.score > google.score);
  assert.ok(google.score > david.score);
});

test("Both ATC commands and pilot replies are captured cleanly for immediate and readback-delayed instructions", () => {
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

  // 1. Immediate command (HOLD_POSITION) adds BOTH ATC_CLEARANCE and PILOT_READBACK synchronously
  const beforeImmediate = s.radioLog[s.radioLog.length - 1]?.id ?? null;
  submitClearanceDecision(s, { aircraftId: ual.id, controller: "GROUND", type: "HOLD_POSITION" }, "PLAYER");
  const immediateMsgs = collectNewMessagesSince(s.radioLog, beforeImmediate);
  assert.equal(immediateMsgs.some((m) => m.category === "ATC_CLEARANCE"), true);
  assert.equal(immediateMsgs.some((m) => m.category === "PILOT_READBACK"), true);

  // 2. Readback-delayed command (PUSHBACK) adds ATC_CLEARANCE now, then PILOT_READBACK after readback delay
  const beforePb = s.radioLog[s.radioLog.length - 1]?.id ?? null;
  submitClearanceDecision(s, { aircraftId: ual.id, controller: "GROUND", type: "PUSHBACK" }, "PLAYER");
  const pbCmdMsgs = collectNewMessagesSince(s.radioLog, beforePb);
  assert.equal(pbCmdMsgs.some((m) => m.category === "ATC_CLEARANCE"), true);

  const beforeTick = s.radioLog[s.radioLog.length - 1]?.id ?? null;
  for (let i = 0; i < 10; i++) stepSimulation(s, 0.2);
  const pbReplyMsgs = collectNewMessagesSince(s.radioLog, beforeTick);
  assert.equal(pbReplyMsgs.some((m) => m.category === "PILOT_READBACK"), true);
});

test("Single-role synchronous clearance waits for acknowledgeSyncClearance before plane begins movement", () => {
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

  const res = submitClearanceDecision(s, { aircraftId: ual.id, controller: "GROUND", type: "PUSHBACK" }, "PLAYER");
  assert.equal(res.ok, true);
  assert.ok(res.clearance);

  // In sync-gated mode, mark syncGated = true
  res.clearance.syncGated = true;

  // Step simulation for 3 seconds — plane must stay at gate waiting!
  for (let i = 0; i < 15; i++) stepSimulation(s, 0.2);
  assert.equal(ual.state, "AT_GATE");
  assert.equal(res.clearance.lifecycle, "READBACK_PENDING");

  // On controller voice completion, sync gate releases and pilot reads back once:
  res.clearance.syncGated = false;
  res.clearance.readbackDueAt = s.time;
  stepSimulation(s, 0.2);
  assert.equal(res.clearance.lifecycle, "ACTIVE");
  assert.ok(ual.state === "PUSHBACK_APPROVED" || ual.state === "PUSHING_BACK");

  // Verify clean single to-and-fro exchange: exactly 1 ATC command and 1 pilot reply
  const msgs = s.radioLog.filter((m) => m.aircraftId === ual.id);
  assert.equal(msgs.filter((m) => m.category === "ATC_CLEARANCE").length, 1);
  assert.equal(msgs.filter((m) => m.category === "PILOT_READBACK").length, 1);
});
