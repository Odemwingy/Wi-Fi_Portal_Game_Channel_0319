import type { GameStateSnapshot } from "@wifi-portal/game-sdk";

export type MiniGomokuMoveView = {
  col: number;
  mark: "X" | "O";
  playedAt: string;
  playerId: string;
  row: number;
  seq: number;
};

export type MiniGomokuWinningCellView = {
  col: number;
  row: number;
};

export type MiniGomokuViewState = {
  board: string[][];
  boardSize: number;
  currentTurnPlayerId: string;
  isCompleted: boolean;
  lastMove: MiniGomokuMoveView | null;
  moves: MiniGomokuMoveView[];
  playerMarks: Record<string, "X" | "O">;
  players: string[];
  targetLineLength: number;
  winnerPlayerIds: string[];
  winningLine: MiniGomokuWinningCellView[];
};

export function parseMiniGomokuState(
  snapshot: GameStateSnapshot
): MiniGomokuViewState | null {
  const state = snapshot.state as Record<string, unknown>;
  const board = Array.isArray(state.board)
    ? state.board.map((row) =>
        Array.isArray(row)
          ? row.map((cell) => (typeof cell === "string" ? cell : ""))
          : []
      )
    : [];

  if (board.length === 0) {
    return null;
  }

  return {
    board,
    boardSize: Number(state.board_size ?? board.length),
    currentTurnPlayerId: String(state.current_turn_player_id ?? ""),
    isCompleted: Boolean(state.is_completed),
    lastMove: parseMove(state.last_move),
    moves: Array.isArray(state.moves)
      ? state.moves
          .map((move) => parseMove(move))
          .filter((move): move is MiniGomokuMoveView => move !== null)
      : [],
    playerMarks: Object.fromEntries(
      Object.entries((state.player_marks ?? {}) as Record<string, unknown>).flatMap(
        ([playerId, mark]) =>
          mark === "X" || mark === "O" ? [[playerId, mark]] : []
      )
    ),
    players: Array.isArray(state.players)
      ? state.players.filter((playerId): playerId is string => typeof playerId === "string")
      : [],
    targetLineLength: Number(state.target_line_length ?? 5),
    winnerPlayerIds: Array.isArray(state.winner_player_ids)
      ? state.winner_player_ids.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : [],
    winningLine: Array.isArray(state.winning_line)
      ? state.winning_line
          .map((cell) => {
            const candidate = cell as Record<string, unknown>;
            if (
              typeof candidate.row !== "number" ||
              typeof candidate.col !== "number"
            ) {
              return null;
            }

            return {
              col: candidate.col,
              row: candidate.row
            } satisfies MiniGomokuWinningCellView;
          })
          .filter((cell): cell is MiniGomokuWinningCellView => cell !== null)
      : []
  };
}

function parseMove(value: unknown): MiniGomokuMoveView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.col !== "number" ||
    typeof candidate.playedAt !== "string" ||
    typeof candidate.playerId !== "string" ||
    typeof candidate.row !== "number" ||
    typeof candidate.seq !== "number" ||
    (candidate.mark !== "X" && candidate.mark !== "O")
  ) {
    return null;
  }

  return {
    col: candidate.col,
    mark: candidate.mark,
    playedAt: candidate.playedAt,
    playerId: candidate.playerId,
    row: candidate.row,
    seq: candidate.seq
  };
}
