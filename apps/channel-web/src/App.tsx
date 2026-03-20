import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState
} from "react";

import type {
  GameStateSnapshot,
  PassengerPointsSummary,
  PassengerRewardsWallet,
  PointsLeaderboardEntry,
  RealtimeServerMessage,
  RewardOffer,
  RoomPlayer,
  RoomSnapshot,
  SessionBootstrapRequest,
  SessionBootstrapResponse
} from "@wifi-portal/game-sdk";

import {
  apiBaseUrl,
  bootstrapSession,
  buildRealtimeUrl,
  createRoom,
  getPassengerPointsSummary,
  getPassengerRewardsWallet,
  getPointsLeaderboard,
  getRewardsCatalog,
  getRoom,
  isRealtimeOpen,
  joinRoomByInvite,
  joinRoom,
  parseRealtimeMessage,
  redeemReward,
  setReady
} from "./channel-api";
import { buildGamePackageLaunchSpec } from "./game-package-launcher";
import {
  QuizDuelRuntimePanel
} from "./quiz-duel-runtime";
import {
  parseQuizDuelState,
  type QuizChoice
} from "./quiz-duel-runtime-state";

type BootstrapFormState = {
  airline_code: string;
  cabin_class: string;
  locale: string;
  seat_number: string;
};

type CatalogCapabilityFilter =
  | "all"
  | "multiplayer"
  | "single-player"
  | "points-reporting";

type CatalogSortMode = "recommended" | "a-z" | "points" | "multiplayer-first";

type RoomStatus = "idle" | "connecting" | "connected" | "error";

type ActivityItem = {
  id: string;
  tone: "info" | "success" | "warn" | "error";
  summary: string;
  detail?: string;
  timestamp: string;
};

type PassengerProfile = {
  id: string;
  label: string;
  passenger_id: string;
  session_id: string;
  seat_number: string;
};

const DEFAULT_BOOTSTRAP_FORM: BootstrapFormState = {
  airline_code: "MU",
  cabin_class: "economy",
  locale: "zh-CN",
  seat_number: "32A"
};

