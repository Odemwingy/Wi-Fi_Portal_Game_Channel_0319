import { describe, expect, it } from "vitest";

import type { GameEventEnvelope } from "@wifi-portal/game-sdk";

import { AirlineTriviaTeamsAdapter } from "./airline-trivia-teams.adapter";
import {
  AirlineTriviaTeamsStateRepository,
  type AirlineTriviaTeamsRoomState
} from "../repositories/airline-trivia-teams-state.repository";

class CloningAirlineTriviaTeamsStateRepository extends AirlineTriviaTeamsStateRepository {
  private readonly rooms = new Map<string, AirlineTriviaTeamsRoomState>();

  async delete(roomId: string) {
    this.rooms.delete(roomId);
  }

  async get(roomId: string) {
    const room = this.rooms.get(roomId);
    return room ? this.clone(room) : undefined;
  }

  async set(roomId: string, state: AirlineTriviaTeamsRoomState) {
    const cloned = this.clone(state);
    this.rooms.set(roomId, cloned);
    return this.clone(cloned);
  }

  private clone(state: AirlineTriviaTeamsRoomState) {
    return JSON.parse(JSON.stringify(state)) as AirlineTriviaTeamsRoomState;
  }
}

describe("AirlineTriviaTeamsAdapter", () => {
  it("persists 2-4 player answers, team assignments, and team scores", async () => {
    const repository = new CloningAirlineTriviaTeamsStateRepository();
    const adapter = new AirlineTriviaTeamsAdapter(repository);
    const roomId = "room-airline-trivia";

    await adapter.createMatch(roomId, "host-1");
    await adapter.joinMatch(roomId, "player-2");
    await adapter.joinMatch(roomId, "player-3");

    const initialSnapshot = await adapter.getSnapshot(roomId);
    expect(initialSnapshot.state.players).toEqual(["host-1", "player-2", "player-3"]);
    expect(initialSnapshot.state.player_teams).toEqual({
      "host-1": "team-a",
      "player-2": "team-b",
      "player-3": "team-a"
    });

    await adapter.handlePlayerAction({
      gameId: "airline-trivia-teams",
      payload: { answer: "B" },
      playerId: "host-1",
      roomId,
      seq: 1,
      type: "game_event"
    } satisfies GameEventEnvelope);
    await adapter.handlePlayerAction({
      gameId: "airline-trivia-teams",
      payload: { answer: "A" },
      playerId: "player-2",
      roomId,
      seq: 1,
      type: "game_event"
    } satisfies GameEventEnvelope);
    await adapter.handlePlayerAction({
      gameId: "airline-trivia-teams",
      payload: { answer: "B" },
      playerId: "player-3",
      roomId,
      seq: 1,
      type: "game_event"
    } satisfies GameEventEnvelope);

    const updatedSnapshot = await adapter.getSnapshot(roomId);
    expect(updatedSnapshot.state.current_round_number).toBe(2);
    expect(updatedSnapshot.state.last_completed_round).toMatchObject({
      roundNumber: 1,
      winningTeamIds: ["team-a"]
    });
    expect(updatedSnapshot.state.scores).toEqual({
      "host-1": 6,
      "player-2": 0,
      "player-3": 6
    });
    expect(updatedSnapshot.state.team_scores).toEqual({
      "team-a": 2,
      "team-b": 0
    });
  });
});
