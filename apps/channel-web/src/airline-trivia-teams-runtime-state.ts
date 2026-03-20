import type { GameStateSnapshot } from "@wifi-portal/game-sdk";

export type AirlineTriviaChoice = "A" | "B" | "C" | "D";
export type AirlineTriviaTeamId = "team-a" | "team-b";

type AirlineTriviaOption = {
  description: string;
  id: AirlineTriviaChoice;
  label: string;
};

type AirlineTriviaAnswer = {
  answer: AirlineTriviaChoice;
  playerId: string;
  seq: number;
  submittedAt: string;
  teamId: AirlineTriviaTeamId;
};

export type AirlineTriviaRoundResult = {
  answersByPlayer: Record<string, AirlineTriviaChoice | null>;
  completedAt: string;
  correctAnswer: AirlineTriviaChoice;
  promptId: string;
  promptTitle: string;
  roundNumber: number;
  scoresSnapshot: Record<string, number>;
  teamScoresSnapshot: Record<AirlineTriviaTeamId, number>;
  winningPlayerIds: string[];
  winningTeamIds: AirlineTriviaTeamId[];
};

export type AirlineTriviaTeamsViewState = {
  allPlayersAnswered: boolean;
  answerCount: number;
  answersByPlayer: Record<string, AirlineTriviaChoice | null>;
  completedRoundCount: number;
  currentRoundNumber: number;
  isCompleted: boolean;
  lastCompletedRound: AirlineTriviaRoundResult | null;
  playerTeams: Record<string, AirlineTriviaTeamId>;
  prompt: {
    body: string;
    id: string;
    options: AirlineTriviaOption[];
    title: string;
  };
  recentAnswers: AirlineTriviaAnswer[];
  roundHistory: AirlineTriviaRoundResult[];
  scores: Record<string, number>;
  teamScores: Record<AirlineTriviaTeamId, number>;
  totalRounds: number;
  winningPlayerIds: string[];
  winningTeamIds: AirlineTriviaTeamId[];
};

const QUIZ_CHOICES = ["A", "B", "C", "D"] as const;

export function parseAirlineTriviaTeamsState(
  snapshot: GameStateSnapshot
): AirlineTriviaTeamsViewState | null {
  const state = snapshot.state as Record<string, unknown>;
  const prompt = state.prompt as Record<string, unknown> | undefined;
  const options = Array.isArray(prompt?.options)
    ? prompt.options
        .map((option) => {
          const candidate = option as Record<string, unknown>;
          const id = candidate.id;
          if (!isQuizChoice(id)) {
            return null;
          }

          return {
            description: String(candidate.description ?? ""),
            id,
            label: String(candidate.label ?? id)
          };
        })
        .filter((value): value is AirlineTriviaOption => value !== null)
    : [];

  if (
    typeof prompt?.title !== "string" ||
    typeof prompt?.body !== "string" ||
    typeof prompt?.id !== "string" ||
    options.length === 0
  ) {
    return null;
  }

  return {
    allPlayersAnswered: Boolean(state.all_players_answered),
    answerCount: Number(state.answer_count ?? 0),
    answersByPlayer: Object.fromEntries(
      Object.entries((state.answers_by_player ?? {}) as Record<string, unknown>).map(
        ([playerId, answer]) => [playerId, isQuizChoice(answer) ? answer : null]
      )
    ) as Record<string, AirlineTriviaChoice | null>,
    completedRoundCount: Number(state.completed_round_count ?? 0),
    currentRoundNumber: Number(state.current_round_number ?? 1),
    isCompleted: Boolean(state.is_completed),
    lastCompletedRound: parseRoundResult(state.last_completed_round),
    playerTeams: Object.fromEntries(
      Object.entries((state.player_teams ?? {}) as Record<string, unknown>).flatMap(
        ([playerId, teamId]) =>
          teamId === "team-a" || teamId === "team-b" ? [[playerId, teamId]] : []
      )
    ) as Record<string, AirlineTriviaTeamId>,
    prompt: {
      body: prompt.body,
      id: prompt.id,
      options,
      title: prompt.title
    },
    recentAnswers: Array.isArray(state.recent_answers)
      ? state.recent_answers
          .map((entry) => {
            const answer = entry as Record<string, unknown>;
            if (
              !isQuizChoice(answer.answer) ||
              typeof answer.playerId !== "string" ||
              typeof answer.seq !== "number" ||
              typeof answer.submittedAt !== "string" ||
              (answer.teamId !== "team-a" && answer.teamId !== "team-b")
            ) {
              return null;
            }

            return {
              answer: answer.answer,
              playerId: answer.playerId,
              seq: answer.seq,
              submittedAt: answer.submittedAt,
              teamId: answer.teamId
            } satisfies AirlineTriviaAnswer;
          })
          .filter((value): value is AirlineTriviaAnswer => value !== null)
      : [],
    roundHistory: Array.isArray(state.round_history)
      ? state.round_history
          .map((entry) => parseRoundResult(entry))
          .filter((value): value is AirlineTriviaRoundResult => value !== null)
      : [],
    scores: Object.fromEntries(
      Object.entries((state.scores ?? {}) as Record<string, unknown>).map(
        ([playerId, score]) => [playerId, Number(score ?? 0)]
      )
    ),
    teamScores: {
      "team-a": Number((state.team_scores as Record<string, unknown> | undefined)?.["team-a"] ?? 0),
      "team-b": Number((state.team_scores as Record<string, unknown> | undefined)?.["team-b"] ?? 0)
    },
    totalRounds: Number(state.total_rounds ?? 1),
    winningPlayerIds: Array.isArray(state.winning_player_ids)
      ? state.winning_player_ids.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : [],
    winningTeamIds: Array.isArray(state.winning_team_ids)
      ? state.winning_team_ids.filter(
          (teamId): teamId is AirlineTriviaTeamId => teamId === "team-a" || teamId === "team-b"
        )
      : []
  };
}

