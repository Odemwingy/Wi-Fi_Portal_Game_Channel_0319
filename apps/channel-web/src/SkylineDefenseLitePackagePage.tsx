import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState
} from "react";

import type {
  GameStateSnapshot,
  RealtimeServerMessage,
  RoomSnapshot
} from "@wifi-portal/game-sdk";

import {
  apiBaseUrl,
  buildRealtimeUrl,
  getPassengerPointsSummary,
  getRoom,
  isRealtimeOpen,
  parseRealtimeMessage,
  reportPoints
} from "./channel-api";
import { usePackageLaunchContext } from "./package-launch-context";
import {
  parseSkylineDefenseLiteState,
  type SkylineDefenseTypeView
} from "./skyline-defense-lite-runtime-state";

type RoomStatus = "connecting" | "connected" | "error" | "idle";

type ActivityItem = {
  detail?: string;
  id: string;
  summary: string;
  timestamp: string;
  tone: "error" | "info" | "success" | "warn";
};

const DEFENSE_COPY: Record<
  SkylineDefenseTypeView,
  { hint: string; label: string }
> = {
  barrier: {
    hint: "Counter storm surges and shield skyline sectors.",
    label: "Barrier Grid"
  },
  interceptor: {
    hint: "Counter drone swarms and fast aerial threats.",
    label: "Interceptor Pod"
  },
  pulse: {
    hint: "Counter traffic overload and route-control pressure.",
    label: "Pulse Beacon"
  }
};

