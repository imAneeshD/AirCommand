import type {
  Aircraft,
  ClearanceType,
  ControllerRole,
  SimulationState,
} from "../types/atc.ts";
import { runwaySpokenName } from "../data/asteriaAirport.ts";
import { addRadioMessage, controllerCallsign } from "./decisionEngine.ts";

/**
 * Real-world ATC & Cockpit Humorous Moments and Easter Egg Quips.
 * In real life (LiveATC, Kennedy Steve, pilot banter), occasional lighthearted
 * quips and spontaneous humor happen on frequency.
 */

export interface FunnyBanterMoment {
  id: string;
  minCooldownSec: number;
  suitableRole: ControllerRole | "ANY";
  generate: (
    ac: Aircraft,
    state: SimulationState
  ) => Array<{
    senderRole: "PILOT" | "CONTROLLER";
    controller: ControllerRole;
    category: "PILOT_REQUEST" | "ATC_CLEARANCE" | "PILOT_READBACK";
    text: string;
  }>;
}

export const FUNNY_ATC_MOMENTS: FunnyBanterMoment[] = [
  {
    id: "bird_flight_plan",
    minCooldownSec: 180,
    suitableRole: "TOWER",
    generate: (ac, state) => {
      const twr = controllerCallsign("TOWER", state.airport, ac.flightKind);
      return [
        {
          senderRole: "PILOT",
          controller: "TOWER",
          category: "PILOT_REQUEST",
          text: `${twr}, ${ac.spokenCallsign}, verify that bird crossing final filed a valid flight plan?`,
        },
        {
          senderRole: "CONTROLLER",
          controller: "TOWER",
          category: "ATC_CLEARANCE",
          text: `${ac.spokenCallsign}, ${twr}, negative, he squawked 1200 and refused our radar vectors, use caution.`,
        },
      ];
    },
  },
  {
    id: "butter_touchdown_score",
    minCooldownSec: 180,
    suitableRole: "TOWER",
    generate: (ac, state) => {
      const twr = controllerCallsign("TOWER", state.airport, ac.flightKind);
      return [
        {
          senderRole: "PILOT",
          controller: "TOWER",
          category: "PILOT_REQUEST",
          text: `${twr}, ${ac.spokenCallsign}, that was butter smooth on touchdown. What is our score on the tower scoreboard?`,
        },
        {
          senderRole: "CONTROLLER",
          controller: "TOWER",
          category: "ATC_CLEARANCE",
          text: `${ac.spokenCallsign}, ${twr}, solid 9.5 out of 10 from the tower judges. Half-point deducted for fishing for compliments.`,
        },
      ];
    },
  },
  {
    id: "slow_baggage_tug",
    minCooldownSec: 180,
    suitableRole: "GROUND",
    generate: (ac, state) => {
      const gnd = controllerCallsign("GROUND", state.airport, ac.flightKind);
      return [
        {
          senderRole: "PILOT",
          controller: "GROUND",
          category: "PILOT_REQUEST",
          text: `${gnd}, ${ac.spokenCallsign}, we are stuck behind the world's most leisurely baggage tug on the taxiway.`,
        },
        {
          senderRole: "CONTROLLER",
          controller: "GROUND",
          category: "ATC_CLEARANCE",
          text: `${ac.spokenCallsign}, ${gnd}, be gentle with him, his shift ended 5 minutes ago and he is pacing himself.`,
        },
      ];
    },
  },
  {
    id: "cricket_dinner_rush",
    minCooldownSec: 210,
    suitableRole: "ANY",
    generate: (ac, state) => {
      const ctrl = controllerCallsign(ac.controller, state.airport, ac.flightKind);
      return [
        {
          senderRole: "PILOT",
          controller: ac.controller,
          category: "PILOT_REQUEST",
          text: `${ctrl}, ${ac.spokenCallsign}, any chance for direct destination? Captain is trying to catch the cricket match highlights.`,
        },
        {
          senderRole: "CONTROLLER",
          controller: ac.controller,
          category: "ATC_CLEARANCE",
          text: `${ac.spokenCallsign}, ${ctrl}, negative, record the match on replay and maintain present heading.`,
        },
      ];
    },
  },
  {
    id: "catering_truck_priority",
    minCooldownSec: 180,
    suitableRole: "GROUND",
    generate: (ac, state) => {
      const gnd = controllerCallsign("GROUND", state.airport, ac.flightKind);
      return [
        {
          senderRole: "PILOT",
          controller: "GROUND",
          category: "PILOT_REQUEST",
          text: `${gnd}, ${ac.spokenCallsign}, yielding at intersection to the catering truck that looks like it is in a hurry.`,
        },
        {
          senderRole: "CONTROLLER",
          controller: "GROUND",
          category: "ATC_CLEARANCE",
          text: `${ac.spokenCallsign}, ${gnd}, good decision, the catering truck carries fresh samosas and donuts, they have right of way today.`,
        },
      ];
    },
  },
  {
    id: "pavement_roman_vintage",
    minCooldownSec: 210,
    suitableRole: "GROUND",
    generate: (ac, state) => {
      const gnd = controllerCallsign("GROUND", state.airport, ac.flightKind);
      return [
        {
          senderRole: "PILOT",
          controller: "GROUND",
          category: "PILOT_REQUEST",
          text: `${gnd}, ${ac.spokenCallsign}, who paved this taxiway, the ancient Romans?`,
        },
        {
          senderRole: "CONTROLLER",
          controller: "GROUND",
          category: "ATC_CLEARANCE",
          text: `${ac.spokenCallsign}, ${gnd}, affirmative, Julius Caesar personally laid the cobblestones. Enjoy the authentic suspension test.`,
        },
      ];
    },
  },
  {
    id: "airspeed_biryani",
    minCooldownSec: 240,
    suitableRole: "TOWER",
    generate: (ac, state) => {
      const twr = controllerCallsign("TOWER", state.airport, ac.flightKind);
      return [
        {
          senderRole: "CONTROLLER",
          controller: "TOWER",
          category: "ATC_CLEARANCE",
          text: `${ac.spokenCallsign}, ${twr}, say indicated airspeed?`,
        },
        {
          senderRole: "PILOT",
          controller: "TOWER",
          category: "PILOT_READBACK",
          text: `${twr}, ${ac.spokenCallsign}, fast enough to make our dinner reservation before the food gets cold.`,
        },
        {
          senderRole: "CONTROLLER",
          controller: "TOWER",
          category: "ATC_CLEARANCE",
          text: `${ac.spokenCallsign}, approved as requested, enjoy the hot meal upon arrival.`,
        },
      ];
    },
  },
  {
    id: "weather_balloon_ufo",
    minCooldownSec: 240,
    suitableRole: "ANY",
    generate: (ac, state) => {
      const ctrl = controllerCallsign(ac.controller, state.airport, ac.flightKind);
      return [
        {
          senderRole: "PILOT",
          controller: ac.controller,
          category: "PILOT_REQUEST",
          text: `${ctrl}, ${ac.spokenCallsign}, verify unidentified metallic object off our 2 o'clock?`,
        },
        {
          senderRole: "CONTROLLER",
          controller: ac.controller,
          category: "ATC_CLEARANCE",
          text: `${ac.spokenCallsign}, ${ctrl}, that is just a meteorological balloon having an identity crisis, continue as cleared.`,
        },
      ];
    },
  },
  {
    id: "cross_country_taxi_snacks",
    minCooldownSec: 180,
    suitableRole: "GROUND",
    generate: (ac, state) => {
      const gnd = controllerCallsign("GROUND", state.airport, ac.flightKind);
      return [
        {
          senderRole: "PILOT",
          controller: "GROUND",
          category: "PILOT_REQUEST",
          text: `${gnd}, ${ac.spokenCallsign}, pushback complete, ready for the scenic cross-country taxi tour.`,
        },
        {
          senderRole: "CONTROLLER",
          controller: "GROUND",
          category: "ATC_CLEARANCE",
          text: `${ac.spokenCallsign}, ${gnd}, taxi via Alpha, Mike, Bravo. Hope you packed extra coffee and snacks for the trek.`,
        },
      ];
    },
  },
  {
    id: "pigeon_squadron_tailwinds",
    minCooldownSec: 200,
    suitableRole: "TOWER",
    generate: (ac, state) => {
      const twr = controllerCallsign("TOWER", state.airport, ac.flightKind);
      return [
        {
          senderRole: "PILOT",
          controller: "TOWER",
          category: "PILOT_REQUEST",
          text: `${twr}, ${ac.spokenCallsign}, did we just get overtaken on short final by a flock of pigeons?`,
        },
        {
          senderRole: "CONTROLLER",
          controller: "TOWER",
          category: "ATC_CLEARANCE",
          text: `${ac.spokenCallsign}, affirmative, they travel with zero passenger luggage and caught a stiff tailwind today.`,
        },
      ];
    },
  },
];

