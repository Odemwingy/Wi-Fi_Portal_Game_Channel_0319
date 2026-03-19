import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState
} from "react";

import type {
  GameStateSnapshot,
  RealtimeServerMessage,
  RoomSnapshot,
  SpotTheDifferenceScene
} from "@wifi-portal/game-sdk";
import { defaultSpotTheDifferenceScenes } from "@wifi-portal/game-sdk";

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
  readPackageLaunchContext,
  type PackageLaunchContext
} from "./package-launch-context";
import { SpotRaceRuntimePanel } from "./spot-the-difference-runtime";
import {
  parseSpotRaceState,
  type SpotRaceViewState
} from "./spot-the-difference-runtime-state";

type RoomStatus = "idle" | "connecting" | "connected" | "error";

type ActivityItem = {
  detail?: string;
  id: string;
  summary: string;
  timestamp: string;
  tone: "info" | "success" | "warn" | "error";
};

type SoloSpotRaceState = {
  foundSpots: Record<string, { claimedAt: string; playerId: string; spotId: string }>;
  isCompleted: boolean;
  recentClaims: Array<{
    claimedAt: string;
    playerId: string;
    spotId: string;
    status: "claimed" | "duplicate";
  }>;
  scene: SpotTheDifferenceScene;
  scores: Record<string, number>;
};

