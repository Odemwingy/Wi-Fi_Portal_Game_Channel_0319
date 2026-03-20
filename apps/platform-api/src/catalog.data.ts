import {
  channelCatalogEntrySchema,
  channelConfigSchema,
  channelContentDocumentSchema,
  channelContentStateSchema,
  gamePackageMetadataSchema,
  managedChannelCatalogEntrySchema,
  type ChannelCatalogEntry,
  type ChannelConfig,
  type ChannelContentDocument,
  type ChannelContentState,
  type ManagedChannelCatalogEntry
} from "@wifi-portal/game-sdk";

const packageMetadata = [
  gamePackageMetadataSchema.parse({
    id: "quiz-duel",
    name: "Quiz Duel",
    version: "1.0.0",
    frontend: {
      route: "/games/quiz-duel",
      assetsPath: "/opt/games/quiz-duel/frontend"
    },
    server: {
      image: "registry.local/quiz-duel-server:1.0.0",
      port: 8080
    },
    realtime: {
      protocol: "websocket"
    },
    dependencies: ["redis"],
    capabilities: ["multiplayer", "leaderboard", "invite-code", "points-reporting"],
    healthcheck: {
      path: "/health"
    },
    observability: {
      emitsStructuredLogs: true,
      supportsTraceContext: true
    }
  }),
  gamePackageMetadataSchema.parse({
    id: "airline-trivia-teams",
    name: "Airline Trivia Teams",
    version: "1.0.0",
    frontend: {
      route: "/games/airline-trivia-teams",
      assetsPath: "/opt/games/airline-trivia-teams/frontend"
    },
    server: {
      image: "registry.local/airline-trivia-teams-server:1.0.0",
      port: 8099
    },
    realtime: {
      protocol: "websocket"
    },
    dependencies: ["redis"],
    capabilities: ["multiplayer", "leaderboard", "invite-code", "points-reporting"],
    healthcheck: {
      path: "/health"
    },
    observability: {
      emitsStructuredLogs: true,
      supportsTraceContext: true
    }
  }),
  gamePackageMetadataSchema.parse({
    id: "tap-beat-battle",
    name: "Tap Beat Battle",
    version: "1.0.0",
    frontend: {
      route: "/games/tap-beat-battle",
      assetsPath: "/opt/games/tap-beat-battle/frontend"
    },
    server: {
      image: "registry.local/tap-beat-battle-server:1.0.0",
      port: 8100
    },
    realtime: {
      protocol: "websocket"
    },
    dependencies: ["redis"],
    capabilities: ["multiplayer", "leaderboard", "invite-code", "points-reporting"],
    healthcheck: {
      path: "/health"
    },
    observability: {
      emitsStructuredLogs: true,
      supportsTraceContext: true
    }
  }),
  gamePackageMetadataSchema.parse({
    id: "cabin-card-clash",
    name: "Cabin Card Clash",
    version: "1.0.0",
    frontend: {
      route: "/games/cabin-card-clash",
      assetsPath: "/opt/games/cabin-card-clash/frontend"
    },
    server: {
      image: "registry.local/cabin-card-clash-server:1.0.0",
      port: 8098
    },
    realtime: {
      protocol: "websocket"
    },
    dependencies: ["redis"],
    capabilities: ["multiplayer", "leaderboard", "invite-code", "points-reporting"],
    healthcheck: {
      path: "/health"
    },
    observability: {
      emitsStructuredLogs: true,
      supportsTraceContext: true
    }
  }),
  gamePackageMetadataSchema.parse({
    id: "baggage-sort-showdown",
    name: "Baggage Sort Showdown",
    version: "1.0.0",
    frontend: {
      route: "/games/baggage-sort-showdown",
      assetsPath: "/opt/games/baggage-sort-showdown/frontend"
    },
    server: {
      image: "registry.local/baggage-sort-showdown-server:1.0.0",
      port: 8097
    },
    realtime: {
      protocol: "websocket"
    },
    dependencies: ["redis"],
    capabilities: ["multiplayer", "leaderboard", "invite-code", "points-reporting"],
    healthcheck: {
      path: "/health"
    },
    observability: {
      emitsStructuredLogs: true,
      supportsTraceContext: true
    }
  }),
  gamePackageMetadataSchema.parse({
    id: "cabin-puzzle",
    name: "Cabin Puzzle",
    version: "1.0.0",
    frontend: {
      route: "/games/cabin-puzzle",
      assetsPath: "/opt/games/cabin-puzzle/frontend"
    },
    server: {
      image: "registry.local/cabin-puzzle-server:1.0.0",
      port: 8090
    },
    realtime: {
      protocol: "sse"
    },
    dependencies: [],
    capabilities: ["single-player", "points-reporting"],
    healthcheck: {
      path: "/health"
    },
    observability: {
      emitsStructuredLogs: true,
      supportsTraceContext: true
    }
  }),
  gamePackageMetadataSchema.parse({
    id: "word-rally",
    name: "Word Rally",
    version: "1.0.0",
    frontend: {
      route: "/games/word-rally",
      assetsPath: "/opt/games/word-rally/frontend"
    },
    server: {
      image: "registry.local/word-rally-server:1.0.0",
      port: 8081
    },
    realtime: {
      protocol: "websocket"
    },
    dependencies: ["redis"],
    capabilities: ["multiplayer", "leaderboard", "invite-code", "points-reporting"],
    healthcheck: {
      path: "/health"
    },
    observability: {
      emitsStructuredLogs: true,
      supportsTraceContext: true
    }
  }),
  gamePackageMetadataSchema.parse({
    id: "memory-match-duel",
    name: "Memory Match Duel",
    version: "1.0.0",
    frontend: {
      route: "/games/memory-match-duel",
      assetsPath: "/opt/games/memory-match-duel/frontend"
    },
    server: {
      image: "registry.local/memory-match-duel-server:1.0.0",
      port: 8092
    },
    realtime: {
      protocol: "websocket"
    },
    dependencies: ["redis"],
    capabilities: ["multiplayer", "leaderboard", "invite-code", "points-reporting"],
    healthcheck: {
      path: "/health"
    },
    observability: {
      emitsStructuredLogs: true,
      supportsTraceContext: true
    }
  }),
  gamePackageMetadataSchema.parse({
    id: "mini-gomoku",
    name: "Mini Gomoku",
    version: "1.0.0",
    frontend: {
      route: "/games/mini-gomoku",
      assetsPath: "/opt/games/mini-gomoku/frontend"
    },
    server: {
      image: "registry.local/mini-gomoku-server:1.0.0",
      port: 8094
    },
    realtime: {
      protocol: "websocket"
    },
    dependencies: ["redis"],
    capabilities: ["multiplayer", "leaderboard", "invite-code", "points-reporting"],
    healthcheck: {
      path: "/health"
    },
    observability: {
      emitsStructuredLogs: true,
      supportsTraceContext: true
    }
  }),
  gamePackageMetadataSchema.parse({
    id: "seat-map-strategy",
    name: "Seat Map Strategy",
    version: "1.0.0",
    frontend: {
      route: "/games/seat-map-strategy",
      assetsPath: "/opt/games/seat-map-strategy/frontend"
    },
    server: {
      image: "registry.local/seat-map-strategy-server:1.0.0",
      port: 8095
    },
    realtime: {
      protocol: "websocket"
    },
    dependencies: ["redis"],
    capabilities: ["multiplayer", "leaderboard", "invite-code", "points-reporting"],
    healthcheck: {
      path: "/health"
    },
    observability: {
      emitsStructuredLogs: true,
      supportsTraceContext: true
    }
  }),
  gamePackageMetadataSchema.parse({
    id: "signal-scramble",
    name: "Signal Scramble",
    version: "1.0.0",
    frontend: {
      route: "/games/signal-scramble",
      assetsPath: "/opt/games/signal-scramble/frontend"
    },
    server: {
      image: "registry.local/signal-scramble-server:1.0.0",
      port: 8096
    },
    realtime: {
      protocol: "websocket"
    },
    dependencies: ["redis"],
    capabilities: ["multiplayer", "leaderboard", "invite-code", "points-reporting"],
    healthcheck: {
      path: "/health"
    },
    observability: {
      emitsStructuredLogs: true,
      supportsTraceContext: true
    }
  }),
  gamePackageMetadataSchema.parse({
    id: "spot-the-difference-race",
    name: "Spot the Difference Race",
    version: "1.0.0",
    frontend: {
      route: "/games/spot-the-difference-race",
      assetsPath: "/opt/games/spot-the-difference-race/frontend"
    },
    server: {
      image: "registry.local/spot-the-difference-race-server:1.0.0",
      port: 8093
    },
    realtime: {
      protocol: "websocket"
    },
    dependencies: ["redis"],
    capabilities: ["multiplayer", "leaderboard", "invite-code", "points-reporting"],
    healthcheck: {
      path: "/health"
    },
    observability: {
      emitsStructuredLogs: true,
      supportsTraceContext: true
    }
  }),
  gamePackageMetadataSchema.parse({
    id: "runway-rush",
    name: "Runway Rush",
    version: "1.0.0",
    frontend: {
      route: "/games/runway-rush",
      assetsPath: "/opt/games/runway-rush/frontend"
    },
    server: {
      image: "registry.local/runway-rush-server:1.0.0",
      port: 8091
    },
    realtime: {
      protocol: "sse"
    },
    dependencies: [],
    capabilities: ["single-player", "points-reporting"],
    healthcheck: {
      path: "/health"
    },
    observability: {
      emitsStructuredLogs: true,
      supportsTraceContext: true
    }
  }),
  gamePackageMetadataSchema.parse({
    id: "luggage-logic",
    name: "Luggage Logic",
    version: "1.0.0",
    frontend: {
      route: "/games/luggage-logic",
      assetsPath: "/opt/games/luggage-logic/frontend"
    },
    server: {
      image: "registry.local/luggage-logic-server:1.0.0",
      port: 8101
    },
    realtime: {
      protocol: "sse"
    },
    dependencies: [],
    capabilities: ["single-player", "points-reporting"],
    healthcheck: {
      path: "/health"
    },
    observability: {
      emitsStructuredLogs: true,
      supportsTraceContext: true
    }
  }),
  gamePackageMetadataSchema.parse({
    id: "meal-cart-match",
    name: "Meal Cart Match",
    version: "1.0.0",
    frontend: {
      route: "/games/meal-cart-match",
      assetsPath: "/opt/games/meal-cart-match/frontend"
    },
    server: {
      image: "registry.local/meal-cart-match-server:1.0.0",
      port: 8102
    },
    realtime: {
      protocol: "sse"
    },
    dependencies: [],
    capabilities: ["single-player", "points-reporting"],
    healthcheck: {
      path: "/health"
    },
    observability: {
      emitsStructuredLogs: true,
      supportsTraceContext: true
    }
  })
];

