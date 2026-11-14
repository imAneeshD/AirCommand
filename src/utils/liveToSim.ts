import { AIRCRAFT_TYPE_SPECS } from "../data/aircraftCatalog.ts";
import { getSuggestedTaxiRoutes, headingDiffDeg } from "../data/asteriaAirport.ts";
import { createClearanceObject } from "../engine/clearanceEngine.ts";
import { addRadioMessage } from "../engine/decisionEngine.ts";
import {
  createArrivalAircraft,
  createBaseSimulation,
  createDepartureAircraft,
  findBestGateForAircraft,
  getActiveRunways,
  isCargoAircraft,
  isMilitaryAircraft,
  resolveWakeCategory,
  spawnRandomTraffic,
} from "../engine/simulation.ts";
import { updateAircraftStates } from "../engine/aircraftEngine.ts";
import type {
  AirportLayout,
  AirportRecord,
  LiveAdsbTrack,
  PlayerRoleMode,
  RunwayId,
  ScenarioId,
  SimulationState,
} from "../types/atc.ts";
import { haversineNm, latLonToLocalNm } from "./geo.ts";
import { convertAirportBundleToLayout } from "./osmToAirport.ts";

const CARRIER_DIRECTORY: Record<string, { airline: string; spoken: string; defaultType: string }> = {
  AIC: { airline: "Air India", spoken: "Air India", defaultType: "A320" },
  IGO: { airline: "IndiGo Airlines", spoken: "iFly", defaultType: "A320" },
  AXB: { airline: "Air India Express", spoken: "Express India", defaultType: "B738" },
  VTI: { airline: "Vistara", spoken: "Vistara", defaultType: "A320" },
  SEJ: { airline: "SpiceJet", spoken: "SpiceJet", defaultType: "B738" },
  AKJ: { airline: "Akasa Air", spoken: "Akasa", defaultType: "B38M" },
  UAE: { airline: "Emirates", spoken: "Emirates", defaultType: "B772" },
  FDB: { airline: "flydubai", spoken: "Sky Dubai", defaultType: "B738" },
  ABY: { airline: "Air Arabia", spoken: "Arabia", defaultType: "A320" },
  ETD: { airline: "Etihad Airways", spoken: "Etihad", defaultType: "B772" },
  QTR: { airline: "Qatar Airways", spoken: "Qatari", defaultType: "B772" },
  BAW: { airline: "British Airways", spoken: "Speedbird", defaultType: "B772" },
  DLH: { airline: "Lufthansa", spoken: "Lufthansa", defaultType: "A321" },
  SIA: { airline: "Singapore Airlines", spoken: "Singapore", defaultType: "B772" },
  AFR: { airline: "Air France", spoken: "Air France", defaultType: "A320" },
  KLM: { airline: "KLM Royal Dutch", spoken: "KLM", defaultType: "B738" },
  THY: { airline: "Turkish Airlines", spoken: "Turkish", defaultType: "B738" },
  UAL: { airline: "United Airlines", spoken: "United", defaultType: "B738" },
  DAL: { airline: "Delta Air Lines", spoken: "Delta", defaultType: "A321" },
  AAL: { airline: "American Airlines", spoken: "American", defaultType: "B738" },
  SWA: { airline: "Southwest Airlines", spoken: "Southwest", defaultType: "B737" },
  JBU: { airline: "JetBlue Airways", spoken: "JetBlue", defaultType: "A320" },
  FDX: { airline: "FedEx Express", spoken: "FedEx", defaultType: "B77F" },
  UPS: { airline: "UPS Airlines", spoken: "UPS", defaultType: "B748" },
  DHL: { airline: "DHL Aviation", spoken: "DHL", defaultType: "B77F" },
  BZP: { airline: "Blue Dart Aviation", spoken: "Blue Dart", defaultType: "B763" },
  ATN: { airline: "Amazon Prime Air", spoken: "Prime Air", defaultType: "B763" },
  IAF: { airline: "Indian Air Force", spoken: "Indian Air Force", defaultType: "C17" },
  RCH: { airline: "USAF Air Mobility Command", spoken: "Reach", defaultType: "C17" },
  RRR: { airline: "Royal Air Force", spoken: "Ascot", defaultType: "A400" },
  NAVY: { airline: "Indian Naval Air Arm", spoken: "Navy", defaultType: "P8" },
  SVA: { airline: "Saudia", spoken: "Saudia", defaultType: "B772" },
  MEA: { airline: "Middle East Airlines", spoken: "Cedar Jet", defaultType: "A321" },
  JZR: { airline: "Jazeera Airways", spoken: "Jazeera", defaultType: "A320" },
  KAC: { airline: "Kuwait Airways", spoken: "Kuwaiti", defaultType: "B772" },
  BBC: { airline: "Biman Bangladesh", spoken: "Bangladesh", defaultType: "B738" },
  OMS: { airline: "Oman Air", spoken: "Oman Air", defaultType: "B738" },
  MXD: { airline: "Batik Air Malaysia", spoken: "Malindo", defaultType: "B738" },
  BOX: { airline: "AeroLogic Cargo", spoken: "German Cargo", defaultType: "B772" },
};

