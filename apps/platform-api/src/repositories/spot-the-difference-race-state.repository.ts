import { Inject, Injectable } from "@nestjs/common";

import type { SpotTheDifferenceScene } from "@wifi-portal/game-sdk";

import { JsonStateStore } from "./json-state-store";

export type SpotClaimRecord = {
  claimedAt: string;
  playerId: string;
  spotId: string;
};

export type SpotRecentClaim = {
  claimedAt: string;
  playerId: string;
  spotId: string;
  status: "claimed" | "duplicate";
};

export type SpotTheDifferenceRaceRoomState = {
  deadlineAt: string;
  foundSpots: Record<string, SpotClaimRecord>;
  isCompleted: boolean;
  lastRecentClaim: SpotRecentClaim | null;
  lastSeqByPlayer: Record<string, number>;
  players: string[];
  recentClaims: SpotRecentClaim[];
  revision: number;
  scene: SpotTheDifferenceScene;
  scores: Record<string, number>;
  updatedAt: string;
  winnerBonusGranted: boolean;
};

export abstract class SpotTheDifferenceRaceStateRepository {
  abstract delete(roomId: string): Promise<void>;
  abstract get(roomId: string): Promise<SpotTheDifferenceRaceRoomState | undefined>;
  abstract set(
    roomId: string,
    state: SpotTheDifferenceRaceRoomState
  ): Promise<SpotTheDifferenceRaceRoomState>;
}

const SPOT_RACE_STATE_KEY_PREFIX = "wifi-portal:game-state:spot-the-difference-race:";
const SPOT_RACE_STATE_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class StateStoreSpotTheDifferenceRaceStateRepository extends SpotTheDifferenceRaceStateRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async delete(roomId: string) {
    await this.stateStore.delete(this.toStorageKey(roomId));
  }

  async get(roomId: string) {
    return this.stateStore.get<SpotTheDifferenceRaceRoomState>(this.toStorageKey(roomId));
  }

  async set(roomId: string, state: SpotTheDifferenceRaceRoomState) {
    return this.stateStore.set(this.toStorageKey(roomId), state, {
      ttl_seconds: SPOT_RACE_STATE_TTL_SECONDS
    });
  }

  private toStorageKey(roomId: string) {
    return `${SPOT_RACE_STATE_KEY_PREFIX}${roomId}`;
  }
}
