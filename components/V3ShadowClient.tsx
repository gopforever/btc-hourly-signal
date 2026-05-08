"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Summary = {
  total: number;
  resolved: number;
  pending: number;
  tradeable: number;
  noTrade: number;
  correct: number;
  incorrect: number;
  flat: number;
  usefulWins: number;
  usefulLosses: number;
  strongWins: number;
  strongLosses: number;
  smallWins: number;
  smallLosses: number;
  directionalAccuracyPct: number;
  usefulAccuracyPct: number;
  avgDirectionalEdgePct: number;
};

type V3Row = {
  id: number;
  candle_ts: string;
  raw_signal: string;
  effective_signal: string;
  is_tradeable: boolean;
  confidence: number;
  close: number;
  next_close: number | null;
  result: string;
  grade: string | null;
  move: number | null;
  move_pct: number | null;
  directional_score_pct: number | null;
  rsi: number | null;
  ema_9: number | null;
  ema_21: number | null;
  ema_50: number | null;
  macd_histogram: number | null;
  atr: number | null;
  support: number | null;
  resistance: number | null;
  config: any;
  reasons: string[];
  created_at: string;
};

type Payload = {
  generatedAt: string;
  summary: {
    all: Summary;
    last24h: Summary;
    last7d: Summary;
    last30d: Summary;
  };
  latest: V3Row | null;
  recent: V3Row[];
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

function badgeClass(value: string) {
  if (value.includes("Bullish") || value.includes("Win") || value === "Correct") {
    return "badge green";
  }

  if (value.includes("Bearish") || value.includes("Loss") || value === "Incorrect") {
    return "badge red";
  }

  if (value === "No Trade") return "badge yellow";

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
        label="Forward Useful Accuracy"
        value={`${summary.usefulAccuracyPct}%`}
        sub={`${summary.usefulWins} useful wins / ${summary.usefulLosses} useful losses`}
      />
      <MetricCard
        label="Forward Directional Accuracy"
        value={`${summary.directionalAccuracyPct}%`}
        sub={`${summary.correct} correct / ${summary.tradeable} tradeable`}
      />
      <MetricCard
        label="Avg Forward Edge"
        value={pct(summary.avgDirectionalEdgePct)}
        sub="Positive means V3 direction helped"
      />
      <MetricCard
        label="Strong Losses"
        value={summary.strongLosses}
        sub={`${summary.smallLosses} small losses`}
      />
    </section>
  );
}

export function V3ShadowClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [windowKey, setWindowKey] = useState<"all" | "last24h" | "last7d" | "last30d">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/v3-shadow/accuracy", {
        cache: "no-store"
      });

      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload?.error ?? `V3 shadow API failed: ${res.status}`);
      }

      setData(payload);
    } catch (e) {
      console.error("V3 shadow load failed:", e);
      setError(e instanceof Error ? e.message : "Unknown V3 shadow error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const selected = data?.summary[windowKey];

  if (error) {
    return <section className="card card-inner">Error loading V3 shadow page: {error}</section>;
  }

  if (!data || !selected) {
    return <section className="card card-inner">Loading V3 shadow data...</section>;
  }

  const latest = data.latest;

  return (
    <>
      <section className="hero">
        <div className="card card-inner">
          <div className="subtle">Forward Validation</div>
          <h1 className="h1">V3 Shadow Mode</h1>
          <p className="subtle">
            V3 is being tracked separately from the live model. This page measures future,
            unseen performance so we do not trust an overfit backtest.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
            <button className="button" onClick={() => setWindowKey("all")}>All</button>
            <button className="button" onClick={() => setWindowKey("last30d")}>Last 30 Days</button>
            <button className="button" onClick={() => setWindowKey("last7d")}>Last 7 Days</button>
            <button className="button" onClick={() => setWindowKey("last24h")}>Last 24 Hours</button>
            <button className="button" onClick={load} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <Link className="button" href="/backtest">Backtest</Link>
            <Link className="button" href="/">Dashboard</Link>
          </div>
        </div>

        <div className="card card-inner">
          <div className="metric-title">Latest V3 Candidate</div>
          {latest ? (
            <>
              <div style={{ margin: "10px 0" }}>
                <span className={badgeClass(latest.effective_signal)}>
                  {latest.effective_signal}
                </span>
              </div>
              <div className="metric-value">{latest.confidence}% confidence</div>
              <p className="subtle">
                Raw: {latest.raw_signal} · Close: {money(latest.close)} · Result:{" "}
                {latest.result}
              </p>
            </>
          ) : (
            <p className="subtle">No V3 shadow signals yet. Run hourly ingest once.</p>
          )}
        </div>
      </section>

      <SummaryGrid summary={selected} />

      <section className="grid grid-4" style={{ marginBottom: 16 }}>
        <MetricCard
          label="Resolved"
          value={selected.resolved}
          sub={`${selected.pending} pending`}
        />
        <MetricCard
          label="Tradeable"
          value={selected.tradeable}
          sub={`${selected.noTrade} no-trade filtered`}
        />
        <MetricCard
          label="Strong Wins"
          value={selected.strongWins}
          sub={`${selected.smallWins} small wins`}
        />
        <MetricCard
          label="Flat / Noise"
          value={selected.flat}
          sub="Tradeable but below useful move threshold"
        />
      </section>

      <section className="card card-inner">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 12 }}>
          <div>
            <div className="metric-title">Recent V3 Shadow Signals</div>
            <div className="metric-value">Last {data.recent.length}</div>
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Hour</th>
              <th>Raw</th>
              <th>V3 Effective</th>
              <th>Conf</th>
              <th>Close</th>
              <th>Next</th>
              <th>Move</th>
              <th>Edge</th>
              <th>Result</th>
              <th>Grade</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {data.recent.slice(0, 80).map((row) => (
              <tr key={row.id}>
                <td>{timeLabel(row.candle_ts)}</td>
                <td>
                  <span className={badgeClass(row.raw_signal)}>{row.raw_signal}</span>
                </td>
                <td>
                  <span className={badgeClass(row.effective_signal)}>
                    {row.effective_signal}
                  </span>
                </td>
                <td>{row.confidence}%</td>
                <td>{money(row.close)}</td>
                <td>{money(row.next_close)}</td>
                <td>{pct(row.move_pct)}</td>
                <td>{pct(row.directional_score_pct)}</td>
                <td>
                  <span className={badgeClass(row.result)}>{row.result}</span>
                </td>
                <td>
                  <span className={badgeClass(row.grade ?? "Pending")}>
                    {row.grade ?? "Pending"}
                  </span>
                </td>
                <td className="subtle">{(row.reasons ?? []).slice(0, 2).join(" ")}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="footer-note">
          V3 Shadow Mode is forward validation only. Do not use it for Robinhood or trade automation
          until it has a larger sample of resolved future signals.
        </div>
      </section>
    </>
  );
}