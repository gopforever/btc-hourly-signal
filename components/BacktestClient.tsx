"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Summary = {
  totalPeriods: number;
  tradeableSignals: number;
  noTradeSignals: number;
  correct: number;
  incorrect: number;
  usefulWins: number;
  usefulLosses: number;
  flat: number;
  strongWins: number;
  smallWins: number;
  smallLosses: number;
  strongLosses: number;
  directionalAccuracyPct: number;
  usefulAccuracyPct: number;
  avgDirectionalEdgePct: number;
  avgWinPct: number;
  avgLossPct: number;
};

type BacktestRow = {
  model: "Current Model" | "Tuned Model V2" | "Optimizer V3";
  candle_ts: string;
  next_ts: string;
  signal: string;
  effectiveSignal: string;
  confidence: number;
  close: number;
  next_close: number;
  move: number;
  movePct: number;
  expectedDirection: "up" | "down" | "flat" | "none";
  directionalScorePct: number;
  grade: string;
  isTradeable: boolean;
  isCorrect: boolean;
  isUsefulWin: boolean;
  isUsefulLoss: boolean;
  rsi?: number | null;
  ema_9?: number | null;
  ema_21?: number | null;
  ema_50?: number | null;
  macd_histogram?: number | null;
  support?: number | null;
  resistance?: number | null;
  notes: string[];
  filterReasons?: string[];
};

type ModelResult = {
  summary: Summary;
  bySignal: Array<Summary & { signal: string }>;
  thresholdComparison: Array<Summary & { threshold: number }>;
  bestThreshold: (Summary & { threshold: number }) | null;
  recent: BacktestRow[];
};

type V3Config = {
  id: string;
  minConfidence: number;
  emaSpreadMinPct: number;
  emaTrendSpreadMinPct: number;
  atrMinPct: number;
  rangeMinPct: number;
  bullishRsiMin: number;
  bearishRsiMax: number;
  macdMode: "loose" | "medium" | "strict";
};

type OptimizerResult = {
  rank: number;
  score: number;
  config: V3Config;
  summary: Summary;
};

type BacktestPayload = {
  generatedAt: string;
  config: {
    limit: number;
    minConfidence: number;
    minUsefulMovePct: number;
    strongMovePct: number;
    candleCount: number;
    testedPeriods: number;
    optimizerConfigsTested: number;
  };
  current: ModelResult;
  tunedV2: ModelResult;
  optimizerV3: {
    topConfigs: OptimizerResult[];
    bestConfig: OptimizerResult | null;
    bestSummary: Summary | null;
    recent: BacktestRow[];
  };
  comparison: {
    tradeableSignalsDelta: number;
    noTradeDelta: number;
    usefulAccuracyDelta: number;
    directionalAccuracyDelta: number;
    avgDirectionalEdgeDelta: number;
    strongLossDelta: number;
    usefulWinDelta: number;
    usefulLossDelta: number;
  };
  comparisonV3: {
    tradeableSignalsDelta: number;
    noTradeDelta: number;
    usefulAccuracyDelta: number;
    directionalAccuracyDelta: number;
    avgDirectionalEdgeDelta: number;
    strongLossDelta: number;
    usefulWinDelta: number;
    usefulLossDelta: number;
  } | null;
};

const money = (v?: number | null) =>
  v == null || Number.isNaN(v)
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      }).format(v);

