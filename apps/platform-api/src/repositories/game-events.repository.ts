import { Inject, Injectable } from "@nestjs/common";

import {
  gameEventRecordSchema,
  type GameEventRecord
} from "@wifi-portal/game-sdk";

import { JsonStateStore } from "./json-state-store";

export abstract class GameEventsRepository {
  abstract get(eventId: string): Promise<GameEventRecord | undefined>;
  abstract list(input?: {
    event_type?: GameEventRecord["event_type"];
    game_id?: string;
    limit?: number;
    passenger_id?: string;
    room_id?: string;
    session_id?: string;
  }): Promise<GameEventRecord[]>;
  abstract set(event: GameEventRecord): Promise<GameEventRecord>;
}

const GAME_EVENTS_KEY_PREFIX = "wifi-portal:game-events:";
const GAME_EVENTS_TTL_SECONDS = 60 * 60 * 24 * 14;

@Injectable()
export class StateStoreGameEventsRepository extends GameEventsRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async get(eventId: string) {
    const payload = await this.stateStore.get<GameEventRecord>(
      this.toStorageKey(eventId)
    );
    if (!payload) {
      return undefined;
    }

    return gameEventRecordSchema.parse(payload);
  }

  async list(
    input: {
      event_type?: GameEventRecord["event_type"];
      game_id?: string;
      limit?: number;
      passenger_id?: string;
      room_id?: string;
      session_id?: string;
    } = {}
  ) {
    const keys = await this.stateStore.list(GAME_EVENTS_KEY_PREFIX);
    const entries = await Promise.all(
      keys.map(async (key) => {
        const payload = await this.stateStore.get<GameEventRecord>(key);
        if (!payload) {
          return null;
        }

        const entry = gameEventRecordSchema.parse(payload);
        if (input.event_type && entry.event_type !== input.event_type) {
          return null;
        }
        if (input.game_id && entry.game_id !== input.game_id) {
          return null;
        }
        if (input.passenger_id && entry.passenger_id !== input.passenger_id) {
          return null;
        }
        if (input.room_id && entry.room_id !== input.room_id) {
          return null;
        }
        if (input.session_id && entry.session_id !== input.session_id) {
          return null;
        }
        return entry;
      })
    );

    return entries
      .filter((entry): entry is GameEventRecord => entry !== null)
      .sort((left, right) => {
        const recordedAtComparison = right.recorded_at.localeCompare(left.recorded_at);
        if (recordedAtComparison !== 0) {
          return recordedAtComparison;
        }

        return left.event_id.localeCompare(right.event_id);
      })
      .slice(0, input.limit ?? 20);
  }

  async set(event: GameEventRecord) {
    return this.stateStore.set(this.toStorageKey(event.event_id), event, {
      ttl_seconds: GAME_EVENTS_TTL_SECONDS
    });
  }

  private toStorageKey(eventId: string) {
    return `${GAME_EVENTS_KEY_PREFIX}${eventId}`;
  }
}
