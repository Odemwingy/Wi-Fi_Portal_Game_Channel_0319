import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";

import {
  createGameAdapterRegistry,
  type GameAdapter,
  type GameEventEnvelope,
  type GameStateSnapshot
} from "@wifi-portal/game-sdk";
import {
  createSpanId,
  createStructuredLogger,
  startChildSpan,
  type TraceContext
} from "@wifi-portal/shared-observability";

import { BaggageSortShowdownAdapter } from "./game-adapters/baggage-sort-showdown.adapter";
import { MiniGomokuAdapter } from "./game-adapters/mini-gomoku.adapter";
import { MemoryMatchDuelAdapter } from "./game-adapters/memory-match-duel.adapter";
import { QuizDuelAdapter } from "./game-adapters/quiz-duel.adapter";
import { SeatMapStrategyAdapter } from "./game-adapters/seat-map-strategy.adapter";
import { SignalScrambleAdapter } from "./game-adapters/signal-scramble.adapter";
import { SpotTheDifferenceRaceAdapter } from "./game-adapters/spot-the-difference-race.adapter";
import { WordRallyAdapter } from "./game-adapters/word-rally.adapter";
import { RoomService, type RoomSubscriptionEvent } from "./room.service";

const logger = createStructuredLogger("platform-api.game-runtime");

@Injectable()
export class GameRuntimeService implements OnModuleDestroy {
  private readonly adapters: Map<string, GameAdapter>;
  private readonly initializedRooms = new Set<string>();

  private readonly unsubscribe: () => void;

  constructor(
    @Inject(RoomService)
    private readonly roomService: RoomService,
    @Inject(BaggageSortShowdownAdapter)
    baggageSortShowdownAdapter: BaggageSortShowdownAdapter,
    @Inject(MiniGomokuAdapter)
    miniGomokuAdapter: MiniGomokuAdapter,
    @Inject(MemoryMatchDuelAdapter)
    memoryMatchDuelAdapter: MemoryMatchDuelAdapter,
    @Inject(QuizDuelAdapter)
    quizDuelAdapter: QuizDuelAdapter,
    @Inject(SeatMapStrategyAdapter)
    seatMapStrategyAdapter: SeatMapStrategyAdapter,
    @Inject(SignalScrambleAdapter)
    signalScrambleAdapter: SignalScrambleAdapter,
    @Inject(SpotTheDifferenceRaceAdapter)
    spotTheDifferenceRaceAdapter: SpotTheDifferenceRaceAdapter,
    @Inject(WordRallyAdapter)
    wordRallyAdapter: WordRallyAdapter
  ) {
    this.adapters = createGameAdapterRegistry([
      baggageSortShowdownAdapter,
      miniGomokuAdapter,
      memoryMatchDuelAdapter,
      quizDuelAdapter,
      seatMapStrategyAdapter,
      signalScrambleAdapter,
      spotTheDifferenceRaceAdapter,
      wordRallyAdapter
    ] satisfies readonly GameAdapter[]);
    this.unsubscribe = this.roomService.subscribe((event) => {
      void this.handleRoomEvent(event);
    });
  }

  onModuleDestroy() {
    this.unsubscribe();
  }

  async getGameSnapshot(
    traceContext: TraceContext,
    gameId: string,
    roomId: string
  ): Promise<GameStateSnapshot | null> {
    const span = startChildSpan(traceContext);
    const adapter = this.adapters.get(gameId);

    if (!adapter) {
      logger.debug("game.snapshot.skipped", span, {
        output_summary: "no adapter registered",
        metadata: {
          game_id: gameId,
          room_id: roomId
        },
        status: "skipped"
      });
      return null;
    }

    await this.ensureRoomInitialized(span, gameId, roomId);
    const snapshot = await adapter.getSnapshot(roomId);

    logger.info("game.snapshot.loaded", span, {
      output_summary: `revision ${snapshot.revision}`,
      metadata: {
        game_id: gameId,
        room_id: roomId
      }
    });

    return snapshot;
  }

