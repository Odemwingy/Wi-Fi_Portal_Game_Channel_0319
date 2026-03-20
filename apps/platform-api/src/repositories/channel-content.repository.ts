import { Inject, Injectable } from "@nestjs/common";

import {
  channelContentDocumentSchema,
  channelContentStateSchema,
  type ChannelContentDocument
} from "@wifi-portal/game-sdk";

import { JsonStateStore } from "./json-state-store";

const CHANNEL_CONTENT_KEY_PREFIX = "wifi-portal:channel-content:";
const CHANNEL_CONTENT_TTL_SECONDS = 60 * 60 * 24 * 30;

export abstract class ChannelContentRepository {
  abstract get(
    airlineCode: string,
    locale: string
  ): Promise<ChannelContentDocument | undefined>;
  abstract set(
    airlineCode: string,
    locale: string,
    state: ChannelContentDocument
  ): Promise<ChannelContentDocument>;
}

@Injectable()
export class StateStoreChannelContentRepository extends ChannelContentRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async get(airlineCode: string, locale: string) {
    const payload = await this.stateStore.get<unknown>(this.toStorageKey(airlineCode, locale));
    if (!payload) {
      return undefined;
    }

    const document = channelContentDocumentSchema.safeParse(payload);
    if (document.success) {
      return document.data;
    }

    const legacyState = channelContentStateSchema.parse(payload);
    return channelContentDocumentSchema.parse({
      draft: legacyState,
      publication: {
        draft_revision: 1,
        has_unpublished_changes: false,
        last_published_at: legacyState.updated_at,
        last_published_by: "migration",
        published_revision: 1
      },
      published: legacyState
    });
  }

  async set(
    airlineCode: string,
    locale: string,
    state: ChannelContentDocument
  ) {
    return this.stateStore.set(this.toStorageKey(airlineCode, locale), state, {
      ttl_seconds: CHANNEL_CONTENT_TTL_SECONDS
    });
  }

  private toStorageKey(airlineCode: string, locale: string) {
    return `${CHANNEL_CONTENT_KEY_PREFIX}${airlineCode}:${locale}`;
  }
}
