import { describe, expect, it } from "vitest";

import { startTrace } from "@wifi-portal/shared-observability";

import { ChannelContentService } from "./channel-content.service";
import { InMemoryJsonStateStore } from "./repositories/json-state-store";
import {
  ChannelContentRepository,
  StateStoreChannelContentRepository
} from "./repositories/channel-content.repository";

describe("ChannelContentService", () => {
  it("seeds default content and exposes a public catalog sorted by managed order", async () => {
    const repository: ChannelContentRepository = new StateStoreChannelContentRepository(
      new InMemoryJsonStateStore()
    );
    const service = new ChannelContentService(repository);
    const trace = startTrace();

    const content = await service.getChannelContent(trace, "MU", "zh-CN");
    const catalog = await service.getPublicCatalog(trace, "MU", "zh-CN");

    expect(content.draft.catalog).toHaveLength(12);
    expect(content.publication).toMatchObject({
      draft_revision: 1,
      has_unpublished_changes: false,
      published_revision: 1
    });
    expect(catalog[0]).toMatchObject({
      categories: ["Featured", "Multiplayer", "Trivia"],
      game_id: "quiz-duel"
    });
  });

  it("persists hero and catalog visibility updates for subsequent bootstrap reads", async () => {
    const repository: ChannelContentRepository = new StateStoreChannelContentRepository(
      new InMemoryJsonStateStore()
    );
    const service = new ChannelContentService(repository);
    const trace = startTrace();
    const current = await service.getChannelContent(trace, "MU", "zh-CN");

    const updated = await service.updateChannelContent(trace, {
      catalog: current.draft.catalog.map((entry, index) => ({
        categories: entry.game_id === "runway-rush" ? ["Reaction", "Recently Added"] : entry.categories,
        description:
          entry.game_id === "runway-rush"
            ? "Fresh single-player sprint promoted for the latest cabin playlist."
            : entry.description,
        featured: entry.game_id === "runway-rush" ? true : entry.featured,
        game_id: entry.game_id,
        sort_order: entry.game_id === "runway-rush" ? 0 : index + 1,
        status: entry.game_id === "cabin-puzzle" ? "hidden" : entry.status
      })),
      channel_config: {
        ...current.draft.channel_config,
        hero_title: "Freshly configured from the admin console."
      }
    });

    const catalogBeforePublish = await service.getPublicCatalog(trace, "MU", "zh-CN");
    const channelConfig = await service.getPublicChannelConfig(trace, "MU", "zh-CN");
    const published = await service.publishChannelContent(
      trace,
      {
        airline_code: "MU",
        locale: "zh-CN"
      },
      "super-admin"
    );
    const catalogAfterPublish = await service.getPublicCatalog(trace, "MU", "zh-CN");
    const publishedConfig = await service.getPublicChannelConfig(trace, "MU", "zh-CN");

    expect(updated.draft.channel_config.hero_title).toBe(
      "Freshly configured from the admin console."
    );
    expect(updated.publication).toMatchObject({
      draft_revision: 2,
      has_unpublished_changes: true,
      published_revision: 1
    });
    expect(channelConfig.hero_title).not.toBe(
      "Freshly configured from the admin console."
    );
    expect(catalogBeforePublish.some((entry) => entry.game_id === "cabin-puzzle")).toBe(true);
    expect(published.publication).toMatchObject({
      has_unpublished_changes: false,
      last_published_by: "super-admin",
      published_revision: 2
    });
    expect(publishedConfig.hero_title).toBe(
      "Freshly configured from the admin console."
    );
    expect(catalogAfterPublish.some((entry) => entry.game_id === "cabin-puzzle")).toBe(false);
    expect(catalogAfterPublish[0]).toMatchObject({
      categories: ["Featured", "Reaction", "Recently Added"],
      game_id: "runway-rush"
    });
  });
});
