import type { GameStateSnapshot } from "@wifi-portal/game-sdk";

export type SignalNodeView = {
  accent: "amber" | "mint" | "sea" | "violet";
  id: string;
  label: string;
  points: number;
  ring: "inner" | "mid" | "outer";
};

export type SignalActivationView = {
  nodeId: string;
  playerId: string;
  progressAfter: number;
  seq: number;
  status: "accepted" | "ignored";
  submittedAt: string;
};

export type SignalScrambleViewState = {
  activatedNodeIdsByPlayer: Record<string, string[]>;
  completedAtByPlayer: Record<string, string | null>;
  isCompleted: boolean;
  lastActivation: SignalActivationView | null;
  nextTargetByPlayer: Record<string, string | null>;
  players: string[];
  progressByPlayer: Record<string, number>;
  scores: Record<string, number>;
  signalNodes: SignalNodeView[];
  targetSequence: string[];
  winnerPlayerIds: string[];
};

export function parseSignalScrambleState(
  snapshot: GameStateSnapshot
): SignalScrambleViewState | null {
  const state = snapshot.state as Record<string, unknown>;
  const signalNodes = Array.isArray(state.signal_nodes)
    ? state.signal_nodes
        .map((node) => {
          const candidate = node as Record<string, unknown>;
          if (
            typeof candidate.id !== "string" ||
            typeof candidate.label !== "string" ||
            typeof candidate.points !== "number" ||
            (candidate.accent !== "amber" &&
              candidate.accent !== "mint" &&
              candidate.accent !== "sea" &&
              candidate.accent !== "violet") ||
            (candidate.ring !== "inner" &&
              candidate.ring !== "mid" &&
              candidate.ring !== "outer")
          ) {
            return null;
          }

          return {
            accent: candidate.accent,
            id: candidate.id,
            label: candidate.label,
            points: candidate.points,
            ring: candidate.ring
          } satisfies SignalNodeView;
        })
        .filter((node): node is SignalNodeView => node !== null)
    : [];

  if (signalNodes.length === 0) {
    return null;
  }

  return {
    activatedNodeIdsByPlayer: Object.fromEntries(
      Object.entries(
        (state.activated_node_ids_by_player ?? {}) as Record<string, unknown>
      ).map(([playerId, nodeIds]) => [
        playerId,
        Array.isArray(nodeIds)
          ? nodeIds.filter((nodeId): nodeId is string => typeof nodeId === "string")
          : []
      ])
    ),
    completedAtByPlayer: Object.fromEntries(
      Object.entries(
        (state.completed_at_by_player ?? {}) as Record<string, unknown>
      ).map(([playerId, completedAt]) => [
        playerId,
        typeof completedAt === "string" ? completedAt : null
      ])
    ),
    isCompleted: Boolean(state.is_completed),
    lastActivation: parseActivation(state.last_activation),
    nextTargetByPlayer: Object.fromEntries(
      Object.entries((state.next_target_by_player ?? {}) as Record<string, unknown>).map(
        ([playerId, nodeId]) => [playerId, typeof nodeId === "string" ? nodeId : null]
      )
    ),
    players: Array.isArray(state.players)
      ? state.players.filter((playerId): playerId is string => typeof playerId === "string")
      : [],
    progressByPlayer: Object.fromEntries(
      Object.entries((state.progress_by_player ?? {}) as Record<string, unknown>).map(
        ([playerId, progress]) => [playerId, Number(progress ?? 0)]
      )
    ),
    scores: Object.fromEntries(
      Object.entries((state.scores ?? {}) as Record<string, unknown>).map(
        ([playerId, score]) => [playerId, Number(score ?? 0)]
      )
    ),
    signalNodes,
    targetSequence: Array.isArray(state.target_sequence)
      ? state.target_sequence.filter((nodeId): nodeId is string => typeof nodeId === "string")
      : [],
    winnerPlayerIds: Array.isArray(state.winner_player_ids)
      ? state.winner_player_ids.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : []
  };
}

function parseActivation(value: unknown): SignalActivationView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.nodeId !== "string" ||
    typeof candidate.playerId !== "string" ||
    typeof candidate.progressAfter !== "number" ||
    typeof candidate.seq !== "number" ||
    typeof candidate.submittedAt !== "string" ||
    (candidate.status !== "accepted" && candidate.status !== "ignored")
  ) {
    return null;
  }

  return {
    nodeId: candidate.nodeId,
    playerId: candidate.playerId,
    progressAfter: candidate.progressAfter,
    seq: candidate.seq,
    status: candidate.status,
    submittedAt: candidate.submittedAt
  };
}
