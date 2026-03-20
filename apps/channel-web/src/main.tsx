import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";

import { RouteLoadingFallback } from "./RouteLoadingFallback";
import "./styles.css";

type RouteModule = {
  default: React.ComponentType;
};

function loadRoute<TModule>(
  importer: () => Promise<TModule>,
  pick: (module: TModule) => React.ComponentType
) {
  return lazy(async () => {
    const module = await importer();
    return {
      default: pick(module)
    } satisfies RouteModule;
  });
}

const routes: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  "/": loadRoute(
    () => import("./PassengerChannelPage"),
    (module) => module.PassengerChannelPage
  ),
  "/admin/channel": loadRoute(
    () => import("./AdminChannelPage"),
    (module) => module.AdminChannelPage
  ),
  "/admin/operations": loadRoute(
    () => import("./AdminOperationsPage"),
    (module) => module.AdminOperationsPage
  ),
  "/lab/channel": loadRoute(() => import("./App"), (module) => module.App),
  "/portal/host": loadRoute(
    () => import("./PortalHostPage"),
    (module) => module.PortalHostPage
  ),
  "/games/aircraft-fix-kit": loadRoute(
    () => import("./AircraftFixKitPackagePage"),
    (module) => module.AircraftFixKitPackagePage
  ),
  "/games/airline-trivia-teams": loadRoute(
    () => import("./AirlineTriviaTeamsPackagePage"),
    (module) => module.AirlineTriviaTeamsPackagePage
  ),
  "/games/baggage-sort-showdown": loadRoute(
    () => import("./BaggageSortShowdownPackagePage"),
    (module) => module.BaggageSortShowdownPackagePage
  ),
  "/games/cabin-card-clash": loadRoute(
    () => import("./CabinCardClashPackagePage"),
    (module) => module.CabinCardClashPackagePage
  ),
  "/games/cabin-puzzle": loadRoute(
    () => import("./CabinPuzzlePackagePage"),
    (module) => module.CabinPuzzlePackagePage
  ),
  "/games/crew-coordination": loadRoute(
    () => import("./CrewCoordinationPackagePage"),
    (module) => module.CrewCoordinationPackagePage
  ),
  "/games/flight-path-puzzler": loadRoute(
    () => import("./FlightPathPuzzlerPackagePage"),
    (module) => module.FlightPathPuzzlerPackagePage
  ),
  "/games/luggage-logic": loadRoute(
    () => import("./LuggageLogicPackagePage"),
    (module) => module.LuggageLogicPackagePage
  ),
  "/games/meal-cart-match": loadRoute(
    () => import("./MealCartMatchPackagePage"),
    (module) => module.MealCartMatchPackagePage
  ),
  "/games/memory-match-duel": loadRoute(
    () => import("./MemoryMatchDuelPackagePage"),
    (module) => module.MemoryMatchDuelPackagePage
  ),
  "/games/mini-gomoku": loadRoute(
    () => import("./MiniGomokuPackagePage"),
    (module) => module.MiniGomokuPackagePage
  ),
  "/games/puzzle-race-grid": loadRoute(
    () => import("./PuzzleRaceGridPackagePage"),
    (module) => module.PuzzleRaceGridPackagePage
  ),
  "/games/quiet-cabin-sudoku": loadRoute(
    () => import("./QuietCabinSudokuPackagePage"),
    (module) => module.QuietCabinSudokuPackagePage
  ),
  "/games/quiz-duel": loadRoute(
    () => import("./QuizDuelPackagePage"),
    (module) => module.QuizDuelPackagePage
  ),
  "/games/route-builder-duel": loadRoute(
    () => import("./RouteBuilderDuelPackagePage"),
    (module) => module.RouteBuilderDuelPackagePage
  ),
  "/games/runway-rush": loadRoute(
    () => import("./RunwayRushPackagePage"),
    (module) => module.RunwayRushPackagePage
  ),
  "/games/seat-map-strategy": loadRoute(
    () => import("./SeatMapStrategyPackagePage"),
    (module) => module.SeatMapStrategyPackagePage
  ),
  "/games/seat-upgrade-shuffle": loadRoute(
    () => import("./SeatUpgradeShufflePackagePage"),
    (module) => module.SeatUpgradeShufflePackagePage
  ),
  "/games/signal-scramble": loadRoute(
    () => import("./SignalScramblePackagePage"),
    (module) => module.SignalScramblePackagePage
  ),
  "/games/skyline-defense-lite": loadRoute(
    () => import("./SkylineDefenseLitePackagePage"),
    (module) => module.SkylineDefenseLitePackagePage
  ),
  "/games/spot-the-difference-race": loadRoute(
    () => import("./SpotTheDifferenceRacePackagePage"),
    (module) => module.SpotTheDifferenceRacePackagePage
  ),
  "/games/star-map-relax": loadRoute(
    () => import("./StarMapRelaxPackagePage"),
    (module) => module.StarMapRelaxPackagePage
  ),
  "/games/tap-beat-battle": loadRoute(
    () => import("./TapBeatBattlePackagePage"),
    (module) => module.TapBeatBattlePackagePage
  ),
  "/games/window-view-memory": loadRoute(
    () => import("./WindowViewMemoryPackagePage"),
    (module) => module.WindowViewMemoryPackagePage
  ),
  "/games/word-rally": loadRoute(
    () => import("./WordRallyPackagePage"),
    (module) => module.WordRallyPackagePage
  )
};

const RootComponent = routes[window.location.pathname] ?? routes["/"];

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<RouteLoadingFallback />}>
      <RootComponent />
    </Suspense>
  </React.StrictMode>
);
