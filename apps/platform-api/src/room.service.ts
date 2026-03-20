import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import {
  createRoomRequestSchema,
  joinRoomByInviteRequestSchema,
  joinRoomRequestSchema,
  leaveRoomRequestSchema,
  reconnectPlayerRequestSchema,
  roomActionResponseSchema,
  roomSnapshotSchema,
  setReadyRequestSchema,
  type RoomPlayer,
  type RoomSnapshot,
} from "@wifi-portal/game-sdk";
import {
  createStructuredLogger,
  startTrace,
  startChildSpan,
  type TraceContext
} from "@wifi-portal/shared-observability";

import { RoomRepository } from "./repositories/room.repository";

type RoomRecord = RoomSnapshot;
export type RoomEventAction =
  | "room.created"
  | "room.joined"
  | "room.left"
  | "room.cleaned_up"
  | "room.ready_state_updated"
  | "room.reconnected"
  | "room.player_disconnected";
export type RoomSubscriptionEvent = {
  action: RoomEventAction;
  room: RoomSnapshot;
  trace_id: string;
  actor_player_id: string | null;
};
type RoomEventListener = (event: RoomSubscriptionEvent) => void;

const logger = createStructuredLogger("platform-api.room-service");
const RECONNECT_WINDOW_SECONDS = 120;
const STALE_WAITING_ROOM_SECONDS = 30 * 60;
const MAINTENANCE_SWEEP_INTERVAL_MS = 30_000;

@Injectable()
export class RoomService {
  private readonly listeners = new Set<RoomEventListener>();
  private readonly maintenanceTimer: ReturnType<typeof setInterval>;

  constructor(
    @Inject(RoomRepository)
    private readonly roomRepository: RoomRepository
  ) {
    this.maintenanceTimer = setInterval(() => {
      void this.sweepExpiredRooms(startTrace());
    }, MAINTENANCE_SWEEP_INTERVAL_MS);
    this.maintenanceTimer.unref();
  }

  async createRoom(traceContext: TraceContext, payload: unknown) {
    const span = startChildSpan(traceContext);
    const request = this.parsePayload(createRoomRequestSchema.safeParse(payload));

    await this.sweepExpiredRooms(traceContext);

    const now = new Date().toISOString();
    const room = roomSnapshotSchema.parse({
      room_id: this.createRoomId(),
      room_name: request.room_name,
      game_id: request.game_id,
      host_player_id: request.host_player_id,
      status: "waiting",
      invite_code: this.createInviteCode(),
      max_players: request.max_players,
      created_at: now,
      updated_at: now,
      players: [
        this.createPlayer({
          is_host: true,
          player_id: request.host_player_id,
          session_id: request.host_session_id
        })
      ],
      reconnect_window_seconds: RECONNECT_WINDOW_SECONDS
    });

    await this.roomRepository.set(room);

    logger.info("room.created", span, {
      input_summary: JSON.stringify({
        game_id: request.game_id,
        host_player_id: request.host_player_id
      }),
      output_summary: JSON.stringify({
        room_id: room.room_id,
        invite_code: room.invite_code
      }),
      metadata: {
        room_id: room.room_id
      }
    });

    this.emitRoomEvent("room.created", traceContext, room, request.host_player_id);

    return roomActionResponseSchema.parse({
      trace_id: traceContext.trace_id,
      room
    });
  }

  async joinRoom(traceContext: TraceContext, payload: unknown) {
    const span = startChildSpan(traceContext);
    const request = this.parsePayload(joinRoomRequestSchema.safeParse(payload));
    const room = await this.getRoomOrThrow(request.room_id);

    await this.cleanupRoom(traceContext, room.room_id);

    if (room.players.some((player) => player.player_id === request.player_id)) {
      throw new BadRequestException("Player already exists in room");
    }
    if (room.players.length >= room.max_players) {
      throw new BadRequestException("Room is full");
    }

    const updatedRoom = await this.persistRoom({
      ...room,
      updated_at: new Date().toISOString(),
      players: [
        ...room.players,
        this.createPlayer({
          is_host: false,
          player_id: request.player_id,
          session_id: request.session_id
        })
      ]
    });

    logger.info("room.joined", span, {
      input_summary: JSON.stringify(request),
      output_summary: `${updatedRoom.players.length} players`,
      metadata: {
        room_id: updatedRoom.room_id
      }
    });

    this.emitRoomEvent("room.joined", traceContext, updatedRoom, request.player_id);

    return roomActionResponseSchema.parse({
      trace_id: traceContext.trace_id,
      room: updatedRoom
    });
  }

