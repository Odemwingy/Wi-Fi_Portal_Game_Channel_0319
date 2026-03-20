import { describe, expect, it } from "vitest";

import { startTrace } from "@wifi-portal/shared-observability";

import { ChannelContentService } from "./channel-content.service";
import { AppService } from "./app.service";
import { InMemoryJsonStateStore } from "./repositories/json-state-store";
import {
  ChannelContentRepository,
  StateStoreChannelContentRepository
} from "./repositories/channel-content.repository";

describe("AppService", () => {
  const repository: ChannelContentRepository = new StateStoreChannelContentRepository(
    new InMemoryJsonStateStore()
  );
  const service = new AppService(new ChannelContentService(repository));

  it("bootstraps a validated session payload", async () => {
    const response = await service.bootstrapSession(startTrace(), {
      airline_code: "MU",
      cabin_class: "business",
      locale: "zh-CN",
      passenger_id: "passenger-1"
    });

    expect(response.trace_id).toBeTruthy();
    expect(response.session.airlineCode).toBe("MU");
    expect(response.catalog.length).toBeGreaterThan(0);
    expect(response.channel_config.airline_code).toBe("MU");
  });

  it("returns a channel catalog backed by managed package metadata", async () => {
    const catalog = await service.getCatalog(startTrace(), "MU", "zh-CN");

    expect(catalog).toHaveLength(9);
    expect(catalog.map((entry) => entry.game_id)).toEqual([
      "quiz-duel",
      "cabin-puzzle",
      "word-rally",
      "memory-match-duel",
      "mini-gomoku",
      "seat-map-strategy",
      "signal-scramble",
      "spot-the-difference-race",
      "runway-rush"
    ]);
  });
});
