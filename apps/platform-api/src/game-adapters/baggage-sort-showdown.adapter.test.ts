import { describe, expect, it } from "vitest";

import type { GameEventEnvelope } from "@wifi-portal/game-sdk";

import { BaggageSortShowdownAdapter } from "./baggage-sort-showdown.adapter";
import {
  BaggageSortShowdownStateRepository,
  type BaggageSortShowdownRoomState
} from "../repositories/baggage-sort-showdown-state.repository";

class CloningBaggageSortShowdownStateRepository extends BaggageSortShowdownStateRepository {
  private readonly rooms = new Map<string, BaggageSortShowdownRoomState>();

  async delete(roomId: string) {
    this.rooms.delete(roomId);
  }

  async get(roomId: string) {
    const room = this.rooms.get(roomId);
    return room ? this.clone(room) : undefined;
  }

  async set(roomId: string, state: BaggageSortShowdownRoomState) {
    const cloned = this.clone(state);
    this.rooms.set(roomId, cloned);
    return this.clone(cloned);
  }

  private clone(state: BaggageSortShowdownRoomState) {
    return JSON.parse(JSON.stringify(state)) as BaggageSortShowdownRoomState;
  }
}

describe("BaggageSortShowdownAdapter", () => {
  it("persists accepted and rejected classifications with detached repository reads", async () => {
    const repository = new CloningBaggageSortShowdownStateRepository();
    const adapter = new BaggageSortShowdownAdapter(repository);
    const roomId = "room-baggage";

    await adapter.createMatch(roomId, "host-1");
    await adapter.joinMatch(roomId, "player-2");

    const initialSnapshot = await adapter.getSnapshot(roomId);
    expect(initialSnapshot.state.players).toEqual(["host-1", "player-2"]);
    expect(initialSnapshot.state.current_bag.id).toBe("bag-100");

    await adapter.handlePlayerAction({
      gameId: "baggage-sort-showdown",
      payload: {
        laneId: "fragile"
      },
      playerId: "player-2",
      roomId,
      seq: 1,
      type: "game_event"
    } satisfies GameEventEnvelope);

    const rejectedSnapshot = await adapter.getSnapshot(roomId);
    expect(rejectedSnapshot.state.current_bag.id).toBe("bag-100");
    expect(rejectedSnapshot.state.last_action).toMatchObject({
      bagId: "bag-100",
      chosenLane: "fragile",
      playerId: "player-2",
      status: "rejected"
    });

    await adapter.handlePlayerAction({
      gameId: "baggage-sort-showdown",
      payload: {
        laneId: "standard"
      },
      playerId: "host-1",
      roomId,
      seq: 1,
      type: "game_event"
    } satisfies GameEventEnvelope);

    const acceptedSnapshot = await adapter.getSnapshot(roomId);
    expect(acceptedSnapshot.state.current_bag.id).toBe("bag-220");
    expect(acceptedSnapshot.state.resolved_bag_ids).toEqual(["bag-100"]);
    expect(acceptedSnapshot.state.scores).toEqual({
      "host-1": 4,
      "player-2": 0
    });

    await adapter.reconnectPlayer(roomId, "player-2");
    const reconnectedSnapshot = await adapter.getSnapshot(roomId);
    expect(reconnectedSnapshot.state.players).toEqual(["host-1", "player-2"]);
  });
});
