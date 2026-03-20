import { describe, expect, it } from "vitest";

import { startTrace } from "@wifi-portal/shared-observability";

import { MiniGomokuAdapter } from "./game-adapters/mini-gomoku.adapter";
import { MemoryMatchDuelAdapter } from "./game-adapters/memory-match-duel.adapter";
import { QuizDuelAdapter } from "./game-adapters/quiz-duel.adapter";
import { SpotTheDifferenceRaceAdapter } from "./game-adapters/spot-the-difference-race.adapter";
import { WordRallyAdapter } from "./game-adapters/word-rally.adapter";
import { GameRuntimeService } from "./game-runtime.service";
import { InMemoryJsonStateStore } from "./repositories/json-state-store";
import { StateStoreMiniGomokuStateRepository } from "./repositories/mini-gomoku-state.repository";
import { StateStoreMemoryMatchDuelStateRepository } from "./repositories/memory-match-duel-state.repository";
import { StateStoreQuizDuelStateRepository } from "./repositories/quiz-duel-state.repository";
import { StateStoreRoomRepository } from "./repositories/room.repository";
import { StateStoreSpotTheDifferenceRaceStateRepository } from "./repositories/spot-the-difference-race-state.repository";
import { StateStoreWordRallyStateRepository } from "./repositories/word-rally-state.repository";
import { RoomService } from "./room.service";

function createRuntime(stateStore: InMemoryJsonStateStore, roomService: RoomService) {
  return new GameRuntimeService(
    roomService,
    new MiniGomokuAdapter(new StateStoreMiniGomokuStateRepository(stateStore)),
    new MemoryMatchDuelAdapter(
      new StateStoreMemoryMatchDuelStateRepository(stateStore)
    ),
    new QuizDuelAdapter(new StateStoreQuizDuelStateRepository(stateStore)),
    new SpotTheDifferenceRaceAdapter(
      new StateStoreSpotTheDifferenceRaceStateRepository(stateStore)
    ),
    new WordRallyAdapter(new StateStoreWordRallyStateRepository(stateStore))
  );
}

