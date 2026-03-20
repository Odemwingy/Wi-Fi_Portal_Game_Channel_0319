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
import { parseMiniGomokuState } from "./mini-gomoku-runtime-state";
import { usePackageLaunchContext } from "./package-launch-context";

type RoomStatus = "idle" | "connecting" | "connected" | "error";

type ActivityItem = {
  detail?: string;
  id: string;
  summary: string;
  timestamp: string;
  tone: "info" | "success" | "warn" | "error";
};

export function MiniGomokuPackagePage() {
  const { launchContext } = usePackageLaunchContext("mini-gomoku");
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
            id: createClientId("mini-gomoku-activity"),
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
        appendActivity("success", "已收到最新棋局", `revision ${message.payload.revision}`);
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
      appendActivity("success", "Mini Gomoku 实时连接已建立", launchContext.roomId ?? "-");
      socket.send(
        JSON.stringify({
          message_id: createClientId("mini-gomoku-room"),
          payload: { room_id: launchContext.roomId },
          type: "room_snapshot_request"
        })
      );
      socket.send(
        JSON.stringify({
          message_id: createClientId("mini-gomoku-state"),
          payload: { game_id: "mini-gomoku", room_id: launchContext.roomId },
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
      appendActivity("warn", "Mini Gomoku 实时连接已关闭");
    });

    socket.addEventListener("error", () => {
      setRoomStatus("error");
      appendActivity("error", "Mini Gomoku 实时连接发生错误");
    });

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [appendActivity, handleRealtimeMessage, launchContext]);

  const gomokuState =
    gameState?.gameId === "mini-gomoku" ? parseMiniGomokuState(gameState) : null;
  const currentPlayerMark = gomokuState?.playerMarks[launchContext.passengerId] ?? null;
  const currentPlayerIsWinner =
    gomokuState?.winnerPlayerIds.includes(launchContext.passengerId) ?? false;
  const canPlaceStone =
    roomStatus === "connected" &&
    !!activeRoom &&
    activeRoom.players.some((player) => player.player_id === launchContext.passengerId) &&
    !gomokuState?.isCompleted &&
    gomokuState?.currentTurnPlayerId === launchContext.passengerId &&
    gomokuState.players.length >= 2;

  const rewardPoints = useMemo(() => {
    if (!gomokuState?.isCompleted) {
      return 0;
    }

    if (currentPlayerIsWinner) {
      return 18;
    }

    if (gomokuState.winnerPlayerIds.length === 0) {
      return 10;
    }

    return 8;
  }, [currentPlayerIsWinner, gomokuState]);

  useEffect(() => {
    if (!gomokuState?.isCompleted || !activeRoom) {
      return;
    }

    const reportSignature = [
      launchContext.passengerId,
      launchContext.sessionId,
      rewardPoints,
      gomokuState.winnerPlayerIds.join(","),
      gomokuState.moves.length
    ].join(":");

    if (lastReportedSignatureRef.current === reportSignature) {
      return;
    }

    lastReportedSignatureRef.current = reportSignature;
    setIsReportingPoints(true);

    void reportPoints({
      airline_code: launchContext.airlineCode,
      game_id: "mini-gomoku",
      metadata: {
        board_size: gomokuState.boardSize,
        move_count: gomokuState.moves.length,
        player_mark: currentPlayerMark,
        winning_line_length: gomokuState.winningLine.length,
        winner_player_ids: gomokuState.winnerPlayerIds
      },
      passenger_id: launchContext.passengerId,
      points: rewardPoints,
      reason:
        gomokuState.winnerPlayerIds.length === 0
          ? "mini gomoku draw completed"
          : currentPlayerIsWinner
            ? "mini gomoku winner completed"
            : "mini gomoku participant completed",
      report_id: [
        "mini-gomoku",
        launchContext.passengerId,
        launchContext.sessionId,
        gomokuState.moves.length
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
    gomokuState,
    launchContext.airlineCode,
    launchContext.passengerId,
    launchContext.sessionId,
    rewardPoints
  ]);

  function handlePlaceStone(row: number, col: number) {
    const room = activeRoom;
    const socket = socketRef.current;

    if (!room || !isRealtimeOpen(socket)) {
      setApiError("当前没有可用的实时连接");
      return;
    }

    playerEventSeqRef.current += 1;
    socket.send(
      JSON.stringify({
        message_id: createClientId("mini-gomoku-event"),
        payload: {
          gameId: room.game_id,
          payload: { col, row },
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
    if (!gomokuState) {
      return "等待房间状态";
    }
    if (gomokuState.isCompleted) {
      return gomokuState.winnerPlayerIds.length === 0 ? "平局结束" : "本局已结束";
    }
    if (gomokuState.players.length < 2) {
      return "等待第二位乘客加入";
    }
    return gomokuState.currentTurnPlayerId === launchContext.passengerId
      ? "轮到你落子"
      : `等待 ${gomokuState.currentTurnPlayerId}`;
  })();

  return (
    <main className="package-shell">
      <section className="package-hero">
        <div>
          <p className="eyebrow">Multiplayer Package</p>
          <h1>Mini Gomoku</h1>
          <p className="lede">
            轻量化双人五子棋。复用当前房间、邀请码和 WS 同步协议，用最简单的棋盘状态验证
            Wave B 的策略类联机游戏模板。
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
              <span>Turn</span>
              <strong>{gomokuState?.currentTurnPlayerId ?? "-"}</strong>
              <p>{roomStatus}</p>
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
            <div className="quiz-meta-card">
              <span>Board</span>
              <strong>
                {gomokuState?.boardSize ?? 9} x {gomokuState?.boardSize ?? 9}
              </strong>
              <p>五连即胜</p>
            </div>
          </div>

          {apiError ? (
            <div className="status-banner status-error">
              <span>错误</span>
              <strong>{apiError}</strong>
            </div>
          ) : null}

          <div className="json-card">
            <p className="mini-label">launch query</p>
            <pre>{JSON.stringify(launchContext, null, 2)}</pre>
          </div>
        </article>

        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Realtime Match</p>
              <h2>Mini Gomoku Board</h2>
            </div>
            <div className="activity-topline">
              <span>最近落子 {gomokuState?.moves.length ?? 0}</span>
              <span>目标 {gomokuState?.targetLineLength ?? 5} 连</span>
            </div>
          </div>

          <div className="gomoku-layout">
            <div
              className="gomoku-board"
              style={{
                gridTemplateColumns: `repeat(${gomokuState?.boardSize ?? 9}, 1fr)`
              }}
            >
              {(gomokuState?.board ?? []).flatMap((row, rowIndex) =>
                row.map((cell, colIndex) => {
                  const isWinningCell =
                    gomokuState?.winningLine.some(
                      (entry) => entry.row === rowIndex && entry.col === colIndex
                    ) ?? false;

                  return (
                    <button
                      className={`gomoku-cell${cell ? " is-filled" : ""}${isWinningCell ? " is-winning" : ""}`}
                      disabled={!canPlaceStone || cell !== ""}
                      key={`${rowIndex}-${colIndex}`}
                      onClick={() => handlePlaceStone(rowIndex, colIndex)}
                      type="button"
                    >
                      <span>{cell || "·"}</span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="gomoku-sidebar">
              <div className="scoreboard">
                {Object.entries(gomokuState?.playerMarks ?? {}).map(([playerId, mark]) => (
                  <article className="score-row" key={playerId}>
                    <strong>{playerId}</strong>
                    <span>
                      {mark}
                      {gomokuState?.winnerPlayerIds.includes(playerId) ? " · 胜者" : ""}
                    </span>
                  </article>
                ))}
              </div>

              <div className="json-card">
                <p className="mini-label">recent moves</p>
                <pre>{JSON.stringify(gomokuState?.moves.slice(0, 6) ?? [], null, 2)}</pre>
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
