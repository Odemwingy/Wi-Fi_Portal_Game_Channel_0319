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
  parseBaggageSortShowdownState,
  type BaggageLaneView
} from "./baggage-sort-showdown-runtime-state";

type RoomStatus = "idle" | "connecting" | "connected" | "error";

type ActivityItem = {
  detail?: string;
  id: string;
  summary: string;
  timestamp: string;
  tone: "info" | "success" | "warn" | "error";
};

const LANE_COPY: Record<
  BaggageLaneView,
  { helper: string; label: string }
> = {
  fragile: {
    helper: "易碎件优先轻放",
    label: "Fragile"
  },
  oversize: {
    helper: "超规件转 outsize belt",
    label: "Oversize"
  },
  priority: {
    helper: "高优先级快速转运",
    label: "Priority"
  },
  standard: {
    helper: "常规件走 standard line",
    label: "Standard"
  }
};

export function BaggageSortShowdownPackagePage() {
  const { launchContext } = usePackageLaunchContext("baggage-sort-showdown");
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

  const socketRef = useRef<WebSocket | null>(null);
  const playerEventSeqRef = useRef(0);
  const lastReportedSignatureRef = useRef<string | null>(null);

  const appendActivity = useEffectEvent(
    (tone: ActivityItem["tone"], summary: string, detail?: string) => {
      startTransition(() => {
        setActivity((current) => [
          {
            detail,
            id: createClientId("baggage-activity"),
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
        appendActivity("success", "分拣台状态已更新", `revision ${message.payload.revision}`);
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
        "Baggage Sort Showdown 实时连接已建立",
        launchContext.roomId ?? "-"
      );
      socket.send(
        JSON.stringify({
          message_id: createClientId("baggage-room"),
          payload: { room_id: launchContext.roomId },
          type: "room_snapshot_request"
        })
      );
      socket.send(
        JSON.stringify({
          message_id: createClientId("baggage-state"),
          payload: { game_id: "baggage-sort-showdown", room_id: launchContext.roomId },
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
      appendActivity("warn", "Baggage Sort Showdown 实时连接已关闭");
    });

    socket.addEventListener("error", () => {
      setRoomStatus("error");
      appendActivity("error", "Baggage Sort Showdown 实时连接发生错误");
    });

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [appendActivity, handleRealtimeMessage, launchContext]);

  const baggageState =
    gameState?.gameId === "baggage-sort-showdown"
      ? parseBaggageSortShowdownState(gameState)
      : null;
  const currentPlayerScore = baggageState?.scores[launchContext.passengerId] ?? 0;
  const currentPlayerIsWinner =
    baggageState?.winnerPlayerIds.includes(launchContext.passengerId) ?? false;
  const canClassify =
    roomStatus === "connected" &&
    !!activeRoom &&
    activeRoom.players.some((player) => player.player_id === launchContext.passengerId) &&
    !baggageState?.isCompleted &&
    !!baggageState?.currentBag &&
    (baggageState?.players.length ?? 0) >= 2;

  const rewardPoints = useMemo(() => {
    if (!baggageState?.isCompleted) {
      return 0;
    }

    return currentPlayerIsWinner
      ? Math.max(16, currentPlayerScore + 4)
      : Math.max(8, currentPlayerScore);
  }, [baggageState, currentPlayerIsWinner, currentPlayerScore]);

  useEffect(() => {
    if (!baggageState?.isCompleted || !activeRoom) {
      return;
    }

    const reportSignature = [
      launchContext.passengerId,
      launchContext.sessionId,
      rewardPoints,
      baggageState.winnerPlayerIds.join(","),
      baggageState.resolvedBagIds.length
    ].join(":");

    if (lastReportedSignatureRef.current === reportSignature) {
      return;
    }

    lastReportedSignatureRef.current = reportSignature;
    setIsReportingPoints(true);

    void reportPoints({
      airline_code: launchContext.airlineCode,
      game_id: "baggage-sort-showdown",
      metadata: {
        completed: currentPlayerIsWinner,
        resolved_bag_count: baggageState.resolvedBagIds.length,
        total_bags: baggageState.totalBags,
        winner_player_ids: baggageState.winnerPlayerIds
      },
      passenger_id: launchContext.passengerId,
      points: rewardPoints,
      reason: currentPlayerIsWinner
        ? "baggage showdown winner completed"
        : "baggage showdown participant completed",
      report_id: [
        "baggage-sort-showdown",
        launchContext.passengerId,
        launchContext.sessionId,
        baggageState.resolvedBagIds.length
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
    baggageState,
    currentPlayerIsWinner,
    launchContext.airlineCode,
    launchContext.passengerId,
    launchContext.sessionId,
    rewardPoints
  ]);

  function handleClassify(laneId: BaggageLaneView) {
    const room = activeRoom;
    const socket = socketRef.current;

    if (!room || !isRealtimeOpen(socket)) {
      setApiError("当前没有可用的实时连接");
      return;
    }

    playerEventSeqRef.current += 1;
    socket.send(
      JSON.stringify({
        message_id: createClientId("baggage-event"),
        payload: {
          gameId: room.game_id,
          payload: { laneId },
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
    if (!baggageState) {
      return "等待房间状态";
    }
    if (baggageState.isCompleted) {
      return baggageState.winnerPlayerIds.length === 0 ? "分拣结束" : "竞速完成";
    }
    if (baggageState.players.length < 2) {
      return "等待第二位乘客加入";
    }
    return baggageState.currentBag
      ? `处理中 ${baggageState.currentBag.label}`
      : "等待下一件行李";
  })();

  return (
    <main className="package-shell">
      <section className="package-hero">
        <div>
          <p className="eyebrow">Multiplayer Package</p>
          <h1>Baggage Sort Showdown</h1>
          <p className="lede">
            双人低频同步的分拣竞速。当前行李会同时出现在两位乘客端，谁先把它送进正确通道，谁就拿走这件行李的分数。
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
            <span>Resolved</span>
            <strong>
              {baggageState?.resolvedBagIds.length ?? 0}/{baggageState?.totalBags ?? 0}
            </strong>
          </article>
          <article className="stat-chip accent-rose">
            <span>Status</span>
            <strong>{statusLabel}</strong>
          </article>
        </div>
      </section>

      <section className="package-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Launch Context</p>
              <h2>分拣台上下文</h2>
            </div>
            <a className="action-button" href="/">
              返回频道页
            </a>
          </div>

          <div className="launcher-meta-grid">
            <div className="quiz-meta-card">
              <span>Trace</span>
              <strong>{launchContext.traceId}</strong>
              <p>portal + package scope</p>
            </div>
            <div className="quiz-meta-card">
              <span>Room</span>
              <strong>{launchContext.roomId ?? "-"}</strong>
              <p>{isLoadingRoom ? "加载中" : activeRoom?.invite_code ?? "等待房间"}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Your Score</span>
              <strong>{currentPlayerScore}</strong>
              <p>{roomStatus}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Remaining</span>
              <strong>{baggageState?.remainingBagCount ?? 0}</strong>
              <p>共享行李队列</p>
            </div>
            <div className="quiz-meta-card">
              <span>Total Points</span>
              <strong>{pointsSummary?.total_points ?? 0}</strong>
              <p>平台累计积分</p>
            </div>
            <div className="quiz-meta-card">
              <span>Reward</span>
              <strong>{rewardPoints}</strong>
              <p>{isReportingPoints ? "本局积分回传中" : "完赛后自动回传"}</p>
            </div>
          </div>

          {apiError ? (
            <p className="inline-error">{apiError}</p>
          ) : null}

          <div className="baggage-layout">
            <section className="baggage-card">
              <div className="panel-heading compact">
                <div>
                  <p className="panel-kicker">Current Bag</p>
                  <h3>{baggageState?.currentBag?.label ?? "等待题面"}</h3>
                </div>
                <span className="score-pill">
                  {baggageState?.currentBag?.points ?? 0} pts
                </span>
              </div>
              <div className="baggage-meta-row">
                <span>{baggageState?.currentBag?.tagLabel ?? "Queue Pending"}</span>
                <span>{baggageState?.currentBag?.weightKg ?? 0} kg</span>
                <span>
                  Bag {(baggageState?.currentBagIndex ?? 0) + 1}/{baggageState?.totalBags ?? 0}
                </span>
              </div>
              <p className="baggage-brief">
                观察标签与重量，把当前行李送进正确通道。错误提交会被记录，并扣掉 1 分。
              </p>

              <div className="baggage-lanes">
                {(baggageState?.availableLanes ?? []).map((laneId) => (
                  <button
                    key={laneId}
                    className={`baggage-lane accent-${getLaneAccent(laneId)}`}
                    disabled={!canClassify}
                    onClick={() => handleClassify(laneId)}
                    type="button"
                  >
                    <strong>{LANE_COPY[laneId].label}</strong>
                    <span>{LANE_COPY[laneId].helper}</span>
                  </button>
                ))}
              </div>

              <div className="baggage-last-action">
                <span>Latest</span>
                <strong>
                  {baggageState?.lastAction
                    ? `${baggageState.lastAction.playerId} -> ${baggageState.lastAction.chosenLane}`
                    : "等待首个分类动作"}
                </strong>
                <p>
                  {baggageState?.lastAction
                    ? baggageState.lastAction.status === "accepted"
                      ? `命中正确通道 ${baggageState.lastAction.correctLane}，+${baggageState.lastAction.pointsAwarded}`
                      : `错误提交，正确通道是 ${baggageState.lastAction.correctLane}`
                    : "两位乘客加入后即可开始"}
                </p>
              </div>
            </section>

            <aside className="signal-sidebar">
              <div className="panel-heading compact">
                <div>
                  <p className="panel-kicker">Leaderboard</p>
                  <h3>房间分数</h3>
                </div>
              </div>
              <div className="signal-players">
                {(baggageState?.players ?? []).map((playerId) => (
                  <article key={playerId} className="signal-player-card">
                    <strong>{playerId}</strong>
                    <span>{baggageState?.scores[playerId] ?? 0} pts</span>
                    <p>
                      {baggageState?.winnerPlayerIds.includes(playerId)
                        ? "当前领先 / 已完赛"
                        : playerId === launchContext.passengerId
                          ? "当前视角"
                          : "同房乘客"}
                    </p>
                  </article>
                ))}
              </div>
            </aside>
          </div>
        </article>

        <aside className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Activity</p>
              <h2>实时事件流</h2>
            </div>
          </div>
          <div className="activity-feed">
            {activity.length === 0 ? (
              <p className="empty-state">等待房间和分拣事件流。</p>
            ) : (
              activity.map((entry) => (
                <article key={entry.id} className={`activity-item tone-${entry.tone}`}>
                  <div>
                    <strong>{entry.summary}</strong>
                    <span>{entry.timestamp}</span>
                  </div>
                  {entry.detail ? <p>{entry.detail}</p> : null}
                </article>
              ))
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}

function getLaneAccent(laneId: BaggageLaneView) {
  switch (laneId) {
    case "priority":
      return "sun";
    case "fragile":
      return "rose";
    case "oversize":
      return "mint";
    case "standard":
    default:
      return "sea";
  }
}

function createClientId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
