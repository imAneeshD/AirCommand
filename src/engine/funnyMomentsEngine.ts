import type {
  Aircraft,
  ClearanceType,
  ControllerRole,
  SimulationState,
} from "../types/atc.ts";
import { runwaySpokenName } from "../data/asteriaAirport.ts";
import { addRadioMessage, controllerCallsign } from "./decisionEngine.ts";

/**
 * Real-world Aviation Humorous Conversations, Radio Banter & Easter Eggs.
 * Inspired by legendary real-world LiveATC recordings (Kennedy Steve, Boston John,
 * SR-71 speed check, student pilot moments, airline rivalry, and tarmac humor).
 */

export interface DialogueTurn {
  senderRole: "PILOT" | "CONTROLLER";
  controller: ControllerRole;
  category: "PILOT_REQUEST" | "ATC_CLEARANCE" | "PILOT_READBACK";
  delaySec: number;
  text: (ac: Aircraft, state: SimulationState) => string;
}

export interface FunnyBanterMoment {
  id: string;
  minCooldownSec: number;
  suitableRole: ControllerRole | "ANY";
  turns: DialogueTurn[];
}

export const FUNNY_ATC_MOMENTS: FunnyBanterMoment[] = [
  // ==========================================
  // 1. KENNEDY STEVE & TARMAC GROUND BANTER
  // ==========================================
  {
    id: "ks_baggage_tug_leisure",
    minCooldownSec: 150,
    suitableRole: "GROUND",
    turns: [
      {
        senderRole: "PILOT",
        controller: "GROUND",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("GROUND", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, we are stuck behind the world's most leisurely baggage tug on taxiway Alpha.`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "GROUND",
        category: "ATC_CLEARANCE",
        delaySec: 2.2,
        text: (ac, s) => `${ac.spokenCallsign}, Ground, be patient with him, his shift ended 10 minutes ago and he is savoring the scenic route.`,
      },
      {
        senderRole: "PILOT",
        controller: "GROUND",
        category: "PILOT_READBACK",
        delaySec: 4.5,
        text: (ac) => `Understood Ground, we will pace ourselves and enjoy the sightseeing tour.`,
      },
    ],
  },
  {
    id: "ks_scenic_airport_tour",
    minCooldownSec: 160,
    suitableRole: "GROUND",
    turns: [
      {
        senderRole: "PILOT",
        controller: "GROUND",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("GROUND", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, pushback complete, ready for the scenic cross-country taxi tour.`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "GROUND",
        category: "ATC_CLEARANCE",
        delaySec: 2.0,
        text: (ac, s) => `${ac.spokenCallsign}, Ground, taxi via Alpha, Mike, Bravo. Hope you brought snacks and a camera for the scenic journey.`,
      },
    ],
  },
  {
    id: "ks_follow_the_puppy",
    minCooldownSec: 180,
    suitableRole: "GROUND",
    turns: [
      {
        senderRole: "CONTROLLER",
        controller: "GROUND",
        category: "ATC_CLEARANCE",
        delaySec: 0,
        text: (ac, s) => `${ac.spokenCallsign}, ${controllerCallsign("GROUND", s.airport, ac.flightKind)}, give way to the company jet crossing left to right, follow him like a faithful puppy.`,
      },
      {
        senderRole: "PILOT",
        controller: "GROUND",
        category: "PILOT_READBACK",
        delaySec: 2.2,
        text: (ac) => `Following the company puppy, ${ac.spokenCallsign}, hope he knows where he is going.`,
      },
    ],
  },
  {
    id: "ks_roman_pavement",
    minCooldownSec: 180,
    suitableRole: "GROUND",
    turns: [
      {
        senderRole: "PILOT",
        controller: "GROUND",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("GROUND", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, who paved this taxiway, Julius Caesar and the ancient Romans?`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "GROUND",
        category: "ATC_CLEARANCE",
        delaySec: 2.1,
        text: (ac, s) => `${ac.spokenCallsign}, Ground, affirmative, authentic historical cobblestones, enjoy your complimentary suspension test.`,
      },
    ],
  },
  {
    id: "ks_catering_truck_right_of_way",
    minCooldownSec: 160,
    suitableRole: "GROUND",
    turns: [
      {
        senderRole: "PILOT",
        controller: "GROUND",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("GROUND", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, yielding to a speeding catering truck at intersection Charlie.`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "GROUND",
        category: "ATC_CLEARANCE",
        delaySec: 2.0,
        text: (ac) => `${ac.spokenCallsign}, good decision, that truck carries fresh coffee and hot samosas, they hold unconditional right of way today.`,
      },
    ],
  },
  {
    id: "ks_bring_binoculars",
    minCooldownSec: 180,
    suitableRole: "GROUND",
    turns: [
      {
        senderRole: "PILOT",
        controller: "GROUND",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("GROUND", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, confirm the hold short line? The paint looks like modern abstract art.`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "GROUND",
        category: "ATC_CLEARANCE",
        delaySec: 2.1,
        text: (ac) => `${ac.spokenCallsign}, hold where your front wheels feel guilty, maintenance is repainting next Tuesday.`,
      },
    ],
  },
  {
    id: "ks_parking_valet",
    minCooldownSec: 180,
    suitableRole: "GROUND",
    turns: [
      {
        senderRole: "PILOT",
        controller: "GROUND",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("GROUND", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, do you offer valet parking at the terminal gates today?`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "GROUND",
        category: "ATC_CLEARANCE",
        delaySec: 2.0,
        text: (ac) => `${ac.spokenCallsign}, negative, self-park only, and do not forget to tip the marshaller holding the orange wands.`,
      },
    ],
  },

  // ==========================================
  // 2. TOWER, RUNWAY & SCOREBOARD JUDGES
  // ==========================================
  {
    id: "twr_butter_touchdown_score",
    minCooldownSec: 150,
    suitableRole: "TOWER",
    turns: [
      {
        senderRole: "PILOT",
        controller: "TOWER",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("TOWER", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, that was butter smooth on touchdown. What is our score from the tower scoreboard?`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "TOWER",
        category: "ATC_CLEARANCE",
        delaySec: 2.2,
        text: (ac) => `${ac.spokenCallsign}, solid 9.8 out of 10 from the tower judges. Deducting 0.2 points for fishing for compliments on frequency.`,
      },
      {
        senderRole: "PILOT",
        controller: "TOWER",
        category: "PILOT_READBACK",
        delaySec: 4.5,
        text: (ac) => `We will take the 9.8 and buy the tower donuts tomorrow, ${ac.spokenCallsign}.`,
      },
    ],
  },
  {
    id: "twr_carrier_landing_firm",
    minCooldownSec: 160,
    suitableRole: "TOWER",
    turns: [
      {
        senderRole: "CONTROLLER",
        controller: "TOWER",
        category: "ATC_CLEARANCE",
        delaySec: 0,
        text: (ac, s) => `${ac.spokenCallsign}, ${controllerCallsign("TOWER", s.airport, ac.flightKind)}, verify you hit the touchdown zone or did you drop an anchor like an aircraft carrier?`,
      },
      {
        senderRole: "PILOT",
        controller: "TOWER",
        category: "PILOT_READBACK",
        delaySec: 2.3,
        text: (ac) => `${ac.spokenCallsign}, affirmative Tower, the runway didn't move so we decided to test its structural integrity.`,
      },
    ],
  },
  {
    id: "twr_bird_flight_plan",
    minCooldownSec: 160,
    suitableRole: "TOWER",
    turns: [
      {
        senderRole: "PILOT",
        controller: "TOWER",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("TOWER", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, verify that bird crossing final filed an IFR flight plan?`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "TOWER",
        category: "ATC_CLEARANCE",
        delaySec: 2.2,
        text: (ac) => `${ac.spokenCallsign}, negative, he squawked 1200, refused radar vectors, and took the high-speed taxiway without clearance.`,
      },
    ],
  },
  {
    id: "twr_runway_lights_mars",
    minCooldownSec: 180,
    suitableRole: "TOWER",
    turns: [
      {
        senderRole: "PILOT",
        controller: "TOWER",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("TOWER", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, are the runway lights on step 5? We can see them all the way from orbit.`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "TOWER",
        category: "ATC_CLEARANCE",
        delaySec: 2.0,
        text: (ac) => `${ac.spokenCallsign}, affirmative, Mars requested confirmation that our airport is open tonight.`,
      },
    ],
  },
  {
    id: "twr_wave_on_rotation",
    minCooldownSec: 160,
    suitableRole: "TOWER",
    turns: [
      {
        senderRole: "PILOT",
        controller: "TOWER",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("TOWER", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, lined up and ready, first officer promises a wave at the tower on rotation.`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "TOWER",
        category: "ATC_CLEARANCE",
        delaySec: 2.0,
        text: (ac) => `${ac.spokenCallsign}, cleared for takeoff, we will wave back with binoculars.`,
      },
    ],
  },
  {
    id: "twr_rabbit_on_runway",
    minCooldownSec: 190,
    suitableRole: "TOWER",
    turns: [
      {
        senderRole: "CONTROLLER",
        controller: "TOWER",
        category: "ATC_CLEARANCE",
        delaySec: 0,
        text: (ac, s) => `${ac.spokenCallsign}, ${controllerCallsign("TOWER", s.airport, ac.flightKind)}, exercise caution, rabbit reported crossing the runway midpoint at maximum sprint.`,
      },
      {
        senderRole: "PILOT",
        controller: "TOWER",
        category: "PILOT_READBACK",
        delaySec: 2.1,
        text: (ac) => `${ac.spokenCallsign}, roger, rabbit in sight, looks like he's trying to break the airport 100-meter dash record.`,
      },
    ],
  },

  // ==========================================
  // 3. RADAR, SPEED CHECKS & ALTITUDE BANTER
  // ==========================================
  {
    id: "radar_sr71_speed_check",
    minCooldownSec: 180,
    suitableRole: "DEPARTURE",
    turns: [
      {
        senderRole: "PILOT",
        controller: "DEPARTURE",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("DEPARTURE", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, request ground speed readout?`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "DEPARTURE",
        category: "ATC_CLEARANCE",
        delaySec: 2.2,
        text: (ac) => `${ac.spokenCallsign}, Radar shows you across the ground at a blazing 285 knots.`,
      },
      {
        senderRole: "PILOT",
        controller: "DEPARTURE",
        category: "PILOT_READBACK",
        delaySec: 4.6,
        text: (ac) => `${ac.spokenCallsign}, roger, our GPS showed 286, close enough for government work!`,
      },
    ],
  },
  {
    id: "radar_cricket_match_rush",
    minCooldownSec: 180,
    suitableRole: "ANY",
    turns: [
      {
        senderRole: "PILOT",
        controller: "DEPARTURE",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign(ac.controller, s.airport, ac.flightKind)}, ${ac.spokenCallsign}, any chance for direct to destination? Captain is eager to catch the cricket final replay.`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "DEPARTURE",
        category: "ATC_CLEARANCE",
        delaySec: 2.2,
        text: (ac, s) => `${ac.spokenCallsign}, ${controllerCallsign(ac.controller, s.airport, ac.flightKind)}, negative, record it on your phone and maintain present heading.`,
      },
    ],
  },
  {
    id: "radar_weather_balloon_ufo",
    minCooldownSec: 200,
    suitableRole: "ANY",
    turns: [
      {
        senderRole: "PILOT",
        controller: "DEPARTURE",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign(ac.controller, s.airport, ac.flightKind)}, ${ac.spokenCallsign}, verify unidentified shiny target at our 1 o'clock?`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "DEPARTURE",
        category: "ATC_CLEARANCE",
        delaySec: 2.1,
        text: (ac) => `${ac.spokenCallsign}, that is a weather balloon having an existential crisis, continue as cleared.`,
      },
    ],
  },
  {
    id: "radar_climb_fl600",
    minCooldownSec: 210,
    suitableRole: "DEPARTURE",
    turns: [
      {
        senderRole: "PILOT",
        controller: "DEPARTURE",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("DEPARTURE", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, request climb Flight Level 600?`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "DEPARTURE",
        category: "ATC_CLEARANCE",
        delaySec: 2.0,
        text: (ac) => `${ac.spokenCallsign}, cleared to Flight Level 600 if you can reach it in that aircraft!`,
      },
      {
        senderRole: "PILOT",
        controller: "DEPARTURE",
        category: "PILOT_READBACK",
        delaySec: 4.4,
        text: (ac) => `Roger, descending from Flight Level 800 down to 600, ${ac.spokenCallsign}!`,
      },
    ],
  },
  {
    id: "radar_headwinds_hovering",
    minCooldownSec: 180,
    suitableRole: "DEPARTURE",
    turns: [
      {
        senderRole: "PILOT",
        controller: "DEPARTURE",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("DEPARTURE", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, these headwinds are so stiff we are practically flying backwards.`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "DEPARTURE",
        category: "ATC_CLEARANCE",
        delaySec: 2.1,
        text: (ac) => `${ac.spokenCallsign}, roger, radar confirms you have helicopter hover privileges today, airspeed 170 over ground 110.`,
      },
    ],
  },

  // ==========================================
  // 4. STUDENT PILOTS & FLIGHT INSTRUCTORS
  // ==========================================
  {
    id: "student_first_solo_asphalt",
    minCooldownSec: 180,
    suitableRole: "TOWER",
    turns: [
      {
        senderRole: "PILOT",
        controller: "TOWER",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("TOWER", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, student solo on 3-mile final, please say a gentle prayer for the runway asphalt.`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "TOWER",
        category: "ATC_CLEARANCE",
        delaySec: 2.2,
        text: (ac) => `${ac.spokenCallsign}, Tower, fire trucks are alerted just to cheer you on, runway is all yours, cleared to land.`,
      },
      {
        senderRole: "PILOT",
        controller: "TOWER",
        category: "PILOT_READBACK",
        delaySec: 4.5,
        text: (ac) => `Cleared to land, student pilot breathing deeply, thank you Tower!`,
      },
    ],
  },
  {
    id: "student_instructor_whisper",
    minCooldownSec: 190,
    suitableRole: "TOWER",
    turns: [
      {
        senderRole: "PILOT",
        controller: "TOWER",
        category: "PILOT_READBACK",
        delaySec: 0,
        text: (ac) => `Tower, ${ac.spokenCallsign}... uh... turn left heading... um... (faint whisper: 'Heading 090!')... heading 090!`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "TOWER",
        category: "ATC_CLEARANCE",
        delaySec: 2.3,
        text: (ac) => `${ac.spokenCallsign}, tell your flight instructor in the right seat his radio whispering voice is loud and clear.`,
      },
    ],
  },
  {
    id: "student_say_again_everything",
    minCooldownSec: 200,
    suitableRole: "GROUND",
    turns: [
      {
        senderRole: "PILOT",
        controller: "GROUND",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("GROUND", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, say again all after 'good morning'?`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "GROUND",
        category: "ATC_CLEARANCE",
        delaySec: 2.1,
        text: (ac) => `${ac.spokenCallsign}, Ground, pencil ready this time? Taxi to runway hold short Alpha, Mike.`,
      },
    ],
  },

  // ==========================================
  // 5. FOOD, SNACKS, COFFEE & CABIN CHATTER
  // ==========================================
  {
    id: "food_coffee_machine_gate",
    minCooldownSec: 170,
    suitableRole: "GROUND",
    turns: [
      {
        senderRole: "PILOT",
        controller: "GROUND",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("GROUND", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, can you confirm if the espresso machine at Terminal Gate 4 is operational?`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "GROUND",
        category: "ATC_CLEARANCE",
        delaySec: 2.2,
        text: (ac) => `${ac.spokenCallsign}, Ground confirms fresh dark roast brewing, expedite taxi and grab a double shot.`,
      },
    ],
  },
  {
    id: "food_dropped_sandwich",
    minCooldownSec: 180,
    suitableRole: "GROUND",
    turns: [
      {
        senderRole: "PILOT",
        controller: "GROUND",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("GROUND", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, holding position for 20 seconds, copilot dropped his sandwich between the rudder pedals.`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "GROUND",
        category: "ATC_CLEARANCE",
        delaySec: 2.2,
        text: (ac) => `${ac.spokenCallsign}, take your time, retrieve the sandwich, safety first. Five-second rule applies.`,
      },
    ],
  },
  {
    id: "food_samosa_delivery",
    minCooldownSec: 180,
    suitableRole: "TOWER",
    turns: [
      {
        senderRole: "PILOT",
        controller: "TOWER",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("TOWER", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, we brought warm samosas from Delhi, can we air-drop a box to the tower cab?`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "TOWER",
        category: "ATC_CLEARANCE",
        delaySec: 2.1,
        text: (ac) => `${ac.spokenCallsign}, Tower, runway 09 cleared to land, taxi straight to the base of the tower cab, hot sauce included!`,
      },
    ],
  },
  {
    id: "food_pizza_delivery_eta",
    minCooldownSec: 190,
    suitableRole: "ANY",
    turns: [
      {
        senderRole: "PILOT",
        controller: "DEPARTURE",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign(ac.controller, s.airport, ac.flightKind)}, ${ac.spokenCallsign}, speed 250 knots, trying to arrive before the pizza delivery driver beats us to the hotel.`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "DEPARTURE",
        category: "ATC_CLEARANCE",
        delaySec: 2.0,
        text: (ac) => `${ac.spokenCallsign}, cleared direct destination, tell the driver to keep the pepperoni warm.`,
      },
    ],
  },

  // ==========================================
  // 6. ACCIDENTAL PA MISTAKES & MICROPHONE QUIPS
  // ==========================================
  {
    id: "mic_accidental_pa_announcement",
    minCooldownSec: 190,
    suitableRole: "ANY",
    turns: [
      {
        senderRole: "PILOT",
        controller: "TOWER",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac) => `...and from the flight deck, local time is 4 PM, temperature 28 degrees... wait, wrong microphone, disregard!`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "TOWER",
        category: "ATC_CLEARANCE",
        delaySec: 2.3,
        text: (ac) => `${ac.spokenCallsign}, Tower copies, sounded like a lovely announcement, your passengers would have appreciated it.`,
      },
    ],
  },
  {
    id: "mic_hot_mic_laughter",
    minCooldownSec: 200,
    suitableRole: "GROUND",
    turns: [
      {
        senderRole: "PILOT",
        controller: "GROUND",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac) => `...did you see his haircut at dispatch? (snickers)... oops, mic was keyed!`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "GROUND",
        category: "ATC_CLEARANCE",
        delaySec: 2.1,
        text: (ac) => `${ac.spokenCallsign}, Ground, we all agree dispatch needs a barber, taxi via Alpha hold short Bravo.`,
      },
    ],
  },
  {
    id: "mic_say_altitude_altitude",
    minCooldownSec: 180,
    suitableRole: "DEPARTURE",
    turns: [
      {
        senderRole: "CONTROLLER",
        controller: "DEPARTURE",
        category: "ATC_CLEARANCE",
        delaySec: 0,
        text: (ac, s) => `${ac.spokenCallsign}, ${controllerCallsign("DEPARTURE", s.airport, ac.flightKind)}, say altitude?`,
      },
      {
        senderRole: "PILOT",
        controller: "DEPARTURE",
        category: "PILOT_READBACK",
        delaySec: 1.8,
        text: (ac) => `Altitude!`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "DEPARTURE",
        category: "ATC_CLEARANCE",
        delaySec: 3.5,
        text: (ac) => `${ac.spokenCallsign}, say airspeed? (chuckles)`,
      },
      {
        senderRole: "PILOT",
        controller: "DEPARTURE",
        category: "PILOT_READBACK",
        delaySec: 5.2,
        text: (ac) => `Airspeed! Passing 6,000 ft at 220 knots, couldn't resist Tower!`,
      },
    ],
  },

  // ==========================================
  // 7. AIRLINE RIVALRY & FRIENDLY DIGS
  // ==========================================
  {
    id: "rivalry_overtake_slow_airline",
    minCooldownSec: 170,
    suitableRole: "GROUND",
    turns: [
      {
        senderRole: "PILOT",
        controller: "GROUND",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("GROUND", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, can we overtake the jet ahead on parallel taxiway? Their captain is taxiing like it's Sunday afternoon.`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "GROUND",
        category: "ATC_CLEARANCE",
        delaySec: 2.2,
        text: (ac) => `${ac.spokenCallsign}, negative, no overtaking on the highway, maintain 150 feet separation and enjoy the view.`,
      },
    ],
  },
  {
    id: "rivalry_blinding_taxi_lights",
    minCooldownSec: 180,
    suitableRole: "GROUND",
    turns: [
      {
        senderRole: "PILOT",
        controller: "GROUND",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("GROUND", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, tell the aircraft behind us their LED taxi lights are giving our cockpit a full tan.`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "GROUND",
        category: "ATC_CLEARANCE",
        delaySec: 2.2,
        text: (ac) => `Aircraft behind ${ac.spokenCallsign}, dim your stadium floodlights, you are dazzling your company colleagues.`,
      },
    ],
  },
  {
    id: "rivalry_smooth_touchdown_chiropractor",
    minCooldownSec: 190,
    suitableRole: "TOWER",
    turns: [
      {
        senderRole: "PILOT",
        controller: "TOWER",
        category: "PILOT_REQUEST",
        delaySec: 0,
        text: (ac, s) => `${controllerCallsign("TOWER", s.airport, ac.flightKind)}, ${ac.spokenCallsign}, that landing ahead of us rattled the approach lights, do they need a chiropractor?`,
      },
      {
        senderRole: "CONTROLLER",
        controller: "TOWER",
        category: "ATC_CLEARANCE",
        delaySec: 2.1,
        text: (ac) => `${ac.spokenCallsign}, Tower, let's see how gentle your arrival is before you critique the competition. Wind 260 at 12, cleared to land.`,
      },
    ],
  },
];

/**
 * Rich library of spontaneous funny readback additions (~6% trigger).
 */
export const FUNNY_READBACK_QUIPS: Partial<Record<ClearanceType, string[]>> = {
  LAND: [
    "and first officer promises a butter touchdown for the tower cameras",
    "touchdown clearance copied, scoreboard judges ready",
    "cleared to land, passenger cabin promises a standing ovation",
    "landing clearance received, heading in for hot chai and samosas",
    "cleared to land, deploying greaser touchdown mode",
    "wheels ready for a smooth kiss on the tarmac",
    "landing clearance copied, watch the replay on YouTube",
    "cleared to land, captain promises not to bounce this one",
    "cleared to land, hopes the runway asphalt is feeling gentle today",
  ],
  TAKEOFF: [
    "cleared for takeoff, waving at the tower cab on rotation",
    "cleared for takeoff, time to make the flight attendants sit down",
    "full throttle and away we go, leaving ground traffic behind",
    "cleared for takeoff, say goodbye to gravity",
    "cleared for departure, rotating right on the numbers",
    "takeoff clearance copied, leaving rubber on the runway",
    "cleared for takeoff, climbing into the smooth air",
    "spooling up the turbofans, see you on return",
  ],
  PUSHBACK: [
    "pushback approved, rolling before the captain's coffee gets cold",
    "pushback approved, captain says do not scratch the rental paint",
    "pushback commencing, watch out for our shiny new wingtips",
    "pushback approved, tail swinging south into the morning breeze",
    "pushback commencing, tug driver promised us a smooth ride",
    "pushing back, captain hopes he remembered to release the handbrake",
  ],
  TAXI: [
    "taxi clearance copied, hoping the baggage tug ahead finds second gear",
    "taxi via the scenic airport tour route copied",
    "taxi clearance received, enjoying the morning tarmac safari",
    "taxiing forward, keeping our eyes peeled for runway rabbits",
    "taxi clearance copied, rolling at a stately 15 knots",
    "taxiing via Alpha, admiring the scenery",
    "taxi clearance received, following the yellow brick road",
  ],
  HOLD_SHORT: [
    "holding short, feet firmly on the brakes and eyes on the prize",
    "holding short, chilling at the line",
    "holding short, waiting for the red carpet to roll out",
    "holding short, admiring the heavy jet landing ahead",
    "holding short the line, parking brake set",
    "holding short, nose firmly behind the paint",
  ],
  GO_AROUND: [
    "going around, full power, we like flying so much we decided to do it twice",
    "going around, TOGA set, second time's the charm",
    "going around, giving the passengers a scenic flyby",
    "missed approach initiated, climbing out to pattern altitude",
  ],
  VACATE_RUNWAY: [
    "vacating runway, leaving the asphalt nice and warm for the next arrival",
    "runway vacated on the high-speed exit, rolling clean",
    "vacated clear of the active, contacting Ground on 121.9",
  ],
};

/**
 * Deterministic hash check for funny readback quips (~6% of routine clearances).
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
  const timeSlot = Math.floor(time / 35);
  const combined = Math.abs(hash ^ (timeSlot * 2654435761));

  // ~6.25% trigger probability (1 out of 16)
  if (combined % 16 !== 0) {
    return null;
  }

  const idx = Math.floor(combined / 16) % quipList.length;
  return quipList[idx] ?? null;
}

/**
 * Simulation step hook for spontaneous funny moments & back-and-forth radio conversations.
 * Uses LRU anti-repetition memory so lines never repeat consecutively.
 * Staggers multi-turn dialogue with natural radio speech pauses (2-3 seconds between turns).
 */
export function stepFunnyMoments(state: SimulationState, dt: number): void {
  // 1. Process any pending delayed dialogue turns
  if (state.pendingFunnyDialogues && state.pendingFunnyDialogues.length > 0) {
    const readyTurns: typeof state.pendingFunnyDialogues = [];
    const remainingTurns: typeof state.pendingFunnyDialogues = [];

    for (const turn of state.pendingFunnyDialogues) {
      if (state.time >= turn.fireAt) {
        readyTurns.push(turn);
      } else {
        remainingTurns.push(turn);
      }
    }

    state.pendingFunnyDialogues = remainingTurns;

    for (const turn of readyTurns) {
      addRadioMessage(state, {
        sender: turn.sender,
        recipient: turn.recipient,
        controller: turn.controller,
        aircraftId: turn.aircraftId,
        category: turn.category,
        text: turn.text,
      });
    }
  }

  // 2. Cooldown check for initiating a new spontaneous conversation
  const activeAircraft = state.aircraftOrder
    .map((id) => state.aircraft[id])
    .filter(
      (a): a is Aircraft =>
        Boolean(a) &&
        a.state !== "COMPLETED_ARRIVAL" &&
        a.state !== "COMPLETED_DEPARTURE" &&
        a.state !== "CRASHED" &&
        a.commStatus === "NORMAL" &&
        a.operationMode === "NORMAL_OPERATION"
    );

  if (activeAircraft.length < 2) return;

  if (state.lastFunnyMomentAt === undefined) {
    state.lastFunnyMomentAt = state.time - 40;
    return;
  }

  // Dynamic cooldown: between 90 and 160 simulation seconds
  const cooldownSeed = Math.abs((state.nextIdCounter * 9301 + 49297) % 233280);
  const targetCooldown = 95 + (cooldownSeed % 65);

  if (state.time - state.lastFunnyMomentAt < targetCooldown) {
    return;
  }

  // 3. Initialize anti-repetition memory
  if (!state.recentFunnyMomentIds) {
    state.recentFunnyMomentIds = [];
  }

  // Filter candidate moments that have not been played recently (last 15 moments)
  const availableMoments = FUNNY_ATC_MOMENTS.filter(
    (m) => !state.recentFunnyMomentIds?.includes(m.id)
  );
  const momentsPool = availableMoments.length > 0 ? availableMoments : FUNNY_ATC_MOMENTS;

  // Shuffle candidate moments
  const candidateMoments = [...momentsPool].sort(
    () => 0.5 - ((state.nextIdCounter * 37 + (state.time % 13)) % 100) / 100
  );

  for (const moment of candidateMoments) {
    const matchingAc = activeAircraft.find((ac) => {
      if (moment.suitableRole === "ANY") return true;
      return ac.controller === moment.suitableRole;
    });

    if (matchingAc) {
      state.lastFunnyMomentAt = state.time;

      // Track played moment in recent history (retain last 20)
      state.recentFunnyMomentIds.push(moment.id);
      if (state.recentFunnyMomentIds.length > 20) {
        state.recentFunnyMomentIds.shift();
      }

      // Schedule all dialogue turns
      if (!state.pendingFunnyDialogues) {
        state.pendingFunnyDialogues = [];
      }

      moment.turns.forEach((turn, idx) => {
        const sender =
          turn.senderRole === "PILOT"
            ? matchingAc.callsign
            : controllerCallsign(turn.controller, state.airport, matchingAc.flightKind);
        const recipient =
          turn.senderRole === "PILOT"
            ? controllerCallsign(turn.controller, state.airport, matchingAc.flightKind)
            : matchingAc.callsign;
        const text = turn.text(matchingAc, state);

        if (idx === 0 && turn.delaySec === 0) {
          // Deliver first turn immediately
          addRadioMessage(state, {
            sender,
            recipient,
            controller: turn.controller,
            aircraftId: matchingAc.id,
            category: turn.category,
            text,
          });
        } else {
          // Schedule subsequent turns with natural speech pauses
          state.pendingFunnyDialogues!.push({
            fireAt: state.time + Math.max(1.5, turn.delaySec),
            sender,
            recipient,
            controller: turn.controller,
            aircraftId: matchingAc.id,
            category: turn.category,
            text,
          });
        }
      });

      break;
    }
  }
}