function parseLiveCallsignMeta(callsign: string): {
  airline: string;
  spokenCallsign: string;
  defaultType: string;
} {
  const clean = callsign.trim().toUpperCase();
  const prefix = clean.slice(0, 3);
  const flightPart = clean.slice(3);
  const known = CARRIER_DIRECTORY[prefix];

  if (known) {
    return {
      airline: known.airline,
      spokenCallsign: flightPart ? `${known.spoken} ${flightPart}` : known.spoken,
      defaultType: known.defaultType,
    };
  }
  return {
    airline: prefix ? `${prefix} Airlines` : "Commercial Carrier",
    spokenCallsign: clean,
    defaultType: "A320",
  };
}

function normalizeAircraftType(rawType: string | null, fallbackType: string): string {
  if (!rawType) return fallbackType;
  const code = rawType.trim().toUpperCase();
  if (AIRCRAFT_TYPE_SPECS[code]) return code;
  if (code === "A20N" || code === "A318" || code === "A320") return "A320";
  if (code === "A21N" || code === "A321") return "A321";
  if (code === "A19N" || code === "A319") return "A319";
  if (code === "B77W" || code === "B77L" || code === "B773" || code === "B788" || code === "B789" || code === "A359" || code === "A388") return "B772";
  if (code === "B38M" || code === "B39M") return "B38M";
  if (code.startsWith("B73")) return "B738";
  if (code.startsWith("B76") || code.startsWith("A33")) return "B763";
  if (code.startsWith("MD11") || code.startsWith("DC10")) return "MD11";
  return fallbackType;
}

function pickBestRunway(layout: AirportLayout, desiredHeading: number, kind: "DEPARTURE" | "ARRIVAL"): RunwayId {
  const activeRunways = getActiveRunways(layout, kind);
  let best = kind === "DEPARTURE" ? layout.primaryDepartureRunway : layout.primaryArrivalRunway;
  if (!activeRunways.includes(best)) {
    best = activeRunways[0] ?? layout.runwayIds[0];
  }
  let bestDiff = 999;
  for (const rId of activeRunways) {
    const spec = layout.runways[rId];
    if (!spec) continue;
    const diff = Math.abs(headingDiffDeg(desiredHeading, spec.heading));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = rId;
    }
  }
  return best;
}

