import { Inject, Injectable } from "@nestjs/common";

import { JsonStateStore } from "./json-state-store";

export type SkylineDistrict = "harbor" | "midtown" | "runway";

export type SkylineThreatType = "drone" | "storm" | "traffic";

export type SkylineDefenseType = "barrier" | "interceptor" | "pulse";

export type SkylineDefenseNode = {
  baseScore: number;
  defenseType: SkylineDefenseType | null;
  district: SkylineDistrict;
  label: string;
  nodeId: string;
  ownerPlayerId: string | null;
  threatType: SkylineThreatType;
};

export type SkylineDefenseMove = {
  defenseType: SkylineDefenseType;
  district: SkylineDistrict;
  districtControlBonus: number;
  nodeId: string;
  playerId: string;
  pointsAwarded: number;
  selectedAt: string;
  seq: number;
  threatMatchBonus: number;
};

export type SkylineDefenseLiteRoomState = {
  availableNodeCount: number;
  currentTurnPlayerId: string;
  isCompleted: boolean;
  lastMove: SkylineDefenseMove | null;
  lastSeqByPlayer: Record<string, number>;
  moves: SkylineDefenseMove[];
  nodes: SkylineDefenseNode[];
  playerBadges: Record<string, "ALT" | "SKY">;
  players: string[];
  revision: number;
  scores: Record<string, number>;
  updatedAt: string;
  winnerPlayerIds: string[];
};

export abstract class SkylineDefenseLiteStateRepository {
  abstract delete(roomId: string): Promise<void>;
  abstract get(roomId: string): Promise<SkylineDefenseLiteRoomState | undefined>;
  abstract set(
    roomId: string,
    state: SkylineDefenseLiteRoomState
  ): Promise<SkylineDefenseLiteRoomState>;
}

const SKYLINE_DEFENSE_STATE_KEY_PREFIX =
  "wifi-portal:game-state:skyline-defense-lite:";
const SKYLINE_DEFENSE_STATE_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class StateStoreSkylineDefenseLiteStateRepository extends SkylineDefenseLiteStateRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async delete(roomId: string) {
    await this.stateStore.delete(this.toStorageKey(roomId));
  }

  async get(roomId: string) {
    return this.stateStore.get<SkylineDefenseLiteRoomState>(this.toStorageKey(roomId));
  }

  async set(roomId: string, state: SkylineDefenseLiteRoomState) {
    return this.stateStore.set(this.toStorageKey(roomId), state, {
      ttl_seconds: SKYLINE_DEFENSE_STATE_TTL_SECONDS
    });
  }

  private toStorageKey(roomId: string) {
    return `${SKYLINE_DEFENSE_STATE_KEY_PREFIX}${roomId}`;
  }
}
