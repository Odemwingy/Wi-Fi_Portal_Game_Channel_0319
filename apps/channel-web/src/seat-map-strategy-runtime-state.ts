import type { GameStateSnapshot } from "@wifi-portal/game-sdk";

export type SeatMapSeatView = {
  baseScore: number;
  col: number;
  ownerPlayerId: string | null;
  row: number;
  seatId: string;
  seatLabel: string;
  seatType: "aisle" | "window";
};

export type SeatMapClaimMoveView = {
  adjacencyBonus: number;
  claimedAt: string;
  playerId: string;
  pointsAwarded: number;
  seatId: string;
  seq: number;
};

export type SeatMapStrategyViewState = {
  availableSeatCount: number;
  cabinCols: number;
  cabinRows: number;
  currentTurnPlayerId: string;
  isCompleted: boolean;
  lastMove: SeatMapClaimMoveView | null;
  moves: SeatMapClaimMoveView[];
  playerMarks: Record<string, "A" | "B">;
  players: string[];
  scores: Record<string, number>;
  seats: SeatMapSeatView[];
  winnerPlayerIds: string[];
};

export function parseSeatMapStrategyState(
  snapshot: GameStateSnapshot
): SeatMapStrategyViewState | null {
  const state = snapshot.state as Record<string, unknown>;
  const seats = Array.isArray(state.seats)
    ? state.seats
        .map((seat) => {
          const candidate = seat as Record<string, unknown>;
          if (
            typeof candidate.baseScore !== "number" ||
            typeof candidate.col !== "number" ||
            typeof candidate.row !== "number" ||
            typeof candidate.seatId !== "string" ||
            typeof candidate.seatLabel !== "string" ||
            (candidate.seatType !== "aisle" && candidate.seatType !== "window")
          ) {
            return null;
          }

          return {
            baseScore: candidate.baseScore,
            col: candidate.col,
            ownerPlayerId:
              typeof candidate.ownerPlayerId === "string" ? candidate.ownerPlayerId : null,
            row: candidate.row,
            seatId: candidate.seatId,
            seatLabel: candidate.seatLabel,
            seatType: candidate.seatType
          } satisfies SeatMapSeatView;
        })
        .filter((seat): seat is SeatMapSeatView => seat !== null)
    : [];

  if (seats.length === 0) {
    return null;
  }

  return {
    availableSeatCount: Number(state.available_seat_count ?? 0),
    cabinCols: Number(state.cabin_cols ?? 0),
    cabinRows: Number(state.cabin_rows ?? 0),
    currentTurnPlayerId: String(state.current_turn_player_id ?? ""),
    isCompleted: Boolean(state.is_completed),
    lastMove: parseMove(state.last_move),
    moves: Array.isArray(state.moves)
      ? state.moves
          .map((move) => parseMove(move))
          .filter((move): move is SeatMapClaimMoveView => move !== null)
      : [],
    playerMarks: Object.fromEntries(
      Object.entries((state.player_marks ?? {}) as Record<string, unknown>).flatMap(
        ([playerId, mark]) =>
          mark === "A" || mark === "B" ? [[playerId, mark]] : []
      )
    ),
    players: Array.isArray(state.players)
      ? state.players.filter((playerId): playerId is string => typeof playerId === "string")
      : [],
    scores: Object.fromEntries(
      Object.entries((state.scores ?? {}) as Record<string, unknown>).map(
        ([playerId, score]) => [playerId, Number(score ?? 0)]
      )
    ),
    seats,
    winnerPlayerIds: Array.isArray(state.winner_player_ids)
      ? state.winner_player_ids.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : []
  };
}

function parseMove(value: unknown): SeatMapClaimMoveView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.adjacencyBonus !== "number" ||
    typeof candidate.claimedAt !== "string" ||
    typeof candidate.playerId !== "string" ||
    typeof candidate.pointsAwarded !== "number" ||
    typeof candidate.seatId !== "string" ||
    typeof candidate.seq !== "number"
  ) {
    return null;
  }

  return {
    adjacencyBonus: candidate.adjacencyBonus,
    claimedAt: candidate.claimedAt,
    playerId: candidate.playerId,
    pointsAwarded: candidate.pointsAwarded,
    seatId: candidate.seatId,
    seq: candidate.seq
  };
}