  async joinRoomByInvite(traceContext: TraceContext, payload: unknown) {
    const span = startChildSpan(traceContext);
    const request = this.parsePayload(
      joinRoomByInviteRequestSchema.safeParse(payload)
    );
    const room = await this.findRoomByInviteCode(request.invite_code);

    logger.info("room.invite_code_resolved", span, {
      input_summary: request.invite_code.toUpperCase(),
      output_summary: room.room_id,
      metadata: {
        invite_code: room.invite_code,
        room_id: room.room_id
      }
    });

    return this.joinRoom(traceContext, {
      player_id: request.player_id,
      room_id: room.room_id,
      session_id: request.session_id
    });
  }

  async leaveRoom(traceContext: TraceContext, payload: unknown) {
    const span = startChildSpan(traceContext);
    const request = this.parsePayload(leaveRoomRequestSchema.safeParse(payload));
    const room = await this.getRoomOrThrow(request.room_id);

    const remainingPlayers = room.players.filter(
      (player) => player.player_id !== request.player_id
    );

    if (remainingPlayers.length === room.players.length) {
      throw new NotFoundException("Player not found in room");
    }

    const nextHostId = remainingPlayers[0]?.player_id ?? null;
    const updatedRoom = await this.persistRoom({
      ...room,
      host_player_id: nextHostId ?? room.host_player_id,
      status: this.deriveRoomStatus(remainingPlayers),
      updated_at: new Date().toISOString(),
      players: remainingPlayers.map((player) => ({
        ...player,
        is_host: player.player_id === nextHostId
      }))
    });

    if (updatedRoom.players.length === 0) {
      await this.roomRepository.delete(updatedRoom.room_id);
    }

    logger.info("room.left", span, {
      input_summary: JSON.stringify(request),
      output_summary: `${updatedRoom.players.length} players remaining`,
      metadata: {
        room_id: updatedRoom.room_id
      }
    });

    this.emitRoomEvent("room.left", traceContext, updatedRoom, request.player_id);

    return roomActionResponseSchema.parse({
      trace_id: traceContext.trace_id,
      room: updatedRoom
    });
  }

  async setReady(traceContext: TraceContext, payload: unknown) {
    const span = startChildSpan(traceContext);
    const request = this.parsePayload(setReadyRequestSchema.safeParse(payload));
    const room = await this.getRoomOrThrow(request.room_id);

    const updatedPlayers = room.players.map((player) =>
      player.player_id === request.player_id
        ? { ...player, ready: request.ready }
        : player
    );

    if (!updatedPlayers.some((player) => player.player_id === request.player_id)) {
      throw new NotFoundException("Player not found in room");
    }

    const allReady =
      updatedPlayers.length >= 2 && updatedPlayers.every((player) => player.ready);

    const updatedRoom = await this.persistRoom({
      ...room,
      players: updatedPlayers,
      status: this.deriveRoomStatus(updatedPlayers, allReady),
      updated_at: new Date().toISOString()
    });

    logger.info("room.ready_state_updated", span, {
      input_summary: JSON.stringify(request),
      output_summary: updatedRoom.status,
      metadata: {
        room_id: updatedRoom.room_id
      }
    });

    this.emitRoomEvent(
      "room.ready_state_updated",
      traceContext,
      updatedRoom,
      request.player_id
    );

    return roomActionResponseSchema.parse({
      trace_id: traceContext.trace_id,
      room: updatedRoom
    });
  }