function pickClosestUnusedGate(
  layout: AirportLayout,
  xNm: number,
  yNm: number,
  usedGates: Set<string>,
  fallbackIndex: number,
  acInfo?: {
    aircraftType?: string;
    callsign?: string;
    isCargo?: boolean;
    isMilitary?: boolean;
    wakeCategory?: "MEDIUM" | "HEAVY" | "SUPER";
  }
): string {
  if (acInfo) {
    const matched = findBestGateForAircraft(layout, acInfo, usedGates);
    if (matched) {
      usedGates.add(matched);
      return matched;
    }
  }

  const candidates = layout.gateIds.filter((g) => !usedGates.has(g));
  const pool = candidates.length > 0 ? candidates : layout.gateIds;
  let best = pool[fallbackIndex % pool.length];
  let bestDist = Infinity;
  for (const gId of pool) {
    const node = layout.nodes[`GATE_${gId}`];
    if (!node) continue;
    const d = Math.hypot(node.x - xNm, node.y - yNm);
    if (d < bestDist) {
      bestDist = d;
      best = gId;
    }
  }
  usedGates.add(best);
  return best;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function getTargetLimitsForScenario(scen?: ScenarioId): { min: number; max: number } {
  switch (scen) {
    case "LOW_TRAFFIC":
      return { min: 2, max: 3 };
    case "LIGHT":
      return { min: 4, max: 5 };
    case "NORMAL_OPS":
    case "MIXED":
    case "MEDIUM":
      return { min: 6, max: 8 };
    case "HEAVY":
    case "ARRIVAL_HEAVY":
    case "DEPARTURE_HEAVY":
      return { min: 10, max: 14 };
    case "RUSH_HOUR":
      return { min: 14, max: 18 };
    case "SANDBOX":
      return { min: 2, max: 6 };
    case "CROSSINGS_AND_READBACK":
    case "EMERGENCY_AND_NORDO":
    case "EMERGENCY":
    default:
      return { min: 4, max: 8 };
  }
}

export interface LiveConversionResult {
  sim: SimulationState;
  convertedCount: number;
  groundCount: number;
  airborneCount: number;
}

/**
 * Converts a snapshot of real ADS-B tracks into a playable, clearance-gated SimulationState
 * anchored onto the exact real-world airport layout.
 */
export function convertLiveTracksToSimulation(opts: {
  airportRecord: AirportRecord;
  customLayout?: AirportLayout;
  tracks: LiveAdsbTrack[];
  activeStation?: PlayerRoleMode;
  scenarioId?: ScenarioId;
  fetchedAtMs?: number;
  maxAircraft?: number;
}): LiveConversionResult {
  const layout = opts.customLayout ?? convertAirportBundleToLayout(opts.airportRecord);
  const scenarioId = opts.scenarioId ?? "MIXED";
  const activeStation = opts.activeStation ?? "ALL";
  const sim = createBaseSimulation(scenarioId, activeStation, opts.airportRecord.icao, layout);
  const elev = layout.elevationFt;
  const limits = getTargetLimitsForScenario(scenarioId);
  const maxAc = opts.maxAircraft ?? limits.max;

  // Deduplicate & score tracks by proximity + ground/approach relevance
  const seenCallsigns = new Set<string>();
  const scored: Array<{ track: LiveAdsbTrack; callsign: string; distNm: number; priorityScore: number }> = [];

  for (const t of opts.tracks) {
    const cs = (t.callsign || t.icao24).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!cs || seenCallsigns.has(cs)) continue;
    seenCallsigns.add(cs);

    const distNm = haversineNm(opts.airportRecord.lat, opts.airportRecord.lon, t.lat, t.lon);
    if (distNm > 90) continue;

    const altAboveGround = (t.baroAltFt ?? elev + 8000) - elev;
    const groundBonus = t.onGround ? -35 : 0;
    const altPenalty = Math.max(0, altAboveGround) / 1500;
    const realCsPenalty = t.callsign ? 0 : 20;

    scored.push({
      track: t,
      callsign: cs,
      distNm,
      priorityScore: distNm + altPenalty + groundBonus + realCsPenalty,
    });
  }

  scored.sort((a, b) => a.priorityScore - b.priorityScore);
  const chosen = scored.slice(0, maxAc);

  const usedGates = new Set<string>();
  let groundCount = 0;
  let airborneCount = 0;

  chosen.forEach((item, idx) => {
    const { track, callsign, distNm } = item;
    const meta = parseLiveCallsignMeta(callsign);
    const acType = normalizeAircraftType(track.aircraftType, meta.defaultType);
    const airlineName = track.operator?.trim() || meta.airline;
    const localPt = latLonToLocalNm(track.lat, track.lon, opts.airportRecord.lat, opts.airportRecord.lon);

    const altFtRaw = track.baroAltFt ?? elev + (track.onGround ? 0 : 6000);
    const agl = altFtRaw - elev;
    const vRate = track.verticalRateFpm ?? 0;
    const isClimbingDeparture = vRate >= 450 && distNm < 22 && agl < 11000;
    const rawIsGround = track.onGround || (distNm < 1.8 && agl < 250 && (track.groundSpeedKts ?? 0) < 45);
    const isGround =
      rawIsGround ||
      (!isClimbingDeparture && distNm < 2.2 && agl < 350 && (track.groundSpeedKts ?? 0) < 60);

    if (isGround && layout.gateIds.length > 0 && groundCount < Math.max(2, layout.gateIds.length)) {
      groundCount += 1;
      const isCargo = isCargoAircraft(callsign, acType);
      const isMilitary = isMilitaryAircraft(callsign, acType);
      const wakeCategory = resolveWakeCategory(acType);
      const gateId = pickClosestUnusedGate(layout, localPt.x, localPt.y, usedGates, idx, {
        aircraftType: acType,
        callsign,
        isCargo,
        isMilitary,
        wakeCategory,
      });
      const rwyId = layout.primaryDepartureRunway;

      // When multiple ground flights are populated, make one actively being taxied so Ground controller has both parked & taxiing traffic
      const shouldBeTaxied =
        groundCount === 2 ||
        (track.groundSpeedKts !== null && track.groundSpeedKts >= 8 && track.groundSpeedKts < 40);

      const depAc = createDepartureAircraft(sim, {
        id: callsign,
        callsign,
        spokenCallsign: meta.spokenCallsign,
        airline: airlineName,
        aircraftType: acType,
        gateId,
        targetRunway: rwyId,
        requiresPushback: !shouldBeTaxied && !gateId.startsWith("S") && !gateId.toUpperCase().includes("REMOTE"),
        departureFix: layout.departureFixIds[idx % layout.departureFixIds.length],
        controller: "GROUND",
        originIcao: opts.airportRecord.icao,
        originName: `${opts.airportRecord.city} (${opts.airportRecord.name})`,
      });
      depAc.icao24 = track.icao24;
      if (track.registration) depAc.registration = track.registration;

      if (shouldBeTaxied) {
        const routes = getSuggestedTaxiRoutes(layout, `GATE_${gateId}`, rwyId, gateId);
        if (routes.length > 0 && routes[0].nodeIds.length >= 3) {
          const route = routes[0];
          const midNode = layout.nodes[route.nodeIds[1]];
          const nextNode = layout.nodes[route.nodeIds[2]];
          if (midNode && nextNode) {
            depAc.x = midNode.x;
            depAc.y = midNode.y;
            depAc.currentNodeId = midNode.id;
            depAc.assignedRouteNodeIds = [...route.nodeIds];
            depAc.assignedRouteTaxiways = [...route.taxiways];
            depAc.routeStepIndex = 1;
            depAc.speed = 14;
            depAc.heading = Math.round(
              ((Math.atan2(nextNode.x - midNode.x, nextNode.y - midNode.y) * 180) / Math.PI + 360) % 360
            );
            depAc.state = "TAXIING";
            depAc.requiresPushback = false;
            depAc.clearances.push(
              createClearanceObject(sim, {
                aircraft: depAc,
                controller: "GROUND",
                issuedBy: "AUTONOMOUS",
                type: "TAXI",
                parameters: { routeNodeIds: depAc.assignedRouteNodeIds, targetRunway: rwyId },
                phraseology: `${meta.spokenCallsign}, taxi to runway ${rwyId} via ${depAc.assignedRouteTaxiways.join(" ")}.`,
                expectedReadbackText: `Taxi to runway ${rwyId} via ${depAc.assignedRouteTaxiways.join(" ")}, ${meta.spokenCallsign}.`,
                immediate: true,
              })
            );
          }
        }
      }
      return;
    }

    airborneCount += 1;
    // Retain exact real-world radar coordinates relative to airport reference
    let simX = localPt.x;
    let simY = localPt.y;
    const r = Math.hypot(simX, simY);
    if (r < 0.35) {
      // If coordinate snapped right onto center runway origin, offset slightly
      simX = Math.cos(idx) * 2.0;
      simY = Math.sin(idx) * 2.0;
    }

    const bearingFromField = Math.round(((Math.atan2(simX, simY) * 180) / Math.PI + 360) % 360);
    const inboundTowardField = Math.round(((Math.atan2(-simX, -simY) * 180) / Math.PI + 360) % 360);
    const realHdg = track.trackDeg ?? (isClimbingDeparture ? bearingFromField : inboundTowardField);
    const angleOffInbound = Math.abs(headingDiffDeg(realHdg, inboundTowardField));
    const isOutboundDeparture = isClimbingDeparture || angleOffInbound > 95;

    if (isOutboundDeparture) {
      const heading = realHdg;
      const rwyId = pickBestRunway(layout, heading, "DEPARTURE");
      const gateId = pickClosestUnusedGate(layout, 0, 0, usedGates, idx);
      const alt = clamp(Math.round(altFtRaw / 100) * 100, elev + 900, elev + 9500);
      const targetAlt = Math.max(elev + 7000, Math.round((alt + 4000) / 1000) * 1000);
      const spd = clamp(track.groundSpeedKts ?? 220, 175, 280);

      const depAc = createDepartureAircraft(sim, {
        id: callsign,
        callsign,
        spokenCallsign: meta.spokenCallsign,
        airline: airlineName,
        aircraftType: acType,
        gateId,
        targetRunway: rwyId,
        requiresPushback: false,
        controller: "DEPARTURE",
        originIcao: opts.airportRecord.icao,
        originName: `${opts.airportRecord.city} (${opts.airportRecord.name})`,
        bearingDeg: heading,
      });
      depAc.icao24 = track.icao24;
      if (track.registration) depAc.registration = track.registration;
      depAc.state = "CLIMB";
      depAc.x = simX;
      depAc.y = simY;
      depAc.currentNodeId = undefined;
      depAc.heading = heading;
      depAc.altitude = alt;
      depAc.speed = spd;
      depAc.verticalSpeed = clamp(vRate, 600, 2400);
      depAc.assignedHeading = heading;
      depAc.assignedAltitude = targetAlt;
      depAc.assignedSpeed = spd;
      depAc.trail = [{ x: simX, y: simY }];

      depAc.clearances.push(
        createClearanceObject(sim, {
          aircraft: depAc,
          controller: "DEPARTURE",
          issuedBy: "AUTONOMOUS",
          type: "ALTITUDE",
          parameters: { altitude: targetAlt },
          phraseology: `${meta.spokenCallsign}, climb and maintain ${targetAlt} feet.`,
          expectedReadbackText: `Climb and maintain ${targetAlt}, ${meta.spokenCallsign}.`,
          immediate: true,
        }),
        createClearanceObject(sim, {
          aircraft: depAc,
          controller: "DEPARTURE",
          issuedBy: "AUTONOMOUS",
          type: "HEADING",
          parameters: { heading },
          phraseology: `${meta.spokenCallsign}, fly heading ${String(Math.round(heading)).padStart(3, "0")}.`,
          expectedReadbackText: `Heading ${String(Math.round(heading)).padStart(3, "0")}, ${meta.spokenCallsign}.`,
          immediate: true,
        })
      );
      return;
    }

    // Inbound Arrival: flying toward the airfield, heading preserved
    const heading = realHdg;
    const targetRwy = pickBestRunway(layout, heading, "ARRIVAL");
    const gateId = pickClosestUnusedGate(layout, 0, 0, usedGates, idx);
    const alt = clamp(Math.round(altFtRaw / 100) * 100, elev + 1600, elev + 9000);
    const spd = clamp(track.groundSpeedKts ?? 195, 155, 255);

    const arrAc = createArrivalAircraft(sim, {
      id: callsign,
      callsign,
      spokenCallsign: meta.spokenCallsign,
      airline: airlineName,
      aircraftType: acType,
      x: simX,
      y: simY,
      heading,
      altitude: alt,
      speed: spd,
      targetRunway: targetRwy,
      gateId,
      state: "APPROACH",
      controller: "DEPARTURE",
      assignedApproach: null,
      destinationIcao: opts.airportRecord.icao,
      destinationName: `${opts.airportRecord.city} (${opts.airportRecord.name})`,
      bearingDeg: bearingFromField,
    });
    arrAc.icao24 = track.icao24;
    if (track.registration) arrAc.registration = track.registration;

    arrAc.clearances.push(
      createClearanceObject(sim, {
        aircraft: arrAc,
        controller: "DEPARTURE",
        issuedBy: "AUTONOMOUS",
        type: "HEADING",
        parameters: { heading },
        phraseology: `${meta.spokenCallsign}, radar contact, fly heading ${String(Math.round(heading)).padStart(3, "0")}.`,
        expectedReadbackText: `Heading ${String(Math.round(heading)).padStart(3, "0")}, ${meta.spokenCallsign}.`,
        immediate: true,
      })
    );
  });

  // Top up with realistic local flights if live traffic count is below scenario mode minimum or if 0 live flights
  if (
    opts.scenarioId !== "SANDBOX" &&
    (sim.aircraftOrder.length < limits.min || chosen.length === 0)
  ) {
    const targetCount = Math.max(limits.min, 4);
    const need = Math.max(0, targetCount - sim.aircraftOrder.length);
    for (let i = 0; i < need; i++) {
      spawnRandomTraffic(sim);
    }
  }

  // Ensure ground operations always features both a parked plane (AT_GATE) and an actively taxiing plane (TAXIING)
  const groundAcs = sim.aircraftOrder
    .map((id) => sim.aircraft[id])
    .filter((a): a is NonNullable<typeof a> => Boolean(a && a.controller === "GROUND" && a.state !== "COMPLETED_ARRIVAL" && a.state !== "COMPLETED_DEPARTURE"));

  const hasTaxiing = groundAcs.some((a) => a.state === "TAXIING");
  if (!hasTaxiing && groundAcs.length >= 2) {
    const candidate = groundAcs[1];
    if (candidate.state === "AT_GATE" && candidate.gateId) {
      const rwyId = candidate.targetRunway || layout.primaryDepartureRunway;
      const routes = getSuggestedTaxiRoutes(layout, `GATE_${candidate.gateId}`, rwyId, candidate.gateId);
      if (routes.length > 0 && routes[0].nodeIds.length >= 3) {
        const route = routes[0];
        const midNode = layout.nodes[route.nodeIds[1]];
        const nextNode = layout.nodes[route.nodeIds[2]];
        if (midNode && nextNode) {
          candidate.x = midNode.x;
          candidate.y = midNode.y;
          candidate.currentNodeId = midNode.id;
          candidate.assignedRouteNodeIds = [...route.nodeIds];
          candidate.assignedRouteTaxiways = [...route.taxiways];
          candidate.routeStepIndex = 1;
          candidate.speed = 14;
          candidate.heading = Math.round(
            ((Math.atan2(nextNode.x - midNode.x, nextNode.y - midNode.y) * 180) / Math.PI + 360) % 360
          );
          candidate.state = "TAXIING";
          candidate.requiresPushback = false;
          candidate.clearances.push(
            createClearanceObject(sim, {
              aircraft: candidate,
              controller: "GROUND",
              issuedBy: "AUTONOMOUS",
              type: "TAXI",
              parameters: { routeNodeIds: candidate.assignedRouteNodeIds, targetRunway: rwyId },
              phraseology: `${candidate.spokenCallsign}, taxi to runway ${rwyId} via ${candidate.assignedRouteTaxiways.join(" ")}.`,
              expectedReadbackText: `Taxi to runway ${rwyId} via ${candidate.assignedRouteTaxiways.join(" ")}, ${candidate.spokenCallsign}.`,
              immediate: true,
            })
          );
        }
      }
    }
  }

  if (sim.aircraftOrder.length > 0) {
    sim.selectedAircraftId =
      sim.aircraftOrder.find((id) => sim.aircraft[id]?.controller === "GROUND") ??
      sim.aircraftOrder[0];
  }

  sim.config.autoSpawnTraffic = chosen.length === 0;

  sim.liveSnapshotMeta = {
    airportIcao: opts.airportRecord.icao,
    fetchedAtMs: opts.fetchedAtMs ?? Date.now(),
    convertedCount: chosen.length,
    source: "OpenSky Network (Live ADS-B)",
    lastLivePollAtMs: opts.fetchedAtMs ?? Date.now(),
    activeLiveCount: sim.aircraftOrder.length,
    liveSyncEnabled: true,
    lastSyncStatus: "SYNCED",
    cachedTracks: opts.tracks,
  };

  addRadioMessage(sim, {
    sender: "SYSTEM",
    recipient: "ATC",
    controller: "TOWER",
    category: "SYSTEM",
    text:
      chosen.length > 0
        ? `LIVE SNAPSHOT ACTIVE at ${opts.airportRecord.icao} (${scenarioId}): Populated ${sim.aircraftOrder.length} flights (${chosen.length} real ADS-B, ${groundCount} ground, ${airborneCount} airborne).`
        : `No live ADS-B targets found near ${opts.airportRecord.icao} right now — airfield loaded cleanly with ${sim.aircraftOrder.length} simulated flights.`,
  });

  updateAircraftStates(sim);

  return {
    sim,
    convertedCount: chosen.length,
    groundCount,
    airborneCount,
  };
}

