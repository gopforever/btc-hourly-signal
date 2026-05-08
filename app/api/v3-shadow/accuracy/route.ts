import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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
  reasons: string[] | null;
  created_at: string;
};

function summarize(rows: V3Row[]) {
  const resolved = rows.filter((r) => r.result !== "Pending");
  const pending = rows.filter((r) => r.result === "Pending");
  const tradeable = resolved.filter((r) => r.is_tradeable);
  const noTrade = resolved.filter((r) => !r.is_tradeable || r.result === "No Trade");

  const correct = tradeable.filter((r) => r.result === "Correct");
  const incorrect = tradeable.filter((r) => r.result === "Incorrect");
  const flat = tradeable.filter((r) => r.result === "Flat" || r.grade === "Flat");

  const usefulWins = tradeable.filter(
    (r) => r.grade === "Strong Win" || r.grade === "Small Win"
  );

  const usefulLosses = tradeable.filter(
    (r) => r.grade === "Strong Loss" || r.grade === "Small Loss"
  );

  const strongWins = tradeable.filter((r) => r.grade === "Strong Win");
  const strongLosses = tradeable.filter((r) => r.grade === "Strong Loss");
  const smallWins = tradeable.filter((r) => r.grade === "Small Win");
  const smallLosses = tradeable.filter((r) => r.grade === "Small Loss");

  const avg = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

  const edgeValues = tradeable
    .map((r) => r.directional_score_pct)
    .filter((v): v is number => typeof v === "number");

  const usefulResolved = usefulWins.length + usefulLosses.length;

  return {
    total: rows.length,
    resolved: resolved.length,
    pending: pending.length,
    tradeable: tradeable.length,
    noTrade: noTrade.length,

    correct: correct.length,
    incorrect: incorrect.length,
    flat: flat.length,

    usefulWins: usefulWins.length,
    usefulLosses: usefulLosses.length,
    strongWins: strongWins.length,
    strongLosses: strongLosses.length,
    smallWins: smallWins.length,
    smallLosses: smallLosses.length,

    directionalAccuracyPct: tradeable.length
      ? Math.round((correct.length / tradeable.length) * 100)
      : 0,

    usefulAccuracyPct: usefulResolved
      ? Math.round((usefulWins.length / usefulResolved) * 100)
      : 0,

    avgDirectionalEdgePct: Number(avg(edgeValues).toFixed(3))
  };
}

function withinHours(rows: V3Row[], hours: number) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;

  return rows.filter((r) => new Date(r.candle_ts).getTime() >= cutoff);
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase admin client is not configured." },
        { status: 500 }
      );
    }

    const { data, error } = await supabase
      .from("btc_v3_shadow_signals")
      .select("*")
      .order("candle_ts", { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows: V3Row[] = (data ?? []).map((r: any) => ({
      ...r,
      confidence: Number(r.confidence),
      close: Number(r.close),
      next_close: r.next_close == null ? null : Number(r.next_close),
      move: r.move == null ? null : Number(r.move),
      move_pct: r.move_pct == null ? null : Number(r.move_pct),
      directional_score_pct:
        r.directional_score_pct == null ? null : Number(r.directional_score_pct),
      rsi: r.rsi == null ? null : Number(r.rsi),
      ema_9: r.ema_9 == null ? null : Number(r.ema_9),
      ema_21: r.ema_21 == null ? null : Number(r.ema_21),
      ema_50: r.ema_50 == null ? null : Number(r.ema_50),
      macd_histogram:
        r.macd_histogram == null ? null : Number(r.macd_histogram),
      atr: r.atr == null ? null : Number(r.atr),
      support: r.support == null ? null : Number(r.support),
      resistance: r.resistance == null ? null : Number(r.resistance),
      reasons: Array.isArray(r.reasons) ? r.reasons : []
    }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: {
        all: summarize(rows),
        last24h: summarize(withinHours(rows, 24)),
        last7d: summarize(withinHours(rows, 24 * 7)),
        last30d: summarize(withinHours(rows, 24 * 30))
      },
      latest: rows[0] ?? null,
      recent: rows.slice(0, 100)
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Unknown V3 shadow accuracy error"
      },
      { status: 500 }
    );
  }
}