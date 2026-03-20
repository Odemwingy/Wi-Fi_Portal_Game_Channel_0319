import type { GameStateSnapshot } from "@wifi-portal/game-sdk";

export type CrewRoleView = "cabin" | "captain" | "galley" | "purser";
export type CrewZoneView = "aft" | "cockpit" | "forward" | "mid";

export type CrewTaskView = {
  baseScore: number;
  detail: string;
  ownerPlayerId: string | null;
  role: CrewRoleView;
  taskId: string;
  title: string;
  zone: CrewZoneView;
};

export type CrewMoveView = {
  playerId: string;
  pointsAwarded: number;
  relayBonus: number;
  role: CrewRoleView;
  roleMatchBonus: number;
  selectedAt: string;
  seq: number;
  taskId: string;
  zone: CrewZoneView;
};

export type CrewCoordinationViewState = {
  availableTaskCount: number;
  currentTurnPlayerId: string;
  isCompleted: boolean;
  lastMove: CrewMoveView | null;
  missionStatus: "needs-review" | "ready" | "successful";
  moves: CrewMoveView[];
  playerRoles: Record<string, CrewRoleView>;
  playerScores: Record<string, number>;
  players: string[];
  targetScore: number;
  tasks: CrewTaskView[];
  teamScore: number;
  winnerPlayerIds: string[];
};

export function parseCrewCoordinationState(
  snapshot: GameStateSnapshot
): CrewCoordinationViewState | null {
  const state = snapshot.state as Record<string, unknown>;
  const tasks = Array.isArray(state.tasks)
    ? state.tasks
        .map((task) => {
          const candidate = task as Record<string, unknown>;
          if (
            typeof candidate.baseScore !== "number" ||
            typeof candidate.detail !== "string" ||
            typeof candidate.taskId !== "string" ||
            typeof candidate.title !== "string" ||
            !isCrewRole(candidate.role) ||
            !isCrewZone(candidate.zone)
          ) {
            return null;
          }

          return {
            baseScore: candidate.baseScore,
            detail: candidate.detail,
            ownerPlayerId:
              typeof candidate.ownerPlayerId === "string" ? candidate.ownerPlayerId : null,
            role: candidate.role,
            taskId: candidate.taskId,
            title: candidate.title,
            zone: candidate.zone
          } satisfies CrewTaskView;
        })
        .filter((task): task is CrewTaskView => task !== null)
    : [];

  if (tasks.length === 0) {
    return null;
  }

  return {
    availableTaskCount: Number(state.available_task_count ?? 0),
    currentTurnPlayerId: String(state.current_turn_player_id ?? ""),
    isCompleted: Boolean(state.is_completed),
    lastMove: parseMove(state.last_move),
    missionStatus: isMissionStatus(state.mission_status) ? state.mission_status : "ready",
    moves: Array.isArray(state.moves)
      ? state.moves
          .map((move) => parseMove(move))
          .filter((move): move is CrewMoveView => move !== null)
      : [],
    playerRoles: Object.fromEntries(
      Object.entries((state.player_roles ?? {}) as Record<string, unknown>).flatMap(
        ([playerId, role]) => (isCrewRole(role) ? [[playerId, role]] : [])
      )
    ),
    playerScores: Object.fromEntries(
      Object.entries((state.player_scores ?? {}) as Record<string, unknown>).map(
        ([playerId, score]) => [playerId, Number(score ?? 0)]
      )
    ),
    players: Array.isArray(state.players)
      ? state.players.filter((playerId): playerId is string => typeof playerId === "string")
      : [],
    targetScore: Number(state.target_score ?? 0),
    tasks,
    teamScore: Number(state.team_score ?? 0),
    winnerPlayerIds: Array.isArray(state.winner_player_ids)
      ? state.winner_player_ids.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : []
  };
}

function parseMove(value: unknown): CrewMoveView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.playerId !== "string" ||
    typeof candidate.pointsAwarded !== "number" ||
    typeof candidate.relayBonus !== "number" ||
    !isCrewRole(candidate.role) ||
    typeof candidate.roleMatchBonus !== "number" ||
    typeof candidate.selectedAt !== "string" ||
    typeof candidate.seq !== "number" ||
    typeof candidate.taskId !== "string" ||
    !isCrewZone(candidate.zone)
  ) {
    return null;
  }

  return {
    playerId: candidate.playerId,
    pointsAwarded: candidate.pointsAwarded,
    relayBonus: candidate.relayBonus,
    role: candidate.role,
    roleMatchBonus: candidate.roleMatchBonus,
    selectedAt: candidate.selectedAt,
    seq: candidate.seq,
    taskId: candidate.taskId,
    zone: candidate.zone
  };
}

function isCrewRole(value: unknown): value is CrewRoleView {
  return value === "cabin" || value === "captain" || value === "galley" || value === "purser";
}

function isCrewZone(value: unknown): value is CrewZoneView {
  return value === "aft" || value === "cockpit" || value === "forward" || value === "mid";
}

function isMissionStatus(value: unknown): value is CrewCoordinationViewState["missionStatus"] {
  return value === "needs-review" || value === "ready" || value === "successful";
}
