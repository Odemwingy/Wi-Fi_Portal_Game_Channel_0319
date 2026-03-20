import { useEffect, useMemo, useState } from "react";

import {
  apiBaseUrl,
  getPassengerPointsSummary,
  reportPoints
} from "./channel-api";
import { usePackageLaunchContext } from "./package-launch-context";

type MealCategory = "dessert" | "drink" | "meal";

type MealCard = {
  category: MealCategory;
  id: string;
  label: string;
};

type GameStage = "briefing" | "playing" | "completed";

const MEAL_CARDS: MealCard[] = shuffleCards([
  { category: "meal", id: "meal-hot-pot-a", label: "Hot Pot" },
  { category: "meal", id: "meal-hot-pot-b", label: "Hot Pot" },
  { category: "dessert", id: "dessert-mango-a", label: "Mango Mousse" },
  { category: "dessert", id: "dessert-mango-b", label: "Mango Mousse" },
  { category: "drink", id: "drink-jasmine-a", label: "Jasmine Tea" },
  { category: "drink", id: "drink-jasmine-b", label: "Jasmine Tea" },
  { category: "meal", id: "meal-noodle-a", label: "Beef Noodle" },
  { category: "meal", id: "meal-noodle-b", label: "Beef Noodle" },
  { category: "dessert", id: "dessert-tart-a", label: "Fruit Tart" },
  { category: "dessert", id: "dessert-tart-b", label: "Fruit Tart" },
  { category: "drink", id: "drink-cola-a", label: "Cola" },
  { category: "drink", id: "drink-cola-b", label: "Cola" }
]);

const CATEGORY_LABELS: Record<MealCategory, string> = {
  dessert: "Dessert",
  drink: "Drink",
  meal: "Meal"
};