export const buildDefaultChannelContent = (
  airlineCode: string,
  locale: string
): ChannelContentState =>
  channelContentStateSchema.parse({
    catalog: packageMetadata.map((metadata, index) =>
      managedChannelCatalogEntrySchema.parse({
        capabilities: metadata.capabilities,
        categories: getBaseCategories(metadata.id).filter(
          (category) => category !== "Featured"
        ),
        description: getBaseDescription(metadata.id),
        display_name: metadata.name,
        featured: getBaseCategories(metadata.id).includes("Featured"),
        game_id: metadata.id,
        points_enabled: metadata.capabilities.includes("points-reporting"),
        route: metadata.frontend.route,
        sort_order: index,
        status: "published"
      })
    ),
    channel_config: buildDefaultChannelConfig(airlineCode, locale),
    updated_at: new Date().toISOString()
  });

export const buildDefaultChannelContentDocument = (
  airlineCode: string,
  locale: string
): ChannelContentDocument => {
  const seeded = buildDefaultChannelContent(airlineCode, locale);

  return channelContentDocumentSchema.parse({
    draft: seeded,
    publication: {
      draft_revision: 1,
      has_unpublished_changes: false,
      last_published_at: seeded.updated_at,
      last_published_by: "seed",
      published_revision: 1
    },
    published: seeded
  });
};