export function App() {
  const [bootstrapForm, setBootstrapForm] =
    useState<BootstrapFormState>(DEFAULT_BOOTSTRAP_FORM);
  const [bootstrapData, setBootstrapData] =
    useState<SessionBootstrapResponse | null>(null);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [selectedCatalogSection, setSelectedCatalogSection] = useState("All");
  const [selectedCatalogCapability, setSelectedCatalogCapability] =
    useState<CatalogCapabilityFilter>("all");
  const [catalogSortMode, setCatalogSortMode] =
    useState<CatalogSortMode>("recommended");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [roomDraftName, setRoomDraftName] = useState("Cabin Quiz Table");
  const [inviteCodeDraft, setInviteCodeDraft] = useState("");
  const [profiles, setProfiles] = useState<PassengerProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<RoomSnapshot | null>(null);
  const [gameState, setGameState] = useState<GameStateSnapshot | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoadingBootstrap, setIsLoadingBootstrap] = useState(false);
  const [isLoadingPoints, setIsLoadingPoints] = useState(false);
  const [isLoadingRewards, setIsLoadingRewards] = useState(false);
  const [isRedeemingRewardId, setIsRedeemingRewardId] = useState<string | null>(null);
  const [isMutatingRoom, setIsMutatingRoom] = useState(false);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>("idle");
  const [pointsSummary, setPointsSummary] =
    useState<PassengerPointsSummary | null>(null);
  const [pointsLeaderboard, setPointsLeaderboard] =
    useState<PointsLeaderboardEntry[]>([]);
  const [rewardsCatalog, setRewardsCatalog] = useState<RewardOffer[]>([]);
  const [rewardsWallet, setRewardsWallet] =
    useState<PassengerRewardsWallet | null>(null);

  const deferredCatalogQuery = useDeferredValue(catalogQuery.trim().toLowerCase());
  const socketRef = useRef<WebSocket | null>(null);
  const playerEventSeqRef = useRef(0);
  const passengerCounterRef = useRef(1);

  const appendActivity = useEffectEvent(
    (
      tone: ActivityItem["tone"],
      summary: string,
      detail?: string
    ) => {
      startTransition(() => {
        setActivity((current) => [
          {
            detail,
            id: createClientId("activity"),
            summary,
            timestamp: new Date().toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            }),
            tone
          },
          ...current
        ].slice(0, 14));
      });
    }
  );

  const syncRoom = useEffectEvent((room: RoomSnapshot) => {
    startTransition(() => {
      setActiveRoom(room);
      setInviteCodeDraft(room.invite_code);
      if (room.game_id !== "quiz-duel") {
        setGameState(null);
      }
    });
  });

  const rememberProfile = useEffectEvent(
    (session: SessionBootstrapResponse["session"], seatNumber: string) => {
      const label = buildPassengerLabel(
        passengerCounterRef.current,
        seatNumber,
        session.passengerId
      );
      passengerCounterRef.current += 1;

      startTransition(() => {
        setProfiles((current) => {
          const existing = current.find(
            (profile) => profile.passenger_id === session.passengerId
          );

          if (existing) {
            return current.map((profile) =>
              profile.passenger_id === session.passengerId
                ? {
                    ...profile,
                    seat_number: seatNumber,
                    session_id: session.sessionId
                  }
                : profile
            );
          }

          return [
            ...current,
            {
              id: session.passengerId,
              label,
              passenger_id: session.passengerId,
              seat_number: seatNumber,
              session_id: session.sessionId
            }
          ];
        });
        setActiveProfileId(session.passengerId);
      });
    }
  );

  const handleRealtimeMessage = useEffectEvent((message: RealtimeServerMessage) => {
    switch (message.type) {
      case "room_snapshot":
        syncRoom(message.payload);
        appendActivity(
          "success",
          `房间快照已同步 ${message.payload.room_name}`,
          `${message.payload.players.length} 名玩家`
        );
        return;

      case "game_state":
        startTransition(() => {
          setGameState(message.payload);
        });
        appendActivity(
          "success",
          "实时游戏状态已更新",
          `revision ${message.payload.revision}`
        );
        return;

      case "room_presence":
        appendActivity(
          message.payload.status === "connected" ? "info" : "warn",
          `${message.payload.player_id} ${message.payload.status === "connected" ? "已联机" : "已离线"}`,
          `当前在线 ${message.payload.connected_players} 人`
        );
        return;

      case "game_event":
        appendActivity(
          "info",
          `${message.payload.playerId} 提交了游戏事件`,
          JSON.stringify(message.payload.payload)
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
    setIsLoadingBootstrap(true);
    setApiError(null);

    const seatNumber = DEFAULT_BOOTSTRAP_FORM.seat_number;

    void bootstrapSession({
      airline_code: DEFAULT_BOOTSTRAP_FORM.airline_code,
      cabin_class: DEFAULT_BOOTSTRAP_FORM.cabin_class,
      locale: DEFAULT_BOOTSTRAP_FORM.locale,
      seat_number: seatNumber
    })
      .then((response) => {
        setBootstrapData(response);
        setSelectedGameId(response.catalog[0]?.game_id ?? "");
        setActiveRoom(null);
        setGameState(null);
        playerEventSeqRef.current = 0;
        rememberProfile(response.session, seatNumber);
        appendActivity(
          "success",
          "频道配置已刷新",
          `${response.channel_config.channel_name} / ${response.catalog.length} 款游戏`
        );
      })
      .catch((error: unknown) => {
        const detail =
          error instanceof Error ? error.message : "Bootstrap failed";
        setApiError(detail);
        appendActivity("error", "频道初始化失败", detail);
      })
      .finally(() => {
        setIsLoadingBootstrap(false);
      });
  }, [appendActivity, rememberProfile]);

  const channelSectionsKey =
    bootstrapData?.channel_config.sections.join("|") ?? "";

  useEffect(() => {
    const sections = [
      "All",
      ...channelSectionsKey.split("|").filter(Boolean)
    ];
    setSelectedCatalogSection((current) =>
      sections.includes(current) ? current : (sections[0] ?? "All")
    );
  }, [bootstrapData?.trace_id, channelSectionsKey]);

  useEffect(() => {
    const session = bootstrapData?.session;
    const room = activeRoom;

    if (!session || !room) {
      setRoomStatus("idle");
      return;
    }

    if (!room.players.some((player) => player.player_id === session.passengerId)) {
      setRoomStatus("idle");
      return;
    }

    setRoomStatus("connecting");

    const socket = new WebSocket(
      buildRealtimeUrl({
        player_id: session.passengerId,
        room_id: room.room_id,
        session_id: session.sessionId,
        trace_id: createClientId("trace")
      })
    );

    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setRoomStatus("connected");
      appendActivity("success", "实时连接已建立", room.room_name);

      socket.send(
        JSON.stringify({
          message_id: createClientId("snapshot"),
          payload: { room_id: room.room_id },
          type: "room_snapshot_request"
        })
      );
      socket.send(
        JSON.stringify({
          message_id: createClientId("state"),
          payload: { game_id: room.game_id, room_id: room.room_id },
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
      appendActivity("warn", "实时连接已关闭");
    });

    socket.addEventListener("error", () => {
      setRoomStatus("error");
      appendActivity("error", "实时连接发生错误");
    });

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [activeRoom, bootstrapData?.session, appendActivity, handleRealtimeMessage]);

  useEffect(() => {
    const passengerId = bootstrapData?.session.passengerId;
    if (!passengerId) {
      setPointsSummary(null);
      setPointsLeaderboard([]);
      return;
    }

    let isStale = false;
    setIsLoadingPoints(true);

    void Promise.all([
      getPassengerPointsSummary(passengerId),
      getPointsLeaderboard(6)
    ])
      .then(([summary, leaderboard]) => {
        if (isStale) {
          return;
        }

        startTransition(() => {
          setPointsSummary(summary);
          setPointsLeaderboard(leaderboard.entries);
        });
      })
      .catch((error: unknown) => {
        if (isStale) {
          return;
        }

        const detail =
          error instanceof Error ? error.message : "Load points center failed";
        setApiError(detail);
        appendActivity("error", "积分中心刷新失败", detail);
      })
      .finally(() => {
        if (!isStale) {
          setIsLoadingPoints(false);
        }
      });

    return () => {
      isStale = true;
    };
  }, [appendActivity, bootstrapData?.session.passengerId]);

  useEffect(() => {
    const session = bootstrapData?.session;
    if (!session) {
      setRewardsCatalog([]);
      setRewardsWallet(null);
      return;
    }

    let isStale = false;
    setIsLoadingRewards(true);

    void Promise.all([
      getRewardsCatalog({
        airline_code: session.airlineCode,
        locale: session.locale
      }),
      getPassengerRewardsWallet({
        airline_code: session.airlineCode,
        passenger_id: session.passengerId
      })
    ])
      .then(([catalog, wallet]) => {
        if (isStale) {
          return;
        }

        startTransition(() => {
          setRewardsCatalog(catalog.offers);
          setRewardsWallet(wallet);
        });
      })
      .catch((error: unknown) => {
        if (isStale) {
          return;
        }

        const detail =
          error instanceof Error ? error.message : "Load rewards center failed";
        setApiError(detail);
        appendActivity("error", "权益中心刷新失败", detail);
      })
      .finally(() => {
        if (!isStale) {
          setIsLoadingRewards(false);
        }
      });

    return () => {
      isStale = true;
    };
  }, [
    appendActivity,
    bootstrapData?.session,
    bootstrapData?.session.airlineCode,
    bootstrapData?.session.locale,
    bootstrapData?.session.passengerId
  ]);

  const availableCatalogSections = [
    "All",
    ...(bootstrapData?.channel_config.sections ?? [])
  ];
  const catalogEntries = bootstrapData?.catalog ?? [];
  const filteredCatalog = catalogEntries.filter((entry) => {
    if (!matchesCatalogSection(entry, selectedCatalogSection)) {
      return false;
    }

    if (
      selectedCatalogCapability !== "all" &&
      !entry.capabilities.includes(selectedCatalogCapability)
    ) {
      return false;
    }

    if (!deferredCatalogQuery) {
      return true;
    }

    const searchable = [
      entry.display_name,
      entry.description,
      entry.categories.join(" "),
      entry.capabilities.join(" ")
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(deferredCatalogQuery);
  });
  const sortedCatalog = sortCatalogEntries(filteredCatalog, catalogSortMode);
  const featuredCatalog = sortCatalogEntries(
    catalogEntries.filter((entry) => entry.categories.includes("Featured")),
    "recommended"
  ).slice(0, 3);
  const multiplayerCatalog = sortCatalogEntries(
    catalogEntries.filter((entry) => entry.capabilities.includes("multiplayer")),
    "recommended"
  ).slice(0, 3);
  const pointsReadyCatalog = sortCatalogEntries(
    catalogEntries.filter((entry) => entry.points_enabled),
    "points"
  ).slice(0, 3);
  const quickPickCatalog = dedupeCatalogEntries([
    ...featuredCatalog,
    ...multiplayerCatalog,
    ...pointsReadyCatalog
  ]).slice(0, 4);

  const selectedGame =
    sortedCatalog.find((entry) => entry.game_id === selectedGameId) ??
    catalogEntries.find((entry) => entry.game_id === selectedGameId) ??
    sortedCatalog[0] ??
    catalogEntries[0] ??
    null;
  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) ?? null;
  const currentPassengerId = bootstrapData?.session.passengerId ?? null;
  const launcherRoom =
    activeRoom && selectedGame && activeRoom.game_id === selectedGame.game_id
      ? activeRoom
      : null;
  const quizDuelState =
    gameState?.gameId === "quiz-duel" ? parseQuizDuelState(gameState) : null;
  const launchSpec =
    selectedGame && bootstrapData
      ? buildGamePackageLaunchSpec({
          baseUrl:
            typeof window === "undefined"
              ? "http://127.0.0.1:5173"
              : window.location.origin,
          entry: selectedGame,
          launchContext: bootstrapData.session,
          room: launcherRoom,
          traceId: bootstrapData.trace_id
        })
      : null;
  const currentPlayerAnswer =
    currentPassengerId && quizDuelState
      ? quizDuelState.answersByPlayer[currentPassengerId] ?? null
      : null;
  const canSubmitQuizAnswer =
    roomStatus === "connected" &&
    !!launcherRoom &&
    !!currentPassengerId &&
    launcherRoom.players.some((player) => player.player_id === currentPassengerId) &&
    !quizDuelState?.isCompleted &&
    !currentPlayerAnswer;
  const currentPassengerRank =
    currentPassengerId
      ? pointsLeaderboard.findIndex((entry) => entry.passenger_id === currentPassengerId) + 1
      : 0;
  const topGameEntry =
    pointsSummary
      ? Object.entries(pointsSummary.by_game).sort((left, right) => right[1] - left[1])[0] ??
        null
      : null;
  const rewardsEnabled =
    bootstrapData?.channel_config.feature_flags.airline_rewards_enabled ?? false;

  async function refreshBootstrap() {
    setIsLoadingBootstrap(true);
    setApiError(null);

    const payload: SessionBootstrapRequest = {
      airline_code: bootstrapForm.airline_code,
      cabin_class: bootstrapForm.cabin_class,
      locale: bootstrapForm.locale,
      passenger_id: activeProfile?.passenger_id,
      seat_number: activeProfile?.seat_number ?? bootstrapForm.seat_number,
      session_id: activeProfile?.session_id
    };

    try {
      const response = await bootstrapSession(payload);
      setBootstrapData(response);
      setSelectedGameId((current) => current || response.catalog[0]?.game_id || "");
      setGameState(null);
      playerEventSeqRef.current = 0;
      rememberProfile(response.session, payload.seat_number ?? bootstrapForm.seat_number);
      appendActivity(
        "success",
        "频道配置已刷新",
        `${response.channel_config.channel_name} / ${response.catalog.length} 款游戏`
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Bootstrap failed";
      setApiError(detail);
      appendActivity("error", "频道初始化失败", detail);
    } finally {
      setIsLoadingBootstrap(false);
    }
  }

  async function switchToProfile(profile: PassengerProfile) {
    setIsLoadingBootstrap(true);
    setApiError(null);

    try {
      const response = await bootstrapSession({
        airline_code: bootstrapForm.airline_code,
        cabin_class: bootstrapForm.cabin_class,
        locale: bootstrapForm.locale,
        passenger_id: profile.passenger_id,
        seat_number: profile.seat_number,
        session_id: profile.session_id
      });

      setBootstrapData(response);
      setActiveProfileId(profile.id);
      setSelectedGameId((current) => current || response.catalog[0]?.game_id || "");
      setGameState(null);
      playerEventSeqRef.current = 0;
      rememberProfile(response.session, profile.seat_number);
      appendActivity("success", `已切换到 ${profile.label}`, profile.passenger_id);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Profile switch failed";
      setApiError(detail);
      appendActivity("error", "切换乘客视角失败", detail);
    } finally {
      setIsLoadingBootstrap(false);
    }
  }

  async function handleCreatePassengerProfile() {
    const draft = createPassengerProfile(passengerCounterRef.current);
    passengerCounterRef.current += 1;

    setIsLoadingBootstrap(true);
    setApiError(null);

    try {
      const response = await bootstrapSession({
        airline_code: bootstrapForm.airline_code,
        cabin_class: bootstrapForm.cabin_class,
        locale: bootstrapForm.locale,
        passenger_id: draft.passenger_id,
        seat_number: draft.seat_number,
        session_id: draft.session_id
      });

      setBootstrapData(response);
      setSelectedGameId((current) => current || response.catalog[0]?.game_id || "");
      setGameState(null);
      playerEventSeqRef.current = 0;
      rememberProfile(response.session, draft.seat_number);
      appendActivity("success", `已生成新乘客 ${draft.label}`, draft.passenger_id);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Create profile failed";
      setApiError(detail);
      appendActivity("error", "生成乘客身份失败", detail);
    } finally {
      setIsLoadingBootstrap(false);
    }
  }

  async function handleCreateRoom() {
    if (!bootstrapData || !selectedGame) {
      return;
    }

    setIsMutatingRoom(true);
    setApiError(null);

    try {
      const response = await createRoom({
        game_id: selectedGame.game_id,
        host_player_id: bootstrapData.session.passengerId,
        host_session_id: bootstrapData.session.sessionId,
        max_players: 4,
        room_name: roomDraftName
      });

      syncRoom(response.room);
      playerEventSeqRef.current = 0;
      appendActivity(
        "success",
        `已创建房间 ${response.room.room_name}`,
        `invite ${response.room.invite_code}`
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Create room failed";
      setApiError(detail);
      appendActivity("error", "创建房间失败", detail);
    } finally {
      setIsMutatingRoom(false);
    }
  }

  async function handleAddPreviewGuest() {
    if (!activeRoom) {
      return;
    }

    setIsMutatingRoom(true);
    setApiError(null);

    const guestId = createClientId("guest");
    const guestSessionId = createClientId("sess");

    try {
      const response = await joinRoom({
        player_id: guestId,
        room_id: activeRoom.room_id,
        session_id: guestSessionId
      });

      syncRoom(response.room);
      appendActivity("success", `已加入预览乘客 ${guestId}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Join room failed";
      setApiError(detail);
      appendActivity("error", "加入预览乘客失败", detail);
    } finally {
      setIsMutatingRoom(false);
    }
  }

  async function handleJoinRoomByInvite() {
    const session = bootstrapData?.session;
    if (!session || !inviteCodeDraft.trim()) {
      return;
    }

    setIsMutatingRoom(true);
    setApiError(null);

    try {
      const response = await joinRoomByInvite({
        invite_code: inviteCodeDraft.trim().toUpperCase(),
        player_id: session.passengerId,
        session_id: session.sessionId
      });

      syncRoom(response.room);
      playerEventSeqRef.current = 0;
      appendActivity(
        "success",
        `已通过邀请码加入 ${response.room.room_name}`,
        `invite ${response.room.invite_code}`
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Join by invite failed";
      setApiError(detail);
      appendActivity("error", "邀请码加入失败", detail);
    } finally {
      setIsMutatingRoom(false);
    }
  }

  async function handleRefreshRoom() {
    if (!activeRoom) {
      return;
    }

    setIsMutatingRoom(true);
    setApiError(null);

    try {
      const room = await getRoom(activeRoom.room_id);
      syncRoom(room);
      appendActivity("info", "已拉取最新房间状态", room.room_name);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Fetch room failed";
      setApiError(detail);
      appendActivity("error", "刷新房间失败", detail);
    } finally {
      setIsMutatingRoom(false);
    }
  }

  async function handleRefreshPointsCenter() {
    const passengerId = bootstrapData?.session.passengerId;
    if (!passengerId) {
      return;
    }

    setIsLoadingPoints(true);
    setApiError(null);

    try {
      const [summary, leaderboard] = await Promise.all([
        getPassengerPointsSummary(passengerId),
        getPointsLeaderboard(6)
      ]);

      setPointsSummary(summary);
      setPointsLeaderboard(leaderboard.entries);
      appendActivity(
        "info",
        "积分中心已刷新",
        `${summary.total_points} points / rank ${leaderboard.entries.findIndex((entry) => entry.passenger_id === passengerId) + 1 || "-"}`
      );
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Refresh points center failed";
      setApiError(detail);
      appendActivity("error", "积分中心刷新失败", detail);
    } finally {
      setIsLoadingPoints(false);
    }
  }

  async function handleRefreshRewardsCenter() {
    const session = bootstrapData?.session;
    if (!session) {
      return;
    }

    setIsLoadingRewards(true);
    setApiError(null);

    try {
      const [catalog, wallet] = await Promise.all([
        getRewardsCatalog({
          airline_code: session.airlineCode,
          locale: session.locale
        }),
        getPassengerRewardsWallet({
          airline_code: session.airlineCode,
          passenger_id: session.passengerId
        })
      ]);

      setRewardsCatalog(catalog.offers);
      setRewardsWallet(wallet);
      appendActivity(
        "info",
        "权益中心已刷新",
        `${wallet.available_points} available points`
      );
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Refresh rewards center failed";
      setApiError(detail);
      appendActivity("error", "权益中心刷新失败", detail);
    } finally {
      setIsLoadingRewards(false);
    }
  }

  async function handleRedeemReward(offer: RewardOffer) {
    const session = bootstrapData?.session;
    if (!session) {
      return;
    }

    setIsRedeemingRewardId(offer.reward_id);
    setApiError(null);

    try {
      const response = await redeemReward({
        airline_code: session.airlineCode,
        locale: session.locale,
        passenger_id: session.passengerId,
        redemption_id: createClientId("redeem"),
        reward_id: offer.reward_id,
        session_id: session.sessionId
      });

      setRewardsWallet(response.wallet);
      appendActivity(
        "success",
        `已兑换 ${response.redemption.title}`,
        `${response.wallet.available_points} available points`
      );
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Redeem reward failed";
      setApiError(detail);
      appendActivity("error", "权益兑换失败", detail);
    } finally {
      setIsRedeemingRewardId(null);
    }
  }

  async function handleToggleReady(player: RoomPlayer) {
    if (!activeRoom) {
      return;
    }

    setIsMutatingRoom(true);
    setApiError(null);

    try {
      const response = await setReady({
        player_id: player.player_id,
        ready: !player.ready,
        room_id: activeRoom.room_id
      });

      syncRoom(response.room);
      appendActivity(
        "info",
        `${player.player_id} ${player.ready ? "取消准备" : "已准备"}`
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Set ready failed";
      setApiError(detail);
      appendActivity("error", "更新准备状态失败", detail);
    } finally {
      setIsMutatingRoom(false);
    }
  }

  function handleSendQuizAnswer(choice: QuizChoice) {
    const session = bootstrapData?.session;
    const room = activeRoom;
    const socket = socketRef.current;

    if (!session || !room || !isRealtimeOpen(socket)) {
      setApiError("当前没有可用的实时连接");
      return;
    }

    playerEventSeqRef.current += 1;
    socket.send(
      JSON.stringify({
        message_id: createClientId("event"),
        payload: {
          gameId: room.game_id,
          payload: { answer: choice },
          playerId: session.passengerId,
          roomId: room.room_id,
          seq: playerEventSeqRef.current,
          type: "game_event"
        },
        type: "game_event"
      })
    );

    appendActivity("info", `已发送答案 ${choice}`, `seq ${playerEventSeqRef.current}`);
  }

  return (
    <main className="shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Wi-Fi Portal Game Channel</p>
          <h1>机上频道、联机房间与实时游戏状态已经接通</h1>
          <p className="lede">
            这个页面现在直接调用 `platform-api`。你可以刷新 session、读取目录、
            创建房间、模拟乘客加入、切换 ready，并通过 WebSocket 给 `quiz-duel`
            发送实时答案事件。
          </p>
        </div>

        <div className="hero-stats">
          <StatChip label="API" value={apiBaseUrl} accent="sun" />
          <StatChip
            label="Channel"
            value={bootstrapData?.channel_config.channel_name ?? "未加载"}
            accent="sea"
          />
          <StatChip
            label="Passenger"
            value={activeProfile?.label ?? bootstrapData?.session.passengerId ?? "未选择"}
            accent="sea"
          />
          <StatChip
            label="Realtime"
            value={roomStatus}
            accent={roomStatus === "connected" ? "mint" : "rose"}
          />
        </div>
      </section>

      {apiError ? (
        <section className="banner banner-error">
          <strong>请求失败</strong>
          <span>{apiError}</span>
        </section>
      ) : null}

      <section className="dashboard">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Session Bootstrap</p>
              <h2>频道初始化</h2>
            </div>
            <button
              className="action-button"
              disabled={isLoadingBootstrap}
              onClick={() => {
                void refreshBootstrap();
              }}
              type="button"
            >
              {isLoadingBootstrap ? "刷新中..." : "刷新频道"}
            </button>
          </div>

          <div className="form-grid">
            <label>
              航司代码
              <input
                onChange={(event) => {
                  setBootstrapForm((current) => ({
                    ...current,
                    airline_code: event.target.value.toUpperCase()
                  }));
                }}
                value={bootstrapForm.airline_code}
              />
            </label>
            <label>
              舱位
              <input
                onChange={(event) => {
                  setBootstrapForm((current) => ({
                    ...current,
                    cabin_class: event.target.value
                  }));
                }}
                value={bootstrapForm.cabin_class}
              />
            </label>
            <label>
              语言
              <input
                onChange={(event) => {
                  setBootstrapForm((current) => ({
                    ...current,
                    locale: event.target.value
                  }));
                }}
                value={bootstrapForm.locale}
              />
            </label>
            <label>
              座位号
              <input
                onChange={(event) => {
                  setBootstrapForm((current) => ({
                    ...current,
                    seat_number: event.target.value
                  }));
                }}
                value={bootstrapForm.seat_number}
              />
            </label>
          </div>

          <div className="json-card">
            <p className="mini-label">当前 launch context</p>
            <pre>
              {JSON.stringify(
                bootstrapData?.session ?? { status: "等待 bootstrap" },
                null,
                2
              )}
            </pre>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Passenger Profiles</p>
              <h2>乘客视角切换</h2>
            </div>
            <button
              className="action-button"
              disabled={isLoadingBootstrap}
              onClick={() => {
                void handleCreatePassengerProfile();
              }}
              type="button"
            >
              新增乘客
            </button>
          </div>

          <div className="profile-list">
            {profiles.map((profile) => (
              <button
                className={`profile-card ${activeProfileId === profile.id ? "profile-card-active" : ""}`}
                key={profile.id}
                onClick={() => {
                  void switchToProfile(profile);
                }}
                type="button"
              >
                <div className="profile-topline">
                  <strong>{profile.label}</strong>
                  <span>{profile.seat_number}</span>
                </div>
                <p>{profile.passenger_id}</p>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Points Center</p>
              <h2>积分中心</h2>
            </div>
            <button
              className="action-button"
              disabled={!bootstrapData || isLoadingPoints}
              onClick={() => {
                void handleRefreshPointsCenter();
              }}
              type="button"
            >
              {isLoadingPoints ? "刷新中..." : "刷新积分"}
            </button>
          </div>

          <div className="points-stat-grid">
            <article className="points-card">
              <span>Passenger Total</span>
              <strong>{pointsSummary?.total_points ?? 0}</strong>
              <p>当前乘客累计积分</p>
            </article>
            <article className="points-card">
              <span>Leaderboard Rank</span>
              <strong>{currentPassengerRank > 0 ? `#${currentPassengerRank}` : "-"}</strong>
              <p>基于当前平台活跃乘客积分排序</p>
            </article>
            <article className="points-card">
              <span>Top Game</span>
              <strong>{topGameEntry?.[0] ?? "暂无"}</strong>
              <p>{topGameEntry ? `${topGameEntry[1]} points` : "还没有积分回传"}</p>
            </article>
          </div>

          <div className="points-grid">
            <section className="points-card">
              <div className="round-history-topline">
                <strong>全局积分榜</strong>
                <span>top 6</span>
              </div>
              <div className="points-list">
                {pointsLeaderboard.length === 0 ? (
                  <div className="empty-state compact">
                    <h3>还没有排行榜数据</h3>
                    <p>先进入 package 页面回传积分，这里会汇总平台榜单。</p>
                  </div>
                ) : (
                  pointsLeaderboard.map((entry) => (
                    <article className="points-rank-row" key={entry.passenger_id}>
                      <div className="points-rank-badge">#{entry.rank}</div>
                      <div className="points-rank-copy">
                        <strong>{entry.passenger_id}</strong>
                        <p>
                          最近回传 {entry.latest_report?.game_id ?? "n/a"} ·{" "}
                          {formatShortTime(entry.updated_at)}
                        </p>
                      </div>
                      <div className="points-rank-total">{entry.total_points} pts</div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="points-card">
              <div className="round-history-topline">
                <strong>最近积分回传</strong>
                <span>{pointsSummary?.latest_reports.length ?? 0} records</span>
              </div>
              <div className="points-report-list">
                {pointsSummary && pointsSummary.latest_reports.length > 0 ? (
                  pointsSummary.latest_reports.slice(0, 5).map((report) => (
                    <article className="points-report-item" key={report.report_id}>
                      <div className="activity-topline">
                        <strong>{report.game_id}</strong>
                        <span>{report.points} pts</span>
                      </div>
                      <p>{report.reason}</p>
                      <time>{formatShortTime(report.reported_at)}</time>
                    </article>
                  ))
                ) : (
                  <div className="empty-state compact">
                    <h3>还没有积分记录</h3>
                    <p>从 quiz-duel 或 cabin-puzzle 页面回传积分后，这里会显示最近记录。</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Airline Rewards</p>
              <h2>航司权益兑换</h2>
            </div>
            <button
              className="action-button"
              disabled={!bootstrapData || isLoadingRewards || !rewardsEnabled}
              onClick={() => {
                void handleRefreshRewardsCenter();
              }}
              type="button"
            >
              {isLoadingRewards ? "刷新中..." : "刷新权益"}
            </button>
          </div>

          {rewardsEnabled ? (
            <>
              <div className="rewards-stat-grid">
                <article className="points-card">
                  <span>Available Points</span>
                  <strong>{rewardsWallet?.available_points ?? 0}</strong>
                  <p>当前可用于兑换的积分余额</p>
                </article>
                <article className="points-card">
                  <span>Earned vs Redeemed</span>
                  <strong>
                    {rewardsWallet?.earned_points ?? pointsSummary?.total_points ?? 0} /{" "}
                    {rewardsWallet?.redeemed_points ?? 0}
                  </strong>
                  <p>已赚积分 / 已兑换积分</p>
                </article>
                <article className="points-card">
                  <span>Airline Wallet</span>
                  <strong>{bootstrapData?.session.airlineCode ?? "DEMO"}</strong>
                  <p>当前 session 绑定的航司权益钱包</p>
                </article>
              </div>

              <div className="rewards-grid">
                <section className="points-card">
                  <div className="round-history-topline">
                    <strong>可兑换权益</strong>
                    <span>{rewardsCatalog.length} offers</span>
                  </div>
                  <div className="reward-offer-list">
                    {rewardsCatalog.map((offer) => {
                      const isDisabled =
                        offer.inventory_status === "sold_out" ||
                        (rewardsWallet?.available_points ?? 0) < offer.points_cost ||
                        isRedeemingRewardId !== null;

                      return (
                        <article className="reward-offer-card" key={offer.reward_id}>
                          <div className="activity-topline">
                            <strong>{offer.title}</strong>
                            <span>{offer.points_cost} pts</span>
                          </div>
                          <p>{offer.description}</p>
                          <div className="tag-row">
                            <span className="tag">{offer.fulfillment_type}</span>
                            <span className="tag">{offer.inventory_status}</span>
                            {offer.inventory_remaining !== null ? (
                              <span className="tag">剩余 {offer.inventory_remaining}</span>
                            ) : null}
                            {offer.redemption_limit_per_session !== null ? (
                              <span className="tag">
                                每航段限兑 {offer.redemption_limit_per_session}
                              </span>
                            ) : null}
                          </div>
                          <small>{offer.terms}</small>
                          <button
                            className="action-button action-button-primary"
                            disabled={isDisabled}
                            onClick={() => {
                              void handleRedeemReward(offer);
                            }}
                            type="button"
                          >
                            {isRedeemingRewardId === offer.reward_id
                              ? "兑换中..."
                              : offer.inventory_status === "sold_out"
                                ? "已兑完"
                                : (rewardsWallet?.available_points ?? 0) < offer.points_cost
                                  ? "积分不足"
                                  : "立即兑换"}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>

                <section className="points-card">
                  <div className="round-history-topline">
                    <strong>最近兑换记录</strong>
                    <span>{rewardsWallet?.redemption_history.length ?? 0} records</span>
                  </div>
                  <div className="points-report-list">
                    {rewardsWallet && rewardsWallet.redemption_history.length > 0 ? (
                      rewardsWallet.redemption_history.slice(0, 5).map((record) => (
                        <article className="points-report-item" key={record.redemption_id}>
                          <div className="activity-topline">
                            <strong>{record.title}</strong>
                            <span>{record.points_cost} pts</span>
                          </div>
                          <div className="tag-row">
                            <span className="tag">{record.fulfillment_type}</span>
                            <span className="tag">{record.status}</span>
                          </div>
                          <p>{record.reward_id}</p>
                          {record.fulfillment_code ? (
                            <p>兑换码 {record.fulfillment_code}</p>
                          ) : null}
                          <small>{record.fulfillment_instructions}</small>
                          <time>{formatShortTime(record.redeemed_at)}</time>
                        </article>
                      ))
                    ) : (
                      <div className="empty-state compact">
                        <h3>还没有权益兑换</h3>
                        <p>先在右侧挑一个权益兑换，记录会保存在当前乘客钱包里。</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div className="empty-state compact">
              <h3>当前航司未开启权益兑换</h3>
              <p>后续可按航司配置开关开放不同的兑换目录和库存策略。</p>
            </div>
          )}
        </article>

        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Discover</p>
              <h2>频道推荐位与快捷浏览</h2>
            </div>
            <span className="pill">{catalogEntries.length} games live</span>
          </div>

          <div className="discover-grid">
            <section className="discover-hero-card">
              <p className="mini-label">Hero Recommendation</p>
              <h3>{selectedGame?.display_name ?? bootstrapData?.channel_config.channel_name}</h3>
              <p>
                {selectedGame?.description ??
                  bootstrapData?.channel_config.hero_title ??
                  "当前频道已经支持推荐位、筛选和独立 package 启动。"}
              </p>
              <div className="tag-row">
                {(selectedGame?.categories ?? bootstrapData?.channel_config.sections ?? [])
                  .slice(0, 4)
                  .map((item) => (
                    <span className="tag" key={item}>
                      {item}
                    </span>
                  ))}
              </div>
              {selectedGame ? (
                <div className="button-row">
                  <button
                    className="action-button action-button-primary"
                    onClick={() => {
                      const catalogPanel = document.getElementById("catalog-browser");
                      catalogPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    type="button"
                  >
                    浏览这个游戏
                  </button>
                  <a className="action-button" href={launchSpec?.url ?? "#"}>
                    直接启动
                  </a>
                </div>
              ) : null}
            </section>

            <section className="discover-rail">
              <div className="activity-topline">
                <strong>精选推荐</strong>
                <span>{featuredCatalog.length} picks</span>
              </div>
              <div className="discover-list">
                {featuredCatalog.map((entry) => (
                  <button
                    className="discover-tile"
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
            </section>

            <section className="discover-rail">
              <div className="activity-topline">
                <strong>联机专区</strong>
                <span>{multiplayerCatalog.length} rooms-ready</span>
              </div>
              <div className="discover-list">
                {multiplayerCatalog.map((entry) => (
                  <button
                    className="discover-tile"
                    key={entry.game_id}
                    onClick={() => {
                      setSelectedGameId(entry.game_id);
                      setSelectedCatalogSection("Multiplayer");
                    }}
                    type="button"
                  >
                    <strong>{entry.display_name}</strong>
                    <p>{entry.categories.join(" · ")}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="discover-rail">
              <div className="activity-topline">
                <strong>积分优先</strong>
                <span>{pointsReadyCatalog.length} earnable</span>
              </div>
              <div className="discover-list">
                {pointsReadyCatalog.map((entry) => (
                  <button
                    className="discover-tile"
                    key={entry.game_id}
                    onClick={() => {
                      setSelectedGameId(entry.game_id);
                      setSelectedCatalogCapability("points-reporting");
                    }}
                    type="button"
                  >
                    <strong>{entry.display_name}</strong>
                    <p>{entry.points_enabled ? "支持积分回传" : "纯体验"}</p>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="quick-pick-row">
            {quickPickCatalog.map((entry) => (
              <button
                className="quick-pick-card"
                key={entry.game_id}
                onClick={() => {
                  setSelectedGameId(entry.game_id);
                }}
                type="button"
              >
                <span>{entry.display_name}</span>
                <strong>{entry.capabilities[0] ?? "game"}</strong>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Catalog</p>
              <h2>游戏目录</h2>
            </div>
            <span className="pill">{sortedCatalog.length} entries</span>
          </div>

          <div className="catalog-toolbar" id="catalog-browser">
            <label className="catalog-toolbar-field">
              排序
              <select
                onChange={(event) => {
                  setCatalogSortMode(event.target.value as CatalogSortMode);
                }}
                value={catalogSortMode}
              >
                <option value="recommended">推荐优先</option>
                <option value="multiplayer-first">联机优先</option>
                <option value="points">积分优先</option>
                <option value="a-z">A-Z</option>
              </select>
            </label>

            <label className="catalog-toolbar-field">
              能力
              <select
                onChange={(event) => {
                  setSelectedCatalogCapability(
                    event.target.value as CatalogCapabilityFilter
                  );
                }}
                value={selectedCatalogCapability}
              >
                <option value="all">全部</option>
                <option value="multiplayer">联机</option>
                <option value="single-player">单机</option>
                <option value="points-reporting">可赚积分</option>
              </select>
            </label>
          </div>

          <label className="search-row">
            搜索能力 / 分类
            <input
              onChange={(event) => {
                setCatalogQuery(event.target.value);
              }}
              placeholder="multiplayer, quiz, leaderboard..."
              value={catalogQuery}
            />
          </label>

          <div className="section-chip-row">
            {availableCatalogSections.map((section) => (
              <button
                className={`section-chip ${selectedCatalogSection === section ? "section-chip-active" : ""}`}
                key={section}
                onClick={() => {
                  setSelectedCatalogSection(section);
                }}
                type="button"
              >
                {section}
              </button>
            ))}
          </div>

          <div className="catalog-grid">
            {sortedCatalog.map((entry) => (
              <button
                className={`catalog-card ${selectedGame?.game_id === entry.game_id ? "catalog-card-selected" : ""}`}
                key={entry.game_id}
                onClick={() => {
                  setSelectedGameId(entry.game_id);
                }}
                type="button"
              >
                <div className="catalog-topline">
                  <strong>{entry.display_name}</strong>
                  <span>{entry.points_enabled ? "积分" : "纯体验"}</span>
                </div>
                <p>{entry.description}</p>
                <div className="tag-row">
                  {entry.categories.slice(0, 3).map((category) => (
                    <span className="tag" key={category}>
                      {category}
                    </span>
                  ))}
                  {entry.capabilities.map((capability) => (
                    <span className="tag" key={capability}>
                      {capability}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>

          {sortedCatalog.length === 0 ? (
            <div className="empty-state compact">
              <h3>没有匹配的游戏</h3>
              <p>调整 section、能力筛选或搜索词后，这里会更新结果。</p>
            </div>
          ) : null}
        </article>

        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Lobby + Realtime</p>
              <h2>房间联机控制台</h2>
            </div>
            <span className={`status-pill status-${roomStatus}`}>{roomStatus}</span>
          </div>

          <div className="lobby-layout">
            <div className="lobby-actions">
              <label>
                房间名
                <input
                  onChange={(event) => {
                    setRoomDraftName(event.target.value);
                  }}
                  value={roomDraftName}
                />
              </label>

              <label>
                邀请码
                <input
                  onChange={(event) => {
                    setInviteCodeDraft(event.target.value.toUpperCase());
                  }}
                  placeholder="例如 50TI9D"
                  value={inviteCodeDraft}
                />
              </label>

              <button
                className="action-button action-button-primary"
                disabled={!selectedGame || !bootstrapData || isMutatingRoom}
                onClick={() => {
                  void handleCreateRoom();
                }}
                type="button"
              >
                创建 {selectedGame?.display_name ?? "房间"}
              </button>

              <button
                className="action-button"
                disabled={!bootstrapData || !inviteCodeDraft.trim() || isMutatingRoom}
                onClick={() => {
                  void handleJoinRoomByInvite();
                }}
                type="button"
              >
                通过邀请码加入
              </button>

              <button
                className="action-button"
                disabled={!activeRoom || isMutatingRoom}
                onClick={() => {
                  void handleAddPreviewGuest();
                }}
                type="button"
              >
                加入预览乘客
              </button>

              <button
                className="action-button"
                disabled={!activeRoom || isMutatingRoom}
                onClick={() => {
                  void handleRefreshRoom();
                }}
                type="button"
              >
                刷新房间
              </button>
            </div>

            <div className="room-surface">
              {activeRoom ? (
                <>
                  <div className="room-header">
                    <div>
                      <p className="mini-label">Active Room</p>
                      <h3>{activeRoom.room_name}</h3>
                    </div>
                    <div className="room-meta">
                      <span>
                        viewer{" "}
                        {activeProfile?.passenger_id ?? bootstrapData?.session.passengerId ?? "-"}
                      </span>
                      <span>room {activeRoom.room_id}</span>
                      <span>invite {activeRoom.invite_code}</span>
                      <span>{activeRoom.status}</span>
                    </div>
                  </div>

                  <div className="player-list">
                    {activeRoom.players.map((player) => (
                      <article className="player-card" key={player.player_id}>
                        <div>
                          <strong>{player.player_id}</strong>
                          <p>
                            {player.is_host ? "Host" : "Guest"} ·{" "}
                            {player.connection_status}
                          </p>
                          {quizDuelState ? (
                            <p>
                              当前作答:{" "}
                              {quizDuelState.answersByPlayer[player.player_id] ?? "等待中"}
                            </p>
                          ) : null}
                        </div>
                        <button
                          className={`ready-button ${player.ready ? "ready-true" : ""}`}
                          disabled={isMutatingRoom}
                          onClick={() => {
                            void handleToggleReady(player);
                          }}
                          type="button"
                        >
                          {player.ready ? "已准备" : "设为准备"}
                        </button>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <h3>还没有活跃房间</h3>
                  <p>先从上方目录选择一个游戏，然后创建房间。</p>
                </div>
              )}
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Game Package Launcher</p>
              <h2>统一启动器</h2>
            </div>
            <span className="pill">{launchSpec?.mode ?? "idle"}</span>
          </div>

          {selectedGame && launchSpec ? (
            <>
              <section className="launcher-callout">
                <div>
                  <p className="mini-label">Selected Package</p>
                  <h3>{selectedGame.display_name}</h3>
                  <p>
                    {launchSpec.mode === "embedded"
                      ? "当前游戏由频道内置 renderer 承载，后续可以无缝切到独立 package 前端。"
                      : "当前游戏已具备标准 launch URL，可切到独立 iframe 或容器路由。"}
                  </p>
                </div>
                <div className="tag-row">
                  {selectedGame.capabilities.map((capability) => (
                    <span className="tag" key={capability}>
                      {capability}
                    </span>
                  ))}
                </div>
                <div className="launcher-actions">
                  <a className="action-button action-button-primary" href={launchSpec.url}>
                    打开 package 页
                  </a>
                  <a
                    className="action-button"
                    href={launchSpec.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    新标签打开
                  </a>
                </div>
              </section>

              <div className="launcher-meta-grid">
                <div className="quiz-meta-card">
                  <span>Launch Route</span>
                  <strong>{launchSpec.route}</strong>
                  <p>{launchSpec.url}</p>
                </div>
                <div className="quiz-meta-card">
                  <span>Launch Scope</span>
                  <strong>{launchSpec.roomId ? "room-scoped" : "session-scoped"}</strong>
                  <p>
                    {launchSpec.roomId
                      ? `绑定房间 ${launchSpec.roomId}`
                      : "当前只带 passenger/session 上下文"}
                  </p>
                </div>
                <div className="quiz-meta-card">
                  <span>Trace</span>
                  <strong>{launchSpec.traceId}</strong>
                  <p>后续 package server 可直接继承这条 trace</p>
                </div>
                <div className="quiz-meta-card">
                  <span>Package Mode</span>
                  <strong>{launchSpec.mode}</strong>
                  <p>
                    {launchSpec.mode === "embedded"
                      ? "使用本地 renderer registry"
                      : "保留给独立 package route / iframe"}
                  </p>
                </div>
              </div>

              <div className="json-card">
                <p className="mini-label">launch spec</p>
                <pre>{JSON.stringify(launchSpec, null, 2)}</pre>
              </div>

              {launchSpec.mode === "embedded" && quizDuelState ? (
                <>
                  <QuizDuelRuntimePanel
                    activePlayerLabel={activeProfile?.label ?? currentPassengerId ?? "-"}
                    canSubmitAnswer={canSubmitQuizAnswer}
                    currentPlayerAnswer={currentPlayerAnswer}
                    gameState={gameState}
                    onSubmitAnswer={handleSendQuizAnswer}
                    playerCount={activeRoom?.players.length ?? 0}
                    showRawState
                    state={quizDuelState}
                  />
                </>
              ) : (
                <div className="empty-state compact launcher-placeholder">
                  <h3>等待独立 Game Package 前端接入</h3>
                  <p>
                    当前启动器已经生成标准 launch URL、trace 和 session 上下文。后续只需要把
                    `{selectedGame.route}` 对应的 package 前端挂上来，就可以走 iframe 或独立页面模式。
                  </p>
                </div>
              )}

              {launchSpec.mode === "iframe" ? (
                <section className="launcher-iframe-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="panel-kicker">Iframe Preview</p>
                      <h2>{selectedGame.display_name} 独立包预览</h2>
                    </div>
                    <span className="pill">iframe</span>
                  </div>
                  <iframe
                    className="launcher-iframe"
                    src={launchSpec.url}
                    title={`${selectedGame.display_name} iframe preview`}
                  />
                </section>
              ) : null}
            </>
          ) : (
            <div className="empty-state compact">
              <h3>还没有可启动的 Game Package</h3>
              <p>
                先选择一个游戏并完成 session bootstrap，这里会生成 launch spec。
              </p>
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Event Feed</p>
              <h2>活动流</h2>
            </div>
          </div>

          <div className="activity-list">
            {activity.length === 0 ? (
              <div className="empty-state compact">
                <h3>暂无事件</h3>
                <p>刷新频道或创建房间后，这里会记录 API 和实时联机反馈。</p>
              </div>
            ) : (
              activity.map((item) => (
                <article className={`activity-item tone-${item.tone}`} key={item.id}>
                  <div className="activity-topline">
                    <strong>{item.summary}</strong>
                    <span>{item.timestamp}</span>
                  </div>
                  {item.detail ? <p>{item.detail}</p> : null}
                </article>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

function StatChip(props: {
  accent: "mint" | "rose" | "sea" | "sun";
  label: string;
  value: string;
}) {
  return (
    <article className={`stat-chip accent-${props.accent}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </article>
  );
}

function createClientId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createPassengerProfile(index: number): PassengerProfile {
  return {
    id: `profile-${index}`,
    label: `乘客 ${index}`,
    passenger_id: createClientId("passenger"),
    seat_number: generateSeatNumber(index),
    session_id: createClientId("sess")
  };
}

function buildPassengerLabel(
  index: number,
  seatNumber: string,
  passengerId: string
) {
  return `乘客 ${index} · ${seatNumber} · ${passengerId.slice(-4)}`;
}

function generateSeatNumber(index: number) {
  const row = 30 + ((index - 1) % 8);
  const seat = ["A", "B", "C", "D", "E", "F"][(index - 1) % 6];
  return `${row}${seat}`;
}

function matchesCatalogSection(
  entry: SessionBootstrapResponse["catalog"][number],
  section: string
) {
  if (section === "All" || section === "Recently Added") {
    return true;
  }

  if (section === "Featured") {
    return entry.categories.includes("Featured");
  }

  if (section === "Multiplayer") {
    return entry.capabilities.includes("multiplayer");
  }

  if (section === "Single Player") {
    return entry.capabilities.includes("single-player");
  }

  return entry.categories.includes(section);
}

function sortCatalogEntries(
  entries: SessionBootstrapResponse["catalog"],
  sortMode: CatalogSortMode
) {
  return [...entries].sort((left, right) => {
    switch (sortMode) {
      case "a-z":
        return left.display_name.localeCompare(right.display_name);

      case "points":
        if (left.points_enabled !== right.points_enabled) {
          return Number(right.points_enabled) - Number(left.points_enabled);
        }
        return left.display_name.localeCompare(right.display_name);

      case "multiplayer-first":
        if (
          left.capabilities.includes("multiplayer") !==
          right.capabilities.includes("multiplayer")
        ) {
          return Number(right.capabilities.includes("multiplayer")) -
            Number(left.capabilities.includes("multiplayer"));
        }
        return left.display_name.localeCompare(right.display_name);

      case "recommended":
      default: {
        const leftScore = getCatalogRecommendationScore(left);
        const rightScore = getCatalogRecommendationScore(right);
        if (rightScore !== leftScore) {
          return rightScore - leftScore;
        }
        return left.display_name.localeCompare(right.display_name);
      }
    }
  });
}

function getCatalogRecommendationScore(
  entry: SessionBootstrapResponse["catalog"][number]
) {
  let score = 0;
  if (entry.categories.includes("Featured")) {
    score += 4;
  }
  if (entry.capabilities.includes("multiplayer")) {
    score += 3;
  }
  if (entry.points_enabled) {
    score += 2;
  }
  score += Math.max(0, 4 - entry.categories.length);
  return score;
}

function dedupeCatalogEntries(
  entries: SessionBootstrapResponse["catalog"]
) {
  const seen = new Set<string>();

  return entries.filter((entry) => {
    if (seen.has(entry.game_id)) {
      return false;
    }

    seen.add(entry.game_id);
    return true;
  });
}

function formatShortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}
