import { useEffect, useMemo, useState } from "react";

import {
  apiBaseUrl,
  getPassengerPointsSummary,
  reportPoints
} from "./channel-api";
import { usePackageLaunchContext } from "./package-launch-context";

type WaypointTone = "amber" | "mint" | "rose" | "sea";

type RouteOption = {
  hint: string;
  id: string;
  label: string;
  tone: WaypointTone;
};

type RouteRound = {
  destination: string;
  id: string;
  nextWaypointId: string;
  objective: string;
  options: RouteOption[];
  origin: string;
  routeName: string;
};

type RouteDecision = {
  correct: boolean;
  roundId: string;
  selectedWaypointId: string;
};

type GameStage = "briefing" | "playing" | "completed";

const ROUTE_ROUNDS: RouteRound[] = [
  {
    destination: "Seoul Arrival Gate",
    id: "route-01",
    nextWaypointId: "wp-tango",
    objective: "Choose the waypoint that keeps the arrival route clear of a weather patch.",
    options: [
      { hint: "Keeps the climb east of traffic congestion.", id: "wp-tango", label: "TANGO 2E", tone: "sea" },
      { hint: "Turns too early into the busy descent lane.", id: "wp-lima", label: "LIMA 4N", tone: "rose" },
      { hint: "Adds distance and misses the corridor window.", id: "wp-alpha", label: "ALPHA 7R", tone: "amber" }
    ],
    origin: "Shanghai Departure",
    routeName: "MU Cabin Shuttle"
  },
  {
    destination: "Hong Kong Final",
    id: "route-02",
    nextWaypointId: "wp-sierra",
    objective: "Select the turn that lines the aircraft up with the active shoreline approach.",
    options: [
      { hint: "Crosses the final line too high.", id: "wp-bravo", label: "BRAVO 1K", tone: "rose" },
      { hint: "Keeps the descent stable and aligned with approach.", id: "wp-sierra", label: "SIERRA 3A", tone: "mint" },
      { hint: "Loops back toward holding traffic.", id: "wp-delta", label: "DELTA 5C", tone: "amber" }
    ],
    origin: "Cruise Segment",
    routeName: "Pearl Approach"
  },
  {
    destination: "Tokyo Terminal Corridor",
    id: "route-03",
    nextWaypointId: "wp-november",
    objective: "Pick the waypoint that preserves spacing with the parallel arrival stream.",
    options: [
      { hint: "Slides into the protected corridor at the right spacing.", id: "wp-november", label: "NOVEMBER 6J", tone: "sea" },
      { hint: "Cuts through the neighboring cabin shuttle lane.", id: "wp-kilo", label: "KILO 8P", tone: "rose" },
      { hint: "Adds an unnecessary dogleg before descent.", id: "wp-echo", label: "ECHO 2V", tone: "amber" }
    ],
    origin: "Open Ocean Leg",
    routeName: "Skyline Merge"
  },
  {
    destination: "Singapore Gate Cluster",
    id: "route-04",
    nextWaypointId: "wp-zulu",
    objective: "Choose the final waypoint that delivers the shortest clean handoff into terminal flow.",
    options: [
      { hint: "Overflies the gate cluster and forces a long loop back.", id: "wp-foxtrot", label: "FOXTROT 9B", tone: "rose" },
      { hint: "Threads directly into the active arrival funnel.", id: "wp-zulu", label: "ZULU 1M", tone: "mint" },
      { hint: "Drops too low before the terminal handoff.", id: "wp-hotel", label: "HOTEL 3D", tone: "amber" }
    ],
    origin: "Regional Inbound",
    routeName: "Terminal Fast Path"
  }
];

