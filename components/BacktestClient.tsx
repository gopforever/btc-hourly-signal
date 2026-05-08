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
  summary: Summary;
  bySignal: Array<Summary & { signal: string }>;
  thresholdComparison: Array<Summary & { threshold: number }>;
  bestThreshold: (Summary & { threshold: number }) | null;
  recent: BacktestRow[];
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

function SummaryGrid({ summary }: { summary: Summary }) {
  return (
    <section className="grid grid-4" style={{ marginBottom: 16 }}>
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
    if (!data?.bestThreshold) return "Collect more resolved candles before tuning.";

    const best = data.bestThreshold;

    return `Best tested threshold: ${best.threshold}% confidence. Useful accuracy ${best.usefulAccuracyPct}%, average edge ${pct(
      best.avgDirectionalEdgePct
    )}, tradeable signals ${best.tradeableSignals}.`;
  }, [data]);

  return (
    <>
      <section className="hero">
        <div className="card card-inner">
          <div className="subtle">Historical Simulation</div>
          <h1 className="h1">Backtest + Tuning Dashboard</h1>
          <p className="subtle">
            Simulates the current signal engine over stored BTC hourly candles, then compares confidence thresholds
            so we can tune for fewer but higher-quality signals.
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
            Tune by confidence
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
          <SummaryGrid summary={data.summary} />

          <section className="grid grid-4" style={{ marginBottom: 16 }}>
            <MetricCard
              label="Candles Loaded"
              value={data.config.candleCount}
              sub={`${data.config.testedPeriods} backtested signal periods`}
            />
            <MetricCard
              label="Strong Wins"
              value={data.summary.strongWins}
              sub={`${data.summary.smallWins} small wins`}
            />
            <MetricCard
              label="Strong Losses"
              value={data.summary.strongLosses}
              sub={`${data.summary.smallLosses} small losses`}
            />
            <MetricCard
              label="Flat / Noise"
              value={data.summary.flat}
              sub={`Move under ±${data.config.minUsefulMovePct}%`}
            />
          </section>

          <section className="grid grid-2" style={{ marginBottom: 16 }}>
            <div className="card card-inner">
              <div className="metric-title" style={{ marginBottom: 10 }}>
                Confidence Threshold Comparison
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
                  </tr>
                </thead>
                <tbody>
                  {data.thresholdComparison.map((row) => (
                    <tr key={row.threshold}>
                      <td>{row.threshold}%</td>
                      <td>{row.tradeableSignals}</td>
                      <td>{row.noTradeSignals}</td>
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
                Accuracy by Raw Signal Type
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
                  {data.bySignal.map((row) => (
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

          <section className="card card-inner">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 12 }}>
              <div>
                <div className="metric-title">Recent Backtested Signals</div>
                <div className="metric-value">Last {data.recent.length}</div>
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
                </tr>
              </thead>
              <tbody>
                {data.recent.slice(0, 60).map((row) => (
                  <tr key={`${row.candle_ts}-${row.next_ts}`}>
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
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="footer-note">
              Backtest is historical simulation using your stored hourly candles. It is not proof of future performance.
              The goal is to identify thresholds that reduce bad signals and increase positive directional edge.
            </div>
          </section>
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