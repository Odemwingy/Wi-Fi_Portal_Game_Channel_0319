import type { GameStateSnapshot } from "@wifi-portal/game-sdk";

export type SkylineDefenseTypeView = "barrier" | "interceptor" | "pulse";
export type SkylineDistrictView = "harbor" | "midtown" | "runway";
export type SkylineThreatTypeView = "drone" | "storm" | "traffic";

export type SkylineDefenseNodeView = {
  baseScore: number;
  defenseType: SkylineDefenseTypeView | null;
  district: SkylineDistrictView;
  label: string;
  nodeId: string;
  ownerPlayerId: string | null;
  threatType: SkylineThreatTypeView;
};

export type SkylineDefenseMoveView = {
  defenseType: SkylineDefenseTypeView;
  district: SkylineDistrictView;
  districtControlBonus: number;
  nodeId: string;
  playerId: string;
  pointsAwarded: number;
  selectedAt: string;
  seq: number;
  threatMatchBonus: number;
};

export type SkylineDefenseLiteViewState = {
  availableNodeCount: number;
  currentTurnPlayerId: string;
  defenseLoadout: SkylineDefenseTypeView[];
  districtControlByPlayer: Record<string, SkylineDistrictView[]>;
  isCompleted: boolean;
  lastMove: SkylineDefenseMoveView | null;
  moves: SkylineDefenseMoveView[];
  nodes: SkylineDefenseNodeView[];
  playerBadges: Record<string, "ALT" | "SKY">;
  players: string[];
  scores: Record<string, number>;
  winnerPlayerIds: string[];
};

export function parseSkylineDefenseLiteState(
  snapshot: GameStateSnapshot
): SkylineDefenseLiteViewState | null {
  const state = snapshot.state as Record<string, unknown>;
  const nodes = Array.isArray(state.nodes)
    ? state.nodes
        .map((node) => {
          const candidate = node as Record<string, unknown>;
          if (
            typeof candidate.baseScore !== "number" ||
            typeof candidate.label !== "string" ||
            typeof candidate.nodeId !== "string" ||
            (candidate.district !== "harbor" &&
              candidate.district !== "midtown" &&
              candidate.district !== "runway") ||
            (candidate.threatType !== "drone" &&
              candidate.threatType !== "storm" &&
              candidate.threatType !== "traffic")
          ) {
            return null;
          }

          return {
            baseScore: candidate.baseScore,
            defenseType:
              candidate.defenseType === "barrier" ||
              candidate.defenseType === "interceptor" ||
              candidate.defenseType === "pulse"
                ? candidate.defenseType
                : null,
            district: candidate.district,
            label: candidate.label,
            nodeId: candidate.nodeId,
            ownerPlayerId:
              typeof candidate.ownerPlayerId === "string" ? candidate.ownerPlayerId : null,
            threatType: candidate.threatType
          } satisfies SkylineDefenseNodeView;
        })
        .filter((node): node is SkylineDefenseNodeView => node !== null)
    : [];

  if (nodes.length === 0) {
    return null;
  }

  return {
    availableNodeCount: Number(state.available_node_count ?? 0),
    currentTurnPlayerId: String(state.current_turn_player_id ?? ""),
    defenseLoadout: Array.isArray(state.defense_loadout)
      ? state.defense_loadout.filter(
          (item): item is SkylineDefenseTypeView =>
            item === "barrier" || item === "interceptor" || item === "pulse"
        )
      : [],
    districtControlByPlayer: Object.fromEntries(
      Object.entries(
        (state.district_control_by_player ?? {}) as Record<string, unknown>
      ).map(([playerId, districts]) => [
        playerId,
        Array.isArray(districts)
          ? districts.filter(
              (district): district is SkylineDistrictView =>
                district === "harbor" || district === "midtown" || district === "runway"
            )
          : []
      ])
    ),
    isCompleted: Boolean(state.is_completed),
    lastMove: parseMove(state.last_move),
    moves: Array.isArray(state.moves)
      ? state.moves
          .map((move) => parseMove(move))
          .filter((move): move is SkylineDefenseMoveView => move !== null)
      : [],
    nodes,
    playerBadges: Object.fromEntries(
      Object.entries((state.player_badges ?? {}) as Record<string, unknown>).flatMap(
        ([playerId, badge]) =>
          badge === "ALT" || badge === "SKY" ? [[playerId, badge]] : []
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
    winnerPlayerIds: Array.isArray(state.winner_player_ids)
      ? state.winner_player_ids.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : []
  };
}

function parseMove(value: unknown): SkylineDefenseMoveView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    (candidate.defenseType !== "barrier" &&
      candidate.defenseType !== "interceptor" &&
      candidate.defenseType !== "pulse") ||
    (candidate.district !== "harbor" &&
      candidate.district !== "midtown" &&
      candidate.district !== "runway") ||
    typeof candidate.districtControlBonus !== "number" ||
    typeof candidate.nodeId !== "string" ||
    typeof candidate.playerId !== "string" ||
    typeof candidate.pointsAwarded !== "number" ||
    typeof candidate.selectedAt !== "string" ||
    typeof candidate.seq !== "number" ||
    typeof candidate.threatMatchBonus !== "number"
  ) {
    return null;
  }

  return {
    defenseType: candidate.defenseType,
    district: candidate.district,
    districtControlBonus: candidate.districtControlBonus,
    nodeId: candidate.nodeId,
    playerId: candidate.playerId,
    pointsAwarded: candidate.pointsAwarded,
    selectedAt: candidate.selectedAt,
    seq: candidate.seq,
    threatMatchBonus: candidate.threatMatchBonus
  };
}
