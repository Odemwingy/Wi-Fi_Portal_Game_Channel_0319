import { Inject, Injectable } from "@nestjs/common";

import { JsonStateStore } from "./json-state-store";

export type BaggageLane = "fragile" | "oversize" | "priority" | "standard";

export type BaggageItem = {
  accent: "amber" | "mint" | "rose" | "sea";
  id: string;
  label: string;
  points: number;
  tagLabel: string;
  targetLane: BaggageLane;
  weightKg: number;
};

export type BaggageSortAction = {
  bagId: string;
  chosenLane: BaggageLane;
  correctLane: BaggageLane;
  playerId: string;
  pointsAwarded: number;
  seq: number;
  status: "accepted" | "rejected";
  submittedAt: string;
};

export type BaggageSortShowdownRoomState = {
  bags: BaggageItem[];
  currentBagIndex: number;
  isCompleted: boolean;
  lastAction: BaggageSortAction | null;
  lastSeqByPlayer: Record<string, number>;
  players: string[];
  resolvedBagIds: string[];
  revision: number;
  scores: Record<string, number>;
  updatedAt: string;
  winnerPlayerIds: string[];
};

export abstract class BaggageSortShowdownStateRepository {
  abstract delete(roomId: string): Promise<void>;
  abstract get(roomId: string): Promise<BaggageSortShowdownRoomState | undefined>;
  abstract set(
    roomId: string,
    state: BaggageSortShowdownRoomState
  ): Promise<BaggageSortShowdownRoomState>;
}

const BAGGAGE_SORT_SHOWDOWN_STATE_KEY_PREFIX =
  "wifi-portal:game-state:baggage-sort-showdown:";
const BAGGAGE_SORT_SHOWDOWN_STATE_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class StateStoreBaggageSortShowdownStateRepository extends BaggageSortShowdownStateRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async delete(roomId: string) {
    await this.stateStore.delete(this.toStorageKey(roomId));
  }

  async get(roomId: string) {
    return this.stateStore.get<BaggageSortShowdownRoomState>(this.toStorageKey(roomId));
  }

  async set(roomId: string, state: BaggageSortShowdownRoomState) {
    return this.stateStore.set(this.toStorageKey(roomId), state, {
      ttl_seconds: BAGGAGE_SORT_SHOWDOWN_STATE_TTL_SECONDS
    });
  }

  private toStorageKey(roomId: string) {
    return `${BAGGAGE_SORT_SHOWDOWN_STATE_KEY_PREFIX}${roomId}`;
  }
}
