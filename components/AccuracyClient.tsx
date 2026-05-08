"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Summary = {
  total: number;
  resolved: number;
  pending: number;
  correct: number;
  incorrect: number;
  flats: number;
  usefulWins: number;
  usefulLosses: number;
  accuracyPct: number;
  usefulAccuracyPct: number;
  avgDirectionalScorePct: number;
  avgWinPct: number;
  avgLossPct: number;
};

type AccuracyRow = {
  id: number;
  candle_ts: string;
  signal: string;
  confidence: number | null;
  close: number | null;
  next_close: number | null;
  result: string | null;
  probability_bullish: number | null;
  probability_bearish: number | null;
  probability_neutral: number | null;
  rsi: number | null;
  ema_9: number | null;
  ema_21: number | null;
  ema_50: number | null;
  macd_histogram: number | null;
  support: number | null;
  resistance: number | null;
  notes: string[] | null;
  move: number | null;
  movePct: number | null;
  expectedDirection: "up" | "down" | "flat";
  directionalScore: number | null;
  grade: "Strong Win" | "Small Win" | "Flat" | "Small Loss" | "Strong Loss" | "Pending";
  isResolved: boolean;
  isCorrect: boolean;
  isUsefulWin: boolean;
  isUsefulLoss: boolean;
};

type AccuracyPayload = {
  generatedAt: string;
  summary: {
    all: Summary;
    last24h: Summary;
    last7d: Summary;
    last30d: Summary;
  };
  bySignal: Array<Summary & { signal: string }>;
  byConfidence: Array<Summary & { label: string }>;
  recent: AccuracyRow[];
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

function gradeClass(grade: string) {
  if (grade.includes("Win")) return "badge green";
  if (grade.includes("Loss")) return "badge red";
  if (grade === "Pending") return "badge blue";
  return "badge";
}

function signalClass(signal: string) {
  if (signal === "Bullish") return "badge green";
  if (signal === "Bearish") return "badge red";
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
        label="Directional Accuracy"
        value={`${summary.accuracyPct}%`}
        sub={`${summary.correct} correct / ${summary.resolved} resolved`}
      />
      <MetricCard
        label="Useful Accuracy"
        value={`${summary.usefulAccuracyPct}%`}
        sub={`${summary.usefulWins} useful wins / ${summary.usefulLosses} useful losses`}
      />
      <MetricCard
        label="Avg Directional Edge"
        value={pct(summary.avgDirectionalScorePct)}
        sub="Positive means signal direction is helping"
      />
      <MetricCard
        label="Pending Signals"
        value={summary.pending}
        sub={`${summary.total} total tracked`}
      />
    </section>
  );
}

