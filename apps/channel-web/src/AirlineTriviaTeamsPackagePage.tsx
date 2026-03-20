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
import {
  parseAirlineTriviaTeamsState,
  type AirlineTriviaChoice
} from "./airline-trivia-teams-runtime-state";
import { usePackageLaunchContext } from "./package-launch-context";

type RoomStatus = "idle" | "connecting" | "connected" | "error";

type ActivityItem = {
  detail?: string;
  id: string;
  summary: string;
  timestamp: string;
  tone: "info" | "success" | "warn" | "error";
};

export function AirlineTriviaTeamsPackagePage() {
  const { launchContext } = usePackageLaunchContext("airline-trivia-teams");
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
            id: createClientId("airline-trivia-activity"),
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
        appendActivity("success", "已收到最新团队题面", `revision ${message.payload.revision}`);
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
      appendActivity("success", "Airline Trivia Teams 实时连接已建立", launchContext.roomId ?? "-");
      socket.send(
        JSON.stringify({
          message_id: createClientId("airline-trivia-room"),
          payload: { room_id: launchContext.roomId },
          type: "room_snapshot_request"
        })
      );
      socket.send(
        JSON.stringify({
          message_id: createClientId("airline-trivia-state"),
          payload: { game_id: "airline-trivia-teams", room_id: launchContext.roomId },
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
      appendActivity("warn", "Airline Trivia Teams 实时连接已关闭");
    });

    socket.addEventListener("error", () => {
      setRoomStatus("error");
      appendActivity("error", "Airline Trivia Teams 实时连接发生错误");
    });

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [appendActivity, handleRealtimeMessage, launchContext]);

  const triviaState =
    gameState?.gameId === "airline-trivia-teams"
      ? parseAirlineTriviaTeamsState(gameState)
      : null;
  const currentPlayerAnswer = triviaState?.answersByPlayer[launchContext.passengerId] ?? null;
  const currentTeamId = triviaState?.playerTeams[launchContext.passengerId] ?? null;
  const currentPlayerIsWinner =
    triviaState?.winningPlayerIds.includes(launchContext.passengerId) ?? false;
  const canSubmitAnswer =
    roomStatus === "connected" &&
    !!activeRoom &&
    activeRoom.players.some((player) => player.player_id === launchContext.passengerId) &&
    !triviaState?.isCompleted &&
    !currentPlayerAnswer &&
    (triviaState ? Object.keys(triviaState.playerTeams).length >= 2 : false);

  const rewardPoints = useMemo(() => {
    if (!triviaState?.isCompleted) {
      return 0;
    }
    return currentPlayerIsWinner ? 18 : triviaState.winningPlayerIds.length === 0 ? 10 : 8;
  }, [currentPlayerIsWinner, triviaState]);

  useEffect(() => {
    if (!triviaState?.isCompleted || !activeRoom) {
      return;
    }

    const reportSignature = [
      launchContext.passengerId,
      launchContext.sessionId,
      rewardPoints,
      triviaState.winningPlayerIds.join(","),
      triviaState.currentRoundNumber
    ].join(":");

    if (lastReportedSignatureRef.current === reportSignature) {
      return;
    }

    lastReportedSignatureRef.current = reportSignature;
    setIsReportingPoints(true);

    void reportPoints({
      airline_code: launchContext.airlineCode,
      game_id: "airline-trivia-teams",
      metadata: {
        team_id: currentTeamId,
        total_rounds: triviaState.totalRounds,
        winning_team_ids: triviaState.winningTeamIds,
        winning_player_ids: triviaState.winningPlayerIds
      },
      passenger_id: launchContext.passengerId,
      points: rewardPoints,
      reason:
        triviaState.winningPlayerIds.length === 0
          ? "airline trivia teams draw completed"
          : currentPlayerIsWinner
            ? "airline trivia teams winner completed"
            : "airline trivia teams participant completed",
      report_id: [
        "airline-trivia-teams",
        launchContext.passengerId,
        launchContext.sessionId,
        triviaState.totalRounds
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
    currentTeamId,
    launchContext.airlineCode,
    launchContext.passengerId,
    launchContext.sessionId,
    rewardPoints,
    triviaState
  ]);

  function handleSendAnswer(choice: AirlineTriviaChoice) {
    const room = activeRoom;
    const socket = socketRef.current;

    if (!room || !isRealtimeOpen(socket)) {
      setApiError("当前没有可用的实时连接");
      return;
    }

    playerEventSeqRef.current += 1;
    socket.send(
      JSON.stringify({
        message_id: createClientId("airline-trivia-answer"),
        payload: {
          gameId: room.game_id,
          payload: { answer: choice },
          playerId: launchContext.passengerId,
          roomId: room.room_id,
          seq: playerEventSeqRef.current,
          type: "game_event"
        },
        type: "game_event"
      })
    );
  }

  return (
    <main className="package-shell">
      <section className="package-hero">
        <div>
          <p className="eyebrow">Multiplayer Package</p>
          <h1>Airline Trivia Teams</h1>
          <p className="lede">
            2-4 人团队问答。乘客按加入顺序分到 Team A / Team B，团队正确答案累计 team score，个人正确答案累计个人分。
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
            <span>Team</span>
            <strong>{currentTeamId ?? "-"}</strong>
          </article>
          <article className="stat-chip accent-rose">
            <span>Status</span>
            <strong>
              {triviaState?.isCompleted
                ? "本局已结束"
                : triviaState?.allPlayersAnswered
                  ? "本轮已揭晓"
                  : `${triviaState?.answerCount ?? 0}/${Object.keys(triviaState?.playerTeams ?? {}).length} 已作答`}
            </strong>
          </article>
        </div>
      </section>

      <section className="package-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Launch Context</p>
              <h2>团队问答上下文</h2>
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
              <span>个人分</span>
              <strong>{triviaState?.scores[launchContext.passengerId] ?? 0}</strong>
              <p>{roomStatus}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Team Score</span>
              <strong>
                {currentTeamId ? triviaState?.teamScores[currentTeamId] ?? 0 : 0}
              </strong>
              <p>{currentTeamId ?? "未分队"}</p>
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

          {apiError ? <p className="inline-error">{apiError}</p> : null}

          {triviaState ? (
            <>
              <section className="quiz-stage">
                <div className="quiz-header">
                  <div>
                    <p className="mini-label">Prompt</p>
                    <h3>{triviaState.prompt.title}</h3>
                    <p className="quiz-roundline">
                      {triviaState.isCompleted
                        ? `Final ${triviaState.totalRounds}/${triviaState.totalRounds}`
                        : `Round ${triviaState.currentRoundNumber}/${triviaState.totalRounds}`}
                      <span>{triviaState.completedRoundCount} 轮已结算</span>
                    </p>
                  </div>
                  <span
                    className={`status-pill ${
                      triviaState.isCompleted || triviaState.allPlayersAnswered
                        ? "status-connected"
                        : "status-connecting"
                    }`}
                  >
                    {triviaState.isCompleted
                      ? "本局已结束"
                      : triviaState.allPlayersAnswered
                        ? "本轮已揭晓"
                        : `${triviaState.answerCount}/${Object.keys(triviaState.playerTeams).length} 已作答`}
                  </span>
                </div>

                <p className="quiz-body">{triviaState.prompt.body}</p>

                <div className="choice-grid">
                  {triviaState.prompt.options.map((option) => (
                    <button
                      key={option.id}
                      className={`choice-button ${currentPlayerAnswer === option.id ? "choice-button-selected" : ""}`}
                      disabled={!canSubmitAnswer}
                      onClick={() => {
                        handleSendAnswer(option.id);
                      }}
                      type="button"
                    >
                      <span className="choice-label">{option.id}</span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </button>
                  ))}
                </div>

                <div className="quiz-meta-grid">
                  <div className="quiz-meta-card">
                    <span>当前乘客</span>
                    <strong>{launchContext.passengerId}</strong>
                    <p>
                      {triviaState.isCompleted
                        ? "本局已完赛，可查看团队结算"
                        : currentPlayerAnswer
                          ? `你已提交答案 ${currentPlayerAnswer}`
                          : canSubmitAnswer
                            ? "当前可作答"
                            : "等待房间连接或切换到房间内乘客"}
                    </p>
                  </div>
                  <div className="quiz-meta-card">
                    <span>领先团队</span>
                    <strong>{triviaState.winningTeamIds.join(", ") || "暂无"}</strong>
                    <p>团队分数相同会并列领先</p>
                  </div>
                  <div className="quiz-meta-card">
                    <span>上一轮结果</span>
                    <strong>
                      {triviaState.lastCompletedRound
                        ? `Round ${triviaState.lastCompletedRound.roundNumber}`
                        : "尚未揭晓"}
                    </strong>
                    <p>
                      {triviaState.lastCompletedRound
                        ? `正确答案 ${triviaState.lastCompletedRound.correctAnswer} · 胜队 ${triviaState.lastCompletedRound.winningTeamIds.join(", ") || "平局"}`
                        : "等待所有玩家完成作答"}
                    </p>
                  </div>
                </div>
              </section>

              <div className="scoreboard">
                {Object.entries(triviaState.teamScores).map(([teamId, score]) => (
                  <div className="score-chip" key={teamId}>
                    <span>{teamId}</span>
                    <strong>{score}</strong>
                  </div>
                ))}
                {Object.entries(triviaState.scores).map(([playerId, score]) => (
                  <div className="score-chip" key={playerId}>
                    <span>{playerId}</span>
                    <strong>{score}</strong>
                  </div>
                ))}
              </div>

              {triviaState.roundHistory.length > 0 ? (
                <div className="round-history">
                  {triviaState.roundHistory.map((round) => (
                    <article className="round-history-card" key={round.roundNumber}>
                      <div className="round-history-topline">
                        <strong>Round {round.roundNumber}</strong>
                        <span>{round.promptId}</span>
                      </div>
                      <p>{round.promptTitle}</p>
                      <p>
                        正确答案 {round.correctAnswer} · 胜队 {round.winningTeamIds.join(", ") || "平局"}
                      </p>
                      <div className="tag-row">
                        {Object.entries(round.answersByPlayer).map(([playerId, answer]) => (
                          <span className="tag" key={playerId}>
                            {playerId}: {answer ?? "-"}
                          </span>
                        ))}
                        {Object.entries(round.teamScoresSnapshot).map(([teamId, score]) => (
                          <span className="tag" key={teamId}>
                            {teamId}: {score}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
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
              <p className="empty-state">等待房间和团队问答事件流。</p>
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

function createClientId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
