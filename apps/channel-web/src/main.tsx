import React from "react";
import ReactDOM from "react-dom/client";

import { AdminChannelPage } from "./AdminChannelPage";
import { AdminOperationsPage } from "./AdminOperationsPage";
import { App } from "./App";
import { CabinPuzzlePackagePage } from "./CabinPuzzlePackagePage";
import { MemoryMatchDuelPackagePage } from "./MemoryMatchDuelPackagePage";
import { MiniGomokuPackagePage } from "./MiniGomokuPackagePage";
import { PortalHostPage } from "./PortalHostPage";
import { QuizDuelPackagePage } from "./QuizDuelPackagePage";
import { RunwayRushPackagePage } from "./RunwayRushPackagePage";
import { SeatMapStrategyPackagePage } from "./SeatMapStrategyPackagePage";
import { SignalScramblePackagePage } from "./SignalScramblePackagePage";
import { SpotTheDifferenceRacePackagePage } from "./SpotTheDifferenceRacePackagePage";
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
    : pathname === "/games/cabin-puzzle"
      ? CabinPuzzlePackagePage
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