export const buildChannelCatalog = (
  content: ChannelContentState
): ChannelCatalogEntry[] =>
  content.catalog
    .filter((entry) => entry.status === "published")
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((entry) =>
      channelCatalogEntrySchema.parse({
        capabilities: entry.capabilities,
        categories: addFeaturedCategory(entry.categories, entry.featured),
        description: entry.description,
        display_name: entry.display_name,
        game_id: entry.game_id,
        points_enabled: entry.points_enabled,
        route: entry.route
      })
    );

export const buildPublicChannelConfig = (
  content: ChannelContentState
): ChannelConfig => channelConfigSchema.parse(content.channel_config);

export const listDefaultCatalogGameIds = () =>
  packageMetadata.map((metadata) => metadata.id);

export const mergeManagedCatalogEntry = (
  baseEntry: ManagedChannelCatalogEntry,
  input: {
    categories: string[];
    description: string;
    featured: boolean;
    sort_order: number;
    status: "published" | "hidden";
  }
): ManagedChannelCatalogEntry =>
  managedChannelCatalogEntrySchema.parse({
    ...baseEntry,
    categories: normalizeCategories(input.categories),
    description: input.description.trim(),
    featured: input.featured,
    sort_order: input.sort_order,
    status: input.status
  });

function buildDefaultChannelConfig(
  airlineCode: string,
  locale: string
): ChannelConfig {
  return channelConfigSchema.parse({
    airline_code: airlineCode,
    channel_name: `${airlineCode} Game Channel`,
    locale,
    hero_title: "Play lightweight games designed for onboard sessions.",
    sections: ["Featured", "Multiplayer", "Single Player", "Recently Added"],
    feature_flags: {
      airline_rewards_enabled: true,
      multiplayer_lobby_enabled: true,
      points_enabled: true
    }
  });
}

