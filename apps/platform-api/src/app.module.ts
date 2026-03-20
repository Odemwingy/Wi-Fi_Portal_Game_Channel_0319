import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod
} from "@nestjs/common";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AdminAuditService } from "./admin-audit.service";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminAuthGuard } from "./admin-auth.guard";
import { AdminAuthService } from "./admin-auth.service";
import { AirlinePointsController } from "./airline-points.controller";
import {
  AirlinePointsService
} from "./airline-points.service";
import {
  LegacyBatchAirlinePointsAdapter,
  MockHttpAirlinePointsAdapter
} from "./airline-points.adapter";
import { ChannelContentController } from "./channel-content.controller";
import { ChannelContentService } from "./channel-content.service";
import { MiniGomokuAdapter } from "./game-adapters/mini-gomoku.adapter";
import { MemoryMatchDuelAdapter } from "./game-adapters/memory-match-duel.adapter";
import { QuizDuelAdapter } from "./game-adapters/quiz-duel.adapter";
import { SeatMapStrategyAdapter } from "./game-adapters/seat-map-strategy.adapter";
import { SignalScrambleAdapter } from "./game-adapters/signal-scramble.adapter";
import { SpotTheDifferenceRaceAdapter } from "./game-adapters/spot-the-difference-race.adapter";
import { WordRallyAdapter } from "./game-adapters/word-rally.adapter";
import { GameRuntimeService } from "./game-runtime.service";
import { GameEventsController } from "./game-events.controller";
import { GameEventsService } from "./game-events.service";
import { PlatformDiagnosticsService } from "./platform-diagnostics.service";
import {
  GameEventsRepository,
  StateStoreGameEventsRepository
} from "./repositories/game-events.repository";
import {
  PlatformMetricsService,
  sharedPlatformMetricsService
} from "./platform-metrics.service";
import { PointsController } from "./points.controller";
import { PointsRulesController } from "./points-rules.controller";
import { PointsRulesService } from "./points-rules.service";
import { PointsService } from "./points.service";
import { RewardsController } from "./rewards.controller";
import { RewardsService } from "./rewards.service";
import {
  MemoryMatchDuelStateRepository,
  StateStoreMemoryMatchDuelStateRepository
} from "./repositories/memory-match-duel-state.repository";
import {
  MiniGomokuStateRepository,
  StateStoreMiniGomokuStateRepository
} from "./repositories/mini-gomoku-state.repository";
import {
  AdminAuditRepository,
  StateStoreAdminAuditRepository
} from "./repositories/admin-audit.repository";
import {
  AirlinePointsConfigRepository,
  StateStoreAirlinePointsConfigRepository
} from "./repositories/airline-points-config.repository";
import {
  AirlinePointsSyncRepository,
  StateStoreAirlinePointsSyncRepository
} from "./repositories/airline-points-sync.repository";
import {
  AdminSessionRepository,
  StateStoreAdminSessionRepository
} from "./repositories/admin-session.repository";
import {
  ChannelContentRepository,
  StateStoreChannelContentRepository
} from "./repositories/channel-content.repository";
import {
  InMemoryJsonStateStore,
  JsonStateStore,
  RedisJsonStateStore
} from "./repositories/json-state-store";
import {
  PointsRepository,
  StateStorePointsRepository
} from "./repositories/points.repository";
import {
  PointsAuditRepository,
  StateStorePointsAuditRepository
} from "./repositories/points-audit.repository";
import {
  PointsRuleConfigRepository,
  StateStorePointsRuleConfigRepository
} from "./repositories/points-rule-config.repository";
import {
  RewardInventoryRepository,
  StateStoreRewardInventoryRepository
} from "./repositories/reward-inventory.repository";
import {
  RewardsRepository,
  StateStoreRewardsRepository
} from "./repositories/rewards.repository";
import {
  StateStoreQuizDuelStateRepository,
  QuizDuelStateRepository
} from "./repositories/quiz-duel-state.repository";
import {
  SeatMapStrategyStateRepository,
  StateStoreSeatMapStrategyStateRepository
} from "./repositories/seat-map-strategy-state.repository";
import {
  SignalScrambleStateRepository,
  StateStoreSignalScrambleStateRepository
} from "./repositories/signal-scramble-state.repository";
import {
  SpotTheDifferenceRaceStateRepository,
  StateStoreSpotTheDifferenceRaceStateRepository
} from "./repositories/spot-the-difference-race-state.repository";
import {
  StateStoreWordRallyStateRepository,
  WordRallyStateRepository
} from "./repositories/word-rally-state.repository";
import { StateStoreRoomRepository, RoomRepository } from "./repositories/room.repository";
import { loadStateStoreConfig } from "./repositories/state-store.config";
import { RoomController } from "./room.controller";
import { RoomService } from "./room.service";
import { TraceMiddleware } from "./trace.middleware";