function parseRoundResult(value: unknown): AirlineTriviaRoundResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as Record<string, unknown>;
  const prompt = entry.prompt as Record<string, unknown> | undefined;
  const answers = Array.isArray(entry.answers)
    ? entry.answers
        .map((answer) => {
          const candidate = answer as Record<string, unknown>;
          if (
            !isQuizChoice(candidate.answer) ||
            typeof candidate.playerId !== "string"
          ) {
            return null;
          }

          return {
            answer: candidate.answer,
            playerId: candidate.playerId
          };
        })
        .filter((answer): answer is { answer: AirlineTriviaChoice; playerId: string } => answer !== null)
    : [];

  if (
    !isQuizChoice(entry.correctAnswer) ||
    typeof prompt?.id !== "string" ||
    typeof prompt?.title !== "string" ||
    typeof entry.roundNumber !== "number" ||
    typeof entry.completedAt !== "string"
  ) {
    return null;
  }

  return {
    answersByPlayer: Object.fromEntries(
      answers.map((answer) => [answer.playerId, answer.answer])
    ) as Record<string, AirlineTriviaChoice | null>,
    completedAt: entry.completedAt,
    correctAnswer: entry.correctAnswer,
    promptId: prompt.id,
    promptTitle: prompt.title,
    roundNumber: entry.roundNumber,
    scoresSnapshot: Object.fromEntries(
      Object.entries((entry.scoresSnapshot ?? {}) as Record<string, unknown>).map(
        ([playerId, score]) => [playerId, Number(score ?? 0)]
      )
    ),
    teamScoresSnapshot: {
      "team-a": Number((entry.teamScoresSnapshot as Record<string, unknown> | undefined)?.["team-a"] ?? 0),
      "team-b": Number((entry.teamScoresSnapshot as Record<string, unknown> | undefined)?.["team-b"] ?? 0)
    },
    winningPlayerIds: Array.isArray(entry.winningPlayerIds)
      ? entry.winningPlayerIds.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : [],
    winningTeamIds: Array.isArray(entry.winningTeamIds)
      ? entry.winningTeamIds.filter(
          (teamId): teamId is AirlineTriviaTeamId => teamId === "team-a" || teamId === "team-b"
        )
      : []
  };
}

function isQuizChoice(value: unknown): value is AirlineTriviaChoice {
  return typeof value === "string" && QUIZ_CHOICES.includes(value as (typeof QUIZ_CHOICES)[number]);
}
