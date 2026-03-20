import { describe, expect, it } from "vitest";

import { startTrace } from "@wifi-portal/shared-observability";

import {
  AirlinePointsService
} from "./airline-points.service";
import {
  LegacyBatchAirlinePointsAdapter,
  MockHttpAirlinePointsAdapter
} from "./airline-points.adapter";
import { GameEventsService } from "./game-events.service";
import { PointsService } from "./points.service";
import { PointsRulesService } from "./points-rules.service";
import {
  AirlinePointsConfigRepository,
  StateStoreAirlinePointsConfigRepository
} from "./repositories/airline-points-config.repository";
import {
  GameEventsRepository,
  StateStoreGameEventsRepository
} from "./repositories/game-events.repository";
import {
  AirlinePointsSyncRepository,
  StateStoreAirlinePointsSyncRepository
} from "./repositories/airline-points-sync.repository";
import { InMemoryJsonStateStore } from "./repositories/json-state-store";
import {
  PointsAuditRepository,
  StateStorePointsAuditRepository
} from "./repositories/points-audit.repository";
import { PointsRepository, StateStorePointsRepository } from "./repositories/points.repository";
import {
  PointsRuleConfigRepository,
  StateStorePointsRuleConfigRepository
} from "./repositories/points-rule-config.repository";

