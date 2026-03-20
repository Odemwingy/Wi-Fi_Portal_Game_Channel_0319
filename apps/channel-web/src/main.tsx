import React from "react";
import ReactDOM from "react-dom/client";

import { AdminChannelPage } from "./AdminChannelPage";
import { AdminOperationsPage } from "./AdminOperationsPage";
import { AirlineTriviaTeamsPackagePage } from "./AirlineTriviaTeamsPackagePage";
import { App } from "./App";
import { BaggageSortShowdownPackagePage } from "./BaggageSortShowdownPackagePage";
import { CabinCardClashPackagePage } from "./CabinCardClashPackagePage";
import { CabinPuzzlePackagePage } from "./CabinPuzzlePackagePage";
import { FlightPathPuzzlerPackagePage } from "./FlightPathPuzzlerPackagePage";
import { LuggageLogicPackagePage } from "./LuggageLogicPackagePage";
import { MealCartMatchPackagePage } from "./MealCartMatchPackagePage";
import { MemoryMatchDuelPackagePage } from "./MemoryMatchDuelPackagePage";
import { MiniGomokuPackagePage } from "./MiniGomokuPackagePage";
import { PortalHostPage } from "./PortalHostPage";
import { QuizDuelPackagePage } from "./QuizDuelPackagePage";
import { QuietCabinSudokuPackagePage } from "./QuietCabinSudokuPackagePage";
import { RunwayRushPackagePage } from "./RunwayRushPackagePage";
import { SeatMapStrategyPackagePage } from "./SeatMapStrategyPackagePage";
import { SignalScramblePackagePage } from "./SignalScramblePackagePage";
import { SpotTheDifferenceRacePackagePage } from "./SpotTheDifferenceRacePackagePage";
import { StarMapRelaxPackagePage } from "./StarMapRelaxPackagePage";
import { TapBeatBattlePackagePage } from "./TapBeatBattlePackagePage";
import { WindowViewMemoryPackagePage } from "./WindowViewMemoryPackagePage";
import { WordRallyPackagePage } from "./WordRallyPackagePage";
import "./styles.css";

const pathname = window.location.pathname;
const RootComponent =
  pathname === "/admin/channel"
    ? AdminChannelPage
    : pathname === "/admin/operations"
      ? AdminOperationsPage
    : pathname === "/portal/host"
      ? PortalHostPage
    : pathname === "/games/quiz-duel"
      ? QuizDuelPackagePage
      : pathname === "/games/airline-trivia-teams"
        ? AirlineTriviaTeamsPackagePage
      : pathname === "/games/tap-beat-battle"
        ? TapBeatBattlePackagePage
      : pathname === "/games/cabin-card-clash"
        ? CabinCardClashPackagePage
      : pathname === "/games/baggage-sort-showdown"
        ? BaggageSortShowdownPackagePage
    : pathname === "/games/cabin-puzzle"
      ? CabinPuzzlePackagePage
    : pathname === "/games/quiet-cabin-sudoku"
      ? QuietCabinSudokuPackagePage
      : pathname === "/games/star-map-relax"
        ? StarMapRelaxPackagePage
      : pathname === "/games/flight-path-puzzler"
        ? FlightPathPuzzlerPackagePage
      : pathname === "/games/luggage-logic"
        ? LuggageLogicPackagePage
      : pathname === "/games/meal-cart-match"
        ? MealCartMatchPackagePage
      : pathname === "/games/window-view-memory"
        ? WindowViewMemoryPackagePage
      : pathname === "/games/mini-gomoku"
        ? MiniGomokuPackagePage
      : pathname === "/games/seat-map-strategy"
        ? SeatMapStrategyPackagePage
      : pathname === "/games/signal-scramble"
        ? SignalScramblePackagePage
      : pathname === "/games/memory-match-duel"
        ? MemoryMatchDuelPackagePage
      : pathname === "/games/spot-the-difference-race"
        ? SpotTheDifferenceRacePackagePage
      : pathname === "/games/runway-rush"
        ? RunwayRushPackagePage
      : pathname === "/games/word-rally"
        ? WordRallyPackagePage
      : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);
