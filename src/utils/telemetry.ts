import type { Aircraft, AircraftState } from "../types/atc.ts";

const SURFACE_STATES = new Set<AircraftState>([
  "AT_GATE",
  "PUSHBACK_APPROVED",
  "PUSHING_BACK",
  "PUSHBACK_COMPLETE",
  "TAXIING",
  "HOLDING_SHORT",
  "CROSSING_RUNWAY",
  "HOLD_POSITION",
  "LINE_UP_WAIT",
  "TAKEOFF_CLEARED",
  "TAKEOFF_CANCELLED",
  "TAKEOFF_ROLL",
  "REJECTED_TAKEOFF",
  "BRAKING",
  "STOPPED_ON_RUNWAY",
  "TOUCHDOWN",
  "ROLLOUT",
  "VACATING_RUNWAY",
  "COMPLETED_ARRIVAL",
]);

export function isSurfaceAircraft(ac: Aircraft, elevationFt: number): boolean {
  if (SURFACE_STATES.has(ac.state)) return true;
  if (ac.state === "ROTATE" || ac.state === "CLIMB" || ac.state === "GO_AROUND") {
    return false;
  }
  return ac.altitude - elevationFt <= 12;
}

export function getAglAltitudeFt(ac: Aircraft, elevationFt: number): number {
  if (isSurfaceAircraft(ac, elevationFt)) return 0;
  return Math.max(0, Math.round(ac.altitude - elevationFt));
}

export interface AltitudeReadout {
  isGround: boolean;
  aglFt: number;
  mslFt: number;
  compact: string;
  strip: string;
  detailed: string;
}

export function formatAltitudeReadout(
  ac: Aircraft,
  elevationFt: number
): AltitudeReadout {
  const isGround = isSurfaceAircraft(ac, elevationFt);
  const mslFt = Math.round(ac.altitude);
  const aglFt = isGround ? 0 : Math.max(0, Math.round(ac.altitude - elevationFt));

  if (isGround) {
    return {
      isGround: true,
      aglFt: 0,
      mslFt: Math.round(elevationFt),
      compact: "GND 0ft",
      strip: "0ft AGL",
      detailed: `0ft AGL (${Math.round(elevationFt)}ft MSL)`,
    };
  }

  if (aglFt < 1500) {
    return {
      isGround: false,
      aglFt,
      mslFt,
      compact: `${aglFt}ft AGL`,
      strip: `${aglFt}ft`,
      detailed: `${aglFt}ft AGL (${mslFt}ft MSL)`,
    };
  }

  return {
    isGround: false,
    aglFt,
    mslFt,
    compact: `${mslFt}ft`,
    strip: `${mslFt}ft`,
    detailed: `${mslFt}ft MSL (${aglFt}ft AGL)`,
  };
}

/**
 * Computes realistic visual pitch angle (degrees; positive = nose up, negative = nose down)
 * matching takeoff rotation, climb VSI, approach descent glideslope, and landing flare.
 */
export function computeAircraftPitchDeg(ac: Aircraft, elevationFt: number): number {
  if (isSurfaceAircraft(ac, elevationFt)) return 0;

  const agl = Math.max(0, ac.altitude - elevationFt);

  if (ac.state === "ROTATE") {
    return Number(Math.min(13.5, 4 + (agl / 140) * 9.5).toFixed(1));
  }

  if (ac.state === "CLIMB" || ac.state === "GO_AROUND" || ac.state === "MISSED_APPROACH") {
    const pitch = 3 + (ac.verticalSpeed / 2200) * 10;
    return Number(Math.max(1.5, Math.min(14, pitch)).toFixed(1));
  }

  if (ac.state === "LANDING" && agl <= 55) {
    // Landing flare: gentle nose-up attitude over the touchdown zone
    return Number((2.5 + ((55 - agl) / 55) * 2.5).toFixed(1));
  }

  if (ac.verticalSpeed < -150) {
    // Descending on ILS glidepath / descent
    const glideDeg = -Math.min(5.5, Math.max(1.5, (-ac.verticalSpeed / 1200) * 3.5));
    return Number(glideDeg.toFixed(1));
  }

  if (ac.verticalSpeed > 150) {
    const climbDeg = Math.min(12, Math.max(1.5, (ac.verticalSpeed / 2000) * 10));
    return Number(climbDeg.toFixed(1));
  }

  return 0.5;
}