export function SpotTheDifferenceRacePackagePage() {
  const [launchContext] = useState<PackageLaunchContext>(() =>
    readPackageLaunchContext(window.location.search)
  );
  const [activeRoom, setActiveRoom] = useState<RoomSnapshot | null>(null);
  const [gameState, setGameState] = useState<GameStateSnapshot | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>("idle");
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [isReportingPoints, setIsReportingPoints] = useState(false);
  const [pointsSummary, setPointsSummary] = useState<Awaited<
    ReturnType<typeof getPassengerPointsSummary>
  > | null>(null);
  const [soloState, setSoloState] = useState<SoloSpotRaceState>(() => {
    const scene = defaultSpotTheDifferenceScenes[0];
    if (!scene) {
      throw new Error("Spot the Difference Race scene pack is missing");
    }

    return {
      foundSpots: {},
      isCompleted: false,
      recentClaims: [],
      scene,
      scores: {
        [launchContext.passengerId]: 0
      }
    };
  });

  const socketRef = useRef<WebSocket | null>(null);
  const playerEventSeqRef = useRef(0);
  const lastReportedSignatureRef = useRef<string | null>(null);

  const appendActivity = useEffectEvent(
    (tone: ActivityItem["tone"], summary: string, detail?: string) => {
      startTransition(() => {
        setActivity((current) => [
          {
            detail,
            id: createClientId("spot-race-activity"),
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
        appendActivity("success", "已收到最新游戏状态", `revision ${message.payload.revision}`);
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
        // Keep package UI functional if summary fetch fails.
      });
  }, [launchContext.passengerId]);

  useEffect(() => {
    if (!launchContext.roomId) {
      setRoomStatus("idle");
      return;
    }

    void getRoom(launchContext.roomId)
      .then((room) => {
        syncRoom(room);
      })
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : "Load room failed";
        setApiError(detail);
      });
  }, [launchContext.roomId, syncRoom]);

  useEffect(() => {
    if (!launchContext.roomId) {
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
      socket.send(
        JSON.stringify({
          message_id: createClientId("spot-race-room"),
          payload: { room_id: launchContext.roomId },
          type: "room_snapshot_request"
        })
      );
      socket.send(
        JSON.stringify({
          message_id: createClientId("spot-race-state"),
          payload: { game_id: "spot-the-difference-race", room_id: launchContext.roomId },
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
      }
    });

    socket.addEventListener("close", () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      setRoomStatus("idle");
    });

    socket.addEventListener("error", () => {
      setRoomStatus("error");
    });

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [handleRealtimeMessage, launchContext]);

  const multiplayerState =
    gameState?.gameId === "spot-the-difference-race"
      ? parseSpotRaceState(gameState)
      : null;
  const effectiveState = launchContext.roomId
    ? multiplayerState
    : toSoloViewState(soloState, launchContext.passengerId);

  const canClaimSpot = launchContext.roomId
    ? roomStatus === "connected" &&
      !!activeRoom &&
      !effectiveState?.isCompleted &&
      activeRoom.players.some((player) => player.player_id === launchContext.passengerId)
    : !effectiveState?.isCompleted;

  const currentPlayerPoints = effectiveState?.scores[launchContext.passengerId] ?? 0;

  useEffect(() => {
    if (!effectiveState?.isCompleted) {
      return;
    }

    const reportSignature = [
      launchContext.passengerId,
      launchContext.sessionId,
      currentPlayerPoints,
      effectiveState.claimedSpotCount,
      effectiveState.isCompleted
    ].join(":");

    if (lastReportedSignatureRef.current === reportSignature) {
      return;
    }

    lastReportedSignatureRef.current = reportSignature;
    setIsReportingPoints(true);

    void reportPoints({
      game_id: "spot-the-difference-race",
      metadata: {
        claimed_spot_count: effectiveState.claimedSpotCount,
        total_spot_count: effectiveState.totalSpotCount,
        winner_player_ids: effectiveState.winnerPlayerIds,
        mode: launchContext.roomId ? "multiplayer" : "single-player"
      },
      passenger_id: launchContext.passengerId,
      points: Math.max(6, currentPlayerPoints),
      reason: "spot the difference race completed",
      report_id: [
        "spot-the-difference-race",
        launchContext.passengerId,
        launchContext.sessionId,
        reportSignature
      ].join(":"),
      session_id: launchContext.sessionId
    })
      .then((response) => {
        setPointsSummary(response.summary);
      })
      .finally(() => {
        setIsReportingPoints(false);
      });
  }, [
    currentPlayerPoints,
    effectiveState,
    launchContext.passengerId,
    launchContext.roomId,
    launchContext.sessionId
  ]);

  function handleClaimSpot(spotId: string) {
    if (!launchContext.roomId) {
      setSoloState((current) => {
        const existing = current.foundSpots[spotId];
        const claim = {
          claimedAt: new Date().toISOString(),
          playerId: launchContext.passengerId,
          spotId,
          status: existing ? "duplicate" : "claimed"
        } as const;

        const nextFoundSpots = existing
          ? current.foundSpots
          : {
              ...current.foundSpots,
              [spotId]: {
                claimedAt: claim.claimedAt,
                playerId: claim.playerId,
                spotId
              }
            };
        const claimedCount = Object.keys(nextFoundSpots).length;

        return {
          ...current,
          foundSpots: nextFoundSpots,
          isCompleted: claimedCount >= current.scene.spots.length,
          recentClaims: [claim, ...current.recentClaims].slice(0, 10),
          scores: existing
            ? current.scores
            : {
                ...current.scores,
                [launchContext.passengerId]:
                  (current.scores[launchContext.passengerId] ?? 0) + 8
              }
        };
      });
      return;
    }

    const room = activeRoom;
    const socket = socketRef.current;
    if (!room || !isRealtimeOpen(socket)) {
      setApiError("当前没有可用的实时连接");
      return;
    }

    playerEventSeqRef.current += 1;
    socket.send(
      JSON.stringify({
        message_id: createClientId("spot-race-event"),
        payload: {
          gameId: room.game_id,
          payload: { spotId },
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
          <p className="eyebrow">Wave B Validation Package</p>
          <h1>Spot the Difference Race</h1>
          <p className="lede">
            一套 scene pack 同时支持单机和联机。联机模式只同步 spot claim 和比分，不做逐帧同步。
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
            <span>Mode</span>
            <strong>{launchContext.roomId ? "multiplayer" : "single-player"}</strong>
          </article>
          <article className="stat-chip accent-rose">
            <span>Status</span>
            <strong>{launchContext.roomId ? roomStatus : effectiveState?.isCompleted ? "completed" : "local"}</strong>
          </article>
        </div>
      </section>

      <section className="package-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Launch Context</p>
              <h2>Package 上下文</h2>
            </div>
            <a className="action-button" href="/">
              返回频道页
            </a>
          </div>

          <div className="launcher-meta-grid">
            <div className="quiz-meta-card">
              <span>Trace</span>
              <strong>{launchContext.traceId}</strong>
              <p>shared with launcher session</p>
            </div>
            <div className="quiz-meta-card">
              <span>Session</span>
              <strong>{launchContext.sessionId}</strong>
              <p>{launchContext.roomId ?? "solo mode"}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Passenger Total</span>
              <strong>{pointsSummary?.total_points ?? 0}</strong>
              <p>积分中心累计</p>
            </div>
            <div className="quiz-meta-card">
              <span>Runtime Points</span>
              <strong>{currentPlayerPoints}</strong>
              <p>{isReportingPoints ? "积分回传中" : "本局积分"}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Error</span>
              <strong>{apiError ? "present" : "none"}</strong>
              <p>{apiError ?? "运行态无错误"}</p>
            </div>
          </div>

          <div className="json-card">
            <p className="mini-label">launch query</p>
            <pre>{JSON.stringify(launchContext, null, 2)}</pre>
          </div>
        </article>

        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Scene Runtime</p>
              <h2>Spot the Difference Race</h2>
            </div>
            <span className="pill">
              {effectiveState
                ? `${effectiveState.claimedSpotCount}/${effectiveState.totalSpotCount} claimed`
                : "loading"}
            </span>
          </div>

          {effectiveState ? (
            <SpotRaceRuntimePanel
              activePlayerLabel={launchContext.passengerId}
              canClaimSpot={Boolean(canClaimSpot)}
              gameState={gameState}
              modeLabel={launchContext.roomId ? "invite-room multiplayer" : "shared solo mode"}
              state={effectiveState}
              onClaimSpot={handleClaimSpot}
            />
          ) : (
            <div className="panel-hint">
              <strong>等待游戏状态</strong>
              <p>联机模式会在 websocket 建立后同步题面和已命中的差异点。</p>
            </div>
          )}
        </article>
      </section>

      <section className="activity-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Runtime Activity</p>
            <h2>最近事件</h2>
          </div>
          <span className="pill">{activity.length} items</span>
        </div>
        <div className="activity-list">
          {activity.length === 0 ? (
            <p className="empty-copy">命中、重连和结算事件会显示在这里。</p>
          ) : (
            activity.map((item) => (
              <article className={`activity-item tone-${item.tone}`} key={item.id}>
                <div>
                  <strong>{item.summary}</strong>
                  {item.detail ? <p>{item.detail}</p> : null}
                </div>
                <time>{item.timestamp}</time>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function toSoloViewState(
  soloState: SoloSpotRaceState,
  passengerId: string
): SpotRaceViewState {
  return {
    claimedSpotCount: Object.keys(soloState.foundSpots).length,
    deadlineAt: null,
    foundSpots: soloState.foundSpots,
    isCompleted: soloState.isCompleted,
    lastRecentClaim: soloState.recentClaims[0] ?? null,
    recentClaims: soloState.recentClaims,
    remainingSpotCount:
      soloState.scene.spots.length - Object.keys(soloState.foundSpots).length,
    scene: soloState.scene,
    scores: soloState.scores,
    totalSpotCount: soloState.scene.spots.length,
    winnerPlayerIds: [passengerId]
  };
}

function createClientId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
