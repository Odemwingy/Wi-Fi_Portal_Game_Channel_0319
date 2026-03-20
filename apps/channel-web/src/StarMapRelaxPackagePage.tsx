import { useEffect, useMemo, useState } from "react";

import {
  apiBaseUrl,
  getPassengerPointsSummary,
  reportPoints
} from "./channel-api";
import { usePackageLaunchContext } from "./package-launch-context";

type StarNode = {
  id: string;
  label: string;
  x: number;
  y: number;
};

type StarRound = {
  constellationName: string;
  id: string;
  nodes: StarNode[];
  path: string[];
  prompt: string;
};

type RoundLog = {
  completed: boolean;
  roundId: string;
  selectedCount: number;
};

type GameStage = "briefing" | "playing" | "completed";

const STAR_ROUNDS: StarRound[] = [
  {
    constellationName: "North Wing",
    id: "star-map-01",
    nodes: [
      { id: "nw-1", label: "Aster", x: 18, y: 26 },
      { id: "nw-2", label: "Beacon", x: 36, y: 18 },
      { id: "nw-3", label: "Comet", x: 54, y: 28 },
      { id: "nw-4", label: "Drift", x: 70, y: 42 },
      { id: "nw-5", label: "Echo", x: 40, y: 54 }
    ],
    path: ["nw-1", "nw-2", "nw-3", "nw-4", "nw-5"],
    prompt: "Follow the northern wing trace from left to right."
  },
  {
    constellationName: "Cabin Arc",
    id: "star-map-02",
    nodes: [
      { id: "ca-1", label: "Flare", x: 22, y: 62 },
      { id: "ca-2", label: "Glint", x: 34, y: 44 },
      { id: "ca-3", label: "Halo", x: 50, y: 34 },
      { id: "ca-4", label: "Ion", x: 66, y: 42 },
      { id: "ca-5", label: "Jade", x: 76, y: 60 }
    ],
    path: ["ca-1", "ca-2", "ca-3", "ca-4", "ca-5"],
    prompt: "Draw the gentle cabin arc upward, then back down to the right."
  },
  {
    constellationName: "Night Corridor",
    id: "star-map-03",
    nodes: [
      { id: "nc-1", label: "Kite", x: 20, y: 24 },
      { id: "nc-2", label: "Lumen", x: 34, y: 36 },
      { id: "nc-3", label: "Muse", x: 48, y: 22 },
      { id: "nc-4", label: "Nova", x: 62, y: 36 },
      { id: "nc-5", label: "Orbit", x: 78, y: 26 }
    ],
    path: ["nc-1", "nc-2", "nc-3", "nc-4", "nc-5"],
    prompt: "Connect the corridor stars in a smooth zig-zag toward the right wing."
  }
];