  async reconnect(traceContext: TraceContext, payload: unknown) {
    const span = startChildSpan(traceContext);
    const request = this.parsePayload(
      reconnectPlayerRequestSchema.safeParse(payload)
    );
    const room = await this.getRoomOrThrow(request.room_id);
    const player = room.players.find(
      (candidate) => candidate.player_id === request.player_id
    );

    if (!player) {
      throw new NotFoundException("Player not found in room");
    }
    if (
      player.reconnect_deadline_at &&
      new Date(player.reconnect_deadline_at).getTime() < Date.now()
    ) {
      throw new BadRequestException("Reconnect window expired");
    }

    const updatedRoom = await this.persistRoom({
      ...room,
      status: this.deriveRoomStatus(
        room.players.map((candidate) =>
          candidate.player_id === request.player_id
            ? {
                ...candidate,
                session_id: request.session_id,
                connection_status: "connected",
                disconnected_at: null,
                reconnect_deadline_at: null
              }
            : candidate
        )
      ),
      updated_at: new Date().toISOString(),
      players: room.players.map((candidate) =>
        candidate.player_id === request.player_id
          ? {
              ...candidate,
              session_id: request.session_id,
              connection_status: "connected",
              disconnected_at: null,
              reconnect_deadline_at: null
            }
          : candidate
      )
    });

    logger.info("room.reconnected", span, {
      input_summary: JSON.stringify(request),
      output_summary: updatedRoom.status,
      metadata: {
        room_id: updatedRoom.room_id
      }
    });

    this.emitRoomEvent(
      "room.reconnected",
      traceContext,
      updatedRoom,
      request.player_id
    );

    return roomActionResponseSchema.parse({
      trace_id: traceContext.trace_id,
      room: updatedRoom
    });
  }

  async disconnect(traceContext: TraceContext, roomId: string, playerId: string) {
    const span = startChildSpan(traceContext);
    const room = await this.getRoomOrThrow(roomId);
    const now = new Date();
    const reconnectDeadline = new Date(
      now.getTime() + RECONNECT_WINDOW_SECONDS * 1000
    ).toISOString();

    const updatedRoom = await this.persistRoom({
      ...room,
      status: this.deriveRoomStatus(
        room.players.map((player) =>
          player.player_id === playerId
            ? {
                ...player,
                connection_status: "disconnected",
                disconnected_at: now.toISOString(),
                reconnect_deadline_at: reconnectDeadline
              }
            : player
        )
      ),
      updated_at: now.toISOString(),
      players: room.players.map((player) =>
        player.player_id === playerId
          ? {
              ...player,
              connection_status: "disconnected",
              disconnected_at: now.toISOString(),
              reconnect_deadline_at: reconnectDeadline
            }
          : player
      )
    });

    logger.warn("room.player_disconnected", span, {
      input_summary: JSON.stringify({ room_id: roomId, player_id: playerId }),
      output_summary: reconnectDeadline,
      metadata: {
        room_id: roomId
      }
    });

    this.emitRoomEvent(
      "room.player_disconnected",
      traceContext,
      updatedRoom,
      playerId
    );

    return roomActionResponseSchema.parse({
      trace_id: traceContext.trace_id,
      room: updatedRoom
    });
  }

  async getRoom(traceContext: TraceContext, roomId: string) {
    const span = startChildSpan(traceContext);
    await this.cleanupRoom(traceContext, roomId);
    const room = await this.getRoomOrThrow(roomId);

    logger.info("room.fetched", span, {
      output_summary: room.status,
      metadata: {
        room_id: room.room_id
      }
    });

    return roomActionResponseSchema.parse({
      trace_id: traceContext.trace_id,
      room
    });
  }

  getRealtimeContract() {
    return {
      protocol: "websocket",
      endpoint: "/ws/game-room",
      required_query: ["trace_id", "room_id", "player_id", "session_id"],
      supported_message_types: [
        "ack",
        "error",
        "game_event",
        "game_state",
        "game_state_request",
        "room_presence",
        "room_snapshot_request",
        "room_snapshot"
      ]
    };
  }