export function SkylineDefenseLitePackagePage() {
  const { launchContext } = usePackageLaunchContext("skyline-defense-lite");
  const [activeRoom, setActiveRoom] = useState<RoomSnapshot | null>(null);
  const [gameState, setGameState] = useState<GameStateSnapshot | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoadingRoom, setIsLoadingRoom] = useState(false);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>("idle");
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [isReportingPoints, setIsReportingPoints] = useState(false);
  const [pointsSummary, setPointsSummary] = useState<Awaited<
    ReturnType<typeof getPassengerPointsSummary>
  > | null>(null);
  const [selectedDefenseType, setSelectedDefenseType] =
    useState<SkylineDefenseTypeView>("barrier");

  const socketRef = useRef<WebSocket | null>(null);
  const playerEventSeqRef = useRef(0);
  const lastReportedSignatureRef = useRef<string | null>(null);

  const appendActivity = useEffectEvent(
    (tone: ActivityItem["tone"], summary: string, detail?: string) => {
      startTransition(() => {
        setActivity((current) => [
          {
            detail,
            id: createClientId("skyline-defense-activity"),
            summary,
            timestamp: new Date().toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            }),
            tone
          },
          ...current
        ].slice(0, 10));
      });
    }
  );

  const syncRoom = useEffectEvent((room: RoomSnapshot) => {
    startTransition(() => {
      setActiveRoom(room);
    });
  });

  const handleRealtimeMessage = useEffectEvent((message: RealtimeServerMessage) => {
    switch (message.type) {
      case "room_snapshot":
        syncRoom(message.payload);
        appendActivity("success", "房间快照已更新", message.payload.room_name);
        return;
      case "game_state":
        startTransition(() => {
          setGameState(message.payload);
        });
        appendActivity("success", "Skyline Defense 状态已更新", `revision ${message.payload.revision}`);
        return;
      case "room_presence":
        appendActivity(
          message.payload.status === "connected" ? "info" : "warn",
          `${message.payload.player_id} ${message.payload.status === "connected" ? "已联机" : "已离线"}`
        );
        return;
      case "ack":
        appendActivity("info", `已确认 ${message.payload.acked_type}`);
        return;
      case "error":
        setApiError(message.payload.message);
        appendActivity("error", message.payload.code, message.payload.message);
    }
  });

  useEffect(() => {
    void getPassengerPointsSummary(launchContext.passengerId)
      .then((summary) => {
        setPointsSummary(summary);
      })
      .catch(() => {
        // Keep package UI functional even if summary fetch fails.
      });
  }, [launchContext.passengerId]);

  useEffect(() => {
    if (!launchContext.roomId) {
      return;
    }

    setIsLoadingRoom(true);
    setApiError(null);

    void getRoom(launchContext.roomId)
      .then((room) => {
        syncRoom(room);
        appendActivity("success", "已加载房间", room.room_name);
      })
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : "Load room failed";
        setApiError(detail);
        appendActivity("error", "加载房间失败", detail);
      })
      .finally(() => {
        setIsLoadingRoom(false);
      });
  }, [appendActivity, launchContext.roomId, syncRoom]);

  useEffect(() => {
    if (!launchContext.roomId) {
      setRoomStatus("idle");
      return;
    }

    setRoomStatus("connecting");

    const socket = new WebSocket(
      buildRealtimeUrl({
        player_id: launchContext.passengerId,
        room_id: launchContext.roomId,
        session_id: launchContext.sessionId,
        trace_id: launchContext.traceId
      })
    );

    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setRoomStatus("connected");
      appendActivity(
        "success",
        "Skyline Defense Lite 实时连接已建立",
        launchContext.roomId ?? "-"
      );
      socket.send(
        JSON.stringify({
          message_id: createClientId("skyline-defense-room"),
          payload: { room_id: launchContext.roomId },
          type: "room_snapshot_request"
        })
      );
      socket.send(
        JSON.stringify({
          message_id: createClientId("skyline-defense-state"),
          payload: { game_id: "skyline-defense-lite", room_id: launchContext.roomId },
          type: "game_state_request"
        })
      );
    });

    socket.addEventListener("message", (event) => {
      try {
        handleRealtimeMessage(parseRealtimeMessage(String(event.data)));
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : "Unknown realtime payload error";
        setApiError(detail);
        appendActivity("error", "实时消息解析失败", detail);
      }
    });

    socket.addEventListener("close", () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      setRoomStatus("idle");
      appendActivity("warn", "Skyline Defense Lite 实时连接已关闭");
    });

    socket.addEventListener("error", () => {
      setRoomStatus("error");
      appendActivity("error", "Skyline Defense Lite 实时连接发生错误");
    });

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [appendActivity, handleRealtimeMessage, launchContext]);

  const defenseState =
    gameState?.gameId === "skyline-defense-lite"
      ? parseSkylineDefenseLiteState(gameState)
      : null;
  const currentPlayerScore = defenseState?.scores[launchContext.passengerId] ?? 0;
  const currentPlayerBadge = defenseState?.playerBadges[launchContext.passengerId] ?? null;
  const currentPlayerIsWinner =
    defenseState?.winnerPlayerIds.includes(launchContext.passengerId) ?? false;
  const currentPlayerControlledDistricts = useMemo(
    () => defenseState?.districtControlByPlayer[launchContext.passengerId] ?? [],
    [defenseState, launchContext.passengerId]
  );
  const canDeployNode =
    roomStatus === "connected" &&
    !!activeRoom &&
    activeRoom.players.some((player) => player.player_id === launchContext.passengerId) &&
    !defenseState?.isCompleted &&
    defenseState?.currentTurnPlayerId === launchContext.passengerId &&
    (defenseState?.players.length ?? 0) >= 2;

  const rewardPoints = useMemo(() => {
    if (!defenseState?.isCompleted) {
      return 0;
    }

    if (defenseState.winnerPlayerIds.length === 0) {
      return Math.max(10, currentPlayerScore);
    }

    return currentPlayerIsWinner
      ? Math.max(16, currentPlayerScore + 4)
      : Math.max(8, currentPlayerScore);
  }, [currentPlayerIsWinner, currentPlayerScore, defenseState]);

  useEffect(() => {
    if (!defenseState?.isCompleted || !activeRoom) {
      return;
    }

    const reportSignature = [
      launchContext.passengerId,
      launchContext.sessionId,
      rewardPoints,
      defenseState.winnerPlayerIds.join(","),
      defenseState.availableNodeCount
    ].join(":");

    if (lastReportedSignatureRef.current === reportSignature) {
      return;
    }

    lastReportedSignatureRef.current = reportSignature;
    setIsReportingPoints(true);

    void reportPoints({
      airline_code: launchContext.airlineCode,
      game_id: "skyline-defense-lite",
      metadata: {
        controlled_districts: currentPlayerControlledDistricts,
        deployed_node_count: defenseState.nodes.filter(
          (node) => node.ownerPlayerId === launchContext.passengerId
        ).length,
        player_badge: currentPlayerBadge,
        score: currentPlayerScore,
        winner_player_ids: defenseState.winnerPlayerIds
      },
      passenger_id: launchContext.passengerId,
      points: rewardPoints,
      reason: currentPlayerIsWinner
        ? "skyline defense lite winner completed"
        : "skyline defense lite match completed",
      report_id: [
        "skyline-defense-lite",
        launchContext.passengerId,
        launchContext.sessionId,
        defenseState.nodes.length - defenseState.availableNodeCount
      ].join(":"),
      session_id: launchContext.sessionId
    })
      .then((response) => {
        setPointsSummary(response.summary);
        appendActivity("success", "积分已回传", `${response.summary.total_points} total`);
      })
      .finally(() => {
        setIsReportingPoints(false);
      });
  }, [
    activeRoom,
    appendActivity,
    currentPlayerBadge,
    currentPlayerControlledDistricts,
    currentPlayerIsWinner,
    currentPlayerScore,
    defenseState,
    launchContext.airlineCode,
    launchContext.passengerId,
    launchContext.sessionId,
    rewardPoints
  ]);

  function handleDeployNode(nodeId: string) {
    const room = activeRoom;
    const socket = socketRef.current;

    if (!room || !isRealtimeOpen(socket)) {
      setApiError("当前没有可用的实时连接");
      return;
    }

    playerEventSeqRef.current += 1;
    socket.send(
      JSON.stringify({
        message_id: createClientId("skyline-defense-event"),
        payload: {
          gameId: room.game_id,
          payload: {
            defenseType: selectedDefenseType,
            nodeId
          },
          playerId: launchContext.passengerId,
          roomId: room.room_id,
          seq: playerEventSeqRef.current,
          type: "game_event"
        },
        type: "game_event"
      })
    );
  }

  const statusLabel = (() => {
    if (!defenseState) {
      return "等待房间状态";
    }
    if (defenseState.isCompleted) {
      return defenseState.winnerPlayerIds.length === 0
        ? "防线对局平局结束"
        : "Skyline Defense 对局完成";
    }
    if (defenseState.players.length < 2) {
      return "等待第二位乘客加入";
    }
    return defenseState.currentTurnPlayerId === launchContext.passengerId
      ? "轮到你部署下一枚防御模块"
      : `等待 ${defenseState.currentTurnPlayerId}`;
  })();

  return (
    <main className="package-shell">
      <section className="package-hero">
        <div>
          <p className="eyebrow">Multiplayer Package</p>
          <h1>Skyline Defense Lite</h1>
          <p className="lede">
            双人低频回合部署。两位乘客轮流向城市天际线的关键节点部署防御模块，
            通过正确克制威胁和抢下区块控制加成，赢下这场轻量塔防策略对局。
          </p>
        </div>
        <div className="hero-stats">
          <article className="stat-chip accent-sun">
            <span>API</span>
            <strong>{apiBaseUrl}</strong>
          </article>
          <article className="stat-chip accent-sea">
            <span>Passenger</span>
            <strong>{launchContext.passengerId}</strong>
          </article>
          <article className="stat-chip accent-mint">
            <span>Room</span>
            <strong>{launchContext.roomId ?? "-"}</strong>
          </article>
          <article className="stat-chip accent-rose">
            <span>Status</span>
            <strong>{roomStatus}</strong>
          </article>
        </div>
      </section>

      <section className="package-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Match Context</p>
              <h2>房间与乘客上下文</h2>
            </div>
            <a className="action-button" href="/">
              返回频道页
            </a>
          </div>

          <div className="launcher-meta-grid">
            <div className="quiz-meta-card">
              <span>Trace</span>
              <strong>{launchContext.traceId}</strong>
              <p>session-scoped package launch</p>
            </div>
            <div className="quiz-meta-card">
              <span>Invite Room</span>
              <strong>{launchContext.roomId ?? "-"}</strong>
              <p>{activeRoom?.room_name ?? "awaiting room load"}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Your Badge</span>
              <strong>{currentPlayerBadge ?? "-"}</strong>
              <p>{launchContext.airlineCode} / {launchContext.cabinClass}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Passenger Total</span>
              <strong>{pointsSummary?.summary.total_points ?? 0}</strong>
              <p>latest points wallet total</p>
            </div>
          </div>

          {apiError ? <p className="error-text">{apiError}</p> : null}
          {isLoadingRoom ? <p className="muted-text">房间加载中...</p> : null}

          <div className="status-banner defense-banner">
            <strong>{statusLabel}</strong>
            <p>
              已部署 {defenseState ? defenseState.nodes.length - defenseState.availableNodeCount : 0}/
              {defenseState?.nodes.length ?? 6} 个节点。匹配威胁 +2，完成整区控制再 +1。
            </p>
          </div>

          <div className="leaderboard-list">
            {(defenseState?.players ?? []).map((playerId) => (
              <div className="leaderboard-row" key={playerId}>
                <div>
                  <strong>{playerId}</strong>
                  <p>
                    badge {defenseState?.playerBadges[playerId] ?? "-"} / districts{" "}
                    {(defenseState?.districtControlByPlayer[playerId] ?? []).join(", ") || "-"}
                  </p>
                </div>
                <span>{defenseState?.scores[playerId] ?? 0} pts</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Defense Loadout</p>
              <h2>模块选择区</h2>
            </div>
            <span className="pill-tag">turn-based</span>
          </div>

          <div className="defense-loadout">
            {(defenseState?.defenseLoadout ?? ["barrier", "pulse", "interceptor"]).map(
              (defenseType) => (
                <button
                  className={[
                    "defense-module",
                    selectedDefenseType === defenseType ? "is-selected" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={defenseType}
                  onClick={() => {
                    setSelectedDefenseType(defenseType);
                  }}
                  type="button"
                >
                  <span>{DEFENSE_COPY[defenseType].label}</span>
                  <strong>{defenseType}</strong>
                  <p>{DEFENSE_COPY[defenseType].hint}</p>
                </button>
              )
            )}
          </div>

          <div className="defense-grid">
            {(defenseState?.nodes ?? []).map((node) => {
              const isOwnedByCurrentPlayer = node.ownerPlayerId === launchContext.passengerId;
              return (
                <button
                  className={[
                    "defense-node",
                    node.ownerPlayerId ? "is-claimed" : "",
                    isOwnedByCurrentPlayer ? "is-owned" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={!canDeployNode || !!node.ownerPlayerId}
                  key={node.nodeId}
                  onClick={() => {
                    handleDeployNode(node.nodeId);
                  }}
                  type="button"
                >
                  <span>{node.district}</span>
                  <strong>{node.label}</strong>
                  <p>
                    threat {node.threatType} / base {node.baseScore}
                  </p>
                  <p>
                    {node.ownerPlayerId
                      ? `${node.ownerPlayerId} via ${node.defenseType ?? "-"}`
                      : `deploy ${selectedDefenseType}`}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="cabin-puzzle-summary">
            <article className="points-card">
              <span>Your Score</span>
              <strong>{currentPlayerScore}</strong>
              <p>克制加成和区块控制会直接体现在最终积分。</p>
            </article>
            <article className="points-card">
              <span>Last Move</span>
              <strong>{defenseState?.lastMove?.nodeId ?? "-"}</strong>
              <p>
                {defenseState?.lastMove
                  ? `${defenseState.lastMove.playerId} +${defenseState.lastMove.pointsAwarded}`
                  : "waiting for first deployment"}
              </p>
            </article>
            <article className="points-card">
              <span>Auto Points</span>
              <strong>{defenseState?.isCompleted ? rewardPoints : 0}</strong>
              <p>{isReportingPoints ? "比赛结束后正在自动上报积分" : "完赛后自动上报积分"}</p>
            </article>
          </div>

          <div className="launcher-meta-grid">
            {(defenseState?.moves ?? []).map((move) => (
              <div className="quiz-meta-card" key={`${move.nodeId}-${move.seq}`}>
                <span>{move.nodeId}</span>
                <strong>{move.playerId}</strong>
                <p>
                  +{move.pointsAwarded} / match {move.threatMatchBonus} / district{" "}
                  {move.districtControlBonus}
                </p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Match Feed</p>
              <h2>实时动态</h2>
            </div>
            <span className="pill-tag">{activity.length} events</span>
          </div>

          <div className="activity-feed">
            {activity.length === 0 ? (
              <p className="muted-text">等待房间和 WS 事件...</p>
            ) : (
              activity.map((entry) => (
                <article className={`activity-item activity-${entry.tone}`} key={entry.id}>
                  <div>
                    <strong>{entry.summary}</strong>
                    <p>{entry.detail ?? "no detail"}</p>
                  </div>
                  <span>{entry.timestamp}</span>
                </article>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

function createClientId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
