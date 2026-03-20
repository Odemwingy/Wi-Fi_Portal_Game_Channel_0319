import { Inject, Injectable } from "@nestjs/common";

import {
  type GameAdapter,
  type GameEventEnvelope,
  type GameStateSnapshot
} from "@wifi-portal/game-sdk";

import {
  CrewCoordinationStateRepository,
  type CrewCoordinationRoomState,
  type CrewMove,
  type CrewRole,
  type CrewTask
} from "../repositories/crew-coordination-state.repository";

const PLAYER_ROLE_ORDER: CrewRole[] = ["captain", "purser", "galley", "cabin"];
const MISSION_TARGET_SCORE = 36;
const CREW_TASK_BLUEPRINTS: Omit<CrewTask, "ownerPlayerId">[] = [
  {
    baseScore: 4,
    detail: "Align departure brief, route note, and turbulence fallback plan.",
    role: "captain",
    taskId: "task-preflight-brief",
    title: "Preflight Brief",
    zone: "cockpit"
  },
  {
    baseScore: 3,
    detail: "Confirm priority passengers and special-service handoff at door 1L.",
    role: "purser",
    taskId: "task-welcome-manifest",
    title: "Welcome Manifest",
    zone: "forward"
  },
  {
    baseScore: 3,
    detail: "Balance beverage cart, ice draw, and amenity packs before taxi.",
    role: "galley",
    taskId: "task-galley-stock",
    title: "Galley Stock",
    zone: "forward"
  },
  {
    baseScore: 4,
    detail: "Scan seatbelt, handset, and overhead-bin readiness across main cabin.",
    role: "cabin",
    taskId: "task-aisle-safety",
    title: "Aisle Safety Sweep",
    zone: "mid"
  },
  {
    baseScore: 3,
    detail: "Verify aft cabin boarding, lavatory release, and call-bell response lane.",
    role: "cabin",
    taskId: "task-aft-cabin-check",
    title: "Aft Cabin Check",
    zone: "aft"
  },
  {
    baseScore: 4,
    detail: "Reset meal sequencing and service cadence for second service window.",
    role: "galley",
    taskId: "task-meal-reset",
    title: "Meal Service Reset",
    zone: "aft"
  },
  {
    baseScore: 5,
    detail: "Update turbulence script and arrival runway note with cabin leadership.",
    role: "captain",
    taskId: "task-turbulence-script",
    title: "Turbulence Script",
    zone: "cockpit"
  },
  {
    baseScore: 4,
    detail: "Coordinate descent cabin secure flow and premium-cabin final walkthrough.",
    role: "purser",
    taskId: "task-arrival-secure",
    title: "Arrival Secure",
    zone: "mid"
  }
];

@Injectable()
export class CrewCoordinationAdapter implements GameAdapter {
  readonly gameId = "crew-coordination";

  constructor(
    @Inject(CrewCoordinationStateRepository)
    private readonly stateRepository: CrewCoordinationStateRepository
  ) {}

  async createMatch(roomId: string, hostPlayerId: string) {
    const now = new Date().toISOString();

    await this.stateRepository.set(roomId, {
      currentTurnPlayerId: hostPlayerId,
      isCompleted: false,
      lastMove: null,
      lastSeqByPlayer: {
        [hostPlayerId]: -1
      },
      missionStatus: "ready",
      moves: [],
      playerRoles: {
        [hostPlayerId]: "captain"
      },
      playerScores: {
        [hostPlayerId]: 0
      },
      players: [hostPlayerId],
      revision: 1,
      targetScore: MISSION_TARGET_SCORE,
      tasks: createCrewTasks(),
      teamScore: 0,
      updatedAt: now,
      winnerPlayerIds: []
    });
  }

