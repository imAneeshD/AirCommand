import type {
  ControllerRole,
  MultiplayerRoomState,
  RoleScoreMetrics,
  SessionPerformanceReport,
  SimulationState,
} from "../../src/types/atc.ts";

export interface RoomScoreTracker {
  startedAtSec: number;
  roleClearances: Record<ControllerRole, number>;
  roleAccurate: Record<ControllerRole, number>;
  roleHandoffsDone: Record<ControllerRole, number>;
  roleHandoffsMissed: Record<ControllerRole, number>;
  roleResponseSum: Record<ControllerRole, number>;
  roleResponseCount: Record<ControllerRole, number>;
  rolePenalties: Record<ControllerRole, number>;
  incorrectClearances: number;
  handlingSamplesSec: number[];
  countedCompletedIds: Set<string>;
}

export class ScoringService {
  createTracker(): RoomScoreTracker {
    return {
      startedAtSec: 0,
      roleClearances: { DELIVERY: 0, GROUND: 0, TOWER: 0, DEPARTURE: 0, CENTER: 0 },
      roleAccurate: { DELIVERY: 0, GROUND: 0, TOWER: 0, DEPARTURE: 0, CENTER: 0 },
      roleHandoffsDone: { DELIVERY: 0, GROUND: 0, TOWER: 0, DEPARTURE: 0, CENTER: 0 },
      roleHandoffsMissed: { DELIVERY: 0, GROUND: 0, TOWER: 0, DEPARTURE: 0, CENTER: 0 },
      roleResponseSum: { DELIVERY: 0, GROUND: 0, TOWER: 0, DEPARTURE: 0, CENTER: 0 },
      roleResponseCount: { DELIVERY: 0, GROUND: 0, TOWER: 0, DEPARTURE: 0, CENTER: 0 },
      rolePenalties: { DELIVERY: 0, GROUND: 0, TOWER: 0, DEPARTURE: 0, CENTER: 0 },
      incorrectClearances: 0,
      handlingSamplesSec: [],
      countedCompletedIds: new Set<string>(),
    };
  }

  recordCommandResult(
    tracker: RoomScoreTracker,
    role: ControllerRole,
    ok: boolean,
    responseTimeSec?: number
  ): void {
    tracker.roleClearances[role] += 1;
    if (ok) {
      tracker.roleAccurate[role] += 1;
      if (responseTimeSec !== undefined && responseTimeSec >= 0 && responseTimeSec < 300) {
        tracker.roleResponseSum[role] += responseTimeSec;
        tracker.roleResponseCount[role] += 1;
      }
    } else {
      tracker.incorrectClearances += 1;
      tracker.rolePenalties[role] += 5;
    }
  }

  recordHandoffCompleted(tracker: RoomScoreTracker, fromRole: ControllerRole): void {
    tracker.roleHandoffsDone[fromRole] += 1;
  }

  recordHandoffMissed(tracker: RoomScoreTracker, role: ControllerRole): void {
    tracker.roleHandoffsMissed[role] += 1;
    tracker.rolePenalties[role] += 8;
  }

  collectCompletedHandlingTimes(tracker: RoomScoreTracker, sim: SimulationState): void {
    for (const id of sim.aircraftOrder) {
      if (tracker.countedCompletedIds.has(id)) continue;
      const ac = sim.aircraft[id];
      if (!ac) continue;
      if (ac.state === "COMPLETED_ARRIVAL" || ac.state === "COMPLETED_DEPARTURE") {
        tracker.countedCompletedIds.add(id);
        tracker.handlingSamplesSec.push(Math.max(10, ac.stateEnteredAt - ac.spawnedAt));
      }
    }
  }

  buildReport(
    room: MultiplayerRoomState,
    sim: SimulationState,
    tracker: RoomScoreTracker
  ): SessionPerformanceReport {
    this.collectCompletedHandlingTimes(tracker, sim);

    const roleScores = {} as Record<ControllerRole, RoleScoreMetrics>;
    let roleSum = 0;

    for (const role of ["DELIVERY", "GROUND", "TOWER", "DEPARTURE", "CENTER"] as const) {
      const clears = tracker.roleClearances[role];
      const accurate = tracker.roleAccurate[role];
      const hoDone = tracker.roleHandoffsDone[role];
      const hoMiss = tracker.roleHandoffsMissed[role];
      const avgResp =
        tracker.roleResponseCount[role] > 0
          ? Number((tracker.roleResponseSum[role] / tracker.roleResponseCount[role]).toFixed(1))
          : 0;
      const penalties = tracker.rolePenalties[role];
      const raw =
        100 +
        accurate * 12 +
        hoDone * 15 -
        (clears - accurate) * 6 -
        hoMiss * 10 -
        penalties;
      const score = Math.max(0, Math.round(raw));
      roleSum += score;
      roleScores[role] = {
        role,
        playerName: room.slots[role].playerName,
        clearancesIssued: clears,
        accurateClearances: accurate,
        handoffsCompleted: hoDone,
        handoffsMissed: hoMiss,
        avgResponseTimeSec: avgResp,
        penalties,
        score,
      };
    }

    const incursions = sim.incidents.filter((i) => i.code === "RUNWAY_INCURSION").length;
    const sepViolations = sim.incidents.filter((i) => i.code === "LOSS_OF_SEPARATION").length;
    const avgHandlingTimeSec =
      tracker.handlingSamplesSec.length > 0
        ? Number(
            (
              tracker.handlingSamplesSec.reduce((a, b) => a + b, 0) /
              tracker.handlingSamplesSec.length
            ).toFixed(1)
          )
        : 0;

    const totalOps = sim.metrics.departuresCompleted + sim.metrics.arrivalsCompleted;
    const teamScore = Math.max(
      0,
      Math.round(
        roleSum / 3 +
          totalOps * 40 +
          sim.metrics.safetyScore * 2 -
          incursions * 50 -
          sepViolations * 35
      )
    );

    return {
      roomCode: room.roomCode,
      airportIcao: room.airportIcao,
      airportName: room.airportName,
      scenarioId: room.scenarioId,
      difficulty: room.difficulty,
      durationSeconds: Number(sim.time.toFixed(1)),
      teamScore,
      safetyScore: sim.metrics.safetyScore,
      departuresCompleted: sim.metrics.departuresCompleted,
      arrivalsCompleted: sim.metrics.arrivalsCompleted,
      incursions,
      separationViolations: sepViolations,
      incorrectClearances: tracker.incorrectClearances,
      avgHandlingTimeSec,
      roleScores,
    };
  }
}
