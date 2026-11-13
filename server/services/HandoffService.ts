import type {
  ControllerHandoff,
  ControllerRole,
  MultiplayerRoomState,
  SimulationState,
} from "../../src/types/atc.ts";

export class HandoffService {
  initiateHandoff(opts: {
    room: MultiplayerRoomState;
    sim: SimulationState;
    aircraftId: string;
    fromController: ControllerRole;
    toController: ControllerRole;
    note?: string;
  }): { ok: boolean; handoff?: ControllerHandoff; error?: string } {
    const ac = opts.sim.aircraft[opts.aircraftId];
    if (!ac) return { ok: false, error: `Unknown aircraft ${opts.aircraftId}` };
    if (opts.fromController === opts.toController) {
      return { ok: false, error: "Source and destination controller must differ." };
    }
    if (ac.controller !== opts.fromController) {
      return {
        ok: false,
        error: `${ac.callsign} is owned by ${ac.controller}, not ${opts.fromController}.`,
      };
    }

    const existingPending = opts.room.handoffs.find(
      (h) => h.aircraftId === ac.id && h.status === "PENDING"
    );
    if (existingPending) {
      return {
        ok: false,
        error: `Pending handoff already exists for ${ac.callsign} → ${existingPending.toController}.`,
      };
    }

    const targetSlot = opts.room.slots[opts.toController];
    const targetIsAutomated =
      targetSlot.aiTakeover || !targetSlot.playerId || !targetSlot.connected;

    const handoff: ControllerHandoff = {
      id: `ho_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      aircraftId: ac.id,
      callsign: ac.callsign,
      fromController: opts.fromController,
      toController: opts.toController,
      issuedAt: opts.sim.time,
      status: targetIsAutomated ? "ACCEPTED" : "PENDING",
      respondedAt: targetIsAutomated ? opts.sim.time : undefined,
      note: opts.note,
    };

    opts.room.handoffs.push(handoff);
    if (opts.room.handoffs.length > 100) {
      opts.room.handoffs.splice(0, opts.room.handoffs.length - 100);
    }

    return { ok: true, handoff };
  }

  respondHandoff(opts: {
    room: MultiplayerRoomState;
    sim: SimulationState;
    handoffId: string;
    responderRole: ControllerRole;
    accept: boolean;
  }): { ok: boolean; handoff?: ControllerHandoff; error?: string } {
    const h = opts.room.handoffs.find((item) => item.id === opts.handoffId);
    if (!h) return { ok: false, error: "Handoff record not found." };
    if (h.status !== "PENDING") {
      return { ok: false, error: `Handoff already ${h.status}.` };
    }
    if (h.toController !== opts.responderRole) {
      return {
        ok: false,
        error: `Only ${h.toController} may respond to this handoff.`,
      };
    }

    h.respondedAt = opts.sim.time;
    if (opts.accept) {
      h.status = "ACCEPTED";
      const ac = opts.sim.aircraft[h.aircraftId];
      if (ac) {
        ac.controller = h.toController;
      }
    } else {
      h.status = "REJECTED";
    }
    return { ok: true, handoff: h };
  }
}