/**
 * Occasional humorous additions to pilot readbacks (happens ~6% of the time).
 */
export const FUNNY_READBACK_QUIPS: Partial<Record<ClearanceType, string[]>> = {
  LAND: [
    "and first officer promises a butter touchdown for the tower cameras",
    "touchdown clearance copied, scoreboard judges ready",
    "cleared to land, passenger cabin promises a standing ovation",
    "landing clearance received, heading in for hot chai and samosas",
  ],
  TAKEOFF: [
    "cleared for takeoff, and we will wave at the tower on rotation",
    "cleared for takeoff, time to make the flight attendants sit down",
    "full power and away we go, leaving ground traffic behind",
    "cleared for takeoff, say goodbye to gravity",
  ],
  PUSHBACK: [
    "pushback approved, rolling before the captain's coffee gets cold",
    "pushback approved, captain says do not scratch the rental paint",
    "pushback commencing, watch out for our shiny new wingtips",
  ],
  TAXI: [
    "taxi clearance copied, hoping the baggage tug ahead finds second gear",
    "taxi via the scenic airport tour route copied",
    "taxi clearance received, enjoying the morning tarmac safari",
  ],
  HOLD_SHORT: [
    "holding short, feet firmly on the brakes and eyes on the prize",
    "holding short, chilling at the line",
    "holding short, waiting for the red carpet to roll out",
  ],
};

