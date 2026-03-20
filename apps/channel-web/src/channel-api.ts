import {
  adminAuditListResponseSchema,
  adminLoginRequestSchema,
  adminSessionSchema,
  airlinePointsConfigSchema,
  airlinePointsDispatchPendingResponseSchema,
  airlinePointsSyncListResponseSchema,
  channelContentDocumentSchema,
  channelCatalogEntrySchema,
  passengerPointsSummarySchema,
  pointsAirlineSyncSummarySchema,
  pointsAuditListResponseSchema,
  pointsLeaderboardResponseSchema,
  pointsReportResponseSchema,
  pointsRuleSetSchema,
  realtimeServerMessageSchema,
  rewardRedeemResponseSchema,
  rewardsCatalogResponseSchema,
  passengerRewardsWalletSchema,
  roomActionResponseSchema,
  roomSnapshotSchema,
  sessionBootstrapResponseSchema,
  type CreateRoomRequest,
  type AdminAuditListResponse,
  type AdminLoginRequest,
  type AdminSession,
  type AirlinePointsConfig,
  type AirlinePointsConfigUpsertRequest,
  type AirlinePointsDispatchPendingResponse,
  type AirlinePointsSyncListResponse,
  type AirlinePointsSyncStatus,
  type ChannelContentDocument,
  type ChannelContentPublishRequest,
  type ChannelCatalogEntry,
  type ChannelContentUpdateRequest,
  type PassengerPointsSummary,
  type PassengerRewardsWallet,
  type PointsAirlineSyncSummary,
  type PointsAuditListResponse,
  type PointsLeaderboardResponse,
  type PointsReportRequest,
  type PointsReportResponse,
  type PointsRuleSet,
  type PointsRuleSetUpsertRequest,
  type RealtimeConnectionQuery,
  type RealtimeServerMessage,
  type RewardRedeemRequest,
  type RewardRedeemResponse,
  type RewardsCatalogResponse,
  type RoomActionResponse,
  type RoomSnapshot,
  type SessionBootstrapRequest,
  type SessionBootstrapResponse,
  type SetReadyRequest
} from "@wifi-portal/game-sdk";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3000/api";

export const apiBaseUrl =
  normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL) ?? DEFAULT_API_BASE_URL;

const websocketBaseUrl =
  normalizeBaseUrl(import.meta.env.VITE_WS_BASE_URL) ??
  apiBaseUrl.replace(/^http/, "ws").replace(/\/api$/, "");

export async function bootstrapSession(
  payload: SessionBootstrapRequest
): Promise<SessionBootstrapResponse> {
  return requestJson(
    "/session/bootstrap",
    {
      body: JSON.stringify(payload),
      method: "POST"
    },
    sessionBootstrapResponseSchema.parse
  );
}

export async function createRoom(
  payload: CreateRoomRequest
): Promise<RoomActionResponse> {
  return requestJson(
    "/lobby/create-room",
    {
      body: JSON.stringify(payload),
      method: "POST"
    },
    roomActionResponseSchema.parse
  );
}

export async function getAdminChannelContent(payload: {
  airline_code: string;
  locale: string;
  session_token: string;
}): Promise<ChannelContentDocument> {
  const query = new URLSearchParams({
    airline_code: payload.airline_code,
    locale: payload.locale
  });

  return requestJson(
    `/admin/channel/content?${query.toString()}`,
    {
      headers: createAdminHeaders(payload.session_token)
    },
    channelContentDocumentSchema.parse
  );
}

export async function updateAdminChannelContent(
  payload: ChannelContentUpdateRequest & {
    session_token: string;
  }
): Promise<ChannelContentDocument> {
  return requestJson(
    "/admin/channel/content",
    {
      body: JSON.stringify({
        catalog: payload.catalog,
        channel_config: payload.channel_config
      }),
      headers: createAdminHeaders(payload.session_token),
      method: "PUT"
    },
    channelContentDocumentSchema.parse
  );
}

export async function publishAdminChannelContent(
  payload: ChannelContentPublishRequest & {
    session_token: string;
  }
): Promise<ChannelContentDocument> {
  return requestJson(
    "/admin/channel/content/publish",
    {
      body: JSON.stringify({
        airline_code: payload.airline_code,
        locale: payload.locale
      }),
      headers: createAdminHeaders(payload.session_token),
      method: "POST"
    },
    channelContentDocumentSchema.parse
  );
}

export async function getAdminPointsRulesConfig(payload: {
  airline_code: string;
  game_id: string;
  session_token: string;
}): Promise<PointsRuleSet> {
  const query = new URLSearchParams({
    airline_code: payload.airline_code,
    game_id: payload.game_id
  });

  return requestJson(
    `/admin/points-rules/config?${query.toString()}`,
    {
      headers: createAdminHeaders(payload.session_token)
    },
    pointsRuleSetSchema.parse
  );
}

