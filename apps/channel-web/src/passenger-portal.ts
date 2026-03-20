import { useEffect, useMemo, useState } from "react";

import type {
  ChannelCatalogEntry,
  SessionBootstrapResponse
} from "@wifi-portal/game-sdk";

import { bootstrapSession } from "./channel-api";

export const DEFAULT_BOOTSTRAP = {
  airline_code: "MU",
  cabin_class: "economy",
  locale: "zh-CN",
  seat_number: "32A"
} as const;

export function usePassengerBootstrap() {
  const [bootstrapData, setBootstrapData] =
    useState<SessionBootstrapResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    setApiError(null);

    void bootstrapSession(DEFAULT_BOOTSTRAP)
      .then((response) => {
        setBootstrapData(response);
      })
      .catch((error: unknown) => {
        setApiError(error instanceof Error ? error.message : "频道初始化失败");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const catalogEntries = useMemo(
    () => bootstrapData?.catalog ?? [],
    [bootstrapData?.catalog]
  );

  return {
    apiError,
    bootstrapData,
    catalogEntries,
    isLoading
  };
}

export function getFeaturedGames(
  entries: ChannelCatalogEntry[],
  limit = 6
): ChannelCatalogEntry[] {
  const featured = entries.filter((entry) =>
    entry.categories.some((category) => category.toLowerCase() === "featured")
  );
  const fallback = entries.filter(
    (entry) => !featured.some((item) => item.game_id === entry.game_id)
  );

  return [...featured, ...fallback].slice(0, limit);
}

export function getGamesByCapability(
  entries: ChannelCatalogEntry[],
  capability: ChannelCatalogEntry["capabilities"][number],
  limit = 6
): ChannelCatalogEntry[] {
  return entries
    .filter((entry) => entry.capabilities.includes(capability))
    .slice(0, limit);
}

export function getGamesWithPoints(
  entries: ChannelCatalogEntry[],
  limit = 6
): ChannelCatalogEntry[] {
  return entries.filter((entry) => entry.points_enabled).slice(0, limit);
}

export function getGameModeLabel(entry: ChannelCatalogEntry): string {
  if (entry.capabilities.includes("multiplayer")) {
    return entry.capabilities.includes("invite-code")
      ? "联机 / 邀请码"
      : "联机";
  }

  return "单机";
}

export function getGameAccent(entry: ChannelCatalogEntry): string {
  if (entry.capabilities.includes("multiplayer")) {
    return "portal-card-accent-cyan";
  }

  if (entry.points_enabled) {
    return "portal-card-accent-gold";
  }

  return "portal-card-accent-mint";
}
