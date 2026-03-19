import {
  channelCatalogEntrySchema,
  channelConfigSchema,
  gamePackageMetadataSchema,
  type ChannelCatalogEntry,
  type ChannelConfig
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
  })
];

export const buildChannelCatalog = (): ChannelCatalogEntry[] =>
  packageMetadata.map((metadata) =>
    channelCatalogEntrySchema.parse({
      game_id: metadata.id,
      display_name: metadata.name,
      description:
        metadata.id === "quiz-duel"
          ? "Fast head-to-head quiz battles for onboard LAN play."
          : metadata.id === "word-rally"
            ? "Letter-based multiplayer word rounds designed for invite-code matches."
          : metadata.id === "memory-match-duel"
              ? "Turn-based memory flips with shared board state and invite-room play."
            : metadata.id === "spot-the-difference-race"
              ? "Low-frequency spot-claim racing built for cabin invite rooms."
            : metadata.id === "runway-rush"
              ? "Short reaction rounds for passengers who want a quick solo score chase."
            : "Single-player puzzle loops optimized for short sessions.",
      route: metadata.frontend.route,
      categories:
        metadata.id === "quiz-duel"
          ? ["Multiplayer", "Trivia", "Featured"]
          : metadata.id === "word-rally"
            ? ["Multiplayer", "Word", "Featured"]
          : metadata.id === "memory-match-duel"
              ? ["Multiplayer", "Memory", "Featured"]
            : metadata.id === "spot-the-difference-race"
              ? ["Multiplayer", "Observation", "Featured"]
            : metadata.id === "runway-rush"
              ? ["Single Player", "Reaction", "Featured"]
            : ["Single Player", "Puzzle", "Relaxed"],
      capabilities: metadata.capabilities,
      points_enabled: metadata.capabilities.includes("points-reporting")
    })
  );

export const buildChannelConfig = (
  airlineCode: string,
  locale: string
): ChannelConfig =>
  channelConfigSchema.parse({
    airline_code: airlineCode,
    channel_name: `${airlineCode} Game Channel`,
    locale,
    hero_title: "Play lightweight games designed for onboard sessions.",
    sections: ["Featured", "Multiplayer", "Single Player", "Recently Added"],
    feature_flags: {
      points_enabled: true,
      multiplayer_lobby_enabled: true,
      airline_rewards_enabled: true
    }
  });