describe("PointsService", () => {
  it("records points reports, aggregates totals, and deduplicates by report id", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const repository: PointsRepository = new StateStorePointsRepository(stateStore);
    const pointsRuleConfigRepository: PointsRuleConfigRepository =
      new StateStorePointsRuleConfigRepository(stateStore);
    const pointsAuditRepository: PointsAuditRepository =
      new StateStorePointsAuditRepository(stateStore);
    const gameEventsRepository: GameEventsRepository =
      new StateStoreGameEventsRepository(stateStore);
    const gameEventsService = new GameEventsService(gameEventsRepository);
    const pointsRulesService = new PointsRulesService(
      pointsRuleConfigRepository,
      pointsAuditRepository
    );
    const service = new PointsService(
      repository,
      pointsRulesService,
      undefined,
      gameEventsService
    );
    const trace = startTrace();

    const firstReport = await service.reportPoints(trace, {
      game_id: "quiz-duel",
      metadata: {
        round_count: 3
      },
      passenger_id: "passenger-1",
      points: 20,
      reason: "quiz duel completed",
      report_id: "report-quiz-1",
      room_id: "room-1",
      session_id: "sess-1"
    });

    expect(firstReport.summary.total_points).toBe(20);
    expect(firstReport.audit_entry.awarded_points).toBe(20);
    expect(firstReport.summary.by_game).toEqual({
      "quiz-duel": 20
    });

    const duplicateReport = await service.reportPoints(trace, {
      game_id: "quiz-duel",
      metadata: {},
      passenger_id: "passenger-1",
      points: 20,
      reason: "quiz duel completed",
      report_id: "report-quiz-1",
      room_id: "room-1",
      session_id: "sess-1"
    });

    expect(duplicateReport.summary.total_points).toBe(20);
    expect(duplicateReport.summary.latest_reports).toHaveLength(1);

    const secondReport = await service.reportPoints(trace, {
      game_id: "cabin-puzzle",
      metadata: {
        move_count: 7
      },
      passenger_id: "passenger-1",
      points: 18,
      reason: "cabin puzzle solved",
      report_id: "report-puzzle-1",
      session_id: "sess-1"
    });

    expect(secondReport.summary.total_points).toBe(38);
    expect(secondReport.summary.by_game).toEqual({
      "cabin-puzzle": 18,
      "quiz-duel": 20
    });
    expect(secondReport.summary.latest_reports[0]).toMatchObject({
      game_id: "cabin-puzzle",
      points: 18
    });

    const summary = await service.getPassengerSummary(trace, "passenger-1");
    expect(summary.total_points).toBe(38);
    expect(summary.latest_reports).toHaveLength(2);

    const events = await gameEventsService.listEvents(trace, {
      passenger_id: "passenger-1"
    });
    expect(events.entries.map((entry) => entry.event_id)).toEqual([
      "points:report-puzzle-1:game_end",
      "points:report-puzzle-1:score",
      "points:report-quiz-1:game_end",
      "points:report-quiz-1:score"
    ]);
  });

  it("builds a leaderboard ordered by total points and capped by limit", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const repository: PointsRepository = new StateStorePointsRepository(stateStore);
    const pointsRuleConfigRepository: PointsRuleConfigRepository =
      new StateStorePointsRuleConfigRepository(stateStore);
    const pointsAuditRepository: PointsAuditRepository =
      new StateStorePointsAuditRepository(stateStore);
    const gameEventsRepository: GameEventsRepository =
      new StateStoreGameEventsRepository(stateStore);
    const gameEventsService = new GameEventsService(gameEventsRepository);
    const pointsRulesService = new PointsRulesService(
      pointsRuleConfigRepository,
      pointsAuditRepository
    );
    const service = new PointsService(
      repository,
      pointsRulesService,
      undefined,
      gameEventsService
    );
    const trace = startTrace();

    await service.reportPoints(trace, {
      game_id: "quiz-duel",
      metadata: {},
      passenger_id: "passenger-a",
      points: 18,
      reason: "quiz duel completed",
      report_id: "report-a-1",
      session_id: "sess-a"
    });
    await service.reportPoints(trace, {
      game_id: "cabin-puzzle",
      metadata: {},
      passenger_id: "passenger-b",
      points: 26,
      reason: "cabin puzzle solved",
      report_id: "report-b-1",
      session_id: "sess-b"
    });
    await service.reportPoints(trace, {
      game_id: "quiz-duel",
      metadata: {},
      passenger_id: "passenger-c",
      points: 12,
      reason: "quiz duel completed",
      report_id: "report-c-1",
      session_id: "sess-c"
    });

    const leaderboard = await service.getLeaderboard(trace, "2");

    expect(leaderboard.limit).toBe(2);
    expect(leaderboard.entries).toHaveLength(2);
    expect(leaderboard.entries.map((entry) => entry.passenger_id)).toEqual([
      "passenger-b",
      "passenger-a"
    ]);
    expect(leaderboard.entries[0]).toMatchObject({
      latest_report: {
        game_id: "cabin-puzzle"
      },
      rank: 1,
      total_points: 26
    });
    expect(leaderboard.entries[1]).toMatchObject({
      rank: 2,
      total_points: 18
    });
  });

  it("returns airline sync status when the report includes an airline code", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const repository: PointsRepository = new StateStorePointsRepository(
      stateStore
    );
    const airlineConfigRepository: AirlinePointsConfigRepository =
      new StateStoreAirlinePointsConfigRepository(stateStore);
    const airlineSyncRepository: AirlinePointsSyncRepository =
      new StateStoreAirlinePointsSyncRepository(stateStore);
    const airlinePointsService = new AirlinePointsService(
      airlineConfigRepository,
      airlineSyncRepository,
      new MockHttpAirlinePointsAdapter(),
      new LegacyBatchAirlinePointsAdapter()
    );
    const pointsRuleConfigRepository: PointsRuleConfigRepository =
      new StateStorePointsRuleConfigRepository(stateStore);
    const pointsAuditRepository: PointsAuditRepository =
      new StateStorePointsAuditRepository(stateStore);
    const gameEventsRepository: GameEventsRepository =
      new StateStoreGameEventsRepository(stateStore);
    const gameEventsService = new GameEventsService(gameEventsRepository);
    const pointsRulesService = new PointsRulesService(
      pointsRuleConfigRepository,
      pointsAuditRepository
    );
    const service = new PointsService(
      repository,
      pointsRulesService,
      airlinePointsService,
      gameEventsService
    );
    const trace = startTrace();

    const response = await service.reportPoints(trace, {
      airline_code: "MU",
      game_id: "quiz-duel",
      metadata: {},
      passenger_id: "passenger-airline",
      points: 32,
      reason: "quiz duel completed",
      report_id: "report-airline-1",
      session_id: "session-airline-1"
    });

    expect(response.airline_sync).toMatchObject({
      airline_code: "MU",
      status: "synced"
    });
    expect(response.audit_entry.awarded_points).toBe(32);
    expect(response.summary.total_points).toBe(32);
  });
});
