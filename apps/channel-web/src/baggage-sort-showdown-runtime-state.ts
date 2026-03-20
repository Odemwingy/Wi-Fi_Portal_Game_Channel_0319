import type { GameStateSnapshot } from "@wifi-portal/game-sdk";

export type BaggageLaneView = "fragile" | "oversize" | "priority" | "standard";

export type BaggageItemView = {
  accent: "amber" | "mint" | "rose" | "sea";
  id: string;
  label: string;
  points: number;
  tagLabel: string;
  targetLane: BaggageLaneView;
  weightKg: number;
};

export type BaggageSortActionView = {
  bagId: string;
  chosenLane: BaggageLaneView;
  correctLane: BaggageLaneView;
  playerId: string;
  pointsAwarded: number;
  seq: number;
  status: "accepted" | "rejected";
  submittedAt: string;
};

export type BaggageSortShowdownViewState = {
  availableLanes: BaggageLaneView[];
  currentBag: BaggageItemView | null;
  currentBagIndex: number;
  isCompleted: boolean;
  lastAction: BaggageSortActionView | null;
  players: string[];
  remainingBagCount: number;
  resolvedBagIds: string[];
  scores: Record<string, number>;
  totalBags: number;
  winnerPlayerIds: string[];
};

export function parseBaggageSortShowdownState(
  snapshot: GameStateSnapshot
): BaggageSortShowdownViewState | null {
  const state = snapshot.state as Record<string, unknown>;
  const totalBags = Number(state.total_bags ?? 0);

  if (!Number.isFinite(totalBags) || totalBags <= 0) {
    return null;
  }

  return {
    availableLanes: Array.isArray(state.available_lanes)
      ? state.available_lanes.filter(isLane)
      : [],
    currentBag: parseBag(state.current_bag),
    currentBagIndex: Number(state.current_bag_index ?? 0),
    isCompleted: Boolean(state.is_completed),
    lastAction: parseAction(state.last_action),
    players: Array.isArray(state.players)
      ? state.players.filter((playerId): playerId is string => typeof playerId === "string")
      : [],
    remainingBagCount: Number(state.remaining_bag_count ?? 0),
    resolvedBagIds: Array.isArray(state.resolved_bag_ids)
      ? state.resolved_bag_ids.filter((bagId): bagId is string => typeof bagId === "string")
      : [],
    scores: Object.fromEntries(
      Object.entries((state.scores ?? {}) as Record<string, unknown>).map(
        ([playerId, score]) => [playerId, Number(score ?? 0)]
      )
    ),
    totalBags,
    winnerPlayerIds: Array.isArray(state.winner_player_ids)
      ? state.winner_player_ids.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : []
  };
}

function parseBag(value: unknown): BaggageItemView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.label !== "string" ||
    typeof candidate.points !== "number" ||
    typeof candidate.tagLabel !== "string" ||
    typeof candidate.weightKg !== "number" ||
    !isLane(candidate.targetLane) ||
    (candidate.accent !== "amber" &&
      candidate.accent !== "mint" &&
      candidate.accent !== "rose" &&
      candidate.accent !== "sea")
  ) {
    return null;
  }

  return {
    accent: candidate.accent,
    id: candidate.id,
    label: candidate.label,
    points: candidate.points,
    tagLabel: candidate.tagLabel,
    targetLane: candidate.targetLane,
    weightKg: candidate.weightKg
  };
}

function parseAction(value: unknown): BaggageSortActionView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.bagId !== "string" ||
    typeof candidate.playerId !== "string" ||
    typeof candidate.pointsAwarded !== "number" ||
    typeof candidate.seq !== "number" ||
    typeof candidate.submittedAt !== "string" ||
    !isLane(candidate.chosenLane) ||
    !isLane(candidate.correctLane) ||
    (candidate.status !== "accepted" && candidate.status !== "rejected")
  ) {
    return null;
  }

  return {
    bagId: candidate.bagId,
    chosenLane: candidate.chosenLane,
    correctLane: candidate.correctLane,
    playerId: candidate.playerId,
    pointsAwarded: candidate.pointsAwarded,
    seq: candidate.seq,
    status: candidate.status,
    submittedAt: candidate.submittedAt
  };
}

function isLane(value: unknown): value is BaggageLaneView {
  return (
    value === "standard" ||
    value === "priority" ||
    value === "fragile" ||
    value === "oversize"
  );
}
