import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import {
  gameEventLeaderboardEntrySchema,
  gameEventLeaderboardResponseSchema,
  gameEventListResponseSchema,
  gameEventRecordSchema,
  gameEventReportRequestSchema,
  gameEventReportResponseSchema,
  type GameEventLeaderboardResponse,
  type GameEventListResponse,
  type GameEventReportRequest,
  type GameEventReportResponse,
  type GameResultOutcome,
  type PointsEventType,
  type PointsReportRecord
} from "@wifi-portal/game-sdk";
import {
  createStructuredLogger,
  startChildSpan,
  type TraceContext
} from "@wifi-portal/shared-observability";

import { GameEventsRepository } from "./repositories/game-events.repository";

const logger = createStructuredLogger("platform-api.game-events");

@Injectable()
export class GameEventsService {
  constructor(
    @Inject(GameEventsRepository)
    private readonly gameEventsRepository: GameEventsRepository
  ) {}

  async reportEvent(
    traceContext: TraceContext,
    payload: unknown
  ): Promise<GameEventReportResponse> {
    const span = startChildSpan(traceContext);
    const parsed = this.parsePayload(payload, span);
    const existing = await this.gameEventsRepository.get(parsed.event_id);

    if (existing) {
      logger.info("game-events.report.deduplicated", span, {
        input_summary: parsed.event_id,
        output_summary: existing.event_type,
        metadata: {
          game_id: existing.game_id,
          passenger_id: existing.passenger_id
        }
      });

      return gameEventReportResponseSchema.parse({
        deduplicated: true,
        event: existing,
        trace_id: traceContext.trace_id
      });
    }

    const now = new Date().toISOString();
    const record = gameEventRecordSchema.parse({
      airline_code: parsed.airline_code ?? null,
      duration_seconds: parsed.duration_seconds ?? null,
      event_id: parsed.event_id,
      event_type: parsed.event_type,
      game_id: parsed.game_id,
      metadata: parsed.metadata,
      occurred_at: parsed.occurred_at ?? now,
      passenger_id: parsed.passenger_id,
      recorded_at: now,
      result: parsed.result ?? null,
      room_id: parsed.room_id ?? null,
      score_value: parsed.score_value ?? null,
      session_id: parsed.session_id
    });
    const saved = await this.gameEventsRepository.set(record);

    logger.info("game-events.reported", span, {
      input_summary: JSON.stringify({
        event_id: saved.event_id,
        event_type: saved.event_type,
        game_id: saved.game_id
      }),
      output_summary: saved.passenger_id,
      metadata: {
        room_id: saved.room_id,
        score_value: saved.score_value
      }
    });

    return gameEventReportResponseSchema.parse({
      deduplicated: false,
      event: saved,
      trace_id: traceContext.trace_id
    });
  }

  async listEvents(
    traceContext: TraceContext,
    input: {
      event_type?: string;
      game_id?: string;
      limit?: string;
      passenger_id?: string;
      room_id?: string;
      session_id?: string;
    }
  ): Promise<GameEventListResponse> {
    const span = startChildSpan(traceContext);
    const eventType = this.parseEventType(input.event_type);
    const limit = this.parseLimit(input.limit, 30, "Invalid events limit");
    const entries = await this.gameEventsRepository.list({
      event_type: eventType,
      game_id: input.game_id,
      limit,
      passenger_id: input.passenger_id,
      room_id: input.room_id,
      session_id: input.session_id
    });

    logger.info("game-events.loaded", span, {
      input_summary: JSON.stringify({
        event_type: eventType ?? null,
        game_id: input.game_id ?? null,
        limit,
        passenger_id: input.passenger_id ?? null
      }),
      output_summary: `${entries.length} events`
    });

    return gameEventListResponseSchema.parse({
      entries,
      trace_id: traceContext.trace_id
    });
  }

