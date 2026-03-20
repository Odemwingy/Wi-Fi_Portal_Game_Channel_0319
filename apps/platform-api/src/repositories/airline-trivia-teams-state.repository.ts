import { Inject, Injectable } from "@nestjs/common";

import { JsonStateStore } from "./json-state-store";

export type AirlineTriviaChoice = "A" | "B" | "C" | "D";
export type AirlineTriviaTeamId = "team-a" | "team-b";

export type AirlineTriviaPrompt = {
  body: string;
  id: string;
  options: Array<{
    description: string;
    id: AirlineTriviaChoice;
    label: string;
  }>;
  title: string;
};

export type AirlineTriviaAnswer = {
  answer: AirlineTriviaChoice;
  playerId: string;
  seq: number;
  submittedAt: string;
  teamId: AirlineTriviaTeamId;
};

export type AirlineTriviaRoundResult = {
  answers: AirlineTriviaAnswer[];
  completedAt: string;
  correctAnswer: AirlineTriviaChoice;
  prompt: AirlineTriviaPrompt;
  roundNumber: number;
  scoresSnapshot: Record<string, number>;
  teamScoresSnapshot: Record<AirlineTriviaTeamId, number>;
  winningPlayerIds: string[];
  winningTeamIds: AirlineTriviaTeamId[];
};

export type AirlineTriviaTeamsRoomState = {
  answers: AirlineTriviaAnswer[];
  answersByPlayer: Record<string, AirlineTriviaChoice | null>;
  completedRounds: AirlineTriviaRoundResult[];
  correctAnswer: AirlineTriviaChoice;
  currentRoundNumber: number;
  isCompleted: boolean;
  lastSeqByPlayer: Record<string, number>;
  playerTeams: Record<string, AirlineTriviaTeamId>;
  players: string[];
  prompt: AirlineTriviaPrompt;
  revision: number;
  scores: Record<string, number>;
  teamScores: Record<AirlineTriviaTeamId, number>;
  totalRounds: number;
  updatedAt: string;
};

export abstract class AirlineTriviaTeamsStateRepository {
  abstract delete(roomId: string): Promise<void>;
  abstract get(roomId: string): Promise<AirlineTriviaTeamsRoomState | undefined>;
  abstract set(
    roomId: string,
    state: AirlineTriviaTeamsRoomState
  ): Promise<AirlineTriviaTeamsRoomState>;
}

const AIRLINE_TRIVIA_TEAMS_STATE_KEY_PREFIX =
  "wifi-portal:game-state:airline-trivia-teams:";
const AIRLINE_TRIVIA_TEAMS_STATE_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class StateStoreAirlineTriviaTeamsStateRepository extends AirlineTriviaTeamsStateRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async delete(roomId: string) {
    await this.stateStore.delete(this.toStorageKey(roomId));
  }

  async get(roomId: string) {
    return this.stateStore.get<AirlineTriviaTeamsRoomState>(this.toStorageKey(roomId));
  }

  async set(roomId: string, state: AirlineTriviaTeamsRoomState) {
    return this.stateStore.set(this.toStorageKey(roomId), state, {
      ttl_seconds: AIRLINE_TRIVIA_TEAMS_STATE_TTL_SECONDS
    });
  }

  private toStorageKey(roomId: string) {
    return `${AIRLINE_TRIVIA_TEAMS_STATE_KEY_PREFIX}${roomId}`;
  }
}