describe("GameRuntimeService", () => {
  it("creates quiz-duel runtime state from room lifecycle and advances through all rounds", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const roomService = new RoomService(new StateStoreRoomRepository(stateStore));
    const runtime = createRuntime(stateStore, roomService);
    const trace = startTrace();

    const created = await roomService.createRoom(trace, {
      game_id: "quiz-duel",
      host_player_id: "host-1",
      host_session_id: "sess-host-1",
      max_players: 2,
      room_name: "Quiz Runtime Room"
    });

    await roomService.joinRoom(trace, {
      player_id: "player-2",
      room_id: created.room.room_id,
      session_id: "sess-player-2"
    });

    const initialSnapshot = await runtime.getGameSnapshot(
      trace,
      "quiz-duel",
      created.room.room_id
    );
    expect(initialSnapshot?.state.scores).toEqual({
      "host-1": 0,
      "player-2": 0
    });
    expect(initialSnapshot?.state.prompt).toMatchObject({
      id: "safety-briefing-001",
      title: "Cabin Safety Quickfire"
    });

    const updatedSnapshot = await runtime.handleGameEvent(trace, {
      gameId: "quiz-duel",
      payload: {
        answer: "A"
      },
      playerId: "player-2",
      roomId: created.room.room_id,
      seq: 1,
      type: "game_event"
    });

    expect(updatedSnapshot?.state.scores).toEqual({
      "host-1": 0,
      "player-2": 10
    });
    expect(updatedSnapshot?.state.answer_count).toBe(1);
    expect(updatedSnapshot?.state.answers_by_player).toEqual({
      "host-1": null,
      "player-2": "A"
    });

    const duplicateAttempt = await runtime.handleGameEvent(trace, {
      gameId: "quiz-duel",
      payload: {
        answer: "A"
      },
      playerId: "player-2",
      roomId: created.room.room_id,
      seq: 2,
      type: "game_event"
    });

    expect(duplicateAttempt?.state.scores).toEqual({
      "host-1": 0,
      "player-2": 10
    });
    expect(duplicateAttempt?.state.answer_count).toBe(1);

    const roundOneCompleted = await runtime.handleGameEvent(trace, {
      gameId: "quiz-duel",
      payload: {
        answer: "B"
      },
      playerId: "host-1",
      roomId: created.room.room_id,
      seq: 1,
      type: "game_event"
    });

    expect(roundOneCompleted?.state.current_round_number).toBe(2);
    expect(roundOneCompleted?.state.completed_round_count).toBe(1);
    expect(roundOneCompleted?.state.prompt).toMatchObject({
      id: "cabin-signals-002",
      title: "Turbulence Signals"
    });
    expect(roundOneCompleted?.state.last_completed_round).toMatchObject({
      correctAnswer: "A",
      roundNumber: 1,
      winningPlayerIds: ["player-2"]
    });
    expect(roundOneCompleted?.state.answers_by_player).toEqual({
      "host-1": null,
      "player-2": null
    });

    await runtime.handleGameEvent(trace, {
      gameId: "quiz-duel",
      payload: {
        answer: "C"
      },
      playerId: "host-1",
      roomId: created.room.room_id,
      seq: 2,
      type: "game_event"
    });

    const roundTwoCompleted = await runtime.handleGameEvent(trace, {
      gameId: "quiz-duel",
      payload: {
        answer: "B"
      },
      playerId: "player-2",
      roomId: created.room.room_id,
      seq: 3,
      type: "game_event"
    });

    expect(roundTwoCompleted?.state.current_round_number).toBe(3);
    expect(roundTwoCompleted?.state.completed_round_count).toBe(2);
    expect(roundTwoCompleted?.state.prompt).toMatchObject({
      id: "device-mode-003",
      title: "Connected Cabin Etiquette"
    });
    expect(roundTwoCompleted?.state.last_completed_round).toMatchObject({
      correctAnswer: "C",
      roundNumber: 2,
      winningPlayerIds: ["host-1", "player-2"]
    });
    expect(roundTwoCompleted?.state.scores).toEqual({
      "host-1": 10,
      "player-2": 10
    });

    await runtime.handleGameEvent(trace, {
      gameId: "quiz-duel",
      payload: {
        answer: "D"
      },
      playerId: "host-1",
      roomId: created.room.room_id,
      seq: 3,
      type: "game_event"
    });

    const finalSnapshot = await runtime.handleGameEvent(trace, {
      gameId: "quiz-duel",
      payload: {
        answer: "A"
      },
      playerId: "player-2",
      roomId: created.room.room_id,
      seq: 4,
      type: "game_event"
    });

    expect(finalSnapshot?.state.is_completed).toBe(true);
    expect(finalSnapshot?.state.completed_round_count).toBe(3);
    expect(finalSnapshot?.state.total_rounds).toBe(3);
    expect(finalSnapshot?.state.last_completed_round).toMatchObject({
      correctAnswer: "D",
      roundNumber: 3,
      winningPlayerIds: ["host-1"]
    });
    expect(finalSnapshot?.state.round_history).toHaveLength(3);
    expect(finalSnapshot?.state.scores).toEqual({
      "host-1": 20,
      "player-2": 10
    });
    expect(finalSnapshot?.state.winning_player_ids).toEqual(["host-1"]);

    runtime.onModuleDestroy();
  });

  it("supports a second multiplayer adapter for word-rally rooms", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const roomService = new RoomService(new StateStoreRoomRepository(stateStore));
    const runtime = createRuntime(stateStore, roomService);
    const trace = startTrace();

    const created = await roomService.createRoom(trace, {
      game_id: "word-rally",
      host_player_id: "host-1",
      host_session_id: "sess-host-1",
      max_players: 2,
      room_name: "Word Rally Room"
    });

    await roomService.joinRoom(trace, {
      player_id: "player-2",
      room_id: created.room.room_id,
      session_id: "sess-player-2"
    });

    const initialSnapshot = await runtime.getGameSnapshot(
      trace,
      "word-rally",
      created.room.room_id
    );

    expect(initialSnapshot?.state.prompt_id).toBe("word-rally-001");
    expect(initialSnapshot?.state.players).toEqual(["host-1", "player-2"]);

    const updatedSnapshot = await runtime.handleGameEvent(trace, {
      gameId: "word-rally",
      payload: {
        wordId: "cloud"
      },
      playerId: "player-2",
      roomId: created.room.room_id,
      seq: 1,
      type: "game_event"
    });

    expect(updatedSnapshot?.state.answer_count).toBe(1);
    expect(updatedSnapshot?.state.scores).toEqual({
      "host-1": 0,
      "player-2": 10
    });

    runtime.onModuleDestroy();
  });

  it("supports memory-match-duel rooms with shared board state", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const roomService = new RoomService(new StateStoreRoomRepository(stateStore));
    const runtime = createRuntime(stateStore, roomService);
    const trace = startTrace();

    const created = await roomService.createRoom(trace, {
      game_id: "memory-match-duel",
      host_player_id: "host-1",
      host_session_id: "sess-host-1",
      max_players: 2,
      room_name: "Memory Match Room"
    });

    await roomService.joinRoom(trace, {
      player_id: "player-2",
      room_id: created.room.room_id,
      session_id: "sess-player-2"
    });

    const initialSnapshot = await runtime.getGameSnapshot(
      trace,
      "memory-match-duel",
      created.room.room_id
    );

    expect(initialSnapshot?.state.current_turn_player_id).toBe("host-1");
    expect(initialSnapshot?.state.total_pairs).toBe(3);

    await runtime.handleGameEvent(trace, {
      gameId: "memory-match-duel",
      payload: {
        cardIndex: 0
      },
      playerId: "host-1",
      roomId: created.room.room_id,
      seq: 1,
      type: "game_event"
    });

    const resolvedSnapshot = await runtime.handleGameEvent(trace, {
      gameId: "memory-match-duel",
      payload: {
        cardIndex: 2
      },
      playerId: "host-1",
      roomId: created.room.room_id,
      seq: 2,
      type: "game_event"
    });

    expect(resolvedSnapshot?.state.matched_pair_count).toBe(1);
    expect(resolvedSnapshot?.state.scores).toEqual({
      "host-1": 12,
      "player-2": 0
    });
    expect(resolvedSnapshot?.state.winning_player_ids).toEqual(["host-1"]);

    runtime.onModuleDestroy();
  });

  it("supports spot-the-difference-race rooms with low-frequency spot claims", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const roomService = new RoomService(new StateStoreRoomRepository(stateStore));
    const runtime = createRuntime(stateStore, roomService);
    const trace = startTrace();

    const created = await roomService.createRoom(trace, {
      game_id: "spot-the-difference-race",
      host_player_id: "host-1",
      host_session_id: "sess-host-1",
      max_players: 2,
      room_name: "Spot Race Room"
    });

    await roomService.joinRoom(trace, {
      player_id: "player-2",
      room_id: created.room.room_id,
      session_id: "sess-player-2"
    });

    const initialSnapshot = await runtime.getGameSnapshot(
      trace,
      "spot-the-difference-race",
      created.room.room_id
    );

    expect(initialSnapshot?.state.current_scene_id).toBe("cabin-window-evening");
    expect(initialSnapshot?.state.total_spot_count).toBe(5);

    const updatedSnapshot = await runtime.handleGameEvent(trace, {
      gameId: "spot-the-difference-race",
      payload: {
        spotId: "window-shade-01"
      },
      playerId: "host-1",
      roomId: created.room.room_id,
      seq: 1,
      type: "game_event"
    });

    expect(updatedSnapshot?.state.claimed_spot_count).toBe(1);
    expect(updatedSnapshot?.state.scores).toEqual({
      "host-1": 8,
      "player-2": 0
    });
    expect(updatedSnapshot?.state.last_recent_claim).toMatchObject({
      playerId: "host-1",
      spotId: "window-shade-01",
      status: "claimed"
    });

    runtime.onModuleDestroy();
  });

  it("supports mini-gomoku rooms with five-in-a-row win detection", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const roomService = new RoomService(new StateStoreRoomRepository(stateStore));
    const runtime = createRuntime(stateStore, roomService);
    const trace = startTrace();

    const created = await roomService.createRoom(trace, {
      game_id: "mini-gomoku",
      host_player_id: "host-1",
      host_session_id: "sess-host-1",
      max_players: 2,
      room_name: "Mini Gomoku Room"
    });

    await roomService.joinRoom(trace, {
      player_id: "player-2",
      room_id: created.room.room_id,
      session_id: "sess-player-2"
    });

    const initialSnapshot = await runtime.getGameSnapshot(
      trace,
      "mini-gomoku",
      created.room.room_id
    );

    expect(initialSnapshot?.state.board_size).toBe(9);
    expect(initialSnapshot?.state.player_marks).toEqual({
      "host-1": "X",
      "player-2": "O"
    });

    const moves = [
      { playerId: "host-1", row: 0, col: 0, seq: 1 },
      { playerId: "player-2", row: 1, col: 0, seq: 1 },
      { playerId: "host-1", row: 0, col: 1, seq: 2 },
      { playerId: "player-2", row: 1, col: 1, seq: 2 },
      { playerId: "host-1", row: 0, col: 2, seq: 3 },
      { playerId: "player-2", row: 1, col: 2, seq: 3 },
      { playerId: "host-1", row: 0, col: 3, seq: 4 },
      { playerId: "player-2", row: 1, col: 3, seq: 4 }
    ];

    for (const move of moves) {
      await runtime.handleGameEvent(trace, {
        gameId: "mini-gomoku",
        payload: {
          col: move.col,
          row: move.row
        },
        playerId: move.playerId,
        roomId: created.room.room_id,
        seq: move.seq,
        type: "game_event"
      });
    }

    const finalSnapshot = await runtime.handleGameEvent(trace, {
      gameId: "mini-gomoku",
      payload: {
        col: 4,
        row: 0
      },
      playerId: "host-1",
      roomId: created.room.room_id,
      seq: 5,
      type: "game_event"
    });

    expect(finalSnapshot?.state.is_completed).toBe(true);
    expect(finalSnapshot?.state.winner_player_ids).toEqual(["host-1"]);
    expect(finalSnapshot?.state.winning_line).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 3, row: 0 },
      { col: 4, row: 0 }
    ]);

    runtime.onModuleDestroy();
  });
});
