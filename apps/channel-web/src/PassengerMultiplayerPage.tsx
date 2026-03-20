import { useMemo } from "react";

import { PassengerPortalShell } from "./PassengerPortalShell";
import {
  getFeaturedGames,
  getGameAccent,
  getGameModeLabel,
  getGamesByCapability,
  usePassengerBootstrap
} from "./passenger-portal";

export function PassengerMultiplayerPage() {
  const { apiError, bootstrapData, catalogEntries, isLoading } =
    usePassengerBootstrap();

  const multiplayerGames = useMemo(
    () => getGamesByCapability(catalogEntries, "multiplayer", 99),
    [catalogEntries]
  );
  const featuredMultiplayerGames = useMemo(
    () => getFeaturedGames(multiplayerGames, 6),
    [multiplayerGames]
  );

  return (
    <PassengerPortalShell
      activePath="/portal/multiplayer"
      bootstrapData={bootstrapData}
    >
      <section className="portal-page-hero">
        <div>
          <p className="portal-kicker">Realtime Lounge</p>
          <h2>联机专区</h2>
          <p className="portal-copy">
            这里展示机上局域网内支持房间、邀请码、实时同步和断线重连的游戏。
            乘客可以从这里快速进入适合多人同玩的频道内容。
          </p>
        </div>
        <div className="portal-stat-grid">
          <article className="portal-stat-card">
            <span>联机游戏</span>
            <strong>{multiplayerGames.length}</strong>
          </article>
          <article className="portal-stat-card">
            <span>邀请码支持</span>
            <strong>
              {
                multiplayerGames.filter((entry) =>
                  entry.capabilities.includes("invite-code")
                ).length
              }
            </strong>
          </article>
          <article className="portal-stat-card">
            <span>当前状态</span>
            <strong>{isLoading ? "加载中" : "频道可用"}</strong>
          </article>
        </div>
      </section>

      {apiError ? (
        <section className="portal-banner portal-banner-error">
          <strong>联机专区加载失败：</strong>
          <span>{apiError}</span>
        </section>
      ) : null}

      <section className="portal-card-grid portal-card-grid-featured">
        {featuredMultiplayerGames.map((entry) => (
          <article
            className={`portal-feature-card ${getGameAccent(entry)}`}
            key={entry.game_id}
          >
            <div className="portal-feature-topline">
              <span>{entry.categories[0] ?? "Multiplayer"}</span>
              <strong>{getGameModeLabel(entry)}</strong>
            </div>
            <h3>{entry.display_name}</h3>
            <p>{entry.description}</p>
            <div className="portal-feature-actions">
              <a className="portal-primary-link" href={entry.route}>
                进入联机游戏
              </a>
              <span className="portal-feature-meta">
                {entry.capabilities.join(" / ")}
              </span>
            </div>
          </article>
        ))}
      </section>

      <section className="portal-info-grid">
        <article className="portal-info-card">
          <p className="portal-kicker">How It Works</p>
          <h3>乘客联机流程</h3>
          <ol className="portal-steps">
            <li>在游戏页创建房间或加入邀请码。</li>
            <li>同舱乘客通过机上 Wi-Fi 进入同一个房间。</li>
            <li>系统通过 WebSocket 同步状态并支持短时重连。</li>
          </ol>
        </article>

        <article className="portal-info-card">
          <p className="portal-kicker">Core Capability</p>
          <h3>联机底座能力</h3>
          <div className="portal-tag-row">
            <span className="portal-tag">room lifecycle</span>
            <span className="portal-tag">invite code</span>
            <span className="portal-tag">ready state</span>
            <span className="portal-tag">reconnect</span>
            <span className="portal-tag">game state</span>
          </div>
        </article>
      </section>
    </PassengerPortalShell>
  );
}