const pct = (v?: number | null) =>
  v == null || Number.isNaN(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(3)}%`;

const signed = (v: number, suffix = "") => `${v >= 0 ? "+" : ""}${v}${suffix}`;

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

function signalClass(signal: string) {
  if (signal.includes("Bullish")) return "badge green";
  if (signal.includes("Bearish")) return "badge red";
  if (signal === "No Trade") return "badge yellow";
  return "badge blue";
}

function gradeClass(grade: string) {
  if (grade.includes("Win")) return "badge green";
  if (grade.includes("Loss")) return "badge red";
  if (grade === "No Trade") return "badge yellow";
  return "badge blue";
}

function MetricCard({
  label,
  value,
  sub
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="card card-inner">
      <div className="metric-title">{label}</div>
      <div className="metric-value">{value}</div>
      {sub ? <div className="subtle">{sub}</div> : null}
    </div>
  );
}

function SummaryGrid({ summary, title }: { summary: Summary; title: string }) {
  return (
    <section style={{ marginBottom: 16 }}>
      <div className="metric-title" style={{ margin: "0 0 10px 4px" }}>
        {title}
      </div>

      <section className="grid grid-4">
        <MetricCard
          label="Tradeable Accuracy"
          value={`${summary.directionalAccuracyPct}%`}
          sub={`${summary.correct} correct / ${summary.tradeableSignals} tradeable`}
        />
        <MetricCard
          label="Useful Accuracy"
          value={`${summary.usefulAccuracyPct}%`}
          sub={`${summary.usefulWins} wins / ${summary.usefulLosses} losses`}
        />
        <MetricCard
          label="Avg Directional Edge"
          value={pct(summary.avgDirectionalEdgePct)}
          sub="Positive means model direction helped"
        />
        <MetricCard
          label="No-Trade Filtered"
          value={summary.noTradeSignals}
          sub={`${summary.totalPeriods} total tested periods`}
        />
      </section>
    </section>
  );
}

function ThresholdTable({
  title,
  rows
}: {
  title: string;
  rows: ModelResult["thresholdComparison"];
}) {
  return (
    <div className="card card-inner">
      <div className="metric-title" style={{ marginBottom: 10 }}>
        {title}
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Threshold</th>
            <th>Tradeable</th>
            <th>No Trade</th>
            <th>Accuracy</th>
            <th>Useful</th>
            <th>Avg Edge</th>
            <th>Strong Loss</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.threshold}>
              <td>{row.threshold}%</td>
              <td>{row.tradeableSignals}</td>
              <td>{row.noTradeSignals}</td>
              <td>{row.directionalAccuracyPct}%</td>
              <td>{row.usefulAccuracyPct}%</td>
              <td>{pct(row.avgDirectionalEdgePct)}</td>
              <td>{row.strongLosses}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfigText({ config }: { config: V3Config }) {
  return (
    <div className="subtle" style={{ lineHeight: 1.45 }}>
      Conf {config.minConfidence}% · EMA {config.emaSpreadMinPct}% · Trend{" "}
      {config.emaTrendSpreadMinPct}% · ATR {config.atrMinPct}% · Range{" "}
      {config.rangeMinPct}% · Bull RSI {config.bullishRsiMin}+ · Bear RSI ≤
      {config.bearishRsiMax} · MACD {config.macdMode}
    </div>
  );
}

function OptimizerTable({ rows }: { rows: OptimizerResult[] }) {
  return (
    <section className="card card-inner" style={{ marginBottom: 16 }}>
      <div className="metric-title" style={{ marginBottom: 10 }}>
        Optimizer V3 — Top Configurations
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Score</th>
            <th>Tradeable</th>
            <th>No Trade</th>
            <th>Useful</th>
            <th>Avg Edge</th>
            <th>Strong Loss</th>
            <th>Config</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.config.id}>
              <td>#{row.rank}</td>
              <td>{row.score}</td>
              <td>{row.summary.tradeableSignals}</td>
              <td>{row.summary.noTradeSignals}</td>
              <td>{row.summary.usefulAccuracyPct}%</td>
              <td>{pct(row.summary.avgDirectionalEdgePct)}</td>
              <td>{row.summary.strongLosses}</td>
              <td>
                <ConfigText config={row.config} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="footer-note">
        Optimizer score rewards useful accuracy, positive directional edge, and enough tradeable
        signals while penalizing strong losses and small losses.
      </div>
    </section>
  );
}

function RecentTable({
  title,
  rows,
  showReasons
}: {
  title: string;
  rows: BacktestRow[];
  showReasons?: boolean;
}) {
  return (
    <section className="card card-inner" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 12 }}>
        <div>
          <div className="metric-title">{title}</div>
          <div className="metric-value">Last {rows.length}</div>
        </div>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Hour</th>
            <th>Raw Signal</th>
            <th>Effective</th>
            <th>Conf</th>
            <th>Close</th>
            <th>Next</th>
            <th>Move</th>
            <th>Edge</th>
            <th>Grade</th>
            {showReasons ? <th>Filter Reason</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 60).map((row) => (
            <tr key={`${row.model}-${row.candle_ts}-${row.next_ts}`}>
              <td>{timeLabel(row.candle_ts)}</td>
              <td>
                <span className={signalClass(row.signal)}>{row.signal}</span>
              </td>
              <td>
                <span className={signalClass(row.effectiveSignal)}>{row.effectiveSignal}</span>
              </td>
              <td>{row.confidence}%</td>
              <td>{money(row.close)}</td>
              <td>{money(row.next_close)}</td>
              <td>{pct(row.movePct)}</td>
              <td>{pct(row.directionalScorePct)}</td>
              <td>
                <span className={gradeClass(row.grade)}>{row.grade}</span>
              </td>
              {showReasons ? (
                <td className="subtle">{(row.filterReasons ?? []).slice(0, 2).join(" ")}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function BacktestClient() {
  const [data, setData] = useState<BacktestPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [minConfidence, setMinConfidence] = useState(70);
  const [limit, setLimit] = useState(500);
  const [minMovePct, setMinMovePct] = useState(0.1);
  const [strongMovePct, setStrongMovePct] = useState(0.4);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        minConfidence: String(minConfidence),
        limit: String(limit),
        minMovePct: String(minMovePct),
        strongMovePct: String(strongMovePct)
      });

      const res = await fetch(`/api/backtest?${params.toString()}`, {
        cache: "no-store"
      });

      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload?.error ?? `Backtest API failed: ${res.status}`);
      }

      setData(payload);
    } catch (e) {
      console.error("Backtest load failed:", e);
      setError(e instanceof Error ? e.message : "Unknown backtest error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recommendation = useMemo(() => {
    if (!data) return "Run the optimizer.";

    const currentBest = data.current.bestThreshold;
    const tunedBest = data.tunedV2.bestThreshold;
    const v3Best = data.optimizerV3.bestConfig;

    const currentText = currentBest
      ? `Current best: ${currentBest.threshold}% confidence, useful ${currentBest.usefulAccuracyPct}%, edge ${pct(currentBest.avgDirectionalEdgePct)}.`
      : "Current best unavailable.";

    const tunedText = tunedBest
      ? ` V2 best: ${tunedBest.threshold}% confidence, useful ${tunedBest.usefulAccuracyPct}%, edge ${pct(tunedBest.avgDirectionalEdgePct)}.`
      : "";

    const v3Text = v3Best
      ? ` V3 best: useful ${v3Best.summary.usefulAccuracyPct}%, edge ${pct(
          v3Best.summary.avgDirectionalEdgePct
        )}, tradeable ${v3Best.summary.tradeableSignals}, strong losses ${v3Best.summary.strongLosses}.`
      : "";

    return `${currentText}${tunedText}${v3Text}`;
  }, [data]);

  return (
    <>
      <section className="hero">
        <div className="card card-inner">
          <div className="subtle">Historical Simulation</div>
          <h1 className="h1">Backtest + Tuning Dashboard</h1>
          <p className="subtle">
            Compares Current Model, Tuned Model V2, and Optimizer V3. V3 runs a grid
            search across confidence, trend, volatility, RSI, MACD, and no-trade filters.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(140px, 1fr))",
              gap: 10,
              marginTop: 18
            }}
          >
            <label className="subtle">
              Min Confidence
              <input
                value={minConfidence}
                type="number"
                min={0}
                max={100}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
                style={inputStyle}
              />
            </label>

            <label className="subtle">
              Candle Limit
              <input
                value={limit}
                type="number"
                min={80}
                max={2000}
                onChange={(e) => setLimit(Number(e.target.value))}
                style={inputStyle}
              />
            </label>

            <label className="subtle">
              Useful Move %
              <input
                value={minMovePct}
                type="number"
                step="0.05"
                min={0.01}
                max={5}
                onChange={(e) => setMinMovePct(Number(e.target.value))}
                style={inputStyle}
              />
            </label>

            <label className="subtle">
              Strong Move %
              <input
                value={strongMovePct}
                type="number"
                step="0.05"
                min={0.05}
                max={10}
                onChange={(e) => setStrongMovePct(Number(e.target.value))}
                style={inputStyle}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
            <button className="button" onClick={load} disabled={loading}>
              {loading ? "Running Optimizer..." : "Run Backtest + Optimizer"}
            </button>
            <Link className="button" href="/accuracy">
              Accuracy Page
            </Link>
            <Link className="button" href="/">
              Dashboard
            </Link>
          </div>
        </div>

        <div className="card card-inner">
          <div className="metric-title">Recommendation</div>
          <div className="metric-value" style={{ fontSize: 22 }}>
            Find positive edge first
          </div>
          <p className="subtle">{recommendation}</p>
        </div>
      </section>

      {error ? (
        <section className="card card-inner" style={{ marginBottom: 16 }}>
          Error loading backtest: {error}
        </section>
      ) : null}

      {!data ? (
        <section className="card card-inner">Loading backtest data...</section>
      ) : (
        <>
          <section className="grid grid-4" style={{ marginBottom: 16 }}>
            <MetricCard
              label="V3 Useful Accuracy Delta"
              value={
                data.comparisonV3
                  ? signed(data.comparisonV3.usefulAccuracyDelta, "%")
                  : "—"
              }
              sub="V3 minus Current"
            />
            <MetricCard
              label="V3 Avg Edge Delta"
              value={
                data.comparisonV3
                  ? pct(data.comparisonV3.avgDirectionalEdgeDelta)
                  : "—"
              }
              sub="V3 minus Current"
            />
            <MetricCard
              label="V3 Strong Loss Delta"
              value={
                data.comparisonV3
                  ? signed(data.comparisonV3.strongLossDelta)
                  : "—"
              }
              sub="Lower is better"
            />
            <MetricCard
              label="Configs Tested"
              value={data.config.optimizerConfigsTested}
              sub="V3 grid search combinations"
            />
          </section>

          {data.optimizerV3.bestConfig && data.optimizerV3.bestSummary ? (
            <>
              <section className="card card-inner" style={{ marginBottom: 16 }}>
                <div className="metric-title">Best V3 Config</div>
                <div className="metric-value" style={{ fontSize: 24 }}>
                  Rank #{data.optimizerV3.bestConfig.rank} · Score{" "}
                  {data.optimizerV3.bestConfig.score}
                </div>
                <ConfigText config={data.optimizerV3.bestConfig.config} />
              </section>

              <SummaryGrid summary={data.optimizerV3.bestSummary} title="Optimizer V3 Best Config" />
            </>
          ) : null}

          <SummaryGrid summary={data.current.summary} title="Current Model" />
          <SummaryGrid summary={data.tunedV2.summary} title="Tuned Model V2" />

          <section className="grid grid-4" style={{ marginBottom: 16 }}>
            <MetricCard
              label="Candles Loaded"
              value={data.config.candleCount}
              sub={`${data.config.testedPeriods} backtested signal periods`}
            />
            <MetricCard
              label="Current Strong Losses"
              value={data.current.summary.strongLosses}
              sub={`${data.current.summary.smallLosses} small losses`}
            />
            <MetricCard
              label="V2 Strong Losses"
              value={data.tunedV2.summary.strongLosses}
              sub={`${data.tunedV2.summary.smallLosses} small losses`}
            />
            <MetricCard
              label="V3 Strong Losses"
              value={data.optimizerV3.bestSummary?.strongLosses ?? "—"}
              sub={`${data.optimizerV3.bestSummary?.smallLosses ?? "—"} small losses`}
            />
          </section>

          <OptimizerTable rows={data.optimizerV3.topConfigs} />

          <section className="grid grid-2" style={{ marginBottom: 16 }}>
            <ThresholdTable
              title="Current Model Threshold Comparison"
              rows={data.current.thresholdComparison}
            />
            <ThresholdTable
              title="Tuned Model V2 Threshold Comparison"
              rows={data.tunedV2.thresholdComparison}
            />
          </section>

          <section className="grid grid-2" style={{ marginBottom: 16 }}>
            <div className="card card-inner">
              <div className="metric-title" style={{ marginBottom: 10 }}>
                Current Accuracy by Raw Signal Type
              </div>

              <table className="table">
                <thead>
                  <tr>
                    <th>Signal</th>
                    <th>Tradeable</th>
                    <th>Accuracy</th>
                    <th>Useful</th>
                    <th>Avg Edge</th>
                  </tr>
                </thead>
                <tbody>
                  {data.current.bySignal.map((row) => (
                    <tr key={row.signal}>
                      <td>{row.signal}</td>
                      <td>{row.tradeableSignals}</td>
                      <td>{row.directionalAccuracyPct}%</td>
                      <td>{row.usefulAccuracyPct}%</td>
                      <td>{pct(row.avgDirectionalEdgePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card card-inner">
              <div className="metric-title" style={{ marginBottom: 10 }}>
                V2 Accuracy by Raw Signal Type
              </div>

              <table className="table">
                <thead>
                  <tr>
                    <th>Signal</th>
                    <th>Tradeable</th>
                    <th>Accuracy</th>
                    <th>Useful</th>
                    <th>Avg Edge</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tunedV2.bySignal.map((row) => (
                    <tr key={row.signal}>
                      <td>{row.signal}</td>
                      <td>{row.tradeableSignals}</td>
                      <td>{row.directionalAccuracyPct}%</td>
                      <td>{row.usefulAccuracyPct}%</td>
                      <td>{pct(row.avgDirectionalEdgePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <RecentTable
            title="Recent Optimizer V3 Best Config Signals"
            rows={data.optimizerV3.recent}
            showReasons
          />

          <RecentTable
            title="Recent Tuned Model V2 Backtested Signals"
            rows={data.tunedV2.recent}
            showReasons
          />

          <RecentTable
            title="Recent Current Model Backtested Signals"
            rows={data.current.recent}
          />

          <div className="footer-note">
            V3 is optimizer/backtest-only. Do not wire it into the live signal engine until it
            shows a durable positive edge over more candles.
          </div>
        </>
      )}
    </>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  border: "1px solid var(--line)",
  borderRadius: 12,
  padding: "10px 12px",
  background: "rgba(15,23,42,.7)",
  color: "var(--text)"
};