  subscribe(listener: RoomEventListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private createPlayer(input: {
    is_host: boolean;
    player_id: string;
    session_id: string;
  }): RoomPlayer {
    return {
      player_id: input.player_id,
      session_id: input.session_id,
      is_host: input.is_host,
      ready: input.is_host,
      connection_status: "connected",
      disconnected_at: null,
      reconnect_deadline_at: null
    };
  }

  async sweepExpiredRooms(traceContext: TraceContext) {
    for (const roomId of await this.roomRepository.listIds()) {
      await this.cleanupRoom(traceContext, roomId);
    }
  }

  private async cleanupRoom(traceContext: TraceContext, roomId: string) {
    const span = startChildSpan(traceContext);
    const room = await this.roomRepository.get(roomId);
    if (!room) {
      return;
    }

    const now = Date.now();
    const activePlayers = room.players.filter((player) => {
      if (!player.reconnect_deadline_at) {
        return true;
      }
      return new Date(player.reconnect_deadline_at).getTime() >= now;
    });
    const removedPlayerIds = room.players
      .filter((player) => !activePlayers.some((active) => active.player_id === player.player_id))
      .map((player) => player.player_id);
    const isStaleWaitingRoom =
      room.players.length <= 1 &&
      room.status === "waiting" &&
      Date.parse(room.updated_at) + STALE_WAITING_ROOM_SECONDS * 1000 < now;

    if (activePlayers.length === 0 || isStaleWaitingRoom) {
      await this.roomRepository.delete(roomId);

      logger.warn("room.cleaned_up", span, {
        input_summary: roomId,
        output_summary: "deleted",
        metadata: {
          reason: isStaleWaitingRoom ? "stale_waiting_room" : "expired_reconnect_window",
          removed_player_ids: removedPlayerIds,
          room_id: roomId
        }
      });

      this.emitRoomEvent(
        "room.cleaned_up",
        traceContext,
        roomSnapshotSchema.parse({
          ...room,
          players: [],
          status: "abandoned",
          updated_at: new Date().toISOString()
        }),
        null
      );
      return;
    }

    const nextHostId = activePlayers.find((player) => player.is_host)?.player_id
      ?? activePlayers[0]?.player_id
      ?? room.host_player_id;
    const nextRoom = roomSnapshotSchema.parse({
      ...room,
      host_player_id: nextHostId,
      status: this.deriveRoomStatus(
        activePlayers.map((player) => ({
          ...player,
          is_host: player.player_id === nextHostId
        }))
      ),
      updated_at: new Date().toISOString(),
      players: activePlayers.map((player) => ({
        ...player,
        is_host: player.player_id === nextHostId
      }))
    });

    const roomChanged =
      removedPlayerIds.length > 0 ||
      nextRoom.status !== room.status ||
      nextRoom.host_player_id !== room.host_player_id;

    await this.roomRepository.set(nextRoom);

    if (roomChanged) {
      logger.info("room.cleaned_up", span, {
        input_summary: roomId,
        output_summary: nextRoom.status,
        metadata: {
          removed_player_ids: removedPlayerIds,
          room_id: roomId
        }
      });

      this.emitRoomEvent("room.cleaned_up", traceContext, nextRoom, null);
    }
  }

  private async persistRoom(room: RoomRecord) {
    const parsed = roomSnapshotSchema.parse(room);
    return this.roomRepository.set(parsed);
  }

  private async getRoomOrThrow(roomId: string) {
    const room = await this.roomRepository.get(roomId);
    if (!room) {
      throw new NotFoundException("Room not found");
    }
    return room;
  }

  private async findRoomByInviteCode(inviteCode: string) {
    await this.sweepExpiredRooms(startTrace());

    const normalizedInviteCode = inviteCode.trim().toUpperCase();

    for (const roomId of await this.roomRepository.listIds()) {
      const room = await this.roomRepository.get(roomId);
      if (!room) {
        continue;
      }

      if (room.invite_code.toUpperCase() === normalizedInviteCode) {
        return room;
      }
    }

    throw new NotFoundException("Invite code not found");
  }

  private parsePayload<T>(parsed: { success: true; data: T } | { success: false; error: { message: string } }): T {
    if (parsed.success) {
      return parsed.data;
    }
    throw new BadRequestException(parsed.error.message);
  }

  private emitRoomEvent(
    action: RoomEventAction,
    traceContext: TraceContext,
    room: RoomSnapshot,
    actorPlayerId: string | null
  ) {
    for (const listener of this.listeners) {
      try {
        listener({
          action,
          room,
          trace_id: traceContext.trace_id,
          actor_player_id: actorPlayerId
        });
      } catch (error) {
        logger.error("room.listener_failed", traceContext, {
          status: "error",
          error_detail:
            error instanceof Error ? error.message : "Unknown room listener error",
          metadata: {
            room_id: room.room_id,
            action
          }
        });
      }
    }
  }

  private createRoomId() {
    return `room_${Math.random().toString(36).slice(2, 10)}`;
  }

  private createInviteCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  private deriveRoomStatus(players: RoomPlayer[], allReady?: boolean): RoomSnapshot["status"] {
    if (players.length === 0) {
      return "abandoned";
    }

    const connectedPlayers = players.filter(
      (player) => player.connection_status === "connected"
    );
    if (connectedPlayers.length < 2) {
      return "waiting";
    }

    const everyoneReady =
      allReady ?? connectedPlayers.every((player) => player.ready);

    return everyoneReady ? "ready" : "waiting";
  }
}
