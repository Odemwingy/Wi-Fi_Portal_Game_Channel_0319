import {
  BadRequestException,
  Inject,
  Injectable
} from "@nestjs/common";

import {
  channelContentStateSchema,
  channelContentDocumentSchema,
  channelContentPublishRequestSchema,
  channelContentUpdateRequestSchema,
} from "@wifi-portal/game-sdk";
import {
  createStructuredLogger,
  startChildSpan,
  type TraceContext
} from "@wifi-portal/shared-observability";

import {
  buildChannelCatalog,
  buildDefaultChannelContent,
  buildDefaultChannelContentDocument,
  buildPublicChannelConfig,
  listDefaultCatalogGameIds,
  mergeManagedCatalogEntry
} from "./catalog.data";
import { ChannelContentRepository } from "./repositories/channel-content.repository";

const logger = createStructuredLogger("platform-api.channel-content");

@Injectable()
export class ChannelContentService {
  constructor(
    @Inject(ChannelContentRepository)
    private readonly repository: ChannelContentRepository
  ) {}

  async getChannelContent(
    traceContext: TraceContext,
    airlineCode: string,
    locale: string
  ) {
    const span = startChildSpan(traceContext);
    const content = await this.loadOrSeedChannelContent(airlineCode, locale);

    logger.info("channel_content.loaded", span, {
      input_summary: JSON.stringify({
        airline_code: airlineCode,
        locale
      }),
      output_summary: `${content.draft.catalog.length} managed draft entries`,
      metadata: {
        draft_revision: content.publication.draft_revision,
        published_revision: content.publication.published_revision
      }
    });

    return content;
  }

  async getPublicCatalog(
    traceContext: TraceContext,
    airlineCode: string,
    locale: string
  ) {
    const content = await this.getChannelContent(traceContext, airlineCode, locale);
    return buildChannelCatalog(content.published);
  }

  async getPublicChannelConfig(
    traceContext: TraceContext,
    airlineCode: string,
    locale: string
  ) {
    const content = await this.getChannelContent(traceContext, airlineCode, locale);
    return buildPublicChannelConfig(content.published);
  }

  async updateChannelContent(traceContext: TraceContext, payload: unknown) {
    const span = startChildSpan(traceContext);
    const parsedPayload = this.parseUpdatePayload(payload, span);
    const airlineCode = parsedPayload.channel_config.airline_code;
    const locale = parsedPayload.channel_config.locale;
    const currentDocument = await this.loadOrSeedChannelContent(airlineCode, locale);
    const defaultContent = buildDefaultChannelContent(airlineCode, locale);
    const baseEntries = new Map(
      defaultContent.catalog.map((entry) => [entry.game_id, entry])
    );

    this.ensureCatalogCoverage(parsedPayload.catalog);

    const nextState = channelContentStateSchema.parse({
      catalog: parsedPayload.catalog.map((entry) => {
        const baseEntry = baseEntries.get(entry.game_id);
        if (!baseEntry) {
          throw new BadRequestException(`Unknown game_id ${entry.game_id}`);
        }

        return mergeManagedCatalogEntry(baseEntry, entry);
      }),
      channel_config: parsedPayload.channel_config,
      updated_at: new Date().toISOString()
    });

    const nextDocument = channelContentDocumentSchema.parse({
      draft: nextState,
      publication: {
        draft_revision: currentDocument.publication.draft_revision + 1,
        has_unpublished_changes:
          JSON.stringify(nextState) !== JSON.stringify(currentDocument.published),
        last_published_at: currentDocument.publication.last_published_at,
        last_published_by: currentDocument.publication.last_published_by,
        published_revision: currentDocument.publication.published_revision
      },
      published: currentDocument.published
    });

    await this.repository.set(airlineCode, locale, nextDocument);

    logger.info("channel_content.updated", span, {
      input_summary: JSON.stringify({
        airline_code: airlineCode,
        locale
      }),
      output_summary: `${nextDocument.draft.catalog.filter((entry) => entry.status === "published").length} published-ready draft entries`,
      metadata: {
        draft_revision: nextDocument.publication.draft_revision,
        has_unpublished_changes: nextDocument.publication.has_unpublished_changes
      }
    });

    return nextDocument;
  }

  async publishChannelContent(
    traceContext: TraceContext,
    payload: unknown,
    actorUsername: string
  ) {
    const span = startChildSpan(traceContext);
    const parsedPayload = this.parsePublishPayload(payload, span);
    const currentDocument = await this.loadOrSeedChannelContent(
      parsedPayload.airline_code,
      parsedPayload.locale
    );
    const publishedAt = new Date().toISOString();
    const publishedState = channelContentStateSchema.parse({
      ...currentDocument.draft,
      updated_at: publishedAt
    });
    const nextDocument = channelContentDocumentSchema.parse({
      draft: publishedState,
      publication: {
        draft_revision: currentDocument.publication.draft_revision,
        has_unpublished_changes: false,
        last_published_at: publishedAt,
        last_published_by: actorUsername,
        published_revision: currentDocument.publication.published_revision + 1
      },
      published: publishedState
    });

    await this.repository.set(
      parsedPayload.airline_code,
      parsedPayload.locale,
      nextDocument
    );

    logger.info("channel_content.published", span, {
      input_summary: JSON.stringify(parsedPayload),
      output_summary: `published revision ${nextDocument.publication.published_revision}`,
      metadata: {
        actor_username: actorUsername
      }
    });

    return nextDocument;
  }

  private ensureCatalogCoverage(
    catalog: Array<{
      game_id: string;
    }>
  ) {
    const expectedGameIds = listDefaultCatalogGameIds().slice().sort();
    const receivedGameIds = [...new Set(catalog.map((entry) => entry.game_id))]
      .slice()
      .sort();

    if (
      expectedGameIds.length !== receivedGameIds.length ||
      expectedGameIds.some((gameId, index) => gameId !== receivedGameIds[index])
    ) {
      throw new BadRequestException({
        expected_game_ids: expectedGameIds,
        message: "Channel content update must include exactly one entry per known game",
        received_game_ids: receivedGameIds
      });
    }
  }

  private async loadOrSeedChannelContent(airlineCode: string, locale: string) {
    const existing = await this.repository.get(airlineCode, locale);
    if (existing) {
      return existing;
    }

    const seeded = buildDefaultChannelContentDocument(airlineCode, locale);
    await this.repository.set(airlineCode, locale, seeded);
    return seeded;
  }

  private parseUpdatePayload(
    payload: unknown,
    traceContext: TraceContext
  ) {
    const parsed = channelContentUpdateRequestSchema.safeParse(payload);
    if (parsed.success) {
      return parsed.data;
    }

    logger.warn("channel_content.invalid_payload", traceContext, {
      error_detail: parsed.error.message,
      input_summary: JSON.stringify(payload ?? {}),
      status: "error"
    });

    throw new BadRequestException({
      issues: parsed.error.flatten(),
      message: "Invalid channel content update payload"
    });
  }

  private parsePublishPayload(
    payload: unknown,
    traceContext: TraceContext
  ) {
    const parsed = channelContentPublishRequestSchema.safeParse(payload);
    if (parsed.success) {
      return parsed.data;
    }

    logger.warn("channel_content.invalid_publish_payload", traceContext, {
      error_detail: parsed.error.message,
      input_summary: JSON.stringify(payload ?? {}),
      status: "error"
    });

    throw new BadRequestException({
      issues: parsed.error.flatten(),
      message: "Invalid channel content publish payload"
    });
  }
}