@Module({
  controllers: [
    AdminAuthController,
    AirlinePointsController,
    AppController,
    ChannelContentController,
    GameEventsController,
    PointsRulesController,
    RoomController,
    PointsController,
    RewardsController
  ],
  providers: [
    AppService,
    AdminAuditService,
    AdminAuthGuard,
    AdminAuthService,
    AirlinePointsService,
    ChannelContentService,
    GameEventsService,
    LegacyBatchAirlinePointsAdapter,
    MockHttpAirlinePointsAdapter,
    PlatformDiagnosticsService,
    PointsRulesService,
    PointsService,
    RewardsService,
    RoomService,
    GameRuntimeService,
    MiniGomokuAdapter,
    MemoryMatchDuelAdapter,
    QuizDuelAdapter,
    SeatMapStrategyAdapter,
    SignalScrambleAdapter,
    SpotTheDifferenceRaceAdapter,
    WordRallyAdapter,
    TraceMiddleware,
    {
      provide: PlatformMetricsService,
      useValue: sharedPlatformMetricsService
    },
    {
      provide: JsonStateStore,
      useFactory: () => {
        const config = loadStateStoreConfig();
        return config.backend === "redis"
          ? new RedisJsonStateStore(config)
          : new InMemoryJsonStateStore();
      }
    },
    {
      provide: GameEventsRepository,
      useClass: StateStoreGameEventsRepository
    },
    {
      provide: AdminSessionRepository,
      useClass: StateStoreAdminSessionRepository
    },
    {
      provide: AirlinePointsConfigRepository,
      useClass: StateStoreAirlinePointsConfigRepository
    },
    {
      provide: AirlinePointsSyncRepository,
      useClass: StateStoreAirlinePointsSyncRepository
    },
    {
      provide: AdminAuditRepository,
      useClass: StateStoreAdminAuditRepository
    },
    {
      provide: ChannelContentRepository,
      useClass: StateStoreChannelContentRepository
    },
    {
      provide: RoomRepository,
      useClass: StateStoreRoomRepository
    },
    {
      provide: QuizDuelStateRepository,
      useClass: StateStoreQuizDuelStateRepository
    },
    {
      provide: MiniGomokuStateRepository,
      useClass: StateStoreMiniGomokuStateRepository
    },
    {
      provide: SeatMapStrategyStateRepository,
      useClass: StateStoreSeatMapStrategyStateRepository
    },
    {
      provide: SignalScrambleStateRepository,
      useClass: StateStoreSignalScrambleStateRepository
    },
    {
      provide: MemoryMatchDuelStateRepository,
      useClass: StateStoreMemoryMatchDuelStateRepository
    },
    {
      provide: SpotTheDifferenceRaceStateRepository,
      useClass: StateStoreSpotTheDifferenceRaceStateRepository
    },
    {
      provide: PointsRepository,
      useClass: StateStorePointsRepository
    },
    {
      provide: PointsRuleConfigRepository,
      useClass: StateStorePointsRuleConfigRepository
    },
    {
      provide: PointsAuditRepository,
      useClass: StateStorePointsAuditRepository
    },
    {
      provide: WordRallyStateRepository,
      useClass: StateStoreWordRallyStateRepository
    },
    {
      provide: RewardsRepository,
      useClass: StateStoreRewardsRepository
    },
    {
      provide: RewardInventoryRepository,
      useClass: StateStoreRewardInventoryRepository
    }
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TraceMiddleware).forRoutes({
      path: "*path",
      method: RequestMethod.ALL
    });
  }
}