  async getLeaderboard(
    traceContext: TraceContext,
    input: {
      game_id?: string;
      limit?: string;
    }
  ): Promise<GameEventLeaderboardResponse> {
    const span = startChildSpan(traceContext);
    const limit = this.parseLimit(input.limit, 20, "Invalid events leaderboard limit");
    const entries = await this.gameEventsRepository.list({
      game_id: input.game_id,
      limit: 500
    });
    const byPassenger = new Map<
      string,
      {
        events_count: number;
        latest_result: GameResultOutcome | null;
        latest_result_at: string | null;
        last_event_at: string;
        passenger_id: string;
        score_by_game: Record<string, number>;
        total_duration_seconds: number;
        total_score: number;
      }
    >();

    for (const entry of entries) {
      const current = byPassenger.get(entry.passenger_id) ?? {
        events_count: 0,
        latest_result: null,
        latest_result_at: null,
        last_event_at: entry.occurred_at,
        passenger_id: entry.passenger_id,
        score_by_game: {},
        total_duration_seconds: 0,
        total_score: 0
      };

      current.events_count += 1;
      current.last_event_at =
        current.last_event_at.localeCompare(entry.occurred_at) >= 0
          ? current.last_event_at
          : entry.occurred_at;
      current.total_duration_seconds += entry.duration_seconds ?? 0;
      current.total_score += entry.score_value ?? 0;
      if (entry.score_value) {
        current.score_by_game[entry.game_id] =
          (current.score_by_game[entry.game_id] ?? 0) + entry.score_value;
      }
      if (
        entry.result &&
        (!current.latest_result_at ||
          current.latest_result_at.localeCompare(entry.occurred_at) <= 0)
      ) {
        current.latest_result = entry.result;
        current.latest_result_at = entry.occurred_at;
      }

      byPassenger.set(entry.passenger_id, current);
    }

    const rankedEntries = [...byPassenger.values()]
      .sort((left, right) => {
        if (right.total_score !== left.total_score) {
          return right.total_score - left.total_score;
        }

        return right.last_event_at.localeCompare(left.last_event_at);
      })
      .slice(0, limit)
      .map((entry, index) =>
        gameEventLeaderboardEntrySchema.parse({
          events_count: entry.events_count,
          latest_result: entry.latest_result,
          last_event_at: entry.last_event_at,
          passenger_id: entry.passenger_id,
          rank: index + 1,
          score_by_game: entry.score_by_game,
          total_duration_seconds: entry.total_duration_seconds,
          total_score: entry.total_score
        })
      );

    logger.info("game-events.leaderboard.loaded", span, {
      input_summary: JSON.stringify({
        game_id: input.game_id ?? null,
        limit
      }),
      output_summary: `${rankedEntries.length} leaderboard entries`,
      metadata: {
        top_passenger_id: rankedEntries[0]?.passenger_id ?? null
      }
    });

    return gameEventLeaderboardResponseSchema.parse({
      entries: rankedEntries,
      game_id: input.game_id ?? null,
      generated_at: new Date().toISOString(),
      limit,
      trace_id: traceContext.trace_id
    });
  }

  async recordPointsReportEvents(
    traceContext: TraceContext,
    report: PointsReportRecord,
    eventType: PointsEventType
  ) {
    const scorePayload = {
      airline_code: report.airline_code ?? undefined,
      event_id: `points:${report.report_id}:score`,
      event_type: "score" as const,
      game_id: report.game_id,
      metadata: {
        ...report.metadata,
        source: "points-report"
      },
      occurred_at: report.reported_at,
      passenger_id: report.passenger_id,
      room_id: report.room_id ?? undefined,
      score_value: report.points,
      session_id: report.session_id
    };

    await this.reportEvent(traceContext, scorePayload);

    const mappedLifecycleType = mapPointsEventTypeToLifecycle(eventType);
    if (!mappedLifecycleType) {
      return;
    }

    await this.reportEvent(traceContext, {
      airline_code: report.airline_code ?? undefined,
      duration_seconds: readDurationSeconds(report.metadata),
      event_id: `points:${report.report_id}:${mappedLifecycleType}`,
      event_type: mappedLifecycleType,
      game_id: report.game_id,
      metadata: {
        ...report.metadata,
        source: "points-report"
      },
      occurred_at: report.reported_at,
      passenger_id: report.passenger_id,
      result: readResultOutcome(report.metadata, mappedLifecycleType),
      room_id: report.room_id ?? undefined,
      session_id: report.session_id
    });
  }

  private parsePayload(
    payload: unknown,
    traceContext: TraceContext
  ): GameEventReportRequest {
    const parsed = gameEventReportRequestSchema.safeParse(payload);
    if (parsed.success) {
      return parsed.data;
    }

    logger.warn("game-events.invalid_payload", traceContext, {
      input_summary: JSON.stringify(payload ?? {}),
      error_detail: parsed.error.message,
      status: "error"
    });

    throw new BadRequestException({
      issues: parsed.error.flatten(),
      message: "Invalid game event payload"
    });
  }

  private parseEventType(value?: string) {
    if (!value) {
      return undefined;
    }

    const parsed = gameEventRecordSchema.shape.event_type.safeParse(value);
    if (parsed.success) {
      return parsed.data;
    }

    throw new BadRequestException({
      event_type: value,
      message: "Invalid game event type"
    });
  }

  private parseLimit(limitInput: string | undefined, fallback: number, message: string) {
    if (!limitInput) {
      return fallback;
    }

    const limit = Number.parseInt(limitInput, 10);
    if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException({
        limit: limitInput,
        message
      });
    }

    return limit;
  }
}

function mapPointsEventTypeToLifecycle(eventType: PointsEventType) {
  switch (eventType) {
    case "entry":
      return "game_start" as const;
    case "completion":
      return "game_end" as const;
    case "duration":
      return "duration" as const;
    case "result":
      return "result" as const;
    default:
      return null;
  }
}

function readDurationSeconds(metadata: Record<string, unknown>) {
  const durationSeconds = metadata.duration_seconds;
  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds)) {
    return Math.max(0, Math.trunc(durationSeconds));
  }

  return undefined;
}

function readResultOutcome(
  metadata: Record<string, unknown>,
  lifecycleType: "game_start" | "game_end" | "duration" | "result"
) {
  if (lifecycleType === "game_end") {
    return "completed" as const;
  }

  if (lifecycleType !== "result") {
    return undefined;
  }

  const result = metadata.result;
  const parsed = result === undefined ? null : gameEventRecordSchema.shape.result.safeParse(result);
  return parsed?.success ? parsed.data : undefined;
}
