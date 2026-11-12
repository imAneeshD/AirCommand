import { getRunwayExitOptions, getSuggestedTaxiRoutes } from "../data/asteriaAirport.ts";
import type {
  Aircraft,
  ClearanceCommandInput,
  ControllerRole,
  RunwayId,
  SimulationState,
} from "../types/atc.ts";
import { AIRLINE_TELEPHONY, ICAO_PHONETIC_TABLE } from "./natoPhonetics.ts";

export type VoiceParseResult =
  | {
      ok: true;
      aircraftId: string;
      callsign: string;
      summary: string;
      command: ClearanceCommandInput;
    }
  | {
      ok: false;
      reason: string;
      normalizedText: string;
    };

const WORD_DIGIT_MAP: Record<string, string> = {
  zero: "0",
  oh: "0",
  one: "1",
  wun: "1",
  two: "2",
  three: "3",
  tree: "3",
  four: "4",
  fower: "4",
  five: "5",
  fife: "5",
  six: "6",
  seven: "7",
  eight: "8",
  ait: "8",
  nine: "9",
  niner: "9",
};

const TENS_MAP: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const TEENS_MAP: Record<string, number> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const NATO_WORD_TO_LETTER: Record<string, string> = Object.fromEntries(
  ICAO_PHONETIC_TABLE.flatMap((e) => [
    [e.spoken.toLowerCase(), e.letter],
    [e.icao.toLowerCase(), e.letter],
  ])
);

const TELEPHONY_TO_PREFIXES: Array<{ phrase: string; code: string }> = (() => {
  const rows: Array<{ phrase: string; code: string }> = Object.entries(AIRLINE_TELEPHONY).map(
    ([code, phrase]) => ({ phrase: phrase.toLowerCase(), code })
  );
  // Extra common airline synonyms players actually speak
  rows.push({ phrase: "indigo", code: "IGO" });
  rows.push({ phrase: "speed bird", code: "BAW" });
  rows.push({ phrase: "jet blue", code: "JBU" });
  rows.push({ phrase: "akasa", code: "AKJ" });
  rows.push({ phrase: "spice jet", code: "SEJ" });
  rows.push({ phrase: "fed ex", code: "FDX" });
  return rows.sort((a, b) => b.phrase.length - a.phrase.length);
})();

/**
 * Converts spoken aviation numbers cleanly ("four zero two" -> "402",
 * "five thousand" -> "5000", "three thousand five hundred" -> "3500").
 */
export function normalizeSpokenNumbers(input: string): string {
  const clean = input
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";

  const tokens = clean.split(" ");
  const out: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    // Check compound altitude: "<digit> thousand [<digit> hundred]"
    const dig = WORD_DIGIT_MAP[tok] ?? (/^\d$/.test(tok) ? tok : null);
    if (dig !== null && tokens[i + 1] === "thousand") {
      let total = Number(dig) * 1000;
      i += 1;
      const nextDig =
        i + 1 < tokens.length ? WORD_DIGIT_MAP[tokens[i + 1]] ?? (/^\d$/.test(tokens[i + 1]) ? tokens[i + 1] : null) : null;
      if (nextDig !== null && tokens[i + 2] === "hundred") {
        total += Number(nextDig) * 100;
        i += 2;
      }
      out.push(String(total));
      continue;
    }

    if (dig !== null && tokens[i + 1] === "hundred" && tokens[i + 2] !== "thousand") {
      out.push(String(Number(dig) * 100));
      i += 1;
      continue;
    }

    if (TEENS_MAP[tok] !== undefined && tokens[i + 1] === "thousand") {
      out.push(String(TEENS_MAP[tok] * 1000));
      i += 1;
      continue;
    }

    if (TENS_MAP[tok] !== undefined) {
      const nextDig = i + 1 < tokens.length ? WORD_DIGIT_MAP[tokens[i + 1]] : null;
      if (nextDig !== null) {
        out.push(String(TENS_MAP[tok] + Number(nextDig)));
        i += 1;
        continue;
      }
      out.push(String(TENS_MAP[tok]));
      continue;
    }

    if (TEENS_MAP[tok] !== undefined) {
      out.push(String(TEENS_MAP[tok]));
      continue;
    }

    // Merge consecutive spoken single digits ("two seven zero" -> "270")
    if (WORD_DIGIT_MAP[tok] !== undefined || /^\d$/.test(tok)) {
      let digits = WORD_DIGIT_MAP[tok] ?? tok;
      while (
        i + 1 < tokens.length &&
        (WORD_DIGIT_MAP[tokens[i + 1]] !== undefined || /^\d$/.test(tokens[i + 1])) &&
        tokens[i + 2] !== "thousand" &&
        tokens[i + 2] !== "hundred"
      ) {
        i += 1;
        digits += WORD_DIGIT_MAP[tokens[i]] ?? tokens[i];
      }
      out.push(digits);
      continue;
    }

    out.push(tok);
  }

  return out.join(" ");
}

