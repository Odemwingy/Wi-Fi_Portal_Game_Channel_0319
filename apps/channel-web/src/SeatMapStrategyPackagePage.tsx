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
import { parseSeatMapStrategyState } from "./seat-map-strategy-runtime-state";

type RoomStatus = "idle" | "connecting" | "connected" | "error";

type ActivityItem = {
  detail?: string;
  id: string;
  summary: string;
  timestamp: string;
  tone: "info" | "success" | "warn" | "error";
};

export function SeatMapStrategyPackagePage() {
  const { launchContext } = usePackageLaunchContext("seat-map-strategy");
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
            id: createClientId("seat-map-activity"),
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
        appendActivity("success", "座位策略状态已更新", `revision ${message.payload.revision}`);
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
      appendActivity("success", "Seat Map Strategy 实时连接已建立", launchContext.roomId ?? "-");
      socket.send(
        JSON.stringify({
          message_id: createClientId("seat-map-room"),
          payload: { room_id: launchContext.roomId },
          type: "room_snapshot_request"
        })
      );
      socket.send(
        JSON.stringify({
          message_id: createClientId("seat-map-state"),
          payload: { game_id: "seat-map-strategy", room_id: launchContext.roomId },
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
      appendActivity("warn", "Seat Map Strategy 实时连接已关闭");
    });

    socket.addEventListener("error", () => {
      setRoomStatus("error");
      appendActivity("error", "Seat Map Strategy 实时连接发生错误");
    });

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [appendActivity, handleRealtimeMessage, launchContext]);

  const seatMapState =
    gameState?.gameId === "seat-map-strategy"
      ? parseSeatMapStrategyState(gameState)
      : null;
  const currentPlayerScore = seatMapState?.scores[launchContext.passengerId] ?? 0;
  const currentPlayerMark = seatMapState?.playerMarks[launchContext.passengerId] ?? null;
  const currentPlayerIsWinner =
    seatMapState?.winnerPlayerIds.includes(launchContext.passengerId) ?? false;
  const canClaimSeat =
    roomStatus === "connected" &&
    !!activeRoom &&
    activeRoom.players.some((player) => player.player_id === launchContext.passengerId) &&
    !seatMapState?.isCompleted &&
    seatMapState?.currentTurnPlayerId === launchContext.passengerId &&
    seatMapState.players.length >= 2;

  const rewardPoints = useMemo(() => {
    if (!seatMapState?.isCompleted) {
      return 0;
    }

    if (seatMapState.winnerPlayerIds.length === 0) {
      return Math.max(10, currentPlayerScore);
    }

    return currentPlayerIsWinner
      ? Math.max(14, currentPlayerScore + 4)
      : Math.max(8, currentPlayerScore);
  }, [currentPlayerIsWinner, currentPlayerScore, seatMapState]);

  useEffect(() => {
    if (!seatMapState?.isCompleted || !activeRoom) {
      return;
    }

    const reportSignature = [
      launchContext.passengerId,
      launchContext.sessionId,
      rewardPoints,
      seatMapState.winnerPlayerIds.join(","),
      seatMapState.availableSeatCount
    ].join(":");

    if (lastReportedSignatureRef.current === reportSignature) {
      return;
    }

    lastReportedSignatureRef.current = reportSignature;
    setIsReportingPoints(true);

    void reportPoints({
      airline_code: launchContext.airlineCode,
      game_id: "seat-map-strategy",
      metadata: {
        claimed_seat_count: seatMapState.seats.filter(
          (seat) => seat.ownerPlayerId === launchContext.passengerId
        ).length,
        player_mark: currentPlayerMark,
        score: currentPlayerScore,
        winner_player_ids: seatMapState.winnerPlayerIds
      },
      passenger_id: launchContext.passengerId,
      points: rewardPoints,
      reason: currentPlayerIsWinner
        ? "seat map strategy winner completed"
        : "seat map strategy match completed",
      report_id: [
        "seat-map-strategy",
        launchContext.passengerId,
        launchContext.sessionId,
        seatMapState.seats.length - seatMapState.availableSeatCount
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
    currentPlayerIsWinner,
    currentPlayerMark,
    currentPlayerScore,
    launchContext.airlineCode,
    launchContext.passengerId,
    launchContext.sessionId,
    rewardPoints,
    seatMapState
  ]);

  function handleClaimSeat(seatId: string) {
    const room = activeRoom;
    const socket = socketRef.current;

    if (!room || !isRealtimeOpen(socket)) {
      setApiError("当前没有可用的实时连接");
      return;
    }

    playerEventSeqRef.current += 1;
    socket.send(
      JSON.stringify({
        message_id: createClientId("seat-map-event"),
        payload: {
          gameId: room.game_id,
          payload: { seatId },
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
    if (!seatMapState) {
      return "等待房间状态";
    }
    if (seatMapState.isCompleted) {
      return seatMapState.winnerPlayerIds.length === 0 ? "本局平分" : "本局已结束";
    }
    if (seatMapState.players.length < 2) {
      return "等待第二位乘客加入";
    }
    return seatMapState.currentTurnPlayerId === launchContext.passengerId
      ? "轮到你选座"
      : `等待 ${seatMapState.currentTurnPlayerId}`;
  })();

  return (
    <main className="package-shell">
      <section className="package-hero">
        <div>
          <p className="eyebrow">Multiplayer Package</p>
          <h1>Seat Map Strategy</h1>
          <p className="lede">
            双人轮流占据机舱座位。窗口位基础分更高，相邻连通还能拿额外奖励，用低频同步验证
            Grid-based turn strategy 模板。
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
            <span>Mark</span>
            <strong>{currentPlayerMark ?? "-"}</strong>
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
              <h2>对局上下文</h2>
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
              <strong>{seatMapState?.availableSeatCount ?? "-"}</strong>
              <p>剩余可占座位</p>
            </div>
            <div className="quiz-meta-card">
              <span>Total Points</span>
              <strong>{pointsSummary?.total_points ?? 0}</strong>
              <p>平台累计积分</p>
            </div>
            <div className="quiz-meta-card">
              <span>Reward</span>
              <strong>{rewardPoints}</strong>
              <p>{isReportingPoints ? "本局积分回传中" : "对局完成后自动回传"}</p>
            </div>
          </div>

          {apiError ? (
            <div className="status-banner status-error">
              <span>错误</span>
              <strong>{apiError}</strong>
            </div>
          ) : null}

          <div className="json-card">
            <p className="mini-label">recent moves</p>
            <pre>{JSON.stringify(seatMapState?.moves.slice(0, 6) ?? [], null, 2)}</pre>
          </div>
        </article>

        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Realtime Match</p>
              <h2>Cabin Seat Draft</h2>
            </div>
            <div className="activity-topline">
              <span>窗口位 3 分</span>
              <span>相邻己方座位 +1 奖励</span>
            </div>
          </div>

          <div className="seat-map-layout">
            <div
              className="seat-map-grid"
              style={{
                gridTemplateColumns: `repeat(${seatMapState?.cabinCols ?? 4}, 1fr)`
              }}
            >
              {(seatMapState?.seats ?? []).map((seat) => {
                const ownerMark = seat.ownerPlayerId
                  ? seatMapState?.playerMarks[seat.ownerPlayerId] ?? "•"
                  : null;
                const ownedByCurrentPlayer = seat.ownerPlayerId === launchContext.passengerId;

                return (
                  <button
                    className={`seat-map-seat seat-${seat.seatType}${seat.ownerPlayerId ? " is-filled" : ""}${ownedByCurrentPlayer ? " is-owned" : ""}`}
                    disabled={!canClaimSeat || !!seat.ownerPlayerId}
                    key={seat.seatId}
                    onClick={() => handleClaimSeat(seat.seatId)}
                    type="button"
                  >
                    <strong>{seat.seatLabel}</strong>
                    <span>{ownerMark ?? `${seat.baseScore}pt`}</span>
                  </button>
                );
              })}
            </div>

            <div className="seat-map-sidebar">
              <div className="scoreboard">
                {Object.entries(seatMapState?.scores ?? {}).map(([playerId, score]) => (
                  <article className="score-row" key={playerId}>
                    <strong>{playerId}</strong>
                    <span>
                      {score} pts
                      {seatMapState?.winnerPlayerIds.includes(playerId) ? " · 胜者" : ""}
                    </span>
                  </article>
                ))}
              </div>

              <div className="activity-list">
                {activity.map((item) => (
                  <article className={`activity-item tone-${item.tone}`} key={item.id}>
                    <div className="activity-topline">
                      <strong>{item.summary}</strong>
                      <span>{item.timestamp}</span>
                    </div>
                    {item.detail ? <p>{item.detail}</p> : null}
                  </article>
                ))}
              </div>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}

function createClientId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
