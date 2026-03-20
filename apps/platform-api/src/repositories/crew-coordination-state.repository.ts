import { Inject, Injectable } from "@nestjs/common";

import { JsonStateStore } from "./json-state-store";

export type CrewZone = "aft" | "cockpit" | "forward" | "mid";
export type CrewRole = "cabin" | "captain" | "galley" | "purser";

export type CrewTask = {
  baseScore: number;
  detail: string;
  ownerPlayerId: string | null;
  role: CrewRole;
  taskId: string;
  title: string;
  zone: CrewZone;
};

export type CrewMove = {
  playerId: string;
  pointsAwarded: number;
  relayBonus: number;
  role: CrewRole;
  roleMatchBonus: number;
  selectedAt: string;
  seq: number;
  taskId: string;
  zone: CrewZone;
};

export type CrewCoordinationRoomState = {
  currentTurnPlayerId: string;
  isCompleted: boolean;
  lastMove: CrewMove | null;
  lastSeqByPlayer: Record<string, number>;
  missionStatus: "needs-review" | "ready" | "successful";
  moves: CrewMove[];
  playerRoles: Record<string, CrewRole>;
  playerScores: Record<string, number>;
  players: string[];
  revision: number;
  targetScore: number;
  tasks: CrewTask[];
  teamScore: number;
  updatedAt: string;
  winnerPlayerIds: string[];
};

export abstract class CrewCoordinationStateRepository {
  abstract delete(roomId: string): Promise<void>;
  abstract get(roomId: string): Promise<CrewCoordinationRoomState | undefined>;
  abstract set(
    roomId: string,
    state: CrewCoordinationRoomState
  ): Promise<CrewCoordinationRoomState>;
}

const CREW_COORDINATION_STATE_KEY_PREFIX =
  "wifi-portal:game-state:crew-coordination:";
const CREW_COORDINATION_STATE_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class StateStoreCrewCoordinationStateRepository extends CrewCoordinationStateRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async delete(roomId: string) {
    await this.stateStore.delete(this.toStorageKey(roomId));
  }

  async get(roomId: string) {
    return this.stateStore.get<CrewCoordinationRoomState>(this.toStorageKey(roomId));
  }

  async set(roomId: string, state: CrewCoordinationRoomState) {
    return this.stateStore.set(this.toStorageKey(roomId), state, {
      ttl_seconds: CREW_COORDINATION_STATE_TTL_SECONDS
    });
  }

  private toStorageKey(roomId: string) {
    return `${CREW_COORDINATION_STATE_KEY_PREFIX}${roomId}`;
  }
}