function findSpokenAircraft(normalized: string, sim: SimulationState): Aircraft | null {
  const active = sim.aircraftOrder
    .map((id) => sim.aircraft[id])
    .filter(
      (ac): ac is Aircraft =>
        Boolean(ac) &&
        ac.state !== "COMPLETED_ARRIVAL" &&
        ac.state !== "COMPLETED_DEPARTURE"
    );

  // 1. Direct ICAO callsign match ("dal437", "dal 437")
  for (const ac of active) {
    const csLower = ac.callsign.toLowerCase();
    const spaced = csLower.replace(/^([a-z]+)(\d+)$/, "$1 $2");
    if (normalized.includes(csLower) || normalized.includes(spaced)) {
      return ac;
    }
  }

  // 2. Airline telephony + digits ("delta 437", "air india 629")
  for (const { phrase, code } of TELEPHONY_TO_PREFIXES) {
    const re = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\s*(\\d{1,4})\\b`);
    const m = normalized.match(re);
    if (m) {
      const targetCallsign = `${code}${m[1]}`;
      const found = active.find((a) => a.callsign.toUpperCase() === targetCallsign);
      if (found) return found;
    }
  }

  // 3. Spoken numeric flight number alone when unique among active flights
  const numMatches = [...normalized.matchAll(/\b(\d{3,4})\b/g)].map((m) => m[1]);
  for (const digits of numMatches) {
    const matches = active.filter((a) => a.callsign.endsWith(digits));
    if (matches.length === 1) return matches[0];
  }

  // 4. Fallback to currently selected aircraft
  if (sim.selectedAircraftId && sim.aircraft[sim.selectedAircraftId]) {
    return sim.aircraft[sim.selectedAircraftId];
  }
  return null;
}

function findRunwayInText(normalized: string, sim: SimulationState): RunwayId | null {
  const m = normalized.match(/\b(?:runway|rwy|ils)\s+(\d{1,2})\s*(left|right|center|centre|l|r|c)?\b/);
  if (!m) return null;
  const num = m[1].padStart(2, "0");
  const sideRaw = m[2];
  const side =
    sideRaw === "left" || sideRaw === "l"
      ? "L"
      : sideRaw === "right" || sideRaw === "r"
      ? "R"
      : sideRaw === "center" || sideRaw === "centre" || sideRaw === "c"
      ? "C"
      : "";
  const candidate = `${num}${side}`;
  if (sim.airport.runways[candidate]) return candidate;
  const prefixMatch = sim.airport.runwayIds.find((id) => id.startsWith(num));
  return prefixMatch ?? null;
}

function controllerForAction(
  type: ClearanceCommandInput["type"],
  ac: Aircraft
): ControllerRole {
  switch (type) {
    case "PUSHBACK":
    case "TAXI":
    case "HOLD_POSITION":
      return "GROUND";
    case "HOLD_SHORT":
    case "CROSS_RUNWAY":
    case "LINE_UP":
    case "TAKEOFF":
    case "CANCEL_TAKEOFF":
    case "REJECT_TAKEOFF":
    case "LAND":
    case "VACATE_RUNWAY":
    case "GO_AROUND":
    case "LIGHT_GUN":
      return "TOWER";
    case "HEADING":
    case "ALTITUDE":
    case "SPEED":
    case "APPROACH":
    case "DIRECT":
      return "DEPARTURE";
    case "HANDOFF":
    case "UNABLE":
      return ac.controller;
  }
}

/**
 * Parses natural spoken ATC phraseology ("Delta 437, climb and maintain 5000",
 * "United 400, cleared for takeoff runway 09L", "Air India 629, turn left heading 270")
 * into an executable simulator clearance command.
 */
export function parseAtcVoiceCommand(rawTranscript: string, sim: SimulationState): VoiceParseResult {
  const normalized = normalizeSpokenNumbers(rawTranscript);
  if (!normalized) {
    return { ok: false, reason: "No speech recognized.", normalizedText: "" };
  }

  const ac = findSpokenAircraft(normalized, sim);
  if (!ac) {
    return {
      ok: false,
      reason: `Select an aircraft or say its callsign cleanly (heard: "${rawTranscript.trim()}").`,
      normalizedText: normalized,
    };
  }

  const runway = findRunwayInText(normalized, sim) ?? ac.targetRunway;

  const makeResult = (
    type: ClearanceCommandInput["type"],
    parameters: Record<string, unknown>,
    summary: string
  ): VoiceParseResult => ({
    ok: true,
    aircraftId: ac.id,
    callsign: ac.callsign,
    summary,
    command: {
      aircraftId: ac.id,
      controller: controllerForAction(type, ac),
      type,
      parameters,
    },
  });

  if (/\b(?:push\s*back|pushback)\b/.test(normalized)) {
    return makeResult("PUSHBACK", {}, `${ac.callsign}: Pushback approved`);
  }

  if (/\b(?:abort takeoff|reject takeoff|stop immediately)\b/.test(normalized)) {
    return makeResult("REJECT_TAKEOFF", {}, `${ac.callsign}: Reject takeoff`);
  }

  if (/\bcancel takeoff\b/.test(normalized)) {
    return makeResult("CANCEL_TAKEOFF", {}, `${ac.callsign}: Cancel takeoff`);
  }

  if (/\b(?:go around|missed approach)\b/.test(normalized)) {
    return makeResult("GO_AROUND", { runway }, `${ac.callsign}: Go around`);
  }

  if (/\b(?:vacate|exit)\s*(?:the\s*)?(?:runway|rwy)?\b/.test(normalized) && (ac.state === "ROLLOUT" || ac.state === "LANDING" || ac.state === "TOUCHDOWN")) {
    const exits = getRunwayExitOptions(sim.airport, ac, runway);
    const chosen = exits[0];
    const expedite = /\bexpedite\b/.test(normalized);
    return makeResult(
      "VACATE_RUNWAY",
      {
        runway,
        exitRwyNodeId: chosen?.exitRwyNodeId,
        holdShortNodeId: chosen?.holdShortNodeId,
        taxiway: chosen?.taxiway,
        expedite,
      },
      `${ac.callsign}: Vacate RWY ${runway}${chosen ? ` via ${chosen.taxiway}` : ""}`
    );
  }

  if (/\b(?:cleared|clear)\s+(?:to\s+)?land\b/.test(normalized)) {
    return makeResult("LAND", { runway }, `${ac.callsign}: Cleared to land RWY ${runway}`);
  }

  if (/\b(?:cleared\s+(?:for\s+)?takeoff|takeoff cleared|clear for takeoff)\b/.test(normalized)) {
    return makeResult("TAKEOFF", { runway }, `${ac.callsign}: Cleared for takeoff RWY ${runway}`);
  }

  if (/\b(?:line up and wait|line up|position and hold)\b/.test(normalized)) {
    return makeResult("LINE_UP", { runway }, `${ac.callsign}: Line up & wait RWY ${runway}`);
  }

  if (/\bcross\s+(?:runway|rwy)\b/.test(normalized)) {
    return makeResult("CROSS_RUNWAY", { runway }, `${ac.callsign}: Cross RWY ${runway}`);
  }

  if (/\bhold short\b/.test(normalized)) {
    return makeResult("HOLD_SHORT", { runway }, `${ac.callsign}: Hold short RWY ${runway}`);
  }

  if (/\b(?:hold position|hold your position)\b/.test(normalized)) {
    return makeResult("HOLD_POSITION", {}, `${ac.callsign}: Hold position`);
  }

  if (/\btaxi\b/.test(normalized)) {
    const startNodeId =
      ac.currentNodeId ??
      (ac.state === "AT_GATE" && ac.gateId ? `GATE_${ac.gateId}` : undefined) ??
      (ac.state === "PUSHBACK_COMPLETE" && ac.gateId ? `PB_${ac.gateId}` : undefined);

    if (startNodeId) {
      const suggestions = getSuggestedTaxiRoutes(
        sim.airport,
        startNodeId,
        runway,
        ac.gateId,
        ac.flightKind === "ARRIVAL",
        sim,
        ac.id
      );
      // Match any spoken NATO taxiway letters if mentioned after "via"
      const viaIdx = normalized.indexOf(" via ");
      let picked = suggestions[0];
      if (viaIdx >= 0) {
        const afterVia = normalized.slice(viaIdx + 5).split(/\s+/);
        const spokenLetters = afterVia
          .map((w) => NATO_WORD_TO_LETTER[w] ?? (/^[a-z]$/i.test(w) ? w.toUpperCase() : null))
          .filter((x): x is string => Boolean(x));
        if (spokenLetters.length > 0) {
          const matched = suggestions.find((s) =>
            spokenLetters.every((l) => s.taxiways.includes(l))
          );
          if (matched) picked = matched;
        }
      }
      if (picked) {
        return makeResult(
          "TAXI",
          {
            runway,
            routeNodeIds: picked.nodeIds,
            routeTaxiways: picked.taxiways,
            destinationNodeId: picked.nodeIds[picked.nodeIds.length - 1],
          },
          `${ac.callsign}: Taxi RWY ${runway} via ${picked.taxiways.join(", ")}`
        );
      }
    }
  }

  if (/\b(?:cleared\s+(?:for\s+)?(?:the\s+)?ils|cleared approach|ils approach)\b/.test(normalized)) {
    return makeResult("APPROACH", { runway }, `${ac.callsign}: Cleared ILS RWY ${runway}`);
  }

  // Heading: "turn left heading 270" / "fly heading 090"
  const hdgMatch = normalized.match(/\b(left|right)?\s*(?:turn\s+(left|right)\s+)?heading\s+(\d{1,3})\b/);
  if (hdgMatch) {
    const dirWord = (hdgMatch[1] ?? hdgMatch[2] ?? "").toUpperCase();
    const turnDirection = dirWord === "LEFT" ? "LEFT" : dirWord === "RIGHT" ? "RIGHT" : "NEAREST";
    const hdgVal = Number(hdgMatch[3]);
    if (hdgVal >= 1 && hdgVal <= 360) {
      return makeResult(
        "HEADING",
        { heading: hdgVal, turnDirection },
        `${ac.callsign}: Heading ${String(hdgVal).padStart(3, "0")}° (${turnDirection})`
      );
    }
  }

  // Altitude: "climb and maintain 5000" / "descend 3000"
  const altMatch = normalized.match(/\b(?:climb|descend|maintain|altitude)\b(?:\s+and\s+maintain)?\s+(?:to\s+)?(\d{3,5})\b/);
  if (altMatch) {
    const altVal = Number(altMatch[1]);
    if (altVal >= 500 && altVal <= 45000) {
      return makeResult("ALTITUDE", { altitude: altVal }, `${ac.callsign}: Maintain ${altVal} ft`);
    }
  }

  // Speed: "speed 180" / "reduce speed 160"
  const spdMatch = normalized.match(/\b(?:speed|reduce speed|increase speed|maintain speed)\s+(?:to\s+)?(\d{3})\b/);
  if (spdMatch) {
    const spdVal = Number(spdMatch[1]);
    if (spdVal >= 110 && spdVal <= 350) {
      return makeResult("SPEED", { speed: spdVal }, `${ac.callsign}: Speed ${spdVal} kt`);
    }
  }

  // Direct Fix: "proceed direct ASTER1" / "direct DELTA"
  if (/\bdirect\b/.test(normalized)) {
    const fixIds = Object.keys(sim.airport.fixes);
    for (const fid of fixIds) {
      if (normalized.includes(fid.toLowerCase())) {
        return makeResult("DIRECT", { fix: fid }, `${ac.callsign}: Direct ${fid}`);
      }
    }
  }

  // Handoff: "contact tower" / "contact ground" / "contact departure"
  const handoffMatch = normalized.match(/\bcontact\b.*\b(ground|tower|departure|approach)\b/);
  if (handoffMatch) {
    const roleMap: Record<string, ControllerRole> = {
      ground: "GROUND",
      tower: "TOWER",
      departure: "DEPARTURE",
      approach: "DEPARTURE",
    };
    const targetController = roleMap[handoffMatch[1]];
    if (targetController) {
      return makeResult(
        "HANDOFF",
        { targetController },
        `${ac.callsign}: Contact ${targetController}`
      );
    }
  }

  return {
    ok: false,
    reason: `Could not match ATC instruction in "${rawTranscript.trim()}".`,
    normalizedText: normalized,
  };
}
