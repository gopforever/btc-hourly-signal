"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine
} from "recharts";
import { Activity, Target, TrendingDown, TrendingUp } from "lucide-react";
import type { DashboardPayload } from "@/lib/types";
import { SignalBadge } from "./SignalBadge";

const money = (v?: number | null) =>
  v == null || Number.isNaN(v)
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      }).format(v);

const pct = (v?: number | null) =>
  v == null || Number.isNaN(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric"
  });

const fullTimeLabel = (iso?: string | null) =>
  !iso
    ? "—"
    : new Date(iso).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });

const minutesBetween = (from: Date, to: Date) =>
  Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

function metric(label: string, value: string, icon: React.ReactNode) {
  return (
    <div className="card card-inner">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="metric-title">{label}</div>
          <div className="metric-value">{value}</div>
        </div>
        <div className="badge blue">{icon}</div>
      </div>
    </div>
  );
}

function Probability({
  label,
  value,
  color
}: {
  label: string;
  value?: number | null;
  color: string;
}) {
  return (
    <div className="prob-row" style={{ color }}>
      <span>{label}</span>
      <span className="bar">
        <span style={{ width: `${value ?? 0}%` }} />
      </span>
      <strong>{value ?? 0}%</strong>
    </div>
  );
}

export function DashboardClient() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);
  const [isIngesting, setIsIngesting] = useState(false);

  async function load() {
    try {
      setError(null);

      const res = await fetch("/api/dashboard", {
        cache: "no-store"
      });

      if (!res.ok) {
        throw new Error(`Dashboard API failed: ${res.status}`);
      }

      setData(await res.json());
    } catch (e) {
      console.error("Dashboard load failed:", e);
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function runIngestNow() {
    try {
      setIsIngesting(true);
      setIngestStatus("Running BTC ingest...");

      let secret = window.localStorage.getItem("btc_cron_secret") ?? "";

      if (!secret) {
        const entered = window.prompt(
          "Enter your CRON_SECRET from .env.local. It will be saved in this browser only."
        );

        if (!entered) {
          setIngestStatus("Ingest cancelled.");
          return;
        }

        secret = entered.trim();
        window.localStorage.setItem("btc_cron_secret", secret);
      }

      const res = await fetch("/api/ingest/hourly", {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${secret}`
        }
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 401) {
          window.localStorage.removeItem("btc_cron_secret");
          throw new Error("Unauthorized. Saved CRON_SECRET was cleared. Try again.");
        }

        throw new Error(payload?.error ?? `Ingest failed: ${res.status}`);
      }

      setIngestStatus(
        `Ingest complete. Candles processed: ${payload?.insertedCandles ?? "unknown"}. Latest signal: ${payload?.signal?.signal ?? "none"}.`
      );

      await load();
    } catch (e) {
      console.error("Manual ingest failed:", e);
      setIngestStatus(e instanceof Error ? e.message : "Manual ingest failed.");
    } finally {
      setIsIngesting(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  const chartData = useMemo(
    () =>
      (data?.candles ?? []).slice(-96).map((c) => ({
        ...c,
        label: timeLabel(c.ts),
        close: Number(c.close.toFixed(2))
      })),
    [data]
  );

  if (error) {
    return <div className="card card-inner">Error loading dashboard: {error}</div>;
  }

  if (!data) {
    return <div className="card card-inner">Loading BTC signal data...</div>;
  }

const s = data.latestSignal;
const latestCandle = data.candles.at(-1);
const latestClose = latestCandle?.close ?? data.livePrice;

const latestCandleTime = latestCandle?.ts ? new Date(latestCandle.ts) : null;
const nextCandleDue = latestCandleTime
  ? new Date(latestCandleTime.getTime() + 60 * 60 * 1000)
  : null;

const now = new Date(data.generatedAt);
const signalAgeMinutes = s?.candle_ts
  ? minutesBetween(new Date(s.candle_ts), now)
  : null;

const nextCandleMinutes = nextCandleDue
  ? Math.max(0, minutesBetween(now, nextCandleDue))
  : null;

  return (
    <>
      <section className="hero">
        <div className="card card-inner">
          <div className="subtle">Live BTC/USD</div>
          <h1 className="h1">Hourly BTC signal dashboard</h1>
          <div className="price">{money(data.livePrice ?? latestClose)}</div>
          <p className="subtle">
            24h change: {pct(data.liveChange24h)} · Updated{" "}
            {new Date(data.generatedAt).toLocaleString()}
            {data.usingDemoData
              ? " · Demo/live fallback mode until Supabase has enough stored candles"
              : ""}
          </p>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: 18
            }}
          >
            <button
              className="button"
              onClick={runIngestNow}
              disabled={isIngesting}
              style={{ cursor: isIngesting ? "not-allowed" : "pointer" }}
            >
              {isIngesting ? "Running Ingest..." : "Run Ingest Now"}
            </button>

            <button className="button" onClick={load}>
              Refresh Dashboard
            </button>

            {ingestStatus ? <span className="subtle">{ingestStatus}</span> : null}
          </div>
        </div>

        <div className="card card-inner">
          <div className="metric-title">Next Hour Bias</div>
          <div style={{ marginBottom: 14 }}>
            <SignalBadge signal={s?.signal} />
          </div>
          <div className="metric-value">Confidence {s?.confidence ?? 0}%</div>
          <p className="subtle">Close used for signal: {money(s?.close ?? latestClose)}</p>
        </div>
      </section>

      <section className="grid grid-4" style={{ marginBottom: 16 }}>
        {metric("RSI 14", s?.rsi?.toFixed(1) ?? "—", <Activity size={18} />)}
        {metric(
          "EMA 9 / EMA 21",
          `${money(s?.ema_9)} / ${money(s?.ema_21)}`,
          <TrendingUp size={18} />
        )}
        {metric("Support", money(s?.support), <Target size={18} />)}
        {metric("Resistance", money(s?.resistance), <TrendingDown size={18} />)}
      </section>

<section className="grid grid-4" style={{ marginBottom: 16 }}>
  {metric(
    "Last Candle",
    fullTimeLabel(latestCandle?.ts),
    <Activity size={18} />
  )}

  {metric(
    "Next Candle Due",
    nextCandleDue ? fullTimeLabel(nextCandleDue.toISOString()) : "—",
    <Target size={18} />
  )}

  {metric(
    "Signal Age",
    signalAgeMinutes == null ? "—" : formatDuration(signalAgeMinutes),
    <TrendingUp size={18} />
  )}

  {metric(
    "Time Until Next Candle",
    nextCandleMinutes == null ? "—" : formatDuration(nextCandleMinutes),
    <TrendingDown size={18} />
  )}
</section>

      <section className="grid grid-2">
        <div className="card card-inner">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14
            }}
          >
            <div>
              <div className="metric-title">BTC Hourly Close</div>
              <div className="metric-value">Last 96 hours</div>
            </div>
            <button className="button" onClick={load}>
              Refresh
            </button>
          </div>

          <div style={{ width: "100%", height: 390 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 8, right: 18, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.18)" />
                <XAxis dataKey="label" minTickGap={34} stroke="#94a3b8" fontSize={12} />
                <YAxis
                  domain={["auto", "auto"]}
                  stroke="#94a3b8"
                  fontSize={12}
                  tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid rgba(148,163,184,.25)",
                    borderRadius: 12
                  }}
                  formatter={(v) => money(Number(v))}
                />
                {s?.support ? (
                  <ReferenceLine
                    y={s.support}
                    stroke="rgba(34,197,94,.5)"
                    strokeDasharray="4 4"
                  />
                ) : null}
                {s?.resistance ? (
                  <ReferenceLine
                    y={s.resistance}
                    stroke="rgba(239,68,68,.5)"
                    strokeDasharray="4 4"
                  />
                ) : null}
                <Line type="monotone" dataKey="close" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card card-inner">
          <div className="metric-title">Probability Estimate</div>
          <div className="metric-value" style={{ marginBottom: 14 }}>
            {s ? s.signal : "Not enough candles"}
          </div>

          <Probability label="Bullish" value={s?.probability_bullish} color="var(--green)" />
          <Probability label="Bearish" value={s?.probability_bearish} color="var(--red)" />
          <Probability label="Neutral" value={s?.probability_neutral} color="var(--blue)" />

          <hr style={{ borderColor: "var(--line)", margin: "22px 0" }} />

          <div className="metric-title">Signal Reasons</div>
          <ul className="reasons">
            {(s?.notes ?? ["Not enough candle history yet. Run the hourly ingest after setting up Supabase."])
              .slice(0, 8)
              .map((n, i) => (
                <li key={i}>{n}</li>
              ))}
          </ul>
        </div>
      </section>

      <section className="card card-inner" style={{ marginTop: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "center",
            marginBottom: 12
          }}
        >
          <div>
            <div className="metric-title">Recent Signals</div>
            <div className="metric-value">Accuracy: {data.accuracy.percent}%</div>
          </div>
          <a className="button" href="/accuracy">
            View Accuracy
          </a>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Hour</th>
              <th>Signal</th>
              <th>Confidence</th>
              <th>Close</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {(data.recentSignals ?? []).slice(0, 8).map((row) => (
              <tr key={row.candle_ts}>
                <td>{timeLabel(row.candle_ts)}</td>
                <td>
                  <SignalBadge signal={row.signal} />
                </td>
                <td>{row.confidence}%</td>
                <td>{money(row.close)}</td>
                <td>{row.result ?? "Pending"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="footer-note">
          Signals are directional estimates for the next hourly close. This is not financial advice.
        </div>
      </section>
    </>
  );
}