export function MealCartMatchPackagePage() {
  const { launchContext } = usePackageLaunchContext("meal-cart-match");
  const [stage, setStage] = useState<GameStage>("briefing");
  const [cards, setCards] = useState<MealCard[]>(() => shuffleCards(MEAL_CARDS));
  const [revealedIds, setRevealedIds] = useState<string[]>([]);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [attemptCount, setAttemptCount] = useState(0);
  const [isReportingPoints, setIsReportingPoints] = useState(false);
  const [pointsSummary, setPointsSummary] = useState<Awaited<
    ReturnType<typeof getPassengerPointsSummary>
  > | null>(null);

  const matchedPairs = matchedIds.length / 2;
  const logicPoints = useMemo(
    () => Math.max(12, matchedPairs * 8 + Math.max(0, 18 - attemptCount)),
    [attemptCount, matchedPairs]
  );

  useEffect(() => {
    void getPassengerPointsSummary(launchContext.passengerId)
      .then((summary) => {
        setPointsSummary(summary);
      })
      .catch(() => {
        // Keep package UI usable even if summary fetch fails.
      });
  }, [launchContext.passengerId]);

  function handleStart() {
    setStage("playing");
    setCards(shuffleCards(MEAL_CARDS));
    setRevealedIds([]);
    setMatchedIds([]);
    setAttemptCount(0);
  }

  function handleReveal(cardId: string) {
    if (stage !== "playing") {
      return;
    }
    if (revealedIds.includes(cardId) || matchedIds.includes(cardId)) {
      return;
    }
    if (revealedIds.length >= 2) {
      return;
    }

    const nextRevealed = [...revealedIds, cardId];
    setRevealedIds(nextRevealed);

    if (nextRevealed.length < 2) {
      return;
    }

    const [firstId, secondId] = nextRevealed;
    const firstCard = cards.find((card) => card.id === firstId);
    const secondCard = cards.find((card) => card.id === secondId);

    setAttemptCount((current) => current + 1);

    if (firstCard && secondCard && firstCard.label === secondCard.label) {
      const nextMatched = [...matchedIds, firstId, secondId];
      setMatchedIds(nextMatched);
      setRevealedIds([]);

      if (nextMatched.length === cards.length) {
        setStage("completed");
      }
      return;
    }

    window.setTimeout(() => {
      setRevealedIds([]);
    }, 500);
  }

  async function handleReportPoints() {
    if (stage !== "completed") {
      return;
    }

    setIsReportingPoints(true);

    try {
      const response = await reportPoints({
        airline_code: launchContext.airlineCode,
        game_id: "meal-cart-match",
        metadata: {
          attempts: attemptCount,
          matched_pairs: matchedPairs,
          total_pairs: cards.length / 2
        },
        passenger_id: launchContext.passengerId,
        points: logicPoints,
        reason: "meal cart match package completed",
        report_id: [
          "meal-cart-match",
          launchContext.passengerId,
          launchContext.sessionId,
          logicPoints
        ].join(":"),
        session_id: launchContext.sessionId
      });

      setPointsSummary(response.summary);
    } finally {
      setIsReportingPoints(false);
    }
  }

  return (
    <main className="package-shell">
      <section className="package-hero">
        <div>
          <p className="eyebrow">Iframe Game Package</p>
          <h1>Meal Cart Match Package</h1>
          <p className="lede">
            单机配对消除短局。翻开餐车物料卡片，记住位置并完成餐食、饮品和甜点的成对匹配，
            用更少尝试完成整轮整理。
          </p>
        </div>
        <div className="hero-stats">
          <article className="stat-chip accent-sun">
            <span>API</span>
            <strong>{apiBaseUrl}</strong>
          </article>
          <article className="stat-chip accent-sea">
            <span>Passenger</span>
            <strong>{launchContext.passengerId}</strong>
          </article>
          <article className="stat-chip accent-mint">
            <span>Pairs</span>
            <strong>
              {matchedPairs}/{cards.length / 2}
            </strong>
          </article>
          <article className="stat-chip accent-rose">
            <span>Stage</span>
            <strong>{stage}</strong>
          </article>
        </div>
      </section>

      <section className="package-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Launch Context</p>
              <h2>Package 上下文</h2>
            </div>
            <a className="action-button" href="/">
              返回频道页
            </a>
          </div>

          <div className="launcher-meta-grid">
            <div className="quiz-meta-card">
              <span>Trace</span>
              <strong>{launchContext.traceId}</strong>
              <p>session-scoped package launch</p>
            </div>
            <div className="quiz-meta-card">
              <span>Locale</span>
              <strong>{launchContext.locale}</strong>
              <p>
                {launchContext.airlineCode} / {launchContext.cabinClass}
              </p>
            </div>
            <div className="quiz-meta-card">
              <span>Session</span>
              <strong>{launchContext.sessionId}</strong>
              <p>room_id {launchContext.roomId ?? "not required"}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Attempts</span>
              <strong>{attemptCount}</strong>
              <p>尝试次数越少，奖励越高</p>
            </div>
            <div className="quiz-meta-card">
              <span>Passenger Total</span>
              <strong>{pointsSummary?.total_points ?? 0}</strong>
              <p>平台累计积分</p>
            </div>
            <div className="quiz-meta-card">
              <span>Match Reward</span>
              <strong>{logicPoints}</strong>
              <p>完成后可回传的建议积分</p>
            </div>
          </div>

          <div className="launcher-actions">
            {stage === "briefing" ? (
              <button
                className="action-button action-button-primary"
                onClick={handleStart}
                type="button"
              >
                开始 Meal Cart Match
              </button>
            ) : (
              <button className="action-button" onClick={handleStart} type="button">
                重新开局
              </button>
            )}
            <button
              className="action-button action-button-primary"
              disabled={stage !== "completed" || isReportingPoints}
              onClick={() => {
                void handleReportPoints();
              }}
              type="button"
            >
              {isReportingPoints ? "回传中..." : "回传本局积分"}
            </button>
          </div>

          <div className="json-card">
            <p className="mini-label">launch query</p>
            <pre>{JSON.stringify(launchContext, null, 2)}</pre>
          </div>
        </article>

        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Single Player Runtime</p>
              <h2>Meal Cart Match</h2>
            </div>
            <div className="activity-topline">
              <span>12 张卡片</span>
              <span>6 组成对</span>
            </div>
          </div>

          <section className="quiz-stage">
            <div className="quiz-header">
              <div>
                <p className="mini-label">Pair Board</p>
                <h3>Match the catering pairs</h3>
                <p className="quiz-roundline">
                  {stage === "completed"
                    ? `Final ${cards.length / 2}/${cards.length / 2}`
                    : `Pairs ${matchedPairs}/${cards.length / 2}`}
                  <span>{attemptCount} 次尝试</span>
                </p>
              </div>
              <span
                className={`status-pill ${
                  stage === "completed" ? "status-connected" : "status-connecting"
                }`}
              >
                {stage === "briefing"
                  ? "等待开局"
                  : stage === "playing"
                    ? "配对进行中"
                    : "本局已结束"}
              </span>
            </div>

            <div className="cabin-puzzle-grid">
              {cards.map((card) => {
                const isRevealed =
                  revealedIds.includes(card.id) || matchedIds.includes(card.id);

                return (
                  <button
                    className={`cabin-tile ${isRevealed ? "is-solved" : ""}`}
                    disabled={stage !== "playing" || matchedIds.includes(card.id)}
                    key={card.id}
                    onClick={() => handleReveal(card.id)}
                    type="button"
                  >
                    {isRevealed ? (
                      <>
                        <strong>{card.label}</strong>
                        <span>{CATEGORY_LABELS[card.category]}</span>
                      </>
                    ) : (
                      <>
                        <strong>Meal Cart</strong>
                        <span>Tap to reveal</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="quiz-meta-grid">
              <div className="quiz-meta-card">
                <span>当前乘客</span>
                <strong>{launchContext.passengerId}</strong>
                <p>room 不必需，直接从 launcher 启动</p>
              </div>
              <div className="quiz-meta-card">
                <span>已完成配对</span>
                <strong>{matchedPairs}</strong>
                <p>找齐全部 6 组即可完成本局</p>
              </div>
              <div className="quiz-meta-card">
                <span>建议积分</span>
                <strong>{logicPoints}</strong>
                <p>匹配更多、尝试更少会得到更高奖励</p>
              </div>
            </div>
          </section>
        </article>
      </section>
    </main>
  );
}

function shuffleCards(cards: MealCard[]) {
  const next = [...cards];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}
