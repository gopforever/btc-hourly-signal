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
  model: "Current Model" | "Tuned Model V2";
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
  v2Reasons?: string[];
};

type ModelResult = {
  summary: Summary;
  bySignal: Array<Summary & { signal: string }>;
  thresholdComparison: Array<Summary & { threshold: number }>;
  bestThreshold: (Summary & { threshold: number }) | null;
  recent: BacktestRow[];
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
  };
  current: ModelResult;
  tunedV2: ModelResult;
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

const signed = (v: number, suffix = "") =>
  `${v >= 0 ? "+" : ""}${v}${suffix}`;

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

function deltaClass(value: number) {
  if (value > 0) return "badge green";
  if (value < 0) return "badge red";
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
            {showReasons ? <th>V2 Reason</th> : null}
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
                <td className="subtle">
                  {(row.v2Reasons ?? []).slice(0, 2).join(" ")}
                </td>
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
    if (!data?.tunedV2.bestThreshold) return "Collect more resolved candles before tuning.";

    const currentBest = data.current.bestThreshold;
    const tunedBest = data.tunedV2.bestThreshold;

    const currentText = currentBest
      ? `Current best: ${currentBest.threshold}% confidence, useful ${currentBest.usefulAccuracyPct}%, edge ${pct(currentBest.avgDirectionalEdgePct)}.`
      : "Current best unavailable.";

    return `${currentText} V2 best: ${tunedBest.threshold}% confidence, useful ${tunedBest.usefulAccuracyPct}%, edge ${pct(
      tunedBest.avgDirectionalEdgePct
    )}, tradeable ${tunedBest.tradeableSignals}.`;
  }, [data]);

  return (
    <>
      <section className="hero">
        <div className="card card-inner">
          <div className="subtle">Historical Simulation</div>
          <h1 className="h1">Backtest + Tuning Dashboard</h1>
          <p className="subtle">
            Compares the current hourly BTC signal engine against Tuned Model V2. V2 uses stricter trend,
            momentum, volatility, overextension, and no-trade filters.
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
              {loading ? "Running Backtest..." : "Run Backtest"}
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
            Compare V2 before live use
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
              label="Useful Accuracy Delta"
              value={signed(data.comparison.usefulAccuracyDelta, "%")}
              sub="V2 minus Current"
            />
            <MetricCard
              label="Avg Edge Delta"
              value={pct(data.comparison.avgDirectionalEdgeDelta)}
              sub="V2 minus Current"
            />
            <MetricCard
              label="Strong Loss Delta"
              value={signed(data.comparison.strongLossDelta)}
              sub="Lower is better"
            />
            <MetricCard
              label="No-Trade Delta"
              value={signed(data.comparison.noTradeDelta)}
              sub="Higher means stricter filtering"
            />
          </section>

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
              label="V2 Flat / Noise"
              value={data.tunedV2.summary.flat}
              sub={`Move under ±${data.config.minUsefulMovePct}%`}
            />
          </section>

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
            title="Recent Tuned Model V2 Backtested Signals"
            rows={data.tunedV2.recent}
            showReasons
          />

          <RecentTable
            title="Recent Current Model Backtested Signals"
            rows={data.current.recent}
          />

          <div className="footer-note">
            V2 is backtest-only right now. Do not wire it into the live signal engine until it shows a durable
            improvement over more candles.
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