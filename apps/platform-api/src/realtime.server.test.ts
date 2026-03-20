import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import {
  realtimeServerMessageSchema,
  type RealtimeServerMessage
} from "@wifi-portal/game-sdk";
import { startTrace } from "@wifi-portal/shared-observability";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { MiniGomokuAdapter } from "./game-adapters/mini-gomoku.adapter";
import { MemoryMatchDuelAdapter } from "./game-adapters/memory-match-duel.adapter";
import { QuizDuelAdapter } from "./game-adapters/quiz-duel.adapter";
import { SpotTheDifferenceRaceAdapter } from "./game-adapters/spot-the-difference-race.adapter";
import { WordRallyAdapter } from "./game-adapters/word-rally.adapter";
import { GameRuntimeService } from "./game-runtime.service";
import { PlatformMetricsService } from "./platform-metrics.service";
import { InMemoryJsonStateStore } from "./repositories/json-state-store";
import { StateStoreMiniGomokuStateRepository } from "./repositories/mini-gomoku-state.repository";
import { StateStoreMemoryMatchDuelStateRepository } from "./repositories/memory-match-duel-state.repository";
import { StateStoreQuizDuelStateRepository } from "./repositories/quiz-duel-state.repository";
import { StateStoreRoomRepository } from "./repositories/room.repository";
import { StateStoreSpotTheDifferenceRaceStateRepository } from "./repositories/spot-the-difference-race-state.repository";
import { StateStoreWordRallyStateRepository } from "./repositories/word-rally-state.repository";
import { RealtimeServer } from "./realtime.server";
import { RoomService } from "./room.service";

type TestSocket = {
  messages: RealtimeServerMessage[];
  socket: WebSocket;
};

const waitForOpen = (socket: WebSocket) =>
  new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", (error) => reject(error));
  });

const waitForMessage = (
  client: TestSocket,
  predicate: (message: RealtimeServerMessage) => boolean,
  timeoutMs = 2_000
) =>
  new Promise<RealtimeServerMessage>((resolve, reject) => {
    const existing = client.messages.find(predicate);
    if (existing) {
      resolve(existing);
      return;
    }

    const timer = setTimeout(() => {
      client.socket.off("message", onMessage);
      reject(new Error("Timed out waiting for realtime message"));
    }, timeoutMs);

    const onMessage = (raw: Buffer) => {
      const message = realtimeServerMessageSchema.parse(
        JSON.parse(raw.toString()) as unknown
      );

      if (!predicate(message)) {
        return;
      }

      clearTimeout(timer);
      client.socket.off("message", onMessage);
      resolve(message);
    };

    client.socket.on("message", onMessage);
  });

