import type {
  ControllerChatMessage,
  ControllerRole,
  MultiplayerRoomState,
} from "../../src/types/atc.ts";

export class CommunicationService {
  addMessage(
    room: MultiplayerRoomState,
    opts: {
      senderPlayerId: string;
      senderName: string;
      senderRole: ControllerRole | "SYSTEM";
      text: string;
    }
  ): ControllerChatMessage {
    const msg: ControllerChatMessage = {
      id: `chat_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      senderPlayerId: opts.senderPlayerId,
      senderName: opts.senderName,
      senderRole: opts.senderRole,
      timestamp: Date.now(),
      text: opts.text.trim().slice(0, 400),
    };
    room.chat.push(msg);
    if (room.chat.length > 150) {
      room.chat.splice(0, room.chat.length - 150);
    }
    return msg;
  }
}