export function FlightPathPuzzlerPackagePage() {
  const { launchContext } = usePackageLaunchContext("flight-path-puzzler");
  const [stage, setStage] = useState<GameStage>("briefing");
  const [roundIndex, setRoundIndex] = useState(0);
  const [decisions, setDecisions] = useState<RouteDecision[]>([]);
  const [isReportingPoints, setIsReportingPoints] = useState(false);
  const [pointsSummary, setPointsSummary] = useState<Awaited<
    ReturnType<typeof getPassengerPointsSummary>
  > | null>(null);

  const currentRound = ROUTE_ROUNDS[roundIndex] ?? null;
  const correctCount = useMemo(
    () => decisions.filter((decision) => decision.correct).length,
    [decisions]
  );
  const accuracy = useMemo(() => {
    if (decisions.length === 0) {
      return 0;
    }

    return Math.round((correctCount / decisions.length) * 100);
  }, [correctCount, decisions.length]);
  const routePoints = useMemo(
    () => Math.max(12, correctCount * 12 + (accuracy >= 75 ? 8 : 0)),
    [accuracy, correctCount]
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
    setRoundIndex(0);
    setDecisions([]);
  }

  function handleWaypointSelect(selectedWaypointId: string) {
    if (!currentRound || stage !== "playing") {
      return;
    }

    const nextDecisions = [
      ...decisions,
      {
        correct: selectedWaypointId === currentRound.nextWaypointId,
        roundId: currentRound.id,
        selectedWaypointId
      }
    ];

    setDecisions(nextDecisions);

    if (roundIndex + 1 >= ROUTE_ROUNDS.length) {
      setStage("completed");
      return;
    }

    setRoundIndex((current) => current + 1);
  }

  async function handleReportPoints() {
    if (stage !== "completed") {
      return;
    }

    setIsReportingPoints(true);

    try {
      const response = await reportPoints({
        airline_code: launchContext.airlineCode,
        game_id: "flight-path-puzzler",
        metadata: {
          accuracy,
          correct_count: correctCount,
          rounds_completed: decisions.length
        },
        passenger_id: launchContext.passengerId,
        points: routePoints,
        reason: "flight path puzzler package completed",
        report_id: [
          "flight-path-puzzler",
          launchContext.passengerId,
          launchContext.sessionId,
          routePoints
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
          <h1>Flight Path Puzzler Package</h1>
          <p className="lede">
            单机路径规划短局。你需要在每个航段选择正确的下一航路点，让飞机保持最短、
            最稳的进近路径，用更高准确率完成整条航线规划。
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
            <span>Round</span>
            <strong>
              {Math.min(roundIndex + (stage === "completed" ? 0 : 1), ROUTE_ROUNDS.length)}/
              {ROUTE_ROUNDS.length}
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
              <p>solo route planning drill</p>
            </div>
            <div className="quiz-meta-card">
              <span>Passenger Total</span>
              <strong>{pointsSummary?.summary.total_points ?? 0}</strong>
              <p>latest points wallet total</p>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Gameplay</p>
              <h2>Route planning flow</h2>
            </div>
            <span className="pill-tag">single-player</span>
          </div>

          {stage === "briefing" ? (
            <div className="cabin-puzzle-stage">
              <div className="status-banner">
                <strong>规划规则</strong>
                <p>
                  每轮给出起点、目标航段和 3 个候选航路点。选出最合理的下一 waypoint，
                  共 4 轮，准确率越高，积分越高。
                </p>
              </div>

              <div className="cabin-puzzle-summary">
                <article className="points-card">
                  <span>Rounds</span>
                  <strong>{ROUTE_ROUNDS.length}</strong>
                  <p>固定四轮短局，适合机上碎片时间。</p>
                </article>
                <article className="points-card">
                  <span>Points Formula</span>
                  <strong>{routePoints}</strong>
                  <p>每个正确航点都有基础分，准确率高会拿到额外奖励。</p>
                </article>
              </div>

              <button className="action-button action-button-primary" onClick={handleStart}>
                开始规划
              </button>
            </div>
          ) : null}

          {stage === "playing" && currentRound ? (
            <div className="cabin-puzzle-stage">
              <div className="status-banner">
                <strong>
                  Round {roundIndex + 1} / {ROUTE_ROUNDS.length}
                </strong>
                <p>{currentRound.objective}</p>
              </div>

              <div className="cabin-puzzle-summary">
                <article className="points-card">
                  <span>Route</span>
                  <strong>{currentRound.routeName}</strong>
                  <p>
                    {currentRound.origin} {"->"} {currentRound.destination}
                  </p>
                </article>
                <article className="points-card">
                  <span>Accuracy</span>
                  <strong>{accuracy}%</strong>
                  <p>当前已完成 {decisions.length} 轮决策。</p>
                </article>
              </div>

              <div className="card-clash-hand">
                {currentRound.options.map((option) => (
                  <button
                    className={`card-option accent-${option.tone}`}
                    key={option.id}
                    onClick={() => {
                      handleWaypointSelect(option.id);
                    }}
                    type="button"
                  >
                    <span>{option.label}</span>
                    <strong>{option.hint}</strong>
                    <p>{currentRound.destination}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {stage === "completed" ? (
            <div className="cabin-puzzle-stage">
              <div className="status-banner">
                <strong>规划完成</strong>
                <p>
                  你已完成全部 {ROUTE_ROUNDS.length} 轮航路规划。
                  当前正确 {correctCount} 轮，准确率 {accuracy}%。
                </p>
              </div>

              <div className="cabin-puzzle-summary">
                <article className="points-card">
                  <span>Correct Routes</span>
                  <strong>{correctCount}</strong>
                  <p>完成 {decisions.length} 轮后统计的正确航段数。</p>
                </article>
                <article className="points-card">
                  <span>Package Points</span>
                  <strong>{routePoints}</strong>
                  <p>本局结束后可上报到积分中心。</p>
                </article>
              </div>

              <div className="launcher-meta-grid">
                {decisions.map((decision) => {
                  const selected = ROUTE_ROUNDS
                    .flatMap((round) => round.options)
                    .find((option) => option.id === decision.selectedWaypointId);

                  return (
                    <div className="quiz-meta-card" key={decision.roundId}>
                      <span>{decision.roundId}</span>
                      <strong>{decision.correct ? "Correct" : "Missed"}</strong>
                      <p>{selected?.label ?? decision.selectedWaypointId}</p>
                    </div>
                  );
                })}
              </div>

              <div className="button-row">
                <button
                  className="action-button action-button-primary"
                  disabled={isReportingPoints}
                  onClick={() => {
                    void handleReportPoints();
                  }}
                >
                  {isReportingPoints ? "积分上报中..." : "上报积分"}
                </button>
                <button className="action-button" onClick={handleStart}>
                  再玩一局
                </button>
              </div>
            </div>
          ) : null}
        </article>
      </section>
    </main>
  );
}
