import { Inject, Injectable } from "@nestjs/common";

import {
  type GameAdapter,
  type GameEventEnvelope,
  type GameStateSnapshot
} from "@wifi-portal/game-sdk";

import {
  SkylineDefenseLiteStateRepository,
  type SkylineDefenseLiteRoomState,
  type SkylineDefenseMove,
  type SkylineDefenseNode,
  type SkylineDefenseType,
  type SkylineDistrict
} from "../repositories/skyline-defense-lite-state.repository";

const DEFENSE_LOADOUT: SkylineDefenseType[] = ["barrier", "pulse", "interceptor"];

@Injectable()
export class SkylineDefenseLiteAdapter implements GameAdapter {
  readonly gameId = "skyline-defense-lite";

  constructor(
    @Inject(SkylineDefenseLiteStateRepository)
    private readonly stateRepository: SkylineDefenseLiteStateRepository
  ) {}

  async createMatch(roomId: string, hostPlayerId: string) {
    const now = new Date().toISOString();

    await this.stateRepository.set(roomId, {
      availableNodeCount: SKYLINE_NODES.length,
      currentTurnPlayerId: hostPlayerId,
      isCompleted: false,
      lastMove: null,
      lastSeqByPlayer: {
        [hostPlayerId]: -1
      },
      moves: [],
      nodes: createDefenseNodes(),
      playerBadges: {
        [hostPlayerId]: "SKY"
      },
      players: [hostPlayerId],
      revision: 1,
      scores: {
        [hostPlayerId]: 0
      },
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
    room.playerBadges[playerId] = room.playerBadges[playerId] ?? getNextBadge(room.playerBadges);
    room.scores[playerId] = room.scores[playerId] ?? 0;
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

    if (room.isCompleted || room.currentTurnPlayerId !== event.playerId || room.players.length < 2) {
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    const nodeId = this.parseNodeId(event.payload.nodeId);
    const defenseType = this.parseDefenseType(event.payload.defenseType);
    const node = room.nodes.find((entry) => entry.nodeId === nodeId);

    if (!node || node.ownerPlayerId) {
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    node.ownerPlayerId = event.playerId;
    node.defenseType = defenseType;
    room.availableNodeCount -= 1;

    const threatMatchBonus = getThreatMatchBonus(node.threatType, defenseType);
    const districtControlBonus = getDistrictControlBonus(room.nodes, node.district, event.playerId);
    const pointsAwarded = node.baseScore + threatMatchBonus + districtControlBonus;

    room.scores[event.playerId] = (room.scores[event.playerId] ?? 0) + pointsAwarded;
    room.lastMove = {
      defenseType,
      district: node.district,
      districtControlBonus,
      nodeId,
      playerId: event.playerId,
      pointsAwarded,
      selectedAt: new Date().toISOString(),
      seq: event.seq,
      threatMatchBonus
    } satisfies SkylineDefenseMove;
    room.moves.unshift(room.lastMove);
    room.moves = room.moves.slice(0, SKYLINE_NODES.length);

    if (room.availableNodeCount === 0) {
      room.isCompleted = true;
      room.winnerPlayerIds = getWinners(room.scores);
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
        available_node_count: room.availableNodeCount,
        current_turn_player_id: room.currentTurnPlayerId,
        defense_loadout: DEFENSE_LOADOUT,
        district_control_by_player: Object.fromEntries(
          room.players.map((playerId) => [
            playerId,
            getControlledDistricts(room.nodes, playerId)
          ])
        ),
        is_completed: room.isCompleted,
        last_move: room.lastMove,
        moves: room.moves,
        nodes: room.nodes,
        player_badges: room.playerBadges,
        players: room.players,
        scores: room.scores,
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
    room.playerBadges[playerId] = room.playerBadges[playerId] ?? getNextBadge(room.playerBadges);
    room.scores[playerId] = room.scores[playerId] ?? 0;
    this.bumpRevision(room);
    await this.stateRepository.set(roomId, room);
  }

  async finishMatch(roomId: string) {
    await this.stateRepository.delete(roomId);
  }

  private async getRoom(roomId: string) {
    const room = await this.stateRepository.get(roomId);
    if (!room) {
      throw new Error(`Skyline Defense Lite room not found: ${roomId}`);
    }
    return room;
  }

  private getNextPlayerId(room: SkylineDefenseLiteRoomState, playerId: string) {
    const currentIndex = room.players.indexOf(playerId);
    if (currentIndex === -1 || room.players.length === 0) {
      return playerId;
    }

    return room.players[(currentIndex + 1) % room.players.length] ?? playerId;
  }

  private parseDefenseType(value: unknown): SkylineDefenseType {
    if (value !== "barrier" && value !== "interceptor" && value !== "pulse") {
      throw new Error("Skyline Defense Lite expects payload.defenseType");
    }

    return value;
  }

  private parseNodeId(value: unknown) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("Skyline Defense Lite expects payload.nodeId");
    }

    return value;
  }

  private bumpRevision(room: SkylineDefenseLiteRoomState) {
    room.revision += 1;
    room.updatedAt = new Date().toISOString();
  }
}

const SKYLINE_NODES: Omit<SkylineDefenseNode, "defenseType" | "ownerPlayerId">[] = [
  {
    baseScore: 3,
    district: "harbor",
    label: "Harbor West",
    nodeId: "node-harbor-west",
    threatType: "storm"
  },
  {
    baseScore: 4,
    district: "harbor",
    label: "Harbor East",
    nodeId: "node-harbor-east",
    threatType: "drone"
  },
  {
    baseScore: 2,
    district: "midtown",
    label: "Midtown West",
    nodeId: "node-midtown-west",
    threatType: "storm"
  },
  {
    baseScore: 3,
    district: "midtown",
    label: "Midtown East",
    nodeId: "node-midtown-east",
    threatType: "traffic"
  },
  {
    baseScore: 4,
    district: "runway",
    label: "Runway North",
    nodeId: "node-runway-north",
    threatType: "traffic"
  },
  {
    baseScore: 5,
    district: "runway",
    label: "Runway South",
    nodeId: "node-runway-south",
    threatType: "drone"
  }
];

function createDefenseNodes(): SkylineDefenseNode[] {
  return SKYLINE_NODES.map((node) => ({
    ...node,
    defenseType: null,
    ownerPlayerId: null
  }));
}

function getControlledDistricts(nodes: SkylineDefenseNode[], playerId: string) {
  return DISTRICTS.filter((district) =>
    nodes
      .filter((node) => node.district === district)
      .every((node) => node.ownerPlayerId === playerId)
  );
}

const DISTRICTS: SkylineDistrict[] = ["harbor", "midtown", "runway"];

function getDistrictControlBonus(
  nodes: SkylineDefenseNode[],
  district: SkylineDistrict,
  playerId: string
) {
  return nodes
    .filter((node) => node.district === district)
    .every((node) => node.ownerPlayerId === playerId)
    ? 1
    : 0;
}

function getNextBadge(playerBadges: Record<string, "ALT" | "SKY">) {
  const usedBadges = new Set(Object.values(playerBadges));
  return usedBadges.has("SKY") ? "ALT" : "SKY";
}

function getThreatMatchBonus(
  threatType: SkylineDefenseNode["threatType"],
  defenseType: SkylineDefenseType
) {
  return THREAT_COUNTERS[threatType] === defenseType ? 2 : 0;
}

const THREAT_COUNTERS: Record<SkylineDefenseNode["threatType"], SkylineDefenseType> = {
  drone: "interceptor",
  storm: "barrier",
  traffic: "pulse"
};

function getWinners(scores: Record<string, number>) {
  const highestScore = Math.max(...Object.values(scores));
  return Object.entries(scores)
    .filter(([, score]) => score === highestScore)
    .map(([playerId]) => playerId);
}
