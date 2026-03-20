import { useEffect, useMemo, useState } from "react";

import { PassengerPortalShell } from "./PassengerPortalShell";
import { buildGamePackageLaunchSpec } from "./game-package-launcher";
import {
  getFeaturedGames,
  getGameAccent,
  getGamesByCapability,
  getGamesWithPoints,
  usePassengerBootstrap
} from "./passenger-portal";

export function PassengerChannelPage() {
  const { apiError, bootstrapData, catalogEntries, isLoading } =
    usePassengerBootstrap();
  const [selectedGameId, setSelectedGameId] = useState("");

  const featuredGames = useMemo(
    () => getFeaturedGames(catalogEntries, 4),
    [catalogEntries]
  );
  const multiplayerGames = useMemo(
    () => getGamesByCapability(catalogEntries, "multiplayer", 4),
    [catalogEntries]
  );
  const quickPlayGames = useMemo(
    () => getGamesByCapability(catalogEntries, "single-player", 4),
    [catalogEntries]
  );
  const pointsGames = useMemo(
    () => getGamesWithPoints(catalogEntries, 4),
    [catalogEntries]
  );

  useEffect(() => {
    if (!selectedGameId && featuredGames[0]) {
      setSelectedGameId(featuredGames[0].game_id);
    }
  }, [featuredGames, selectedGameId]);

  const selectedGame =
    catalogEntries.find((entry) => entry.game_id === selectedGameId) ??
    featuredGames[0] ??
    catalogEntries[0] ??
    null;

  const selectedLaunchUrl = useMemo(() => {
    if (!bootstrapData || !selectedGame) {
      return "#";
    }

    return buildGamePackageLaunchSpec({
      baseUrl: window.location.origin,
      entry: selectedGame,
      launchContext: bootstrapData.session,
      room: null,
      traceId: bootstrapData.trace_id
    }).url;
  }, [bootstrapData, selectedGame]);

  return (
    <PassengerPortalShell activePath="/" bootstrapData={bootstrapData}>
      <section className="portal-home-hero">
        <div>
          <p className="portal-kicker">Welcome Aboard</p>
          <h2>欢迎进入机上游戏频道</h2>
          <p className="portal-home-copy">
            首页交互和信息密度按 Tech Style In-Flight Entertainment 的结构重做，
            但内容完全映射到当前 Wi-Fi Portal 游戏频道。乘客先看到清晰导航、
            精选推荐和快速入口，再进入具体游戏。
          </p>
        </div>

        <div className="portal-stat-grid">
          <article className="portal-stat-card">
            <span>频道名称</span>
            <strong>{bootstrapData?.channel_config.channel_name ?? "Loading..."}</strong>
          </article>
          <article className="portal-stat-card">
            <span>座位</span>
            <strong>{bootstrapData?.session.seatNumber ?? "32A"}</strong>
          </article>
          <article className="portal-stat-card">
            <span>游戏总量</span>
            <strong>{catalogEntries.length || 25}</strong>
          </article>
        </div>
      </section>

      {apiError ? (
        <section className="portal-banner portal-banner-error">
          <strong>频道加载失败：</strong>
          <span>{apiError}</span>
        </section>
      ) : null}

      <section className="portal-quick-grid">
        <a className="portal-quick-card" href="/portal/games">
          <span className="portal-quick-card-meta">Quick Access</span>
          <strong>游戏频道</strong>
          <p>浏览全部可玩游戏、分类卡片和游戏直达入口。</p>
        </a>
        <a className="portal-quick-card" href="/portal/multiplayer">
          <span className="portal-quick-card-meta">Realtime</span>
          <strong>联机专区</strong>
          <p>按房间玩法查看支持邀请码和实时同步的游戏。</p>
        </a>
        <a className="portal-quick-card" href="/portal/flight-info">
          <span className="portal-quick-card-meta">Flight</span>
          <strong>飞行信息</strong>
          <p>在同一 Portal 外观下承载座位、连接和频道状态。</p>
        </a>
        <a className="portal-quick-card" href={selectedLaunchUrl}>
          <span className="portal-quick-card-meta">Start Now</span>
          <strong>{selectedGame?.display_name ?? "精选推荐"}</strong>
          <p>直接进入当前推荐游戏，减少层级跳转。</p>
        </a>
      </section>

      <section className="portal-home-grid">
        <article className={`portal-spotlight ${selectedGame ? getGameAccent(selectedGame) : ""}`}>
          <div className="portal-feature-topline">
            <span>Today&apos;s Spotlight</span>
            <strong>{isLoading ? "loading" : "ready"}</strong>
          </div>
          <h3>{selectedGame?.display_name ?? "正在准备乘客频道"}</h3>
          <p>
            {selectedGame?.description ??
              bootstrapData?.channel_config.hero_title ??
              "Portal 完成初始化后，会在这里展示当前推荐游戏和最直接的进入入口。"}
          </p>
          <div className="portal-tag-row">
            {(selectedGame?.categories ?? bootstrapData?.channel_config.sections ?? [])
              .slice(0, 4)
              .map((item) => (
                <span className="portal-tag" key={item}>
                  {item}
                </span>
              ))}
          </div>
          <div className="portal-feature-actions">
            <a className="portal-primary-link" href={selectedLaunchUrl}>
              立即开始
            </a>
            <a className="portal-secondary-link" href="/portal/games">
              进入频道列表
            </a>
          </div>
        </article>

        <article className="portal-rail">
          <div className="portal-section-head">
            <div>
              <p className="portal-kicker">Featured Picks</p>
              <h3>精选推荐</h3>
            </div>
            <span className="portal-status-text">{featuredGames.length} picks</span>
          </div>
          <div className="portal-rail-list">
            {featuredGames.map((entry) => (
              <button
                className="portal-rail-button"
                key={entry.game_id}
                onClick={() => {
                  setSelectedGameId(entry.game_id);
                }}
                type="button"
              >
                <strong>{entry.display_name}</strong>
                <p>{entry.description}</p>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="portal-card-grid portal-card-grid-featured">
        <article className="portal-info-card">
          <p className="portal-kicker">Multiplayer</p>
          <h3>联机专区</h3>
          <div className="portal-tag-row">
            {multiplayerGames.map((entry) => (
              <a className="portal-tag" href={entry.route} key={entry.game_id}>
                {entry.display_name}
              </a>
            ))}
          </div>
        </article>
        <article className="portal-info-card">
          <p className="portal-kicker">Quick Play</p>
          <h3>单机快玩</h3>
          <div className="portal-tag-row">
            {quickPlayGames.map((entry) => (
              <a className="portal-tag" href={entry.route} key={entry.game_id}>
                {entry.display_name}
              </a>
            ))}
          </div>
        </article>
        <article className="portal-info-card">
          <p className="portal-kicker">Points Ready</p>
          <h3>积分优先</h3>
          <div className="portal-tag-row">
            {pointsGames.map((entry) => (
              <a className="portal-tag" href={entry.route} key={entry.game_id}>
                {entry.display_name}
              </a>
            ))}
          </div>
        </article>
      </section>
    </PassengerPortalShell>
  );
}