describe("RealtimeServer", () => {
  const sockets = new Set<TestSocket>();
  const closers: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    for (const { socket } of sockets) {
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close();
      }
    }

    await Promise.allSettled(
      closers
        .reverse()
        .map(async (close) => {
          await close();
        })
    );

    sockets.clear();
    closers.length = 0;
  });

  it("sends room snapshots and relays game events inside the room", async () => {
    const { roomId, server } = await createRealtimeFixture(sockets, closers);

    const hostSocket = createSocket(server, roomId, "host-1", "sess-host-1");
    const guestSocket = createSocket(server, roomId, "player-2", "sess-player-2");
    sockets.add(hostSocket);
    sockets.add(guestSocket);

    await Promise.all([
      waitForOpen(hostSocket.socket),
      waitForOpen(guestSocket.socket)
    ]);
    await Promise.all([
      waitForMessage(hostSocket, (message) => message.type === "room_snapshot"),
      waitForMessage(guestSocket, (message) => message.type === "room_snapshot"),
      waitForMessage(hostSocket, (message) => message.type === "game_state"),
      waitForMessage(guestSocket, (message) => message.type === "game_state")
    ]);

    hostSocket.socket.send(
      JSON.stringify({
        message_id: "client-msg-1",
        payload: {
          gameId: "quiz-duel",
          payload: {
            answer: "A"
          },
          playerId: "host-1",
          roomId,
          seq: 1,
          type: "game_event"
        },
        type: "game_event"
      })
    );

    const [ack, relayedEvent, updatedState] = await Promise.all([
      waitForMessage(
        hostSocket,
        (message) =>
          message.type === "ack" &&
          message.correlation_id === "client-msg-1" &&
          message.payload.acked_type === "game_event"
      ),
      waitForMessage(
        guestSocket,
        (message) =>
          message.type === "game_event" &&
          message.correlation_id === "client-msg-1" &&
          message.payload.playerId === "host-1"
      ),
      waitForMessage(
        guestSocket,
        (message) =>
          message.type === "game_state" &&
          message.correlation_id === "client-msg-1" &&
          message.payload.state.scores["host-1"] === 10
      )
    ]);

    expect(ack.type).toBe("ack");
    expect(relayedEvent.type).toBe("game_event");
    expect(relayedEvent.payload.payload).toEqual({ answer: "A" });
    expect(updatedState.type).toBe("game_state");
    expect(updatedState.payload.state.answer_count).toBe(1);
  });

  it("broadcasts a disconnected snapshot when a socket closes", async () => {
    const { roomId, server } = await createRealtimeFixture(sockets, closers);

    const hostSocket = createSocket(server, roomId, "host-1", "sess-host-1");
    const guestSocket = createSocket(server, roomId, "player-2", "sess-player-2");
    sockets.add(hostSocket);
    sockets.add(guestSocket);

    await Promise.all([
      waitForOpen(hostSocket.socket),
      waitForOpen(guestSocket.socket)
    ]);
    await Promise.all([
      waitForMessage(hostSocket, (message) => message.type === "room_snapshot"),
      waitForMessage(guestSocket, (message) => message.type === "room_snapshot"),
      waitForMessage(hostSocket, (message) => message.type === "game_state"),
      waitForMessage(guestSocket, (message) => message.type === "game_state")
    ]);

    guestSocket.socket.close();

    const disconnectedSnapshot = await waitForMessage(
      hostSocket,
      (message) =>
        message.type === "room_snapshot" &&
        message.payload.players.some(
          (player) =>
            player.player_id === "player-2" &&
            player.connection_status === "disconnected"
        )
    );

    expect(disconnectedSnapshot.type).toBe("room_snapshot");
    expect(
      disconnectedSnapshot.payload.players.find(
        (player) => player.player_id === "player-2"
      )?.connection_status
    ).toBe("disconnected");
  });

  it("restores spot-the-difference-race scene state after reconnect", async () => {
    const { roomId, server } = await createRealtimeFixture(sockets, closers, {
      gameId: "spot-the-difference-race"
    });

    const hostSocket = createSocket(server, roomId, "host-1", "sess-host-1");
    const guestSocket = createSocket(server, roomId, "player-2", "sess-player-2");
    sockets.add(hostSocket);
    sockets.add(guestSocket);

    await Promise.all([
      waitForOpen(hostSocket.socket),
      waitForOpen(guestSocket.socket)
    ]);
    await Promise.all([
      waitForMessage(hostSocket, (message) => message.type === "room_snapshot"),
      waitForMessage(guestSocket, (message) => message.type === "room_snapshot"),
      waitForMessage(hostSocket, (message) => message.type === "game_state"),
      waitForMessage(guestSocket, (message) => message.type === "game_state")
    ]);

    hostSocket.socket.send(
      JSON.stringify({
        message_id: "spot-race-msg-1",
        payload: {
          gameId: "spot-the-difference-race",
          payload: {
            spotId: "window-shade-01"
          },
          playerId: "host-1",
          roomId,
          seq: 1,
          type: "game_event"
        },
        type: "game_event"
      })
    );

    await waitForMessage(
      guestSocket,
      (message) =>
        message.type === "game_state" &&
        message.correlation_id === "spot-race-msg-1" &&
        message.payload.state.found_spots["window-shade-01"]?.playerId === "host-1"
    );

    guestSocket.socket.close();

    await waitForMessage(
      hostSocket,
      (message) =>
        message.type === "room_snapshot" &&
        message.payload.players.some(
          (player) =>
            player.player_id === "player-2" &&
            player.connection_status === "disconnected"
        )
    );

    const guestReconnectSocket = createSocket(
      server,
      roomId,
      "player-2",
      "sess-player-2"
    );
    sockets.add(guestReconnectSocket);

    await waitForOpen(guestReconnectSocket.socket);

    const restoredState = await waitForMessage(
      guestReconnectSocket,
      (message) =>
        message.type === "game_state" &&
        message.payload.gameId === "spot-the-difference-race" &&
        message.payload.state.found_spots["window-shade-01"]?.playerId === "host-1"
    );

    expect(restoredState.type).toBe("game_state");
    expect(restoredState.payload.state.claimed_spot_count).toBe(1);
    expect(restoredState.payload.state.current_scene_id).toBe("cabin-window-evening");
    expect(restoredState.payload.state.scores).toEqual({
      "host-1": 8,
      "player-2": 0
    });
  });
});

