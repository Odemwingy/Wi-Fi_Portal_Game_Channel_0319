import { Inject, Injectable } from "@nestjs/common";

import {
  defaultSpotTheDifferenceScenes,
  type GameAdapter,
  type GameEventEnvelope,
  type GameStateSnapshot
} from "@wifi-portal/game-sdk";

import {
  SpotTheDifferenceRaceStateRepository,
  type SpotRecentClaim,
  type SpotTheDifferenceRaceRoomState
} from "../repositories/spot-the-difference-race-state.repository";

const CLAIM_POINTS = 8;
const WINNER_BONUS_POINTS = 12;

@Injectable()
export class SpotTheDifferenceRaceAdapter implements GameAdapter {
  readonly gameId = "spot-the-difference-race";

  constructor(
    @Inject(SpotTheDifferenceRaceStateRepository)
    private readonly stateRepository: SpotTheDifferenceRaceStateRepository
  ) {}

  async createMatch(roomId: string, hostPlayerId: string) {
    const now = new Date();
    const scene = defaultSpotTheDifferenceScenes[0];
    if (!scene) {
      throw new Error("Spot the Difference Race scene pack is missing");
    }

    await this.stateRepository.set(roomId, {
      deadlineAt: new Date(now.getTime() + scene.timeLimitSeconds * 1000).toISOString(),
      foundSpots: {},
      isCompleted: false,
      lastRecentClaim: null,
      lastSeqByPlayer: {
        [hostPlayerId]: -1
      },
      players: [hostPlayerId],
      recentClaims: [],
      revision: 1,
      scene,
      scores: {
        [hostPlayerId]: 0
      },
      updatedAt: now.toISOString(),
      winnerBonusGranted: false
    });
  }

  async joinMatch(roomId: string, playerId: string) {
    const room = await this.getRoom(roomId);
    if (room.players.includes(playerId)) {
      return;
    }

    room.players.push(playerId);
    room.lastSeqByPlayer[playerId] = -1;
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
    this.completeIfExpired(room);

    if (room.isCompleted) {
      this.bumpRevision(room);
      await this.stateRepository.set(event.roomId, room);
      return;
    }

    const spotId = this.parseSpotId(event.payload.spotId);
    this.ensureSceneContainsSpot(room, spotId);

    const existing = room.foundSpots[spotId];
    const claim: SpotRecentClaim = {
      claimedAt: new Date().toISOString(),
      playerId: event.playerId,
      spotId,
      status: existing ? "duplicate" : "claimed"
    };

    if (!existing) {
      room.foundSpots[spotId] = {
        claimedAt: claim.claimedAt,
        playerId: event.playerId,
        spotId
      };
      room.scores[event.playerId] = (room.scores[event.playerId] ?? 0) + CLAIM_POINTS;
    }

    room.lastRecentClaim = claim;
    room.recentClaims.unshift(claim);
    room.recentClaims = room.recentClaims.slice(0, 10);

    this.completeIfFinished(room);
    this.bumpRevision(room);
    await this.stateRepository.set(event.roomId, room);
  }

  async getSnapshot(roomId: string): Promise<GameStateSnapshot> {
    const room = await this.getRoom(roomId);
    const wasCompleted = room.isCompleted;
    this.completeIfExpired(room);

    if (!wasCompleted && room.isCompleted) {
      this.bumpRevision(room);
      await this.stateRepository.set(roomId, room);
    }

    return {
      gameId: this.gameId,
      roomId,
      revision: room.revision,
      state: {
        claimed_spot_count: Object.keys(room.foundSpots).length,
        current_scene_id: room.scene.id,
        deadline_at: room.deadlineAt,
        found_spots: room.foundSpots,
        is_completed: room.isCompleted,
        last_recent_claim: room.lastRecentClaim,
        recent_claims: room.recentClaims,
        remaining_spot_count: room.scene.spots.length - Object.keys(room.foundSpots).length,
        scene: room.scene,
        scores: room.scores,
        total_spot_count: room.scene.spots.length,
        winner_player_ids: this.getWinningPlayerIds(room)
      },
      updatedAt: room.updatedAt
    };
  }

  async reconnectPlayer(roomId: string, playerId: string) {
    const room = await this.getRoom(roomId);
    room.lastSeqByPlayer[playerId] = room.lastSeqByPlayer[playerId] ?? -1;
    room.scores[playerId] = room.scores[playerId] ?? 0;
    if (!room.players.includes(playerId)) {
      room.players.push(playerId);
    }
    this.bumpRevision(room);
    await this.stateRepository.set(roomId, room);
  }

  async finishMatch(roomId: string) {
    await this.stateRepository.delete(roomId);
  }

  private async getRoom(roomId: string) {
    const room = await this.stateRepository.get(roomId);
    if (!room) {
      throw new Error(`Spot the Difference Race room not found: ${roomId}`);
    }

    return room;
  }

  private parseSpotId(value: unknown) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("Spot the Difference Race expects payload.spotId to be a non-empty string");
    }

    return value.trim();
  }

  private ensureSceneContainsSpot(room: SpotTheDifferenceRaceRoomState, spotId: string) {
    if (!room.scene.spots.some((spot) => spot.id === spotId)) {
      throw new Error(`Spot not found in active scene: ${spotId}`);
    }
  }

  private completeIfFinished(room: SpotTheDifferenceRaceRoomState) {
    const claimedSpotCount = Object.keys(room.foundSpots).length;
    const totalSpotCount = room.scene.spots.length;
    const majorityThreshold = Math.floor(totalSpotCount / 2) + 1;
    const bestPlayerClaimCount = Math.max(
      0,
      ...room.players.map((playerId) =>
        Object.values(room.foundSpots).filter((claim) => claim.playerId === playerId).length
      )
    );

    if (
      claimedSpotCount >= totalSpotCount ||
      bestPlayerClaimCount >= majorityThreshold
    ) {
      room.isCompleted = true;
      this.grantWinnerBonus(room);
    }
  }

  private completeIfExpired(room: SpotTheDifferenceRaceRoomState) {
    if (room.isCompleted) {
      return;
    }

    if (Date.now() >= new Date(room.deadlineAt).getTime()) {
      room.isCompleted = true;
      this.grantWinnerBonus(room);
    }
  }

  private grantWinnerBonus(room: SpotTheDifferenceRaceRoomState) {
    if (room.winnerBonusGranted) {
      return;
    }

    const winners = this.getWinningPlayerIds(room);
    for (const playerId of winners) {
      room.scores[playerId] = (room.scores[playerId] ?? 0) + WINNER_BONUS_POINTS;
    }
    room.winnerBonusGranted = true;
  }

  private getWinningPlayerIds(room: SpotTheDifferenceRaceRoomState) {
    const highestScore = Math.max(...Object.values(room.scores));
    return Object.entries(room.scores)
      .filter(([, score]) => score === highestScore)
      .map(([playerId]) => playerId);
  }

  private bumpRevision(room: SpotTheDifferenceRaceRoomState) {
    room.revision += 1;
    room.updatedAt = new Date().toISOString();
  }
}
