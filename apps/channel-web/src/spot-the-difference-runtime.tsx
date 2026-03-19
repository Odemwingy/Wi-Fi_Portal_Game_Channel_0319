import type { GameStateSnapshot } from "@wifi-portal/game-sdk";

import type { SpotRaceViewState } from "./spot-the-difference-runtime-state";

type SpotRaceRuntimePanelProps = {
  activePlayerLabel: string;
  canClaimSpot: boolean;
  gameState: GameStateSnapshot | null;
  modeLabel: string;
  state: SpotRaceViewState;
  onClaimSpot: (spotId: string) => void;
};

export function SpotRaceRuntimePanel(props: SpotRaceRuntimePanelProps) {
  return (
    <>
      <section className="quiz-stage">
        <div className="quiz-header">
          <div>
            <p className="mini-label">Scene Pack</p>
            <h3>{props.state.scene.title}</h3>
            <p className="quiz-roundline">
              {props.state.claimedSpotCount}/{props.state.totalSpotCount} claimed
              <span>{props.modeLabel}</span>
            </p>
          </div>
          <span
            className={`status-pill ${
              props.state.isCompleted ? "status-connected" : "status-connecting"
            }`}
          >
            {props.state.isCompleted
              ? "本局已结束"
              : `${props.state.remainingSpotCount} spots remaining`}
          </span>
        </div>

        <div className="quiz-meta-grid">
          <div className="quiz-meta-card">
            <span>当前乘客</span>
            <strong>{props.activePlayerLabel}</strong>
            <p>{props.canClaimSpot ? "当前可提交命中" : "等待连接或已结算"}</p>
          </div>
          <div className="quiz-meta-card">
            <span>Deadline</span>
            <strong>
              {props.state.deadlineAt
                ? new Date(props.state.deadlineAt).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                  })
                : "-"}
            </strong>
            <p>联机模式按服务端截止时间结算</p>
          </div>
          <div className="quiz-meta-card">
            <span>领先玩家</span>
            <strong>{props.state.winnerPlayerIds.join(", ") || "暂无"}</strong>
            <p>当前比分领先者</p>
          </div>
          <div className="quiz-meta-card">
            <span>最新命中</span>
            <strong>{props.state.lastRecentClaim?.spotId ?? "暂无"}</strong>
            <p>
              {props.state.lastRecentClaim
                ? `${props.state.lastRecentClaim.playerId} / ${props.state.lastRecentClaim.status}`
                : "等待第一个 spot claim"}
            </p>
          </div>
        </div>

        <div className="choice-grid">
          {props.state.scene.spots.map((spot) => {
            const claim = props.state.foundSpots[spot.id];

            return (
              <button
                className={`choice-button ${claim ? "choice-button-selected" : ""}`}
                disabled={!props.canClaimSpot || Boolean(claim)}
                key={spot.id}
                onClick={() => {
                  props.onClaimSpot(spot.id);
                }}
                type="button"
              >
                <span className="choice-label">{spot.id.split("-").at(-1) ?? "SP"}</span>
                <strong>{spot.label}</strong>
                <small>
                  {claim
                    ? `claimed by ${claim.playerId}`
                    : `x ${spot.x.toFixed(2)} / y ${spot.y.toFixed(2)}`}
                </small>
              </button>
            );
          })}
        </div>
      </section>

      <div className="scoreboard">
        {Object.entries(props.state.scores).map(([playerId, score]) => (
          <div className="score-chip" key={playerId}>
            <span>{playerId}</span>
            <strong>{score}</strong>
          </div>
        ))}
      </div>

      <div className="round-history">
        {props.state.recentClaims.map((claim) => (
          <article className="round-history-card" key={`${claim.playerId}-${claim.spotId}-${claim.claimedAt}`}>
            <div className="round-history-topline">
              <strong>{claim.spotId}</strong>
              <span>{claim.status}</span>
            </div>
            <p>{claim.playerId}</p>
            <p>
              {new Date(claim.claimedAt).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
              })}
            </p>
          </article>
        ))}
      </div>

      <div className="json-card">
        <p className="mini-label">最新 game state</p>
        <pre>{JSON.stringify(props.gameState, null, 2)}</pre>
      </div>
    </>
  );
}
