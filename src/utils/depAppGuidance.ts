import { alongRunwayNm, crossTrackRunwayNm, runwayPoint } from "../data/asteriaAirport.ts";
import type { Aircraft, AirportLayout, RunwayId } from "../types/atc.ts";

export type DepAppGuidanceMode =
  | "GO_AROUND_RECOVERY"
  | "ARRIVAL_APPROACH"
  | "DEPARTURE_CLIMB"
  | "GROUND_PREFLIGHT";

export interface DepAppGuidance {
  mode: DepAppGuidanceMode;
  recommendedRunway: RunwayId;
  recommendedHeading: number;
  recommendedTurnDirection: "LEFT" | "RIGHT" | "NEAREST";
  recommendedAltitude: number;
  recommendedSpeed: number;
  recommendedDirectFix: string | null;
  needsPatternTurn: boolean;
  /** Screen/world waypoints showing the suggested recovery path back to runway */
  recoveryPreviewPoints: Array<{ x: number; y: number }>;
  headline: string;
  stepSummary: string;
}

function normalizeHeading(deg: number): number {
  const h = ((Math.round(deg) % 360) + 360) % 360;
  return h === 0 ? 360 : h;
}

function bearingDeg(x1: number, y1: number, x2: number, y2: number): number {
  const rad = Math.atan2(x2 - x1, y2 - y1);
  return normalizeHeading((rad * 180) / Math.PI);
}

/**
 * Computes geometry-aware DEP / APP form recommendations (heading + turn,
 * altitude, airspeed, direct fix, and ILS runway) and a visual return-to-runway
 * recovery path for Go-Around / Missed Approach aircraft.
 */