function MiniTable({
  title,
  rows,
  firstColumn
}: {
  title: string;
  rows: Array<Summary & Record<string, string | number>>;
  firstColumn: string;
}) {
  return (
    <div className="card card-inner">
      <div className="metric-title" style={{ marginBottom: 10 }}>
        {title}
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>{firstColumn}</th>
            <th>Resolved</th>
            <th>Accuracy</th>
            <th>Useful</th>
            <th>Avg Edge</th>
            <th>Pending</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const key = String(r.signal ?? r.label);
            return (
              <tr key={key}>
                <td>{key}</td>
                <td>{r.resolved}</td>
                <td>{r.accuracyPct}%</td>
                <td>{r.usefulAccuracyPct}%</td>
                <td>{pct(r.avgDirectionalScorePct)}</td>
                <td>{r.pending}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AccuracyClient() {
  const [data, setData] = useState<AccuracyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [windowKey, setWindowKey] = useState<"all" | "last24h" | "last7d" | "last30d">("all");

  async function load() {
    try {
      setError(null);

      const res = await fetch("/api/accuracy", {
        cache: "no-store"
      });

      if (!res.ok) {
        throw new Error(`Accuracy API failed: ${res.status}`);
      }

      setData(await res.json());
    } catch (e) {
      console.error("Accuracy load failed:", e);
      setError(e instanceof Error ? e.message : "Unknown accuracy error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const selectedSummary = data?.summary[windowKey];

  const recentResolved = useMemo(
    () => (data?.recent ?? []).filter((r) => r.isResolved),
    [data]
  );

  if (error) {
    return (
      <main>
        <div className="card card-inner">Error loading accuracy page: {error}</div>
      </main>
    );
  }

  if (!data || !selectedSummary) {
    return (
      <main>
        <div className="card card-inner">Loading accuracy data...</div>
      </main>
    );
  }

  return (
    <main>
      <section className="hero">
        <div className="card card-inner">
          <div className="subtle">BTC Signal Performance</div>
          <h1 className="h1">Accuracy Dashboard</h1>
          <p className="subtle">
            Measures directional correctness, useful wins/losses, confidence performance, and signal edge.
            Updated {new Date(data.generatedAt).toLocaleString()}.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
            <button className="button" onClick={() => setWindowKey("all")}>
              All
            </button>
            <button className="button" onClick={() => setWindowKey("last30d")}>
              Last 30 Days
            </button>
            <button className="button" onClick={() => setWindowKey("last7d")}>
              Last 7 Days
            </button>
            <button className="button" onClick={() => setWindowKey("last24h")}>
              Last 24 Hours
            </button>
            <button className="button" onClick={load}>
              Refresh
            </button>
            <Link className="button" href="/">
              Back to Dashboard
            </Link>
          </div>
        </div>

        <div className="card card-inner">
          <div className="metric-title">Current Window</div>
          <div className="metric-value">
            {windowKey === "all"
              ? "All Signals"
              : windowKey === "last30d"
                ? "Last 30 Days"
                : windowKey === "last7d"
                  ? "Last 7 Days"
                  : "Last 24 Hours"}
          </div>
          <p className="subtle">
            Accuracy excludes pending signals. Useful accuracy excludes flat/noise moves.
          </p>
        </div>
      </section>

      <SummaryGrid summary={selectedSummary} />

      <section className="grid grid-2" style={{ marginBottom: 16 }}>
        <MiniTable title="Accuracy by Signal Type" rows={data.bySignal} firstColumn="Signal" />
        <MiniTable title="Accuracy by Confidence Band" rows={data.byConfidence} firstColumn="Confidence" />
      </section>

      <section className="grid grid-4" style={{ marginBottom: 16 }}>
        <MetricCard
          label="Avg Useful Win"
          value={pct(selectedSummary.avgWinPct)}
          sub="Directional move in predicted direction"
        />
        <MetricCard
          label="Avg Useful Loss"
          value={pct(selectedSummary.avgLossPct)}
          sub="Directional move against prediction"
        />
        <MetricCard
          label="Flat / Noise"
          value={selectedSummary.flats}
          sub="Resolved moves under ±0.10%"
        />
        <MetricCard
          label="Resolved Signals"
          value={selectedSummary.resolved}
          sub={`${selectedSummary.pending} still pending`}
        />
      </section>

      <section className="card card-inner">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 12 }}>
          <div>
            <div className="metric-title">Recent Resolved Signals</div>
            <div className="metric-value">Last {recentResolved.slice(0, 50).length}</div>
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Hour</th>
              <th>Signal</th>
              <th>Confidence</th>
              <th>Close</th>
              <th>Next Close</th>
              <th>Move</th>
              <th>Directional Edge</th>
              <th>Grade</th>
            </tr>
          </thead>
          <tbody>
            {recentResolved.slice(0, 50).map((row) => (
              <tr key={row.id}>
                <td>{timeLabel(row.candle_ts)}</td>
                <td>
                  <span className={signalClass(row.signal)}>{row.signal}</span>
                </td>
                <td>{row.confidence ?? 0}%</td>
                <td>{money(row.close)}</td>
                <td>{money(row.next_close)}</td>
                <td>{pct(row.movePct)}</td>
                <td>{pct(row.directionalScore)}</td>
                <td>
                  <span className={gradeClass(row.grade)}>{row.grade}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="footer-note">
          Grading uses directional movement: Strong Win ≥ 0.40%, Small Win ≥ 0.10%, Flat between
          -0.10% and +0.10%, Small Loss below -0.10%, Strong Loss below -0.40%.
        </div>
      </section>
    </main>
  );
}
