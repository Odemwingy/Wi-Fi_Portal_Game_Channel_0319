import { describe, expect, it } from "vitest";

import type { GameEventEnvelope } from "@wifi-portal/game-sdk";

import { SpotTheDifferenceRaceAdapter } from "./spot-the-difference-race.adapter";
import {
  SpotTheDifferenceRaceStateRepository,
  type SpotTheDifferenceRaceRoomState
} from "../repositories/spot-the-difference-race-state.repository";

class CloningSpotRaceStateRepository extends SpotTheDifferenceRaceStateRepository {
  private readonly rooms = new Map<string, SpotTheDifferenceRaceRoomState>();

  async delete(roomId: string) {
    this.rooms.delete(roomId);
  }

  async get(roomId: string) {
    const room = this.rooms.get(roomId);
    return room ? this.clone(room) : undefined;
  }

  async set(roomId: string, state: SpotTheDifferenceRaceRoomState) {
    const cloned = this.clone(state);
    this.rooms.set(roomId, cloned);
    return this.clone(cloned);
  }

  private clone(state: SpotTheDifferenceRaceRoomState) {
    return JSON.parse(JSON.stringify(state)) as SpotTheDifferenceRaceRoomState;
  }
}

describe("SpotTheDifferenceRaceAdapter", () => {
  it("records unique spot claims and ignores duplicates for scoring", async () => {
    const repository = new CloningSpotRaceStateRepository();
    const adapter = new SpotTheDifferenceRaceAdapter(repository);
    const roomId = "room-spot-race";

    await adapter.createMatch(roomId, "host-1");
    await adapter.joinMatch(roomId, "player-2");

    await adapter.handlePlayerAction({
      gameId: "spot-the-difference-race",
      payload: { spotId: "window-shade-01" },
      playerId: "host-1",
      roomId,
      seq: 1,
      type: "game_event"
    } satisfies GameEventEnvelope);

    const afterClaim = await adapter.getSnapshot(roomId);
    expect(afterClaim.state.claimed_spot_count).toBe(1);
    expect(afterClaim.state.scores).toEqual({
      "host-1": 8,
      "player-2": 0
    });

    await adapter.handlePlayerAction({
      gameId: "spot-the-difference-race",
      payload: { spotId: "window-shade-01" },
      playerId: "player-2",
      roomId,
      seq: 1,
      type: "game_event"
    } satisfies GameEventEnvelope);

    const afterDuplicate = await adapter.getSnapshot(roomId);
    expect(afterDuplicate.state.claimed_spot_count).toBe(1);
    expect(afterDuplicate.state.scores).toEqual({
      "host-1": 8,
      "player-2": 0
    });
    expect(afterDuplicate.state.last_recent_claim).toMatchObject({
      playerId: "player-2",
      spotId: "window-shade-01",
      status: "duplicate"
    });
  });
});