/**
 * Periodically merges fresh real-world ADS-B telemetry into the active simulation state.
 * Smoothly updates positions and velocities of existing real aircraft,
 * and seamlessly adds newly detected live arrivals and departures into the airspace.
 */
export function mergeLiveTracksIntoSimulation(opts: {
  sim: SimulationState;
  airportRecord: AirportRecord;
  tracks: LiveAdsbTrack[];
  maxRangeNm?: number;
}): { addedCount: number; updatedCount: number } {
  const { sim, airportRecord, tracks } = opts;
  const layout = sim.airport;
  const elev = layout.elevationFt;
  const maxRangeNm = opts.maxRangeNm ?? 55;

  const byIcao = new Map<string, (typeof sim.aircraft)[string]>();
  const byCallsign = new Map<string, (typeof sim.aircraft)[string]>();
  for (const id of sim.aircraftOrder) {
    const ac = sim.aircraft[id];
    if (!ac) continue;
    if (ac.icao24) byIcao.set(ac.icao24.toLowerCase(), ac);
    byCallsign.set(ac.callsign.toUpperCase(), ac);
  }

  let updatedCount = 0;
  let addedCount = 0;
  const usedGates = new Set<string>();
  for (const ac of Object.values(sim.aircraft)) {
    if (ac.gateId) usedGates.add(ac.gateId);
  }

  for (const track of tracks) {
    if (track.lat === null || track.lon === null || typeof track.lat !== "number" || typeof track.lon !== "number") continue;
    const localPt = latLonToLocalNm(track.lat, track.lon, airportRecord.lat, airportRecord.lon);
    const distNm = Math.hypot(localPt.x, localPt.y);
    if (distNm > maxRangeNm) continue;

    const icaoKey = track.icao24?.trim().toLowerCase();
    const csRaw = (track.callsign || track.icao24).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!csRaw && !icaoKey) continue;

    const existing = (icaoKey ? byIcao.get(icaoKey) : null) || (csRaw ? byCallsign.get(csRaw) : null);

    if (existing) {
      // Existing real aircraft: update real position & live telemetry
      if (
        existing.state !== "COMPLETED_ARRIVAL" &&
        existing.state !== "COMPLETED_DEPARTURE" &&
        existing.state !== "CRASHED"
      ) {
        if (
          existing.state === "APPROACH" ||
          existing.state === "CLIMB" ||
          existing.state === "CRUISE_OUTBOUND" ||
          existing.state === "FINAL" ||
          existing.state === "CLEARED_TO_LAND" ||
          existing.state === "GO_AROUND"
        ) {
          existing.x = localPt.x;
          existing.y = localPt.y;
          if (track.baroAltFt !== null) {
            existing.altitude = track.baroAltFt;
          }
          if (track.groundSpeedKts !== null && track.groundSpeedKts > 50) {
            existing.speed = track.groundSpeedKts;
          }
          if (track.trackDeg !== null) {
            existing.heading = track.trackDeg;
            if (existing.assignedHeading === null || Math.abs(existing.assignedHeading - existing.heading) < 15) {
              existing.assignedHeading = track.trackDeg;
            }
          }
          if (track.verticalRateFpm !== null) {
            existing.verticalSpeed = track.verticalRateFpm;
          }
        }
        if (track.registration && !existing.registration) {
          existing.registration = track.registration;
        }
        if (track.aircraftType && (!existing.aircraftType || existing.aircraftType === "A320")) {
          existing.aircraftType = normalizeAircraftType(track.aircraftType, existing.aircraftType);
        }
        if (track.operator && (!existing.airline || existing.airline.includes("Airlines"))) {
          existing.airline = track.operator;
        }
        if (!existing.trail) existing.trail = [];
        existing.trail.push({ x: localPt.x, y: localPt.y });
        if (existing.trail.length > 25) existing.trail.shift();
        updatedCount++;
      }
    } else {
      // New incoming live flight entering TRACON airspace
      const activeCount = sim.aircraftOrder.filter((id) => {
        const a = sim.aircraft[id];
        return a && a.state !== "COMPLETED_ARRIVAL" && a.state !== "COMPLETED_DEPARTURE" && a.state !== "CRASHED";
      }).length;
      if (activeCount >= 18) continue; // Safety cap to maintain playable ATC workload

      const callsign = csRaw || (icaoKey ? icaoKey.toUpperCase() : `LIVE${Math.floor(Math.random() * 9000 + 1000)}`);
      if (sim.aircraft[callsign]) continue;

      const meta = parseLiveCallsignMeta(callsign);
      const acType = normalizeAircraftType(track.aircraftType, meta.defaultType);
      const airlineName = track.operator?.trim() || meta.airline;
      const altFtRaw = track.baroAltFt ?? elev + (track.onGround ? 0 : 6000);
      const agl = altFtRaw - elev;
      const isGround = track.onGround || (distNm < 2.0 && agl < 250 && (track.groundSpeedKts ?? 0) < 45);

      if (isGround && layout.gateIds.length > 0) {
        const gateId = pickClosestUnusedGate(layout, localPt.x, localPt.y, usedGates, sim.aircraftOrder.length);
        const rwyId = layout.primaryDepartureRunway;
        const depAc = createDepartureAircraft(sim, {
          id: callsign,
          callsign,
          spokenCallsign: meta.spokenCallsign,
          airline: airlineName,
          aircraftType: acType,
          gateId,
          targetRunway: rwyId,
          requiresPushback: true,
          controller: "GROUND",
        });
        depAc.icao24 = track.icao24;
        if (track.registration) depAc.registration = track.registration;
        byIcao.set(depAc.icao24.toLowerCase(), depAc);
        byCallsign.set(callsign, depAc);
        addedCount++;
      } else if (!isGround) {
        const vRate = track.verticalRateFpm ?? 0;
        const isClimbingDeparture = vRate >= 450 && distNm < 22 && agl < 11000;

        if (isClimbingDeparture) {
          const heading = track.trackDeg ?? Math.round(((Math.atan2(localPt.x, localPt.y) * 180) / Math.PI + 360) % 360);
          const rwyId = pickBestRunway(layout, heading, "DEPARTURE");
          const gateId = pickClosestUnusedGate(layout, 0, 0, usedGates, sim.aircraftOrder.length);
          const alt = clamp(Math.round(altFtRaw / 100) * 100, elev + 900, elev + 12000);
          const targetAlt = Math.max(elev + 7000, Math.round((alt + 4000) / 1000) * 1000);
          const spd = clamp(track.groundSpeedKts ?? 220, 175, 300);

          const depAc = createDepartureAircraft(sim, {
            id: callsign,
            callsign,
            spokenCallsign: meta.spokenCallsign,
            airline: airlineName,
            aircraftType: acType,
            gateId,
            targetRunway: rwyId,
            requiresPushback: false,
            controller: "DEPARTURE",
          });
          depAc.icao24 = track.icao24;
          if (track.registration) depAc.registration = track.registration;
          depAc.state = "CLIMB";
          depAc.x = localPt.x;
          depAc.y = localPt.y;
          depAc.currentNodeId = undefined;
          depAc.heading = heading;
          depAc.altitude = alt;
          depAc.speed = spd;
          depAc.verticalSpeed = clamp(vRate, 600, 2500);
          depAc.assignedHeading = heading;
          depAc.assignedAltitude = targetAlt;
          depAc.assignedSpeed = spd;
          depAc.trail = [{ x: localPt.x, y: localPt.y }];

          byIcao.set(depAc.icao24.toLowerCase(), depAc);
          byCallsign.set(callsign, depAc);
          addedCount++;
        } else {
          // Inbound Arrival
          const inboundTowardField = Math.round(((Math.atan2(-localPt.x, -localPt.y) * 180) / Math.PI + 360) % 360);
          const realHdg = track.trackDeg ?? inboundTowardField;
          const heading = headingDiffDeg(realHdg, inboundTowardField) <= 105 ? realHdg : inboundTowardField;
          const targetRwy = pickBestRunway(layout, heading, "ARRIVAL");
          const gateId = pickClosestUnusedGate(layout, 0, 0, usedGates, sim.aircraftOrder.length);
          const alt = clamp(Math.round(altFtRaw / 100) * 100, elev + 1600, elev + 14000);
          const spd = clamp(track.groundSpeedKts ?? 210, 155, 300);

          const arrAc = createArrivalAircraft(sim, {
            id: callsign,
            callsign,
            spokenCallsign: meta.spokenCallsign,
            airline: airlineName,
            aircraftType: acType,
            x: localPt.x,
            y: localPt.y,
            heading,
            altitude: alt,
            speed: spd,
            targetRunway: targetRwy,
            gateId,
            state: "APPROACH",
            controller: "DEPARTURE",
            assignedApproach: null,
          });
          arrAc.icao24 = track.icao24;
          if (track.registration) arrAc.registration = track.registration;
          arrAc.verticalSpeed = track.verticalRateFpm ?? -600;

          byIcao.set(arrAc.icao24.toLowerCase(), arrAc);
          byCallsign.set(callsign, arrAc);
          addedCount++;
        }
      }
    }
  }

  sim.liveSnapshotMeta = {
    airportIcao: airportRecord.icao,
    fetchedAtMs: Date.now(),
    convertedCount: sim.aircraftOrder.length,
    source: "OpenSky Network (Live ADS-B)",
    lastLivePollAtMs: Date.now(),
    activeLiveCount: sim.aircraftOrder.filter((id) => Boolean(sim.aircraft[id]?.icao24)).length,
    liveSyncEnabled: true,
    lastSyncStatus: "SYNCED",
  };

  updateAircraftStates(sim);

  return { addedCount, updatedCount };
}
