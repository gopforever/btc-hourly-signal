"use client";

import { useEffect, useMemo, useState } from "react";
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
  variant_key: string;
  variant_name: string;
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

type VariantGroup = {
  rank: number;
  variantKey: string;
  variantName: string;
  config: any;
  latest: V3Row | null;
  summary: {
    all: Summary;
    last24h: Summary;
    last7d: Summary;
    last30d: Summary;
  };
  recent: V3Row[];
};

type Payload = {
  generatedAt: string;
  summary: {
    all: Summary;
    last24h: Summary;
    last7d: Summary;
    last30d: Summary;
  };
  variants: {
    all: VariantGroup[];
    last24h: VariantGroup[];
    last7d: VariantGroup[];
    last30d: VariantGroup[];
  };
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

function ConfigText({ config }: { config: any }) {
  if (!config) return <span className="subtle">—</span>;

  return (
    <span className="subtle">
      Conf {config.minConfidence}% · EMA {config.emaSpreadMinPct}% · Bull RSI{" "}
      {config.bullishRsiMin}+ · Bear RSI ≤{config.bearishRsiMax} · MACD{" "}
      {config.macdMode}
    </span>
  );
}

export function V3ShadowClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [windowKey, setWindowKey] =
    useState<"all" | "last24h" | "last7d" | "last30d">("all");
  const [selectedVariant, setSelectedVariant] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/v3-shadow/variants", {
        cache: "no-store"
      });

      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload?.error ?? `V3 variant API failed: ${res.status}`);
      }

      setData(payload);
    } catch (e) {
      console.error("V3 variants load failed:", e);
      setError(e instanceof Error ? e.message : "Unknown V3 variant error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const variants = data?.variants[windowKey] ?? [];
  const selectedSummary = data?.summary[windowKey];

  const bestVariant = variants[0] ?? null;

  const tableRows = useMemo(() => {
    if (!data) return [];

    if (selectedVariant === "all") {
      return data.recent;
    }

    return data.recent.filter((row) => row.variant_key === selectedVariant);
  }, [data, selectedVariant]);

  if (error) {
    return <section className="card card-inner">Error loading V3 variants page: {error}</section>;
  }

  if (!data || !selectedSummary) {
    return <section className="card card-inner">Loading V3 variant data...</section>;
  }

  return (
    <>
      <section className="hero">
        <div className="card card-inner">
          <div className="subtle">Forward Validation</div>
          <h1 className="h1">V3 Shadow Variants</h1>
          <p className="subtle">
            Tracks multiple V3 confidence variants forward in time so we can prove which
            threshold is best before trusting it.
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
          <div className="metric-title">Best Forward Variant</div>
          {bestVariant ? (
            <>
              <div className="metric-value" style={{ fontSize: 26 }}>
                #{bestVariant.rank} {bestVariant.variantName}
              </div>
              <p className="subtle">
                Useful {bestVariant.summary[windowKey].usefulAccuracyPct}% · Edge{" "}
                {pct(bestVariant.summary[windowKey].avgDirectionalEdgePct)} · Tradeable{" "}
                {bestVariant.summary[windowKey].tradeable} · Strong Losses{" "}
                {bestVariant.summary[windowKey].strongLosses}
              </p>
              <ConfigText config={bestVariant.config} />
            </>
          ) : (
            <p className="subtle">No variant data yet. Run hourly ingest once.</p>
          )}
        </div>
      </section>

      <SummaryGrid summary={selectedSummary} />

      <section className="grid grid-4" style={{ marginBottom: 16 }}>
        <MetricCard
          label="Resolved"
          value={selectedSummary.resolved}
          sub={`${selectedSummary.pending} pending`}
        />
        <MetricCard
          label="Tradeable"
          value={selectedSummary.tradeable}
          sub={`${selectedSummary.noTrade} no-trade filtered`}
        />
        <MetricCard
          label="Strong Wins"
          value={selectedSummary.strongWins}
          sub={`${selectedSummary.smallWins} small wins`}
        />
        <MetricCard
          label="Flat / Noise"
          value={selectedSummary.flat}
          sub="Tradeable but below useful move threshold"
        />
      </section>

      <section className="card card-inner" style={{ marginBottom: 16 }}>
        <div className="metric-title" style={{ marginBottom: 10 }}>
          Forward Accuracy by Variant
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Variant</th>
              <th>Config</th>
              <th>Resolved</th>
              <th>Tradeable</th>
              <th>No Trade</th>
              <th>Useful</th>
              <th>Directional</th>
              <th>Avg Edge</th>
              <th>Strong Loss</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((variant) => {
              const s = variant.summary[windowKey];

              return (
                <tr key={variant.variantKey}>
                  <td>#{variant.rank}</td>
                  <td>
                    <button
                      className="button"
                      onClick={() => setSelectedVariant(variant.variantKey)}
                    >
                      {variant.variantName}
                    </button>
                  </td>
                  <td>
                    <ConfigText config={variant.config} />
                  </td>
                  <td>{s.resolved}</td>
                  <td>{s.tradeable}</td>
                  <td>{s.noTrade}</td>
                  <td>{s.usefulAccuracyPct}%</td>
                  <td>{s.directionalAccuracyPct}%</td>
                  <td>{pct(s.avgDirectionalEdgePct)}</td>
                  <td>{s.strongLosses}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="footer-note">
          Click a variant name to filter the recent signal table below.
        </div>
      </section>

      <section className="card card-inner">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 12 }}>
          <div>
            <div className="metric-title">Recent V3 Variant Signals</div>
            <div className="metric-value">
              {selectedVariant === "all" ? "All Variants" : selectedVariant}
            </div>
          </div>

          {selectedVariant !== "all" ? (
            <button className="button" onClick={() => setSelectedVariant("all")}>
              Show All
            </button>
          ) : null}
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Hour</th>
              <th>Variant</th>
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
            {tableRows.slice(0, 120).map((row) => (
              <tr key={`${row.id}-${row.variant_key}`}>
                <td>{timeLabel(row.candle_ts)}</td>
                <td>{row.variant_name}</td>
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
          V3 variants are forward-validation only. Do not use them for Robinhood or trade
          automation until a larger sample proves positive edge.
        </div>
      </section>
    </>
  );
}