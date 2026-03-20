import { Inject, Injectable } from "@nestjs/common";

import {
  type GameAdapter,
  type GameEventEnvelope,
  type GameStateSnapshot
} from "@wifi-portal/game-sdk";

import {
  MiniGomokuStateRepository,
  type MiniGomokuCellValue,
  type MiniGomokuMove,
  type MiniGomokuRoomState,
  type MiniGomokuWinningCell
} from "../repositories/mini-gomoku-state.repository";

const BOARD_SIZE = 9;
const TARGET_LINE_LENGTH = 5;

@Injectable()
export class MiniGomokuAdapter implements GameAdapter {
  readonly gameId = "mini-gomoku";

  constructor(
    @Inject(MiniGomokuStateRepository)
    private readonly stateRepository: MiniGomokuStateRepository
  ) {}

  async createMatch(roomId: string, hostPlayerId: string) {
    const now = new Date().toISOString();

    await this.stateRepository.set(roomId, {
      board: createEmptyBoard(),
      boardSize: BOARD_SIZE,
      currentTurnPlayerId: hostPlayerId,
      isCompleted: false,
      lastSeqByPlayer: {
        [hostPlayerId]: -1
      },
      moves: [],
      playerMarks: {
        [hostPlayerId]: "X"
      },
      players: [hostPlayerId],
      revision: 1,
      targetLineLength: TARGET_LINE_LENGTH,
      updatedAt: now,
      winnerPlayerIds: [],
      winningLine: []
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

    const row = this.parseCoordinate(event.payload.row, "row");
    const col = this.parseCoordinate(event.payload.col, "col");
    const currentCell = room.board[row]?.[col];
    const mark = room.playerMarks[event.playerId];

    if (!mark || currentCell === undefined || currentCell !== "") {
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    room.board[row]![col] = mark;
    room.moves.unshift({
      col,
      mark,
      playedAt: new Date().toISOString(),
      playerId: event.playerId,
      row,
      seq: event.seq
    } satisfies MiniGomokuMove);
    room.moves = room.moves.slice(0, BOARD_SIZE * BOARD_SIZE);

    const winningLine = findWinningLine(room.board, row, col, mark);
    if (winningLine.length > 0) {
      room.isCompleted = true;
      room.winnerPlayerIds = [event.playerId];
      room.winningLine = winningLine;
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    if (isBoardFull(room.board)) {
      room.isCompleted = true;
      room.winnerPlayerIds = [];
      room.winningLine = [];
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
        board: room.board,
        board_size: room.boardSize,
        current_turn_player_id: room.currentTurnPlayerId,
        is_completed: room.isCompleted,
        last_move: room.moves[0] ?? null,
        moves: room.moves.slice(0, 12),
        player_marks: room.playerMarks,
        players: room.players,
        target_line_length: room.targetLineLength,
        winner_player_ids: room.winnerPlayerIds,
        winning_line: room.winningLine
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
    this.bumpRevision(room);
    await this.stateRepository.set(roomId, room);
  }

  async finishMatch(roomId: string) {
    await this.stateRepository.delete(roomId);
  }

  private async getRoom(roomId: string) {
    const room = await this.stateRepository.get(roomId);
    if (!room) {
      throw new Error(`Mini Gomoku room not found: ${roomId}`);
    }
    return room;
  }

  private getNextPlayerId(room: MiniGomokuRoomState, playerId: string) {
    const currentIndex = room.players.indexOf(playerId);
    if (currentIndex === -1 || room.players.length === 0) {
      return playerId;
    }

    return room.players[(currentIndex + 1) % room.players.length] ?? playerId;
  }

  private parseCoordinate(value: unknown, field: "row" | "col") {
    if (!Number.isInteger(value)) {
      throw new Error(`Mini Gomoku expects payload.${field} to be an integer`);
    }

    const parsed = Number(value);
    if (parsed < 0 || parsed >= BOARD_SIZE) {
      throw new Error(`Mini Gomoku payload.${field} is out of bounds`);
    }

    return parsed;
  }

  private bumpRevision(room: MiniGomokuRoomState) {
    room.revision += 1;
    room.updatedAt = new Date().toISOString();
  }
}

function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => "" satisfies MiniGomokuCellValue)
  );
}

function getNextMark(playerMarks: Record<string, "X" | "O">) {
  const usedMarks = new Set(Object.values(playerMarks));
  return usedMarks.has("X") ? "O" : "X";
}

function isBoardFull(board: MiniGomokuCellValue[][]) {
  return board.every((row) => row.every((cell) => cell !== ""));
}

function findWinningLine(
  board: MiniGomokuCellValue[][],
  row: number,
  col: number,
  mark: "X" | "O"
) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
  ] as const;

  for (const [rowDelta, colDelta] of directions) {
    const cells: MiniGomokuWinningCell[] = [{ row, col }];

    collectDirection(board, cells, row, col, rowDelta, colDelta, mark);
    collectDirection(board, cells, row, col, -rowDelta, -colDelta, mark);

    if (cells.length >= TARGET_LINE_LENGTH) {
      return cells
        .sort((left, right) => left.row - right.row || left.col - right.col)
        .slice(0, TARGET_LINE_LENGTH);
    }
  }

  return [];
}

function collectDirection(
  board: MiniGomokuCellValue[][],
  cells: MiniGomokuWinningCell[],
  startRow: number,
  startCol: number,
  rowDelta: number,
  colDelta: number,
  mark: "X" | "O"
) {
  let nextRow = startRow + rowDelta;
  let nextCol = startCol + colDelta;

  while (
    nextRow >= 0 &&
    nextRow < BOARD_SIZE &&
    nextCol >= 0 &&
    nextCol < BOARD_SIZE &&
    board[nextRow]?.[nextCol] === mark
  ) {
    cells.push({
      col: nextCol,
      row: nextRow
    });
    nextRow += rowDelta;
    nextCol += colDelta;
  }
}
