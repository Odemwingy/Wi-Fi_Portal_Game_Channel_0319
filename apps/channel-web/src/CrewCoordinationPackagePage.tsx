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
  parseCrewCoordinationState,
  type CrewRoleView
} from "./crew-coordination-runtime-state";
import { usePackageLaunchContext } from "./package-launch-context";

type RoomStatus = "connecting" | "connected" | "error" | "idle";

type ActivityItem = {
  detail?: string;
  id: string;
  summary: string;
  timestamp: string;
  tone: "error" | "info" | "success" | "warn";
};

const ROLE_COPY: Record<CrewRoleView, { accent: string; label: string }> = {
  cabin: {
    accent: "Cabin Flow",
    label: "Cabin Specialist"
  },
  captain: {
    accent: "Flight Deck",
    label: "Captain Lead"
  },
  galley: {
    accent: "Service Ops",
    label: "Galley Lead"
  },
  purser: {
    accent: "Frontline Sync",
    label: "Purser Lead"
  }
};

export function CrewCoordinationPackagePage() {
  const { launchContext } = usePackageLaunchContext("crew-coordination");
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
            id: createClientId("crew-coordination-activity"),
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
        appendActivity("success", "Crew Coordination 状态已更新", `revision ${message.payload.revision}`);
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
      appendActivity("success", "Crew Coordination 实时连接已建立", launchContext.roomId ?? "-");
      socket.send(
        JSON.stringify({
          message_id: createClientId("crew-coordination-room"),
          payload: { room_id: launchContext.roomId },
          type: "room_snapshot_request"
        })
      );
      socket.send(
        JSON.stringify({
          message_id: createClientId("crew-coordination-state"),
          payload: { game_id: "crew-coordination", room_id: launchContext.roomId },
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
      appendActivity("warn", "Crew Coordination 实时连接已关闭");
    });

    socket.addEventListener("error", () => {
      setRoomStatus("error");
      appendActivity("error", "Crew Coordination 实时连接发生错误");
    });

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [appendActivity, handleRealtimeMessage, launchContext]);

  const crewState =
    gameState?.gameId === "crew-coordination"
      ? parseCrewCoordinationState(gameState)
      : null;
  const currentPlayerScore = crewState?.playerScores[launchContext.passengerId] ?? 0;
  const currentPlayerRole = crewState?.playerRoles[launchContext.passengerId] ?? null;
  const missionSucceeded = crewState?.missionStatus === "successful";
  const canClaimTask =
    roomStatus === "connected" &&
    !!activeRoom &&
    activeRoom.players.some((player) => player.player_id === launchContext.passengerId) &&
    !crewState?.isCompleted &&
    crewState?.currentTurnPlayerId === launchContext.passengerId &&
    (crewState?.players.length ?? 0) >= 2;

  const rewardPoints = useMemo(() => {
    if (!crewState?.isCompleted) {
      return 0;
    }

    return missionSucceeded
      ? Math.max(18, Math.floor(crewState.teamScore / Math.max(crewState.players.length, 2)) + 8)
      : Math.max(8, currentPlayerScore);
  }, [crewState, currentPlayerScore, missionSucceeded]);

  useEffect(() => {
    if (!crewState?.isCompleted || !activeRoom) {
      return;
    }

    const reportSignature = [
      launchContext.passengerId,
      launchContext.sessionId,
      rewardPoints,
      crewState.missionStatus,
      crewState.teamScore
    ].join(":");

    if (lastReportedSignatureRef.current === reportSignature) {
      return;
    }

    lastReportedSignatureRef.current = reportSignature;
    setIsReportingPoints(true);

    void reportPoints({
      airline_code: launchContext.airlineCode,
      game_id: "crew-coordination",
      metadata: {
        mission_status: crewState.missionStatus,
        player_role: currentPlayerRole,
        player_score: currentPlayerScore,
        target_score: crewState.targetScore,
        team_score: crewState.teamScore
      },
      passenger_id: launchContext.passengerId,
      points: rewardPoints,
      reason: missionSucceeded
        ? "crew coordination mission successful"
        : "crew coordination mission completed",
      report_id: [
        "crew-coordination",
        launchContext.passengerId,
        launchContext.sessionId,
        crewState.teamScore
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
    crewState,
    currentPlayerRole,
    currentPlayerScore,
    launchContext.airlineCode,
    launchContext.passengerId,
    launchContext.sessionId,
    missionSucceeded,
    rewardPoints
  ]);

  function handleClaimTask(taskId: string) {
    const room = activeRoom;
    const socket = socketRef.current;

    if (!room || !isRealtimeOpen(socket)) {
      setApiError("当前没有可用的实时连接");
      return;
    }

    playerEventSeqRef.current += 1;
    socket.send(
      JSON.stringify({
        message_id: createClientId("crew-coordination-event"),
        payload: {
          gameId: room.game_id,
          payload: {
            taskId
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

  return (
    <main className="package-shell">
      <section className="package-hero">
        <div>
          <p className="eyebrow">Crew Coordination</p>
          <h1>Cabin-wide mission relay for 2-4 crew roles.</h1>
          <p className="package-copy">
            轮流接手航前、服务和降落任务，把总队伍分数压过目标线。每位玩家都有不同职责，协作越顺，积分越高。
          </p>
        </div>
        <div className="package-meta-card">
          <div>
            <span>Status</span>
            <strong>{roomStatus}</strong>
          </div>
          <div>
            <span>Passenger</span>
            <strong>{launchContext.passengerId}</strong>
          </div>
          <div>
            <span>Room</span>
            <strong>{launchContext.roomId ?? "No room"}</strong>
          </div>
          <div>
            <span>Role</span>
            <strong>{currentPlayerRole ? ROLE_COPY[currentPlayerRole].label : "Waiting"}</strong>
          </div>
        </div>
      </section>

      {apiError ? <p className="package-error">{apiError}</p> : null}
      {isLoadingRoom ? <p className="package-note">正在加载房间...</p> : null}

      <section className="package-grid">
        <article className="package-panel">
          <div className="package-panel-header">
            <div>
              <p className="eyebrow">Mission</p>
              <h2>Turn relay board</h2>
            </div>
            <span className="status-pill">
              {crewState?.isCompleted
                ? missionSucceeded
                  ? "Mission successful"
                  : "Needs review"
                : canClaimTask
                  ? "Your turn"
                  : "Waiting"}
            </span>
          </div>

          {crewState ? (
            <>
              <div className="crew-banner">
                <div>
                  <span>Team score</span>
                  <strong>
                    {crewState.teamScore} / {crewState.targetScore}
                  </strong>
                </div>
                <div>
                  <span>Current turn</span>
                  <strong>{crewState.currentTurnPlayerId}</strong>
                </div>
                <div>
                  <span>Open tasks</span>
                  <strong>{crewState.availableTaskCount}</strong>
                </div>
              </div>

              <div className="crew-role-strip">
                {crewState.players.map((playerId) => {
                  const role = crewState.playerRoles[playerId] ?? "cabin";
                  return (
                    <article key={playerId} className="crew-role-card">
                      <p>{playerId}</p>
                      <strong>{ROLE_COPY[role].label}</strong>
                      <span>{ROLE_COPY[role].accent}</span>
                      <em>{crewState.playerScores[playerId] ?? 0} pts</em>
                    </article>
                  );
                })}
              </div>

              <div className="crew-task-grid">
                {crewState.tasks.map((task) => {
                  const isOwned = task.ownerPlayerId !== null;
                  const isSelectable = canClaimTask && !isOwned;
                  return (
                    <button
                      key={task.taskId}
                      className="crew-task-card"
                      disabled={!isSelectable}
                      onClick={() => handleClaimTask(task.taskId)}
                      type="button"
                    >
                      <span>{task.zone}</span>
                      <strong>{task.title}</strong>
                      <p>{task.detail}</p>
                      <div>
                        <small>{ROLE_COPY[task.role].label}</small>
                        <small>{task.baseScore} pts</small>
                      </div>
                      <em>{isOwned ? `Handled by ${task.ownerPlayerId}` : "Open relay slot"}</em>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="package-note">等待房间同步 Crew Coordination 状态...</p>
          )}
        </article>

        <aside className="package-sidebar">
          <article className="package-panel">
            <div className="package-panel-header">
              <div>
                <p className="eyebrow">Mission Feed</p>
                <h2>Latest relay</h2>
              </div>
            </div>

            {crewState?.lastMove ? (
              <div className="package-callout">
                <strong>{crewState.lastMove.playerId}</strong>
                <p>
                  完成 {crewState.lastMove.taskId}，获得 {crewState.lastMove.pointsAwarded} 分。
                </p>
                <small>
                  role bonus {crewState.lastMove.roleMatchBonus} / relay bonus {crewState.lastMove.relayBonus}
                </small>
              </div>
            ) : (
              <p className="package-note">首个任务还未被接管。</p>
            )}

            <ul className="package-activity-list">
              {activity.map((item) => (
                <li key={item.id} className={`package-activity-item tone-${item.tone}`}>
                  <div>
                    <strong>{item.summary}</strong>
                    {item.detail ? <p>{item.detail}</p> : null}
                  </div>
                  <span>{item.timestamp}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="package-panel">
            <div className="package-panel-header">
              <div>
                <p className="eyebrow">Points</p>
                <h2>Passenger wallet</h2>
              </div>
            </div>
            <div className="package-points">
              <strong>{pointsSummary?.total_points ?? 0}</strong>
              <span>total points</span>
            </div>
            <p className="package-note">
              {isReportingPoints
                ? "正在回传积分..."
                : crewState?.isCompleted
                  ? `本局预计回传 ${rewardPoints} 分`
                  : "完成 mission 后自动回传积分"}
            </p>
          </article>

          <article className="package-panel">
            <div className="package-panel-header">
              <div>
                <p className="eyebrow">Debug</p>
                <h2>Launch context</h2>
              </div>
            </div>
            <pre className="package-code">
              {JSON.stringify(
                {
                  apiBaseUrl,
                  airlineCode: launchContext.airlineCode,
                  roomId: launchContext.roomId,
                  sessionId: launchContext.sessionId,
                  traceId: launchContext.traceId
                },
                null,
                2
              )}
            </pre>
          </article>
        </aside>
      </section>
    </main>
  );
}

function createClientId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
