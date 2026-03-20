import { Inject, Injectable } from "@nestjs/common";

import { JsonStateStore } from "./json-state-store";

export type SeatMapSeatType = "aisle" | "window";

export type SeatMapSeat = {
  baseScore: number;
  col: number;
  ownerPlayerId: string | null;
  row: number;
  seatId: string;
  seatLabel: string;
  seatType: SeatMapSeatType;
};

export type SeatMapClaimMove = {
  adjacencyBonus: number;
  claimedAt: string;
  playerId: string;
  pointsAwarded: number;
  seatId: string;
  seq: number;
};

export type SeatMapRoomState = {
  availableSeatCount: number;
  cabinCols: number;
  cabinRows: number;
  currentTurnPlayerId: string;
  isCompleted: boolean;
  lastMove: SeatMapClaimMove | null;
  lastSeqByPlayer: Record<string, number>;
  moves: SeatMapClaimMove[];
  playerMarks: Record<string, "A" | "B">;
  players: string[];
  revision: number;
  scores: Record<string, number>;
  seats: SeatMapSeat[];
  updatedAt: string;
  winnerPlayerIds: string[];
};

export abstract class SeatMapStrategyStateRepository {
  abstract delete(roomId: string): Promise<void>;
  abstract get(roomId: string): Promise<SeatMapRoomState | undefined>;
  abstract set(
    roomId: string,
    state: SeatMapRoomState
  ): Promise<SeatMapRoomState>;
}

const SEAT_MAP_STATE_KEY_PREFIX = "wifi-portal:game-state:seat-map-strategy:";
const SEAT_MAP_STATE_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class StateStoreSeatMapStrategyStateRepository extends SeatMapStrategyStateRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async delete(roomId: string) {
    await this.stateStore.delete(this.toStorageKey(roomId));
  }

  async get(roomId: string) {
    return this.stateStore.get<SeatMapRoomState>(this.toStorageKey(roomId));
  }

  async set(roomId: string, state: SeatMapRoomState) {
    return this.stateStore.set(this.toStorageKey(roomId), state, {
      ttl_seconds: SEAT_MAP_STATE_TTL_SECONDS
    });
  }

  private toStorageKey(roomId: string) {
    return `${SEAT_MAP_STATE_KEY_PREFIX}${roomId}`;
  }
}