export function computeDepAppGuidance(
  airport: AirportLayout,
  ac: Aircraft,
  requestedRunway?: RunwayId
): DepAppGuidance {
  const elev = airport.elevationFt;
  const baseAlt = Math.round(elev / 500) * 500;
  const fallbackRwy =
    ac.flightKind === "ARRIVAL"
      ? airport.primaryArrivalRunway
      : airport.primaryDepartureRunway;
  const rwyId =
    requestedRunway && airport.runways[requestedRunway]
      ? requestedRunway
      : ac.assignedApproach && airport.runways[ac.assignedApproach]
      ? ac.assignedApproach
      : airport.runways[ac.targetRunway]
      ? ac.targetRunway
      : fallbackRwy;
  const rwy = airport.runways[rwyId] ?? Object.values(airport.runways)[0];

  const isGround =
    ac.altitude <= elev + 40 &&
    ac.state !== "TAKEOFF_ROLL" &&
    ac.state !== "LANDING" &&
    ac.state !== "ROTATE";

  if (isGround) {
    const depFix = ac.assignedDepartureFix ?? airport.departureFixIds[0] ?? null;
    const alt = baseAlt + 3000;
    return {
      mode: "GROUND_PREFLIGHT",
      recommendedRunway: rwyId,
      recommendedHeading: normalizeHeading(rwy?.heading ?? ac.heading),
      recommendedTurnDirection: "NEAREST",
      recommendedAltitude: alt,
      recommendedSpeed: 210,
      recommendedDirectFix: ac.flightKind === "DEPARTURE" ? depFix : airport.iafByRunway[rwyId] ?? null,
      needsPatternTurn: false,
      recoveryPreviewPoints: [],
      headline: "PRE-DEPARTURE / SURFACE STANDBY",
      stepSummary: `Suggested initial climb: HDG ${String(normalizeHeading(rwy?.heading ?? ac.heading)).padStart(3, "0")}° · ALT ${alt} ft · SPD 210 kt`,
    };
  }

  // DEPARTURE CLIMB / ENROUTE GUIDANCE
  if (ac.flightKind === "DEPARTURE") {
    const depFixId = ac.assignedDepartureFix ?? airport.departureFixIds[0] ?? null;
    const depFix = depFixId ? airport.fixes[depFixId] : undefined;
    const recHdg = depFix
      ? bearingDeg(ac.x, ac.y, depFix.x, depFix.y)
      : normalizeHeading(rwy?.heading ?? ac.heading);
    const agl = Math.max(0, ac.altitude - elev);
    const recAlt = agl < 1500 ? baseAlt + 3000 : baseAlt + 7000;
    const recSpd = agl < 1200 ? 180 : agl < 3000 ? 210 : 250;

    return {
      mode: "DEPARTURE_CLIMB",
      recommendedRunway: rwyId,
      recommendedHeading: recHdg,
      recommendedTurnDirection: "NEAREST",
      recommendedAltitude: recAlt,
      recommendedSpeed: recSpd,
      recommendedDirectFix: depFixId,
      needsPatternTurn: false,
      recoveryPreviewPoints: depFix ? [{ x: ac.x, y: ac.y }, { x: depFix.x, y: depFix.y }] : [],
      headline: "SUGGESTED DEPARTURE CLEARANCE",
      stepSummary: `Climb ${recAlt.toLocaleString()} ft · Speed ${recSpd} kt · ${
        depFixId ? `Direct ${depFixId} (HDG ${String(recHdg).padStart(3, "0")}°)` : `Heading ${String(recHdg).padStart(3, "0")}°`
      }`,
    };
  }

  // ARRIVAL / GO-AROUND / MISSED APPROACH PATTERN RECOVERY GUIDANCE
  const iafId = airport.iafByRunway[rwyId] ?? airport.arrivalFixIds[0] ?? null;
  const iafFix = iafId ? airport.fixes[iafId] : undefined;
  const along = rwy ? alongRunwayNm(rwy, ac.x, ac.y) : -6;
  const cross = rwy ? crossTrackRunwayNm(rwy, ac.x, ac.y) : 0;

  const isGoAround = ac.state === "GO_AROUND" || ac.state === "MISSED_APPROACH";
  // If aircraft is ahead of approach gate (past threshold or < 4 NM out without localizer align), vector downwind/base first
  const needsPatternTurn = isGoAround || along > -4.2;

  const patternAlt = baseAlt + 2500;
  const sideSign = Math.abs(cross) >= 0.4 ? Math.sign(cross) : 1; // +1 right pattern, -1 left pattern
  const downwindPt = rwy ? runwayPoint(rwy, -6.5, sideSign * 2.8) : { x: ac.x, y: ac.y };
  const interceptPt = rwy ? runwayPoint(rwy, -8.5, 0) : { x: ac.x, y: ac.y };
  const targetPt = iafFix ?? interceptPt;
  const recSpeed = needsPatternTurn ? 180 : along > -3.5 ? 160 : 180;

  let recHeading: number;
  let recTurnDir: "LEFT" | "RIGHT" | "NEAREST" = "NEAREST";
  let previewPts: Array<{ x: number; y: number }>;

  if (needsPatternTurn && rwy) {
    // If abeam/ahead of airport (along > -4.5), turn cleanly toward lateral downwind gate before IAF
    const targetGate = along > -3.0 ? downwindPt : targetPt;
    recHeading = bearingDeg(ac.x, ac.y, targetGate.x, targetGate.y);
    recTurnDir = sideSign < 0 ? "LEFT" : "RIGHT";
    previewPts = [
      { x: ac.x, y: ac.y },
      ...(along > -3.0 ? [downwindPt] : []),
      { x: targetPt.x, y: targetPt.y },
      { x: rwy.thresholdX, y: rwy.thresholdY },
    ];
  } else {
    recHeading = bearingDeg(ac.x, ac.y, targetPt.x, targetPt.y);
    previewPts = rwy
      ? [
          { x: ac.x, y: ac.y },
          { x: targetPt.x, y: targetPt.y },
          { x: rwy.thresholdX, y: rwy.thresholdY },
        ]
      : [];
  }

  const hdgText = String(recHeading).padStart(3, "0");
  const turnWord = recTurnDir === "NEAREST" ? "" : ` (${recTurnDir})`;

  return {
    mode: isGoAround ? "GO_AROUND_RECOVERY" : "ARRIVAL_APPROACH",
    recommendedRunway: rwyId,
    recommendedHeading: recHeading,
    recommendedTurnDirection: recTurnDir,
    recommendedAltitude: patternAlt,
    recommendedSpeed: recSpeed,
    recommendedDirectFix: iafId,
    needsPatternTurn,
    recoveryPreviewPoints: previewPts,
    headline: isGoAround
      ? `GO-AROUND RETURN → RWY ${rwyId}`
      : needsPatternTurn
      ? `RE-SEQUENCE PATTERN → RWY ${rwyId}`
      : `SUGGESTED APPROACH SETUP → RWY ${rwyId}`,
    stepSummary: needsPatternTurn
      ? `Vector HDG ${hdgText}°${turnWord} · ALT ${patternAlt.toLocaleString()} ft · SPD ${recSpeed} kt → ${
          iafId ? `Direct ${iafId} → ` : ""
        }ILS RWY ${rwyId}`
      : `${iafId ? `Direct ${iafId} (HDG ${hdgText}°) · ` : ""}ALT ${patternAlt.toLocaleString()} ft · SPD ${recSpeed} kt → ILS RWY ${rwyId}`,
  };
}
