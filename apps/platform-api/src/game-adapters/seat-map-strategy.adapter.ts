import { Inject, Injectable } from "@nestjs/common";

import {
  type GameAdapter,
  type GameEventEnvelope,
  type GameStateSnapshot
} from "@wifi-portal/game-sdk";

import {
  SeatMapStrategyStateRepository,
  type SeatMapClaimMove,
  type SeatMapRoomState,
  type SeatMapSeat
} from "../repositories/seat-map-strategy-state.repository";

const CABIN_ROWS = 4;
const CABIN_COLS = 4;

@Injectable()
export class SeatMapStrategyAdapter implements GameAdapter {
  readonly gameId = "seat-map-strategy";

  constructor(
    @Inject(SeatMapStrategyStateRepository)
    private readonly stateRepository: SeatMapStrategyStateRepository
  ) {}

  async createMatch(roomId: string, hostPlayerId: string) {
    const now = new Date().toISOString();

    await this.stateRepository.set(roomId, {
      availableSeatCount: CABIN_ROWS * CABIN_COLS,
      cabinCols: CABIN_COLS,
      cabinRows: CABIN_ROWS,
      currentTurnPlayerId: hostPlayerId,
      isCompleted: false,
      lastMove: null,
      lastSeqByPlayer: {
        [hostPlayerId]: -1
      },
      moves: [],
      playerMarks: {
        [hostPlayerId]: "A"
      },
      players: [hostPlayerId],
      revision: 1,
      scores: {
        [hostPlayerId]: 0
      },
      seats: createSeatMap(),
      updatedAt: now,
      winnerPlayerIds: []
    });
  }

  async joinMatch(roomId: string, playerId: string) {
    const room = await this.getRoom(roomId);
    if (room.players.includes(playerId)) {
      return;
    }

    room.players.push(playerId);
    room.lastSeqByPlayer[playerId] = -1;
    room.playerMarks[playerId] = room.playerMarks[playerId] ?? getNextMark(room.playerMarks);
    room.scores[playerId] = room.scores[playerId] ?? 0;
    this.bumpRevision(room);
    await this.stateRepository.set(roomId, room);
  }

  async handlePlayerAction(event: GameEventEnvelope) {
    const room = await this.getRoom(event.roomId);
    const previousSeq = room.lastSeqByPlayer[event.playerId] ?? -1;

    if (event.seq <= previousSeq) {
      return;
    }

    room.lastSeqByPlayer[event.playerId] = event.seq;

    if (room.isCompleted || room.currentTurnPlayerId !== event.playerId || room.players.length < 2) {
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    const seatId = this.parseSeatId(event.payload.seatId);
    const seat = room.seats.find((entry) => entry.seatId === seatId);

    if (!seat || seat.ownerPlayerId) {
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    const adjacencyBonus = getAdjacencyBonus(room.seats, seat, event.playerId);
    const pointsAwarded = seat.baseScore + adjacencyBonus;

    seat.ownerPlayerId = event.playerId;
    room.availableSeatCount -= 1;
    room.scores[event.playerId] = (room.scores[event.playerId] ?? 0) + pointsAwarded;
    room.lastMove = {
      adjacencyBonus,
      claimedAt: new Date().toISOString(),
      playerId: event.playerId,
      pointsAwarded,
      seatId,
      seq: event.seq
    } satisfies SeatMapClaimMove;
    room.moves.unshift(room.lastMove);
    room.moves = room.moves.slice(0, CABIN_ROWS * CABIN_COLS);

    if (room.availableSeatCount === 0) {
      room.isCompleted = true;
      room.winnerPlayerIds = getWinners(room.scores);
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    room.currentTurnPlayerId = this.getNextPlayerId(room, event.playerId);
    this.bumpRevision(room);
    await this.stateRepository.set(event.roomId, room);
  }

  async getSnapshot(roomId: string): Promise<GameStateSnapshot> {
    const room = await this.getRoom(roomId);

    return {
      gameId: this.gameId,
      roomId,
      revision: room.revision,
      state: {
        available_seat_count: room.availableSeatCount,
        cabin_cols: room.cabinCols,
        cabin_rows: room.cabinRows,
        current_turn_player_id: room.currentTurnPlayerId,
        is_completed: room.isCompleted,
        last_move: room.lastMove,
        moves: room.moves.slice(0, 10),
        player_marks: room.playerMarks,
        players: room.players,
        scores: room.scores,
        seats: room.seats,
        winner_player_ids: room.winnerPlayerIds
      },
      updatedAt: room.updatedAt
    };
  }

  async reconnectPlayer(roomId: string, playerId: string) {
    const room = await this.getRoom(roomId);
    room.lastSeqByPlayer[playerId] = room.lastSeqByPlayer[playerId] ?? -1;
    if (!room.players.includes(playerId)) {
      room.players.push(playerId);
    }
    room.playerMarks[playerId] = room.playerMarks[playerId] ?? getNextMark(room.playerMarks);
    room.scores[playerId] = room.scores[playerId] ?? 0;
    this.bumpRevision(room);
    await this.stateRepository.set(roomId, room);
  }

  async finishMatch(roomId: string) {
    await this.stateRepository.delete(roomId);
  }

  private async getRoom(roomId: string) {
    const room = await this.stateRepository.get(roomId);
    if (!room) {
      throw new Error(`Seat Map Strategy room not found: ${roomId}`);
    }
    return room;
  }

  private getNextPlayerId(room: SeatMapRoomState, playerId: string) {
    const currentIndex = room.players.indexOf(playerId);
    if (currentIndex === -1 || room.players.length === 0) {
      return playerId;
    }

    return room.players[(currentIndex + 1) % room.players.length] ?? playerId;
  }

  private parseSeatId(value: unknown) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("Seat Map Strategy expects payload.seatId");
    }

    return value;
  }

  private bumpRevision(room: SeatMapRoomState) {
    room.revision += 1;
    room.updatedAt = new Date().toISOString();
  }
}

function createSeatMap(): SeatMapSeat[] {
  return Array.from({ length: CABIN_ROWS }, (_, rowIndex) =>
    Array.from({ length: CABIN_COLS }, (_, colIndex) => {
      const seatLetter = String.fromCharCode(65 + colIndex);
      const seatType = colIndex === 0 || colIndex === CABIN_COLS - 1 ? "window" : "aisle";

      return {
        baseScore: seatType === "window" ? 3 : 2,
        col: colIndex,
        ownerPlayerId: null,
        row: rowIndex,
        seatId: `${rowIndex + 1}${seatLetter}`,
        seatLabel: `${rowIndex + 1}${seatLetter}`,
        seatType
      } satisfies SeatMapSeat;
    })
  ).flat();
}

function getNextMark(playerMarks: Record<string, "A" | "B">) {
  const usedMarks = new Set(Object.values(playerMarks));
  return usedMarks.has("A") ? "B" : "A";
}

function getAdjacencyBonus(
  seats: SeatMapSeat[],
  claimedSeat: SeatMapSeat,
  playerId: string
) {
  return seats.filter((seat) => {
    if (seat.ownerPlayerId !== playerId) {
      return false;
    }

    const rowDistance = Math.abs(seat.row - claimedSeat.row);
    const colDistance = Math.abs(seat.col - claimedSeat.col);
    return rowDistance + colDistance === 1;
  }).length;
}

function getWinners(scores: Record<string, number>) {
  const highestScore = Math.max(...Object.values(scores));
  return Object.entries(scores)
    .filter(([, score]) => score === highestScore)
    .map(([playerId]) => playerId);
}
