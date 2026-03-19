import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import { CabinPuzzlePackagePage } from "./CabinPuzzlePackagePage";
import { MemoryMatchDuelPackagePage } from "./MemoryMatchDuelPackagePage";
import { QuizDuelPackagePage } from "./QuizDuelPackagePage";
import { RunwayRushPackagePage } from "./RunwayRushPackagePage";
import { SpotTheDifferenceRacePackagePage } from "./SpotTheDifferenceRacePackagePage";
import { WordRallyPackagePage } from "./WordRallyPackagePage";
import "./styles.css";

const pathname = window.location.pathname;
const RootComponent =
  pathname === "/games/quiz-duel"
    ? QuizDuelPackagePage
    : pathname === "/games/cabin-puzzle"
      ? CabinPuzzlePackagePage
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