/**
 * Deterministic but sparse hash check for funny readback quips (~6% of routine clearances).
 */
export function getFunnyReadbackQuip(
  type: ClearanceType,
  callsign: string,
  time: number
): string | null {
  const quipList = FUNNY_READBACK_QUIPS[type];
  if (!quipList || quipList.length === 0) return null;

  // Hash using callsign + time block
  let hash = 0;
  for (let i = 0; i < callsign.length; i++) {
    hash = (hash * 31 + callsign.charCodeAt(i)) & 0xffffffff;
  }
  const timeSlot = Math.floor(time / 40);
  const combined = Math.abs(hash ^ (timeSlot * 2654435761));

  // ~6.25% trigger probability (1 out of 16)
  if (combined % 16 !== 0) {
    return null;
  }

  const idx = Math.floor(combined / 16) % quipList.length;
  return quipList[idx] ?? null;
}

/**
 * Simulation step hook for spontaneous funny moments between pilots and controllers.
 * Randomly fires once every 120-220 simulation seconds when traffic is active.
 */
export function stepFunnyMoments(state: SimulationState, dt: number): void {
  // Only run when at least 2 active planes exist in normal operation
  const activeAircraft = state.aircraftOrder
    .map((id) => state.aircraft[id])
    .filter(
      (a): a is Aircraft =>
        Boolean(a) &&
        a.state !== "COMPLETED_ARRIVAL" &&
        a.state !== "COMPLETED_DEPARTURE" &&
        a.commStatus === "NORMAL" &&
        a.operationMode === "NORMAL_OPERATION"
    );

  if (activeAircraft.length < 2) return;

  // Initialize or check cooldown
  if (state.lastFunnyMomentAt === undefined) {
    // Initial jitter so it doesn't fire immediately at t=0
    state.lastFunnyMomentAt = state.time - 35;
    return;
  }

  // Dynamic random cooldown between 130 and 220 simulation seconds
  const cooldownSeed = Math.abs((state.nextIdCounter * 9301 + 49297) % 233280);
  const targetCooldown = 130 + (cooldownSeed % 90);

  if (state.time - state.lastFunnyMomentAt < targetCooldown) {
    return;
  }

  // Select a suitable aircraft and moment
  const candidateMoments = [...FUNNY_ATC_MOMENTS].sort(
    () => 0.5 - ((state.nextIdCounter * 37) % 100) / 100
  );

  for (const moment of candidateMoments) {
    const matchingAc = activeAircraft.find((ac) => {
      if (moment.suitableRole === "ANY") return true;
      return ac.controller === moment.suitableRole;
    });

    if (matchingAc) {
      state.lastFunnyMomentAt = state.time;
      const msgs = moment.generate(matchingAc, state);

      msgs.forEach((m, idx) => {
        // Stagger the reply slightly (1-2 seconds) so they sequence naturally
        const sender =
          m.senderRole === "PILOT"
            ? matchingAc.callsign
            : controllerCallsign(m.controller, state.airport, matchingAc.flightKind);
        const recipient =
          m.senderRole === "PILOT"
            ? controllerCallsign(m.controller, state.airport, matchingAc.flightKind)
            : matchingAc.callsign;

        addRadioMessage(state, {
          sender,
          recipient,
          controller: m.controller,
          aircraftId: matchingAc.id,
          category: m.category,
          text: m.text,
        });
      });

      break;
    }
  }
}
