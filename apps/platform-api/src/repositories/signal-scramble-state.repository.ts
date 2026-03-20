import { Inject, Injectable } from "@nestjs/common";

import { JsonStateStore } from "./json-state-store";

export type SignalNode = {
  accent: "amber" | "mint" | "sea" | "violet";
  id: string;
  label: string;
  points: number;
  ring: "inner" | "mid" | "outer";
};

export type SignalActivation = {
  nodeId: string;
  playerId: string;
  progressAfter: number;
  seq: number;
  status: "accepted" | "ignored";
  submittedAt: string;
};

export type SignalScrambleRoomState = {
  activatedNodeIdsByPlayer: Record<string, string[]>;
  completedAtByPlayer: Record<string, string | null>;
  isCompleted: boolean;
  lastActivation: SignalActivation | null;
  lastSeqByPlayer: Record<string, number>;
  players: string[];
  progressByPlayer: Record<string, number>;
  revision: number;
  scores: Record<string, number>;
  signalNodes: SignalNode[];
  targetSequence: string[];
  updatedAt: string;
  winnerPlayerIds: string[];
};

export abstract class SignalScrambleStateRepository {
  abstract delete(roomId: string): Promise<void>;
  abstract get(roomId: string): Promise<SignalScrambleRoomState | undefined>;
  abstract set(
    roomId: string,
    state: SignalScrambleRoomState
  ): Promise<SignalScrambleRoomState>;
}

const SIGNAL_SCRAMBLE_STATE_KEY_PREFIX = "wifi-portal:game-state:signal-scramble:";
const SIGNAL_SCRAMBLE_STATE_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class StateStoreSignalScrambleStateRepository extends SignalScrambleStateRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async delete(roomId: string) {
    await this.stateStore.delete(this.toStorageKey(roomId));
  }

  async get(roomId: string) {
    return this.stateStore.get<SignalScrambleRoomState>(this.toStorageKey(roomId));
  }

  async set(roomId: string, state: SignalScrambleRoomState) {
    return this.stateStore.set(this.toStorageKey(roomId), state, {
      ttl_seconds: SIGNAL_SCRAMBLE_STATE_TTL_SECONDS
    });
  }

  private toStorageKey(roomId: string) {
    return `${SIGNAL_SCRAMBLE_STATE_KEY_PREFIX}${roomId}`;
  }
}
