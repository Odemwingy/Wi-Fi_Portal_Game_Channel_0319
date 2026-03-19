import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod
} from "@nestjs/common";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { MemoryMatchDuelAdapter } from "./game-adapters/memory-match-duel.adapter";
import { QuizDuelAdapter } from "./game-adapters/quiz-duel.adapter";
import { SpotTheDifferenceRaceAdapter } from "./game-adapters/spot-the-difference-race.adapter";
import { WordRallyAdapter } from "./game-adapters/word-rally.adapter";
import { GameRuntimeService } from "./game-runtime.service";
import { PlatformDiagnosticsService } from "./platform-diagnostics.service";
import {
  PlatformMetricsService,
  sharedPlatformMetricsService
} from "./platform-metrics.service";
import { PointsController } from "./points.controller";
import { PointsService } from "./points.service";
import { RewardsController } from "./rewards.controller";
import { RewardsService } from "./rewards.service";
import {
  MemoryMatchDuelStateRepository,
  StateStoreMemoryMatchDuelStateRepository
} from "./repositories/memory-match-duel-state.repository";
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
  controllers: [AppController, RoomController, PointsController, RewardsController],
  providers: [
    AppService,
    PlatformDiagnosticsService,
    PointsService,
    RewardsService,
    RoomService,
    GameRuntimeService,
    MemoryMatchDuelAdapter,
    QuizDuelAdapter,
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
      provide: RoomRepository,
      useClass: StateStoreRoomRepository
    },
    {
      provide: QuizDuelStateRepository,
      useClass: StateStoreQuizDuelStateRepository
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
