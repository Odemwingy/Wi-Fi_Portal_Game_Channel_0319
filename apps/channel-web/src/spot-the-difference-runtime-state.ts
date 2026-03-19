import type { GameStateSnapshot, SpotTheDifferenceScene } from "@wifi-portal/game-sdk";

export type SpotRaceClaimView = {
  claimedAt: string;
  playerId: string;
  spotId: string;
  status: "claimed" | "duplicate";
};

export type SpotRaceViewState = {
  claimedSpotCount: number;
  deadlineAt: string | null;
  foundSpots: Record<
    string,
    {
      claimedAt: string;
      playerId: string;
      spotId: string;
    }
  >;
  isCompleted: boolean;
  lastRecentClaim: SpotRaceClaimView | null;
  recentClaims: SpotRaceClaimView[];
  remainingSpotCount: number;
  scene: SpotTheDifferenceScene;
  scores: Record<string, number>;
  totalSpotCount: number;
  winnerPlayerIds: string[];
};

export function parseSpotRaceState(snapshot: GameStateSnapshot): SpotRaceViewState | null {
  const state = snapshot.state as Record<string, unknown>;
  const scene = state.scene as SpotTheDifferenceScene | undefined;

  if (!scene || typeof scene.id !== "string" || !Array.isArray(scene.spots)) {
    return null;
  }

  return {
    claimedSpotCount: Number(state.claimed_spot_count ?? 0),
    deadlineAt: typeof state.deadline_at === "string" ? state.deadline_at : null,
    foundSpots: Object.fromEntries(
      Object.entries((state.found_spots ?? {}) as Record<string, unknown>).map(
        ([spotId, rawClaim]) => {
          const claim = rawClaim as Record<string, unknown>;
          return [
            spotId,
            {
              claimedAt: String(claim.claimedAt ?? ""),
              playerId: String(claim.playerId ?? ""),
              spotId: String(claim.spotId ?? spotId)
            }
          ];
        }
      )
    ),
    isCompleted: Boolean(state.is_completed),
    lastRecentClaim: parseClaim(state.last_recent_claim),
    recentClaims: Array.isArray(state.recent_claims)
      ? state.recent_claims
          .map(parseClaim)
          .filter((value): value is SpotRaceClaimView => value !== null)
      : [],
    remainingSpotCount: Number(state.remaining_spot_count ?? scene.spots.length),
    scene,
    scores: Object.fromEntries(
      Object.entries((state.scores ?? {}) as Record<string, unknown>).map(
        ([playerId, score]) => [playerId, Number(score ?? 0)]
      )
    ),
    totalSpotCount: Number(state.total_spot_count ?? scene.spots.length),
    winnerPlayerIds: Array.isArray(state.winner_player_ids)
      ? state.winner_player_ids.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : []
  };
}

function parseClaim(value: unknown): SpotRaceClaimView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const claim = value as Record<string, unknown>;
  if (
    typeof claim.claimedAt !== "string" ||
    typeof claim.playerId !== "string" ||
    typeof claim.spotId !== "string"
  ) {
    return null;
  }

  return {
    claimedAt: claim.claimedAt,
    playerId: claim.playerId,
    spotId: claim.spotId,
    status: claim.status === "duplicate" ? "duplicate" : "claimed"
  };
}
