import { Inject, Injectable } from "@nestjs/common";

import {
  type GameAdapter,
  type GameEventEnvelope,
  type GameStateSnapshot
} from "@wifi-portal/game-sdk";

import {
  AirlineTriviaTeamsStateRepository,
  type AirlineTriviaChoice,
  type AirlineTriviaPrompt,
  type AirlineTriviaRoundResult,
  type AirlineTriviaTeamId,
  type AirlineTriviaTeamsRoomState
} from "../repositories/airline-trivia-teams-state.repository";

type TriviaPromptDefinition = {
  correctAnswer: AirlineTriviaChoice;
  prompt: AirlineTriviaPrompt;
};

const TEAM_IDS: AirlineTriviaTeamId[] = ["team-a", "team-b"];
const PROMPT_DECK: TriviaPromptDefinition[] = [
  {
    correctAnswer: "B",
    prompt: {
      body:
        "A flight is delayed and a tight-connection passenger arrives first at the desk. Which response best reflects a premium recovery flow?",
      id: "airline-trivia-001",
      options: [
        { description: "Ask them to queue again after boarding ends.", id: "A", label: "Delay queue" },
        { description: "Prioritize reaccommodation and onward transfer options.", id: "B", label: "Fast reaccommodation" },
        { description: "Offer Wi-Fi only and no itinerary guidance.", id: "C", label: "Wi-Fi only" },
        { description: "Close the desk to avoid crowding.", id: "D", label: "Close desk" }
      ],
      title: "Irregular Ops Recovery"
    }
  },
  {
    correctAnswer: "D",
    prompt: {
      body:
        "Which lounge perk is most aligned with a premium long-haul product expectation before departure?",
      id: "airline-trivia-002",
      options: [
        { description: "Standing-room-only snack shelf.", id: "A", label: "Quick shelf" },
        { description: "Single queue for all disruptions.", id: "B", label: "Common queue" },
        { description: "Boarding gate coupons handed out ad hoc.", id: "C", label: "Coupon desk" },
        { description: "Quiet seating, showers, and proactive rebooking support.", id: "D", label: "Full-service lounge" }
      ],
      title: "Premium Ground Experience"
    }
  },
  {
    correctAnswer: "A",
    prompt: {
      body:
        "For airline Wi-Fi entertainment, what is the strongest reason to prefer lightweight web games over heavy native installs?",
      id: "airline-trivia-003",
      options: [
        { description: "They launch instantly inside captive portal and WebView constraints.", id: "A", label: "Portal-friendly launch" },
        { description: "They require no product analytics.", id: "B", label: "No analytics" },
        { description: "They remove all backend needs.", id: "C", label: "No backend" },
        { description: "They guarantee zero support issues.", id: "D", label: "Zero support" }
      ],
      title: "Portal Product Fit"
    }
  }
];

@Injectable()
export class AirlineTriviaTeamsAdapter implements GameAdapter {
  readonly gameId = "airline-trivia-teams";

  constructor(
    @Inject(AirlineTriviaTeamsStateRepository)
    private readonly stateRepository: AirlineTriviaTeamsStateRepository
  ) {}

  async createMatch(roomId: string, hostPlayerId: string) {
    const firstRound = this.getRoundDefinition(1);
    const now = new Date().toISOString();

    await this.stateRepository.set(roomId, {
      answers: [],
      answersByPlayer: {
        [hostPlayerId]: null
      },
      completedRounds: [],
      correctAnswer: firstRound.correctAnswer,
      currentRoundNumber: 1,
      isCompleted: false,
      lastSeqByPlayer: {
        [hostPlayerId]: -1
      },
      playerTeams: {
        [hostPlayerId]: "team-a"
      },
      players: [hostPlayerId],
      prompt: firstRound.prompt,
      revision: 1,
      scores: {
        [hostPlayerId]: 0
      },
      teamScores: {
        "team-a": 0,
        "team-b": 0
      },
      totalRounds: PROMPT_DECK.length,
      updatedAt: now
    });
  }

  async joinMatch(roomId: string, playerId: string) {
    const room = await this.getRoom(roomId);
    if (room.players.includes(playerId)) {
      return;
    }

    room.players.push(playerId);
    room.answersByPlayer[playerId] = null;
    room.lastSeqByPlayer[playerId] = -1;
    room.playerTeams[playerId] = getAssignedTeam(room.players.length - 1);
    room.scores[playerId] = 0;
    this.bumpRevision(room);
    await this.stateRepository.set(roomId, room);
  }