export async function updateAdminPointsRulesConfig(
  payload: PointsRuleSetUpsertRequest & {
    session_token: string;
  }
): Promise<PointsRuleSet> {
  return requestJson(
    "/admin/points-rules/config",
    {
      body: JSON.stringify({
        airline_code: payload.airline_code,
        game_id: payload.game_id,
        max_points_per_report: payload.max_points_per_report,
        rules: payload.rules
      }),
      headers: createAdminHeaders(payload.session_token),
      method: "PUT"
    },
    pointsRuleSetSchema.parse
  );
}

export async function getAdminPointsRulesAudit(payload: {
  game_id?: string;
  limit?: number;
  passenger_id?: string;
  session_token: string;
}): Promise<PointsAuditListResponse> {
  const query = new URLSearchParams();
  if (payload.game_id) {
    query.set("game_id", payload.game_id);
  }
  if (payload.limit) {
    query.set("limit", String(payload.limit));
  }
  if (payload.passenger_id) {
    query.set("passenger_id", payload.passenger_id);
  }

  return requestJson(
    `/admin/points-rules/audit?${query.toString()}`,
    {
      headers: createAdminHeaders(payload.session_token)
    },
    pointsAuditListResponseSchema.parse
  );
}

export async function getAdminAirlinePointsConfig(payload: {
  airline_code: string;
  session_token: string;
}): Promise<AirlinePointsConfig> {
  const query = new URLSearchParams({
    airline_code: payload.airline_code
  });

  return requestJson(
    `/admin/airline-points/config?${query.toString()}`,
    {
      headers: createAdminHeaders(payload.session_token)
    },
    airlinePointsConfigSchema.parse
  );
}

export async function updateAdminAirlinePointsConfig(
  payload: AirlinePointsConfigUpsertRequest & {
    session_token: string;
  }
): Promise<AirlinePointsConfig> {
  return requestJson(
    "/admin/airline-points/config",
    {
      body: JSON.stringify({
        airline_code: payload.airline_code,
        api_base_url: payload.api_base_url,
        auth_credential: payload.auth_credential,
        auth_type: payload.auth_type,
        enabled: payload.enabled,
        field_mapping: payload.field_mapping,
        points_multiplier: payload.points_multiplier,
        provider: payload.provider,
        retry_policy: payload.retry_policy,
        simulation_mode: payload.simulation_mode,
        sync_mode: payload.sync_mode
      }),
      headers: createAdminHeaders(payload.session_token),
      method: "PUT"
    },
    airlinePointsConfigSchema.parse
  );
}

export async function getAdminAirlineSyncRecords(payload: {
  airline_code?: string;
  limit?: number;
  session_token: string;
  status?: AirlinePointsSyncStatus;
}): Promise<AirlinePointsSyncListResponse> {
  const query = new URLSearchParams();
  if (payload.airline_code) {
    query.set("airline_code", payload.airline_code);
  }
  if (payload.limit) {
    query.set("limit", String(payload.limit));
  }
  if (payload.status) {
    query.set("status", payload.status);
  }

  return requestJson(
    `/admin/airline-points/sync-records?${query.toString()}`,
    {
      headers: createAdminHeaders(payload.session_token)
    },
    airlinePointsSyncListResponseSchema.parse
  );
}

export async function retryAdminAirlineSyncRecord(payload: {
  session_token: string;
  sync_id: string;
}): Promise<PointsAirlineSyncSummary> {
  return requestJson(
    `/admin/airline-points/sync-records/${payload.sync_id}/retry`,
    {
      headers: createAdminHeaders(payload.session_token),
      method: "POST"
    },
    pointsAirlineSyncSummarySchema.parse
  );
}

export async function dispatchAdminAirlineSyncPending(payload: {
  airline_code?: string;
  limit?: number;
  session_token: string;
}): Promise<AirlinePointsDispatchPendingResponse> {
  return requestJson(
    "/admin/airline-points/dispatch-pending",
    {
      body: JSON.stringify({
        airline_code: payload.airline_code,
        limit: payload.limit
      }),
      headers: createAdminHeaders(payload.session_token),
      method: "POST"
    },
    airlinePointsDispatchPendingResponseSchema.parse
  );
}

export async function loginAdmin(
  payload: AdminLoginRequest
): Promise<AdminSession> {
  const parsedPayload = adminLoginRequestSchema.parse(payload);

  return requestJson(
    "/admin/auth/login",
    {
      body: JSON.stringify(parsedPayload),
      method: "POST"
    },
    adminSessionSchema.parse
  );
}

export async function getAdminMe(sessionToken: string): Promise<AdminSession> {
  return requestJson(
    "/admin/auth/me",
    {
      headers: createAdminHeaders(sessionToken)
    },
    adminSessionSchema.parse
  );
}

export async function logoutAdmin(sessionToken: string) {
  return requestJson(
    "/admin/auth/logout",
    {
      headers: createAdminHeaders(sessionToken),
      method: "POST"
    },
    (value) => value as { ok: true }
  );
}

