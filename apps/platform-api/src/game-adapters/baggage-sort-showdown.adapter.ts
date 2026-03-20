import { Inject, Injectable } from "@nestjs/common";

import {
  type GameAdapter,
  type GameEventEnvelope,
  type GameStateSnapshot
} from "@wifi-portal/game-sdk";

import {
  BaggageSortShowdownStateRepository,
  type BaggageItem,
  type BaggageLane,
  type BaggageSortAction,
  type BaggageSortShowdownRoomState
} from "../repositories/baggage-sort-showdown-state.repository";

const BAG_DECK: BaggageItem[] = [
  {
    accent: "sea",
    id: "bag-100",
    label: "Rollaboard 21",
    points: 4,
    tagLabel: "Cabin Ready",
    targetLane: "standard",
    weightKg: 8
  },
  {
    accent: "amber",
    id: "bag-220",
    label: "Sky Priority Duffel",
    points: 5,
    tagLabel: "Fast Transfer",
    targetLane: "priority",
    weightKg: 11
  },
  {
    accent: "rose",
    id: "bag-330",
    label: "Fragile Camera Case",
    points: 6,
    tagLabel: "Handle With Care",
    targetLane: "fragile",
    weightKg: 6
  },
  {
    accent: "mint",
    id: "bag-440",
    label: "Oversize Ski Tube",
    points: 6,
    tagLabel: "Outsize Belt",
    targetLane: "oversize",
    weightKg: 18
  },
  {
    accent: "amber",
    id: "bag-550",
    label: "Express Connection Tote",
    points: 5,
    tagLabel: "Tight Connection",
    targetLane: "priority",
    weightKg: 9
  },
  {
    accent: "sea",
    id: "bag-660",
    label: "Checked Cabin Box",
    points: 4,
    tagLabel: "Gate Return",
    targetLane: "standard",
    weightKg: 12
  }
];

const AVAILABLE_LANES: BaggageLane[] = ["standard", "priority", "fragile", "oversize"];

@Injectable()
export class BaggageSortShowdownAdapter implements GameAdapter {
  readonly gameId = "baggage-sort-showdown";

  constructor(
    @Inject(BaggageSortShowdownStateRepository)
    private readonly stateRepository: BaggageSortShowdownStateRepository
  ) {}

  async createMatch(roomId: string, hostPlayerId: string) {
    const now = new Date().toISOString();

    await this.stateRepository.set(roomId, {
      bags: BAG_DECK,
      currentBagIndex: 0,
      isCompleted: false,
      lastAction: null,
      lastSeqByPlayer: {
        [hostPlayerId]: -1
      },
      players: [hostPlayerId],
      resolvedBagIds: [],
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
    room.scores[playerId] = 0;
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
    const currentBag = room.bags[room.currentBagIndex] ?? null;

    if (room.isCompleted || room.players.length < 2 || !currentBag) {
      if (currentBag) {
        this.recordAction(room, {
          bagId: currentBag.id,
          chosenLane: currentBag.targetLane,
          correctLane: currentBag.targetLane,
          playerId: event.playerId,
          pointsAwarded: 0,
          seq: event.seq,
          status: "rejected",
          submittedAt: new Date().toISOString()
        });
        await this.stateRepository.set(event.roomId, room);
      }
      return;
    }

    const chosenLane = this.parseLane(event.payload.laneId);
    const isAccepted = chosenLane === currentBag.targetLane;

    if (isAccepted) {
      room.scores[event.playerId] = (room.scores[event.playerId] ?? 0) + currentBag.points;
      room.resolvedBagIds.push(currentBag.id);
      room.currentBagIndex += 1;
    } else {
      room.scores[event.playerId] = Math.max(0, (room.scores[event.playerId] ?? 0) - 1);
    }

    this.recordAction(room, {
      bagId: currentBag.id,
      chosenLane,
      correctLane: currentBag.targetLane,
      playerId: event.playerId,
      pointsAwarded: isAccepted ? currentBag.points : -1,
      seq: event.seq,
      status: isAccepted ? "accepted" : "rejected",
      submittedAt: new Date().toISOString()
    });

    if (room.currentBagIndex >= room.bags.length) {
      room.isCompleted = true;
      room.winnerPlayerIds = getWinners(room.scores);
    }

    await this.stateRepository.set(event.roomId, room);
  }

  async getSnapshot(roomId: string): Promise<GameStateSnapshot> {
    const room = await this.getRoom(roomId);
    const currentBag = room.bags[room.currentBagIndex] ?? null;

    return {
      gameId: this.gameId,
      roomId,
      revision: room.revision,
      state: {
        available_lanes: AVAILABLE_LANES,
        current_bag: currentBag,
        current_bag_index: room.currentBagIndex,
        is_completed: room.isCompleted,
        last_action: room.lastAction,
        players: room.players,
        remaining_bag_count: Math.max(room.bags.length - room.currentBagIndex, 0),
        resolved_bag_ids: room.resolvedBagIds,
        scores: room.scores,
        total_bags: room.bags.length,
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
      throw new Error(`Baggage Sort Showdown room not found: ${roomId}`);
    }
    return room;
  }

  private parseLane(value: unknown): BaggageLane {
    if (
      value !== "standard" &&
      value !== "priority" &&
      value !== "fragile" &&
      value !== "oversize"
    ) {
      throw new Error("Baggage Sort Showdown expects payload.laneId");
    }

    return value;
  }

  private recordAction(room: BaggageSortShowdownRoomState, action: BaggageSortAction) {
    room.lastAction = action;
    this.bumpRevision(room);
  }

  private bumpRevision(room: BaggageSortShowdownRoomState) {
    room.revision += 1;
    room.updatedAt = new Date().toISOString();
  }
}

function getWinners(scores: Record<string, number>) {
  const highestScore = Math.max(...Object.values(scores));
  return Object.entries(scores)
    .filter(([, score]) => score === highestScore)
    .map(([playerId]) => playerId);
}
