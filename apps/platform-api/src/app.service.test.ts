import { describe, expect, it } from "vitest";

import { startTrace } from "@wifi-portal/shared-observability";

import { AppService } from "./app.service";

describe("AppService", () => {
  const service = new AppService();

  it("bootstraps a validated session payload", () => {
    const response = service.bootstrapSession(startTrace(), {
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

  it("returns a channel catalog backed by package metadata", () => {
    const catalog = service.getCatalog(startTrace());

    expect(catalog).toHaveLength(6);
    expect(catalog.map((entry) => entry.game_id)).toEqual([
      "quiz-duel",
      "cabin-puzzle",
      "word-rally",
      "memory-match-duel",
      "spot-the-difference-race",
      "runway-rush"
    ]);
  });
});