export async function getAdminAuditLogs(
  sessionToken: string
): Promise<AdminAuditListResponse> {
  return requestJson(
    "/admin/audit/logs",
    {
      headers: createAdminHeaders(sessionToken)
    },
    adminAuditListResponseSchema.parse
  );
}

export async function getChannelCatalog(payload: {
  airline_code: string;
  locale: string;
}): Promise<ChannelCatalogEntry[]> {
  const query = new URLSearchParams({
    airline_code: payload.airline_code,
    locale: payload.locale
  });

  return requestJson(
    `/channel/catalog?${query.toString()}`,
    {},
    channelCatalogEntrySchema.array().parse
  );
}

export async function joinRoom(payload: {
  room_id: string;
  player_id: string;
  session_id: string;
}): Promise<RoomActionResponse> {
  return requestJson(
    "/lobby/join-room",
    {
      body: JSON.stringify(payload),
      method: "POST"
    },
    roomActionResponseSchema.parse
  );
}

export async function joinRoomByInvite(payload: {
  invite_code: string;
  player_id: string;
  session_id: string;
}): Promise<RoomActionResponse> {
  return requestJson(
    "/lobby/join-by-invite",
    {
      body: JSON.stringify(payload),
      method: "POST"
    },
    roomActionResponseSchema.parse
  );
}

export async function setReady(
  payload: SetReadyRequest
): Promise<RoomActionResponse> {
  return requestJson(
    "/lobby/set-ready",
    {
      body: JSON.stringify(payload),
      method: "POST"
    },
    roomActionResponseSchema.parse
  );
}

export async function getRoom(roomId: string): Promise<RoomSnapshot> {
  return requestJson(`/lobby/rooms/${roomId}`, {}, (value) =>
    roomSnapshotSchema.parse((value as { room: unknown }).room)
  );
}

export async function reportPoints(
  payload: PointsReportRequest
): Promise<PointsReportResponse> {
  return requestJson(
    "/points/report",
    {
      body: JSON.stringify(payload),
      method: "POST"
    },
    pointsReportResponseSchema.parse
  );
}

export async function getPassengerPointsSummary(
  passengerId: string
): Promise<PassengerPointsSummary> {
  return requestJson(
    `/points/passengers/${passengerId}`,
    {},
    passengerPointsSummarySchema.parse
  );
}

export async function getPointsLeaderboard(
  limit = 8
): Promise<PointsLeaderboardResponse> {
  const query = new URLSearchParams({
    limit: String(limit)
  });

  return requestJson(
    `/points/leaderboard?${query.toString()}`,
    {},
    pointsLeaderboardResponseSchema.parse
  );
}

export async function getRewardsCatalog(payload: {
  airline_code: string;
  locale: string;
}): Promise<RewardsCatalogResponse> {
  const query = new URLSearchParams(payload);

  return requestJson(
    `/rewards/catalog?${query.toString()}`,
    {},
    rewardsCatalogResponseSchema.parse
  );
}

export async function getPassengerRewardsWallet(payload: {
  airline_code: string;
  passenger_id: string;
}): Promise<PassengerRewardsWallet> {
  const query = new URLSearchParams({
    airline_code: payload.airline_code
  });

  return requestJson(
    `/rewards/passengers/${payload.passenger_id}/wallet?${query.toString()}`,
    {},
    passengerRewardsWalletSchema.parse
  );
}

export async function redeemReward(
  payload: RewardRedeemRequest
): Promise<RewardRedeemResponse> {
  return requestJson(
    "/rewards/redeem",
    {
      body: JSON.stringify(payload),
      method: "POST"
    },
    rewardRedeemResponseSchema.parse
  );
}

export function buildRealtimeUrl(query: RealtimeConnectionQuery) {
  const url = new URL("/ws/game-room", websocketBaseUrl);
  url.searchParams.set("trace_id", query.trace_id);
  url.searchParams.set("room_id", query.room_id);
  url.searchParams.set("player_id", query.player_id);
  url.searchParams.set("session_id", query.session_id);
  return url.toString();
}

export function isRealtimeOpen(socket: WebSocket | null) {
  return socket?.readyState === WebSocket.OPEN;
}

type JsonParser<T> = (value: unknown) => T;

async function requestJson<T>(
  path: string,
  init: RequestInit,
  parse: JsonParser<T>
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });

  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok) {
    throw new Error(readErrorMessage(payload) ?? `Request failed: ${response.status}`);
  }

  return parse(payload);
}

function normalizeBaseUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  return value.replace(/\/$/, "");
}

function createAdminHeaders(sessionToken: string) {
  return {
    authorization: `Bearer ${sessionToken}`
  };
}

function readErrorMessage(payload: Record<string, unknown> | null) {
  if (!payload) {
    return null;
  }

  const message = payload.message;
  if (typeof message === "string") {
    return message;
  }

  return null;
}

export function parseRealtimeMessage(raw: string): RealtimeServerMessage {
  return realtimeServerMessageSchema.parse(JSON.parse(raw));
}