  async handleGameEvent(
    traceContext: TraceContext,
    event: GameEventEnvelope
  ): Promise<GameStateSnapshot | null> {
    const span = startChildSpan(traceContext);
    const adapter = this.adapters.get(event.gameId);

    if (!adapter) {
      logger.warn("game.event.unhandled", span, {
        input_summary: JSON.stringify({
          game_id: event.gameId,
          room_id: event.roomId
        }),
        output_summary: "no adapter registered",
        metadata: {
          game_id: event.gameId,
          room_id: event.roomId
        },
        status: "skipped"
      });
      return null;
    }

    await this.ensureRoomInitialized(span, event.gameId, event.roomId);
    await adapter.handlePlayerAction(event);
    const snapshot = await adapter.getSnapshot(event.roomId);

    logger.info("game.event.applied", span, {
      input_summary: JSON.stringify({
        game_id: event.gameId,
        player_id: event.playerId,
        room_id: event.roomId,
        seq: event.seq
      }),
      output_summary: `revision ${snapshot.revision}`,
      metadata: {
        game_id: event.gameId,
        room_id: event.roomId
      }
    });

    return snapshot;
  }

  private async handleRoomEvent(event: RoomSubscriptionEvent) {
    const traceContext: TraceContext = {
      trace_id: event.trace_id,
      span_id: createSpanId(),
      parent_span_id: null
    };

    const adapter = this.adapters.get(event.room.game_id);
    if (!adapter) {
      return;
    }

    try {
      const initializationKey = this.getInitializationKey(
        event.room.game_id,
        event.room.room_id
      );

      switch (event.action) {
        case "room.created":
          if (
            event.actor_player_id &&
            !this.initializedRooms.has(initializationKey)
          ) {
            await adapter.createMatch(event.room.room_id, event.actor_player_id);
            this.initializedRooms.add(initializationKey);
          }
          break;

        case "room.joined":
          if (event.actor_player_id) {
            await adapter.joinMatch(event.room.room_id, event.actor_player_id);
            this.initializedRooms.add(initializationKey);
          }
          break;

        case "room.reconnected":
          if (event.actor_player_id) {
            await adapter.reconnectPlayer(event.room.room_id, event.actor_player_id);
            this.initializedRooms.add(initializationKey);
          }
          break;

        case "room.left":
        case "room.cleaned_up":
          if (event.room.players.length === 0) {
            await adapter.finishMatch(event.room.room_id);
            this.initializedRooms.delete(initializationKey);
          }
          break;

        default:
          break;
      }

      logger.info("game.runtime.room_event_applied", traceContext, {
        output_summary: event.action,
        metadata: {
          game_id: event.room.game_id,
          room_id: event.room.room_id
        }
      });
    } catch (error) {
      logger.error("game.runtime.room_event_failed", traceContext, {
        error_detail:
          error instanceof Error ? error.message : "Unknown game runtime error",
        metadata: {
          action: event.action,
          game_id: event.room.game_id,
          room_id: event.room.room_id
        },
        status: "error"
      });
    }
  }

  private async ensureRoomInitialized(
    traceContext: TraceContext,
    gameId: string,
    roomId: string
  ) {
    const initializationKey = this.getInitializationKey(gameId, roomId);
    if (this.initializedRooms.has(initializationKey)) {
      return;
    }

    const adapter = this.adapters.get(gameId);
    if (!adapter) {
      return;
    }

    const room = (await this.roomService.getRoom(traceContext, roomId)).room;
    await adapter.createMatch(room.room_id, room.host_player_id);

    for (const player of room.players) {
      if (player.player_id === room.host_player_id) {
        continue;
      }
      await adapter.joinMatch(room.room_id, player.player_id);
    }

    this.initializedRooms.add(initializationKey);

    logger.info("game.runtime.room_seeded", traceContext, {
      output_summary: `${room.players.length} players seeded`,
      metadata: {
        game_id: gameId,
        room_id: roomId
      }
    });
  }

  private getInitializationKey(gameId: string, roomId: string) {
    return `${gameId}:${roomId}`;
  }
}
