import { useMemo, useState } from "react";

import { PassengerPortalShell } from "./PassengerPortalShell";
import {
  getFeaturedGames,
  getGameAccent,
  getGameModeLabel,
  getGamesByCapability,
  getGamesWithPoints,
  usePassengerBootstrap
} from "./passenger-portal";

const filterOptions = [
  { id: "all", label: "全部游戏" },
  { id: "multiplayer", label: "联机优先" },
  { id: "single-player", label: "单机快玩" },
  { id: "points", label: "积分优先" }
] as const;

type FilterId = (typeof filterOptions)[number]["id"];

export function PassengerGamesHubPage() {
  const { apiError, bootstrapData, catalogEntries, isLoading } =
    usePassengerBootstrap();
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");

  const filteredGames = useMemo(() => {
    switch (activeFilter) {
      case "multiplayer":
        return getGamesByCapability(catalogEntries, "multiplayer", 99);
      case "single-player":
        return getGamesByCapability(catalogEntries, "single-player", 99);
      case "points":
        return getGamesWithPoints(catalogEntries, 99);
      default:
        return catalogEntries;
    }
  }, [activeFilter, catalogEntries]);

  const featuredGames = useMemo(
    () => getFeaturedGames(catalogEntries, 3),
    [catalogEntries]
  );
  const multiplayerGames = useMemo(
    () => getGamesByCapability(catalogEntries, "multiplayer", 99),
    [catalogEntries]
  );
  const pointsGames = useMemo(
    () => getGamesWithPoints(catalogEntries, 99),
    [catalogEntries]
  );

  return (
    <PassengerPortalShell activePath="/portal/games" bootstrapData={bootstrapData}>
      <section className="portal-page-hero">
        <div>
          <p className="portal-kicker">Games Channel</p>
          <h2>游戏频道</h2>
          <p className="portal-copy">
            频道列表、推荐位、联机能力和积分能力都按乘客视角汇总在这里，
            视觉和交互参考 Tech Style In-Flight Entertainment 稿的导航与卡片结构。
          </p>
        </div>
        <div className="portal-stat-grid">
          <article className="portal-stat-card">
            <span>可玩游戏</span>
            <strong>{catalogEntries.length}</strong>
          </article>
          <article className="portal-stat-card">
            <span>联机游戏</span>
            <strong>{multiplayerGames.length}</strong>
          </article>
          <article className="portal-stat-card">
            <span>积分支持</span>
            <strong>{pointsGames.length}</strong>
          </article>
        </div>
      </section>

      {apiError ? (
        <section className="portal-banner portal-banner-error">
          <strong>频道加载失败：</strong>
          <span>{apiError}</span>
        </section>
      ) : null}

      <section className="portal-section-block">
        <div className="portal-section-head">
          <div>
            <p className="portal-kicker">Filter</p>
            <h3>按使用场景浏览</h3>
          </div>
          <span className="portal-status-text">
            {isLoading ? "loading" : `${filteredGames.length} items`}
          </span>
        </div>

        <div className="portal-filter-row">
          {filterOptions.map((option) => (
            <button
              className={
                option.id === activeFilter
                  ? "portal-filter-chip portal-filter-chip-active"
                  : "portal-filter-chip"
              }
              key={option.id}
              onClick={() => {
                setActiveFilter(option.id);
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="portal-card-grid portal-card-grid-featured">
        {featuredGames.map((entry) => (
          <article
            className={`portal-feature-card ${getGameAccent(entry)}`}
            key={entry.game_id}
          >
            <div className="portal-feature-topline">
              <span>{entry.categories[0] ?? "Featured"}</span>
              <strong>{getGameModeLabel(entry)}</strong>
            </div>
            <h3>{entry.display_name}</h3>
            <p>{entry.description}</p>
            <div className="portal-feature-actions">
              <a className="portal-primary-link" href={entry.route}>
                进入游戏
              </a>
              <span className="portal-feature-meta">
                {entry.capabilities.join(" / ")}
              </span>
            </div>
          </article>
        ))}
      </section>

      <section className="portal-card-grid portal-game-grid">
        {filteredGames.map((entry) => (
          <article className={`portal-game-card ${getGameAccent(entry)}`} key={entry.game_id}>
            <div className="portal-game-card-top">
              <span>{entry.categories.join(" · ")}</span>
              <strong>{entry.points_enabled ? "积分可得" : "纯娱乐"}</strong>
            </div>
            <h3>{entry.display_name}</h3>
            <p>{entry.description}</p>
            <div className="portal-tag-row">
              {entry.capabilities.map((capability) => (
                <span className="portal-tag" key={capability}>
                  {capability}
                </span>
              ))}
            </div>
            <a className="portal-secondary-link" href={entry.route}>
              开始体验
            </a>
          </article>
        ))}
      </section>
    </PassengerPortalShell>
  );
}