  async joinMatch(roomId: string, playerId: string) {
    const room = await this.getRoom(roomId);
    if (room.players.includes(playerId)) {
      return;
    }

    room.players.push(playerId);
    room.lastSeqByPlayer[playerId] = -1;
    room.playerRoles[playerId] = room.playerRoles[playerId] ?? getNextRole(room.playerRoles);
    room.playerScores[playerId] = room.playerScores[playerId] ?? 0;
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

    if (
      room.isCompleted ||
      room.currentTurnPlayerId !== event.playerId ||
      room.players.length < 2
    ) {
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    const taskId = this.parseTaskId(event.payload.taskId);
    const task = room.tasks.find((entry) => entry.taskId === taskId);

    if (!task || task.ownerPlayerId) {
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    const assignedRole = room.playerRoles[event.playerId] ?? "cabin";
    const roleMatchBonus = assignedRole === task.role ? 2 : 0;
    const relayBonus =
      room.lastMove && room.lastMove.playerId !== event.playerId && room.lastMove.zone !== task.zone
        ? 1
        : 0;
    const pointsAwarded = task.baseScore + roleMatchBonus + relayBonus;

    task.ownerPlayerId = event.playerId;
    room.teamScore += pointsAwarded;
    room.playerScores[event.playerId] = (room.playerScores[event.playerId] ?? 0) + pointsAwarded;
    room.lastMove = {
      playerId: event.playerId,
      pointsAwarded,
      relayBonus,
      role: task.role,
      roleMatchBonus,
      selectedAt: new Date().toISOString(),
      seq: event.seq,
      taskId,
      zone: task.zone
    } satisfies CrewMove;
    room.moves.unshift(room.lastMove);
    room.moves = room.moves.slice(0, CREW_TASK_BLUEPRINTS.length);

    if (room.tasks.every((entry) => entry.ownerPlayerId !== null)) {
      room.isCompleted = true;
      room.missionStatus =
        room.teamScore >= room.targetScore ? "successful" : "needs-review";
      room.winnerPlayerIds =
        room.missionStatus === "successful" ? [...room.players] : [];
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
        available_task_count: room.tasks.filter((task) => task.ownerPlayerId === null).length,
        current_turn_player_id: room.currentTurnPlayerId,
        is_completed: room.isCompleted,
        last_move: room.lastMove,
        mission_status: room.missionStatus,
        moves: room.moves.slice(0, 10),
        player_roles: room.playerRoles,
        player_scores: room.playerScores,
        players: room.players,
        target_score: room.targetScore,
        tasks: room.tasks,
        team_score: room.teamScore,
        winner_player_ids: room.winnerPlayerIds
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
    room.playerRoles[playerId] = room.playerRoles[playerId] ?? getNextRole(room.playerRoles);
    room.playerScores[playerId] = room.playerScores[playerId] ?? 0;
    this.bumpRevision(room);
    await this.stateRepository.set(roomId, room);
  }

  async finishMatch(roomId: string) {
    await this.stateRepository.delete(roomId);
  }

  private async getRoom(roomId: string) {
    const room = await this.stateRepository.get(roomId);
    if (!room) {
      throw new Error(`Crew Coordination room not found: ${roomId}`);
    }
    return room;
  }

  private getNextPlayerId(room: CrewCoordinationRoomState, playerId: string) {
    const currentIndex = room.players.indexOf(playerId);
    if (currentIndex === -1 || room.players.length === 0) {
      return playerId;
    }

    return room.players[(currentIndex + 1) % room.players.length] ?? playerId;
  }

  private parseTaskId(value: unknown) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("Crew Coordination expects payload.taskId");
    }

    return value;
  }

  private bumpRevision(room: CrewCoordinationRoomState) {
    room.revision += 1;
    room.updatedAt = new Date().toISOString();
  }
}

function createCrewTasks(): CrewTask[] {
  return CREW_TASK_BLUEPRINTS.map((task) => ({
    ...task,
    ownerPlayerId: null
  }));
}

function getNextRole(playerRoles: Record<string, CrewRole>) {
  const usedRoles = new Set(Object.values(playerRoles));
  return PLAYER_ROLE_ORDER.find((role) => !usedRoles.has(role)) ?? "cabin";
}