  async handlePlayerAction(event: GameEventEnvelope) {
    const room = await this.getRoom(event.roomId);
    const answer = this.parseAnswer(event.payload.answer);
    const previousSeq = room.lastSeqByPlayer[event.playerId] ?? -1;

    if (event.seq <= previousSeq) {
      return;
    }

    if (room.answersByPlayer[event.playerId]) {
      room.lastSeqByPlayer[event.playerId] = event.seq;
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    room.lastSeqByPlayer[event.playerId] = event.seq;
    room.answersByPlayer[event.playerId] = answer;
    room.answers.push({
      answer,
      playerId: event.playerId,
      seq: event.seq,
      submittedAt: new Date().toISOString(),
      teamId: room.playerTeams[event.playerId] ?? "team-a"
    });

    if (answer === room.correctAnswer) {
      room.scores[event.playerId] = (room.scores[event.playerId] ?? 0) + 6;
      const teamId = room.playerTeams[event.playerId] ?? "team-a";
      room.teamScores[teamId] = (room.teamScores[teamId] ?? 0) + 1;
    }

    if (room.players.every((playerId) => room.answersByPlayer[playerId] !== null)) {
      this.completeRound(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

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
        all_players_answered: room.players.every(
          (playerId) => room.answersByPlayer[playerId] !== null
        ),
        answer_count: room.answers.length,
        answers_by_player: room.answersByPlayer,
        completed_round_count: room.completedRounds.length,
        current_round_number: room.currentRoundNumber,
        is_completed: room.isCompleted,
        last_answer: room.answers.length === 0 ? null : room.answers[room.answers.length - 1],
        last_completed_round:
          room.completedRounds.length === 0 ? null : room.completedRounds[room.completedRounds.length - 1],
        player_teams: room.playerTeams,
        players: room.players,
        prompt: room.prompt,
        prompt_id: room.prompt.id,
        recent_answers: room.answers.slice(-8).reverse(),
        round_history: room.completedRounds.slice(-3).reverse(),
        scores: room.scores,
        team_scores: room.teamScores,
        total_rounds: room.totalRounds,
        winning_player_ids: this.getWinningPlayerIds(room),
        winning_team_ids: this.getWinningTeamIds(room)
      },
      updatedAt: room.updatedAt
    };
  }

  async reconnectPlayer(roomId: string, playerId: string) {
    const room = await this.getRoom(roomId);
    room.answersByPlayer[playerId] = room.answersByPlayer[playerId] ?? null;
    room.scores[playerId] = room.scores[playerId] ?? 0;
    room.lastSeqByPlayer[playerId] = room.lastSeqByPlayer[playerId] ?? -1;
    if (!room.players.includes(playerId)) {
      room.players.push(playerId);
    }
    room.playerTeams[playerId] =
      room.playerTeams[playerId] ?? getAssignedTeam(room.players.indexOf(playerId));
    this.bumpRevision(room);
    await this.stateRepository.set(roomId, room);
  }

  async finishMatch(roomId: string) {
    await this.stateRepository.delete(roomId);
  }

  private async getRoom(roomId: string) {
    const room = await this.stateRepository.get(roomId);
    if (!room) {
      throw new Error(`Airline Trivia Teams room not found: ${roomId}`);
    }
    return room;
  }

  private parseAnswer(value: unknown): AirlineTriviaChoice {
    if (value === "A" || value === "B" || value === "C" || value === "D") {
      return value;
    }
    throw new Error("Airline Trivia Teams expects payload.answer to be one of A, B, C, D");
  }

  private getWinningTeamIds(room: AirlineTriviaTeamsRoomState) {
    const highestScore = Math.max(...Object.values(room.teamScores));
    return TEAM_IDS.filter((teamId) => room.teamScores[teamId] === highestScore);
  }

  private getWinningPlayerIds(room: AirlineTriviaTeamsRoomState) {
    const winningTeams = new Set(this.getWinningTeamIds(room));
    return room.players.filter((playerId) => winningTeams.has(room.playerTeams[playerId] ?? "team-a"));
  }

  private completeRound(room: AirlineTriviaTeamsRoomState) {
    const completedRound: AirlineTriviaRoundResult = {
      answers: [...room.answers],
      completedAt: new Date().toISOString(),
      correctAnswer: room.correctAnswer,
      prompt: room.prompt,
      roundNumber: room.currentRoundNumber,
      scoresSnapshot: { ...room.scores },
      teamScoresSnapshot: { ...room.teamScores },
      winningPlayerIds: this.getWinningPlayerIds(room),
      winningTeamIds: this.getWinningTeamIds(room)
    };

    room.completedRounds.push(completedRound);

    if (room.currentRoundNumber >= room.totalRounds) {
      room.isCompleted = true;
      this.bumpRevision(room);
      return;
    }

    const nextRoundNumber = room.currentRoundNumber + 1;
    const nextRound = this.getRoundDefinition(nextRoundNumber);

    room.answers = [];
    room.answersByPlayer = Object.fromEntries(
      room.players.map((playerId) => [playerId, null])
    ) as Record<string, AirlineTriviaChoice | null>;
    room.correctAnswer = nextRound.correctAnswer;
    room.currentRoundNumber = nextRoundNumber;
    room.prompt = nextRound.prompt;
    room.isCompleted = false;

    this.bumpRevision(room);
  }

  private bumpRevision(room: AirlineTriviaTeamsRoomState) {
    room.revision += 1;
    room.updatedAt = new Date().toISOString();
  }

  private getRoundDefinition(roundNumber: number) {
    const definition = PROMPT_DECK[roundNumber - 1];
    if (!definition) {
      throw new Error(`Airline Trivia Teams prompt missing for round ${roundNumber}`);
    }
    return definition;
  }
}

function getAssignedTeam(playerIndex: number): AirlineTriviaTeamId {
  return TEAM_IDS[playerIndex % TEAM_IDS.length] ?? "team-a";
}