function getBaseCategories(gameId: string) {
  switch (gameId) {
    case "quiz-duel":
      return ["Multiplayer", "Trivia", "Featured"];
    case "airline-trivia-teams":
      return ["Multiplayer", "Trivia", "Featured"];
    case "tap-beat-battle":
      return ["Multiplayer", "Rhythm", "Featured"];
    case "cabin-card-clash":
      return ["Multiplayer", "Cards", "Featured"];
    case "baggage-sort-showdown":
      return ["Multiplayer", "Reaction", "Featured"];
    case "word-rally":
      return ["Multiplayer", "Word", "Featured"];
    case "memory-match-duel":
      return ["Multiplayer", "Memory", "Featured"];
    case "mini-gomoku":
      return ["Multiplayer", "Strategy", "Board"];
    case "seat-map-strategy":
      return ["Multiplayer", "Strategy", "Cabin"];
    case "signal-scramble":
      return ["Multiplayer", "Puzzle", "Signal"];
    case "spot-the-difference-race":
      return ["Multiplayer", "Observation", "Featured"];
    case "runway-rush":
      return ["Single Player", "Reaction", "Featured"];
    case "luggage-logic":
      return ["Single Player", "Puzzle", "Featured"];
    case "meal-cart-match":
      return ["Single Player", "Memory", "Featured"];
    default:
      return ["Single Player", "Puzzle", "Relaxed"];
  }
}

function getBaseDescription(gameId: string) {
  switch (gameId) {
    case "quiz-duel":
      return "Fast head-to-head quiz battles for onboard LAN play.";
    case "airline-trivia-teams":
      return "Team-scored airline trivia rounds for 2-4 passengers inside the same cabin room.";
    case "tap-beat-battle":
      return "Visual tempo duels with low-frequency synchronized beat patterns.";
    case "cabin-card-clash":
      return "A deliberately lightweight two-player cabin card duel with fast round resolution.";
    case "baggage-sort-showdown":
      return "Shared baggage queue reaction battles where the first correct classification wins the bag.";
    case "word-rally":
      return "Letter-based multiplayer word rounds designed for invite-code matches.";
    case "memory-match-duel":
      return "Turn-based memory flips with shared board state and invite-room play.";
    case "mini-gomoku":
      return "A lightweight invite-room Gomoku duel with five-in-a-row win detection.";
    case "seat-map-strategy":
      return "Cabin seat drafting with adjacency bonuses and turn-based score control.";
    case "signal-scramble":
      return "Asynchronous relay activation races where the first complete signal chain wins.";
    case "spot-the-difference-race":
      return "Low-frequency spot-claim racing built for cabin invite rooms.";
    case "runway-rush":
      return "Short reaction rounds for passengers who want a quick solo score chase.";
    case "luggage-logic":
      return "Single-player baggage sorting loops designed for quick cabin sessions.";
    case "meal-cart-match":
      return "Single-player pair matching loops built around meal-cart memory and catering cues.";
    default:
      return "Single-player puzzle loops optimized for short sessions.";
  }
}

function addFeaturedCategory(categories: string[], featured: boolean) {
  const normalized = normalizeCategories(categories);

  if (!featured) {
    return normalized;
  }

  return ["Featured", ...normalized.filter((category) => category !== "Featured")];
}

function normalizeCategories(categories: string[]) {
  return [...new Set(categories.map((category) => category.trim()).filter(Boolean))];
}