async function createRealtimeFixture(
  sockets: Set<TestSocket>,
  closers: Array<() => Promise<void> | void>,
  options?: {
    gameId?:
      | "memory-match-duel"
      | "mini-gomoku"
      | "quiz-duel"
      | "spot-the-difference-race"
      | "word-rally";
  }
) {
  const stateStore = new InMemoryJsonStateStore();
  const roomService = new RoomService(new StateStoreRoomRepository(stateStore));
  const runtime = new GameRuntimeService(
    roomService,
    new MiniGomokuAdapter(new StateStoreMiniGomokuStateRepository(stateStore)),
    new MemoryMatchDuelAdapter(
      new StateStoreMemoryMatchDuelStateRepository(stateStore)
    ),
    new QuizDuelAdapter(new StateStoreQuizDuelStateRepository(stateStore)),
    new SpotTheDifferenceRaceAdapter(
      new StateStoreSpotTheDifferenceRaceStateRepository(stateStore)
    ),
    new WordRallyAdapter(new StateStoreWordRallyStateRepository(stateStore))
  );
  const metrics = new PlatformMetricsService();
  const trace = startTrace();
  const gameId = options?.gameId ?? "quiz-duel";
  const created = await roomService.createRoom(trace, {
    game_id: gameId,
    host_player_id: "host-1",
    host_session_id: "sess-host-1",
    max_players: 2,
    room_name: "Realtime Room"
  });

  await roomService.joinRoom(trace, {
    player_id: "player-2",
    room_id: created.room.room_id,
    session_id: "sess-player-2"
  });

  const server = createServer((_request, response) => {
    response.writeHead(426).end();
  });
  const realtimeServer = new RealtimeServer(server, roomService, runtime, metrics);

  closers.push(async () => {
    realtimeServer.close();
  });
  closers.push(() => {
    runtime.onModuleDestroy();
  });
  closers.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  );

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  return {
    roomId: created.room.room_id,
    server
  };
}

function createSocket(
  server: HttpServer,
  roomId: string,
  playerId: string,
  sessionId: string
) {
  const address = server.address() as AddressInfo;
  const socket = new WebSocket(
    `ws://127.0.0.1:${address.port}/ws/game-room?trace_id=test-trace-${playerId}&room_id=${roomId}&player_id=${playerId}&session_id=${sessionId}`
  );
  const messages: RealtimeServerMessage[] = [];

  socket.on("message", (raw: Buffer) => {
    messages.push(
      realtimeServerMessageSchema.parse(JSON.parse(raw.toString()) as unknown)
    );
  });

  return {
    messages,
    socket
  };
}