export function StarMapRelaxPackagePage() {
  const { launchContext } = usePackageLaunchContext("star-map-relax");
  const [stage, setStage] = useState<GameStage>("briefing");
  const [roundIndex, setRoundIndex] = useState(0);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [roundLogs, setRoundLogs] = useState<RoundLog[]>([]);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [isReportingPoints, setIsReportingPoints] = useState(false);
  const [pointsSummary, setPointsSummary] = useState<Awaited<
    ReturnType<typeof getPassengerPointsSummary>
  > | null>(null);

  const currentRound = STAR_ROUNDS[roundIndex] ?? null;
  const completedRounds = roundLogs.filter((entry) => entry.completed).length;
  const relaxPoints = useMemo(
    () => Math.max(12, completedRounds * 16 + Math.max(0, 10 - mistakeCount * 2)),
    [completedRounds, mistakeCount]
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
    setSelectedPath([]);
    setRoundLogs([]);
    setMistakeCount(0);
  }

  function handleSelectNode(nodeId: string) {
    if (!currentRound || stage !== "playing") {
      return;
    }
    if (selectedPath.includes(nodeId)) {
      return;
    }

    const expectedNodeId = currentRound.path[selectedPath.length];
    if (nodeId !== expectedNodeId) {
      setMistakeCount((current) => current + 1);
      return;
    }

    const nextPath = [...selectedPath, nodeId];
    setSelectedPath(nextPath);

    if (nextPath.length !== currentRound.path.length) {
      return;
    }

    const nextLogs = [
      ...roundLogs,
      {
        completed: true,
        roundId: currentRound.id,
        selectedCount: nextPath.length
      }
    ];

    setRoundLogs(nextLogs);
    setSelectedPath([]);

    if (roundIndex + 1 >= STAR_ROUNDS.length) {
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
        game_id: "star-map-relax",
        metadata: {
          completed_rounds: completedRounds,
          mistakes: mistakeCount,
          total_rounds: STAR_ROUNDS.length
        },
        passenger_id: launchContext.passengerId,
        points: relaxPoints,
        reason: "star map relax package completed",
        report_id: [
          "star-map-relax",
          launchContext.passengerId,
          launchContext.sessionId,
          relaxPoints
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
          <h1>Star Map Relax Package</h1>
          <p className="lede">
            单机星图连线短局。按提示顺序连接星点，完成 3 幅轻量星图，
            以更少失误完成一段安静的夜航放松体验。
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
            <span>Rounds</span>
            <strong>
              {completedRounds}/{STAR_ROUNDS.length}
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
              <span>Mistakes</span>
              <strong>{mistakeCount}</strong>
              <p>错误顺序会增加失误次数</p>
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
              <h2>Star tracing flow</h2>
            </div>
            <span className="pill-tag">single-player</span>
          </div>

          {stage === "briefing" ? (
            <div className="cabin-puzzle-stage">
              <div className="status-banner">
                <strong>连线规则</strong>
                <p>
                  依照提示顺序点击星点。每轮需要按既定路径完成 5 个节点的连接，
                  顺序错误会累计失误次数。
                </p>
              </div>

              <div className="cabin-puzzle-summary">
                <article className="points-card">
                  <span>Constellations</span>
                  <strong>{STAR_ROUNDS.length}</strong>
                  <p>三幅轻量星图，适合夜航与静音场景。</p>
                </article>
                <article className="points-card">
                  <span>Points Formula</span>
                  <strong>{relaxPoints}</strong>
                  <p>完成轮次越多、失误越少，最终积分越高。</p>
                </article>
              </div>

              <button className="action-button action-button-primary" onClick={handleStart}>
                开始连线
              </button>
            </div>
          ) : null}

          {stage === "playing" && currentRound ? (
            <div className="cabin-puzzle-stage">
              <div className="status-banner">
                <strong>{currentRound.constellationName}</strong>
                <p>{currentRound.prompt}</p>
              </div>

              <div
                className="panel"
                style={{
                  minHeight: "320px",
                  position: "relative",
                  background:
                    "radial-gradient(circle at top, rgba(115, 198, 220, 0.14), transparent 28%), linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.88))"
                }}
              >
                {currentRound.nodes.map((node, index) => {
                  const isActive = selectedPath.includes(node.id);
                  const isNext = currentRound.path[selectedPath.length] === node.id;

                  return (
                    <button
                      key={node.id}
                      onClick={() => {
                        handleSelectNode(node.id);
                      }}
                      style={{
                        position: "absolute",
                        left: `${node.x}%`,
                        top: `${node.y}%`,
                        transform: "translate(-50%, -50%)",
                        width: "74px",
                        height: "74px",
                        borderRadius: "999px",
                        border: isActive
                          ? "2px solid rgba(115, 221, 179, 0.72)"
                          : isNext
                            ? "2px solid rgba(245, 191, 66, 0.68)"
                            : "1px solid rgba(148, 163, 184, 0.24)",
                        background: isActive
                          ? "rgba(115, 221, 179, 0.2)"
                          : "rgba(255, 255, 255, 0.08)",
                        color: "#f8fafc",
                        display: "grid",
                        gap: "0.15rem",
                        placeItems: "center"
                      }}
                      type="button"
                    >
                      <span style={{ fontSize: "0.72rem", letterSpacing: "0.06em" }}>
                        {index + 1}
                      </span>
                      <strong style={{ fontSize: "0.88rem" }}>{node.label}</strong>
                    </button>
                  );
                })}
              </div>

              <div className="cabin-puzzle-summary">
                <article className="points-card">
                  <span>Progress</span>
                  <strong>
                    {selectedPath.length}/{currentRound.path.length}
                  </strong>
                  <p>按正确顺序逐步点亮整幅星图。</p>
                </article>
                <article className="points-card">
                  <span>Round Goal</span>
                  <strong>{currentRound.constellationName}</strong>
                  <p>当前轮完成后会自动进入下一幅星图。</p>
                </article>
              </div>
            </div>
          ) : null}

          {stage === "completed" ? (
            <div className="cabin-puzzle-stage">
              <div className="status-banner">
                <strong>夜航连线完成</strong>
                <p>
                  你已完成全部 {STAR_ROUNDS.length} 轮星图放松练习，累计失误 {mistakeCount} 次，
                  可以将本局积分上报到积分中心。
                </p>
              </div>

              <div className="cabin-puzzle-summary">
                <article className="points-card">
                  <span>Completed Rounds</span>
                  <strong>{completedRounds}</strong>
                  <p>全部星图都已经完成连接。</p>
                </article>
                <article className="points-card">
                  <span>Package Points</span>
                  <strong>{relaxPoints}</strong>
                  <p>本局结束后可上报到积分中心。</p>
                </article>
              </div>

              <div className="launcher-meta-grid">
                {roundLogs.map((entry) => (
                  <div className="quiz-meta-card" key={entry.roundId}>
                    <span>{entry.roundId}</span>
                    <strong>{entry.completed ? "Completed" : "Pending"}</strong>
                    <p>{entry.selectedCount} nodes linked</p>
                  </div>
                ))}
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
