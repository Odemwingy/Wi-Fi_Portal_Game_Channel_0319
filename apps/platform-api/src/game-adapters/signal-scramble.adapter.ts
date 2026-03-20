import { Inject, Injectable } from "@nestjs/common";

import {
  type GameAdapter,
  type GameEventEnvelope,
  type GameStateSnapshot
} from "@wifi-portal/game-sdk";

import {
  SignalScrambleStateRepository,
  type SignalActivation,
  type SignalNode,
  type SignalScrambleRoomState
} from "../repositories/signal-scramble-state.repository";

const SIGNAL_NODES: SignalNode[] = [
  { accent: "sea", id: "relay-a1", label: "A1", points: 2, ring: "outer" },
  { accent: "amber", id: "relay-b2", label: "B2", points: 3, ring: "mid" },
  { accent: "mint", id: "relay-c3", label: "C3", points: 4, ring: "inner" },
  { accent: "violet", id: "relay-d4", label: "D4", points: 5, ring: "inner" },
  { accent: "amber", id: "relay-e5", label: "E5", points: 4, ring: "mid" },
  { accent: "sea", id: "relay-f6", label: "F6", points: 3, ring: "outer" },
  { accent: "mint", id: "relay-g7", label: "G7", points: 2, ring: "outer" },
  { accent: "violet", id: "relay-h8", label: "H8", points: 3, ring: "mid" }
];

const TARGET_SEQUENCE = ["relay-b2", "relay-c3", "relay-e5", "relay-f6"];

@Injectable()
export class SignalScrambleAdapter implements GameAdapter {
  readonly gameId = "signal-scramble";

  constructor(
    @Inject(SignalScrambleStateRepository)
    private readonly stateRepository: SignalScrambleStateRepository
  ) {}

  async createMatch(roomId: string, hostPlayerId: string) {
    const now = new Date().toISOString();

    await this.stateRepository.set(roomId, {
      activatedNodeIdsByPlayer: {
        [hostPlayerId]: []
      },
      completedAtByPlayer: {
        [hostPlayerId]: null
      },
      isCompleted: false,
      lastActivation: null,
      lastSeqByPlayer: {
        [hostPlayerId]: -1
      },
      players: [hostPlayerId],
      progressByPlayer: {
        [hostPlayerId]: 0
      },
      revision: 1,
      scores: {
        [hostPlayerId]: 0
      },
      signalNodes: SIGNAL_NODES,
      targetSequence: TARGET_SEQUENCE,
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
    room.activatedNodeIdsByPlayer[playerId] = [];
    room.completedAtByPlayer[playerId] = null;
    room.lastSeqByPlayer[playerId] = -1;
    room.progressByPlayer[playerId] = 0;
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

    if (room.isCompleted || room.players.length < 2) {
      this.recordIgnoredActivation(room, event.playerId, event.seq, event.payload.nodeId);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    const nodeId = this.parseNodeId(event.payload.nodeId);
    const expectedNodeId =
      room.targetSequence[room.progressByPlayer[event.playerId] ?? 0] ?? null;

    if (nodeId !== expectedNodeId) {
      this.recordIgnoredActivation(room, event.playerId, event.seq, nodeId);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    const node = room.signalNodes.find((entry) => entry.id === nodeId);
    if (!node) {
      this.recordIgnoredActivation(room, event.playerId, event.seq, nodeId);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    room.activatedNodeIdsByPlayer[event.playerId] = [
      ...(room.activatedNodeIdsByPlayer[event.playerId] ?? []),
      nodeId
    ];
    room.progressByPlayer[event.playerId] = (room.progressByPlayer[event.playerId] ?? 0) + 1;
    room.scores[event.playerId] = (room.scores[event.playerId] ?? 0) + node.points;
    room.lastActivation = {
      nodeId,
      playerId: event.playerId,
      progressAfter: room.progressByPlayer[event.playerId],
      seq: event.seq,
      status: "accepted",
      submittedAt: new Date().toISOString()
    } satisfies SignalActivation;

    if (room.progressByPlayer[event.playerId] >= room.targetSequence.length) {
      room.completedAtByPlayer[event.playerId] = room.lastActivation.submittedAt;
      room.isCompleted = true;
      room.winnerPlayerIds = [event.playerId];
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
        activated_node_ids_by_player: room.activatedNodeIdsByPlayer,
        completed_at_by_player: room.completedAtByPlayer,
        is_completed: room.isCompleted,
        last_activation: room.lastActivation,
        next_target_by_player: Object.fromEntries(
          room.players.map((playerId) => [
            playerId,
            room.targetSequence[room.progressByPlayer[playerId] ?? 0] ?? null
          ])
        ),
        players: room.players,
        progress_by_player: room.progressByPlayer,
        scores: room.scores,
        signal_nodes: room.signalNodes,
        target_sequence: room.targetSequence,
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
    room.activatedNodeIdsByPlayer[playerId] = room.activatedNodeIdsByPlayer[playerId] ?? [];
    room.completedAtByPlayer[playerId] = room.completedAtByPlayer[playerId] ?? null;
    room.progressByPlayer[playerId] = room.progressByPlayer[playerId] ?? 0;
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
      throw new Error(`Signal Scramble room not found: ${roomId}`);
    }
    return room;
  }

  private parseNodeId(value: unknown) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("Signal Scramble expects payload.nodeId");
    }

    return value;
  }

  private recordIgnoredActivation(
    room: SignalScrambleRoomState,
    playerId: string,
    seq: number,
    nodeId: unknown
  ) {
    room.lastActivation = {
      nodeId: typeof nodeId === "string" ? nodeId : "unknown",
      playerId,
      progressAfter: room.progressByPlayer[playerId] ?? 0,
      seq,
      status: "ignored",
      submittedAt: new Date().toISOString()
    };
    this.bumpRevision(room);
  }

  private bumpRevision(room: SignalScrambleRoomState) {
    room.revision += 1;
    room.updatedAt = new Date().toISOString();
  }
}
