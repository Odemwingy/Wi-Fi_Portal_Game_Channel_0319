import { Inject, Injectable } from "@nestjs/common";

import { JsonStateStore } from "./json-state-store";

export type MiniGomokuCellValue = "" | "X" | "O";

export type MiniGomokuMove = {
  col: number;
  mark: "X" | "O";
  playedAt: string;
  playerId: string;
  row: number;
  seq: number;
};

export type MiniGomokuWinningCell = {
  col: number;
  row: number;
};

export type MiniGomokuRoomState = {
  board: MiniGomokuCellValue[][];
  boardSize: number;
  currentTurnPlayerId: string;
  isCompleted: boolean;
  lastSeqByPlayer: Record<string, number>;
  moves: MiniGomokuMove[];
  playerMarks: Record<string, "X" | "O">;
  players: string[];
  revision: number;
  targetLineLength: number;
  updatedAt: string;
  winnerPlayerIds: string[];
  winningLine: MiniGomokuWinningCell[];
};

export abstract class MiniGomokuStateRepository {
  abstract delete(roomId: string): Promise<void>;
  abstract get(roomId: string): Promise<MiniGomokuRoomState | undefined>;
  abstract set(
    roomId: string,
    state: MiniGomokuRoomState
  ): Promise<MiniGomokuRoomState>;
}

const MINI_GOMOKU_STATE_KEY_PREFIX = "wifi-portal:game-state:mini-gomoku:";
const MINI_GOMOKU_STATE_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class StateStoreMiniGomokuStateRepository extends MiniGomokuStateRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async delete(roomId: string) {
    await this.stateStore.delete(this.toStorageKey(roomId));
  }

  async get(roomId: string) {
    return this.stateStore.get<MiniGomokuRoomState>(this.toStorageKey(roomId));
  }

  async set(roomId: string, state: MiniGomokuRoomState) {
    return this.stateStore.set(this.toStorageKey(roomId), state, {
      ttl_seconds: MINI_GOMOKU_STATE_TTL_SECONDS
    });
  }

  private toStorageKey(roomId: string) {
    return `${MINI_GOMOKU_STATE_KEY_PREFIX}${roomId}`;
  }
}
