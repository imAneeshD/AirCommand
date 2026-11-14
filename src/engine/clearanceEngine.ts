import type {
  ATCClearance,
  Aircraft,
  ClearanceLifecycle,
  ClearanceType,
  ControllerRole,
  RunwayId,
  SimulationState,
} from "../types/atc.ts";

export function nextId(state: SimulationState, prefix: string): string {
  state.nextIdCounter += 1;
  return `${prefix}_${state.nextIdCounter}`;
}

export function getActiveClearances(
  aircraft: Aircraft,
  type?: ClearanceType
): ATCClearance[] {
  return aircraft.clearances.filter((c) => {
    if (c.cancelled) return false;
    if (!c.active || !c.acknowledged) return false;
    if (c.lifecycle !== "ACTIVE" && c.lifecycle !== "EXECUTED") return false;
    if (type && c.type !== type) return false;
    return true;
  });
}

export function getLatestActiveClearance(
  aircraft: Aircraft,
  type: ClearanceType
): ATCClearance | undefined {
  const list = getActiveClearances(aircraft, type);
  return list.length > 0 ? list[list.length - 1] : undefined;
}

export function getPendingReadbackClearances(
  aircraft: Aircraft
): ATCClearance[] {
  return aircraft.clearances.filter(
    (c) =>
      !c.cancelled &&
      (c.lifecycle === "READBACK_PENDING" || c.lifecycle === "ISSUED")
  );
}

export function createClearanceObject(
  state: SimulationState,
  params: {
    aircraft: Aircraft;
    controller: ControllerRole;
    issuedBy: "PLAYER" | "AUTONOMOUS";
    type: ClearanceType;
    parameters: Record<string, unknown>;
    phraseology: string;
    expectedReadbackText: string;
    immediate?: boolean;
  }
): ATCClearance {
  const isSingleRoleBrowser =
    typeof window !== "undefined" &&
    !params.immediate;

  const delay = params.immediate ? 0 : state.config.readbackDelaySeconds;
  const clearance: ATCClearance = {
    id: nextId(state, "clr"),
    aircraftId: params.aircraft.id,
    controller: params.controller,
    issuedBy: params.issuedBy,
    type: params.type,
    parameters: { ...params.parameters },
    issuedAt: state.time,
    readbackDueAt: state.time + delay,
    acknowledged: params.immediate ? true : false,
    active: params.immediate ? true : false,
    cancelled: false,
    lifecycle: params.immediate ? "ACTIVE" : "READBACK_PENDING",
    phraseology: params.phraseology,
    expectedReadbackText: params.expectedReadbackText,
    syncGated: isSingleRoleBrowser,
  };
  return clearance;
}

export function supersedeClearancesForNewInstruction(
  aircraft: Aircraft,
  newType: ClearanceType,
  parameters: Record<string, unknown>
): void {
  const supersedeTypes = new Set<ClearanceType>();

  switch (newType) {
    case "PUSHBACK":
      supersedeTypes.add("HOLD_POSITION");
      break;
    case "TAXI":
      supersedeTypes.add("TAXI");
      supersedeTypes.add("HOLD_POSITION");
      supersedeTypes.add("HOLD_SHORT");
      break;
    case "HOLD_SHORT": {
      supersedeTypes.add("CROSS_RUNWAY");
      supersedeTypes.add("HOLD_SHORT");
      const rwy = parameters.runway as RunwayId | undefined;
      if (rwy) {
        aircraft.crossRunwayCleared[rwy] = false;
      }
      break;
    }
    case "CROSS_RUNWAY":
      supersedeTypes.add("HOLD_SHORT");
      supersedeTypes.add("HOLD_POSITION");
      break;
    case "LINE_UP":
      supersedeTypes.add("HOLD_POSITION");
      supersedeTypes.add("HOLD_SHORT");
      break;
    case "TAKEOFF":
      supersedeTypes.add("HOLD_POSITION");
      supersedeTypes.add("LINE_UP");
      break;
    case "CANCEL_TAKEOFF":
      supersedeTypes.add("TAKEOFF");
      break;
    case "REJECT_TAKEOFF":
      supersedeTypes.add("TAKEOFF");
      break;
    case "HOLD_POSITION":
      if (!parameters.yieldToAircraftId) {
        supersedeTypes.add("TAXI");
      }
      supersedeTypes.add("CROSS_RUNWAY");
      supersedeTypes.add("LINE_UP");
      supersedeTypes.add("TAKEOFF");
      supersedeTypes.add("PUSHBACK");
      break;
    case "LAND":
      supersedeTypes.add("LAND");
      break;
    case "VACATE_RUNWAY":
      supersedeTypes.add("VACATE_RUNWAY");
      supersedeTypes.add("HOLD_POSITION");
      break;
    case "GO_AROUND":
      supersedeTypes.add("LAND");
      supersedeTypes.add("APPROACH");
      break;
    case "HEADING":
      supersedeTypes.add("HEADING");
      supersedeTypes.add("DIRECT");
      break;
    case "DIRECT":
      supersedeTypes.add("HEADING");
      supersedeTypes.add("DIRECT");
      break;
    case "ALTITUDE":
      supersedeTypes.add("ALTITUDE");
      break;
    case "SPEED":
      supersedeTypes.add("SPEED");
      break;
    case "APPROACH":
      supersedeTypes.add("APPROACH");
      break;
    default:
      break;
  }

  if (supersedeTypes.size === 0) return;

  for (const clr of aircraft.clearances) {
    if (
      !clr.cancelled &&
      supersedeTypes.has(clr.type) &&
      (clr.lifecycle === "ACTIVE" ||
        clr.lifecycle === "EXECUTED" ||
        clr.lifecycle === "READBACK_PENDING" ||
        clr.lifecycle === "READBACK_ERROR" ||
        clr.lifecycle === "ISSUED")
    ) {
      if (newType === "CANCEL_TAKEOFF" || newType === "REJECT_TAKEOFF") {
        clr.cancelled = true;
        clr.active = false;
        clr.lifecycle = "CANCELLED";
      } else if (
        newType === "HOLD_SHORT" &&
        clr.type === "CROSS_RUNWAY" &&
        parameters.runway &&
        clr.parameters.runway !== parameters.runway
      ) {
        continue;
      } else {
        clr.active = false;
        clr.lifecycle = "SUPERSEDED";
      }
    }
  }
}

export function transitionClearanceLifecycle(
  clearance: ATCClearance,
  lifecycle: ClearanceLifecycle
): void {
  clearance.lifecycle = lifecycle;
  if (lifecycle === "ACTIVE" || lifecycle === "EXECUTED") {
    clearance.active = true;
    clearance.acknowledged = true;
  } else if (
    lifecycle === "CANCELLED" ||
    lifecycle === "SUPERSEDED" ||
    lifecycle === "EXPIRED" ||
    lifecycle === "COMPLETED"
  ) {
    clearance.active = false;
    if (lifecycle === "CANCELLED") {
      clearance.cancelled = true;
    }
  } else if (lifecycle === "READBACK_ERROR") {
    clearance.active = false;
    clearance.acknowledged = false;
  }
}

export function completeClearancesOfType(
  aircraft: Aircraft,
  type: ClearanceType
): void {
  for (const clr of aircraft.clearances) {
    if (
      clr.type === type &&
      !clr.cancelled &&
      (clr.lifecycle === "ACTIVE" || clr.lifecycle === "EXECUTED")
    ) {
      clr.active = false;
      clr.lifecycle = "COMPLETED";
    }
  }
}
