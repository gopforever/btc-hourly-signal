import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type V3VariantRow = {
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
  reasons: string[] | null;
  created_at: string;
};

function normalize(row: any): V3VariantRow {
  return {
    ...row,
    confidence: Number(row.confidence),
    close: Number(row.close),
    next_close: row.next_close == null ? null : Number(row.next_close),
    move: row.move == null ? null : Number(row.move),
    move_pct: row.move_pct == null ? null : Number(row.move_pct),
    directional_score_pct:
      row.directional_score_pct == null ? null : Number(row.directional_score_pct),
    rsi: row.rsi == null ? null : Number(row.rsi),
    ema_9: row.ema_9 == null ? null : Number(row.ema_9),
    ema_21: row.ema_21 == null ? null : Number(row.ema_21),
    ema_50: row.ema_50 == null ? null : Number(row.ema_50),
    macd_histogram:
      row.macd_histogram == null ? null : Number(row.macd_histogram),
    atr: row.atr == null ? null : Number(row.atr),
    support: row.support == null ? null : Number(row.support),
    resistance: row.resistance == null ? null : Number(row.resistance),
    reasons: Array.isArray(row.reasons) ? row.reasons : []
  };
}

function summarize(rows: V3VariantRow[]) {
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

function withinHours(rows: V3VariantRow[], hours: number) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;

  return rows.filter((r) => new Date(r.candle_ts).getTime() >= cutoff);
}

function groupByVariant(rows: V3VariantRow[]) {
  const map = new Map<string, V3VariantRow[]>();

  for (const row of rows) {
    const key = row.variant_key;

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key)!.push(row);
  }

  return Array.from(map.entries()).map(([variantKey, variantRows]) => {
    const first = variantRows[0];

    return {
      variantKey,
      variantName: first?.variant_name ?? variantKey,
      config: first?.config ?? null,
      latest: variantRows[0] ?? null,
      summary: {
        all: summarize(variantRows),
        last24h: summarize(withinHours(variantRows, 24)),
        last7d: summarize(withinHours(variantRows, 24 * 7)),
        last30d: summarize(withinHours(variantRows, 24 * 30))
      },
      recent: variantRows.slice(0, 50)
    };
  });
}

function rankVariants(
  variants: ReturnType<typeof groupByVariant>,
  windowKey: "all" | "last24h" | "last7d" | "last30d"
) {
  return variants
    .slice()
    .sort((a, b) => {
      const as = a.summary[windowKey];
      const bs = b.summary[windowKey];

      if (bs.avgDirectionalEdgePct !== as.avgDirectionalEdgePct) {
        return bs.avgDirectionalEdgePct - as.avgDirectionalEdgePct;
      }

      if (bs.usefulAccuracyPct !== as.usefulAccuracyPct) {
        return bs.usefulAccuracyPct - as.usefulAccuracyPct;
      }

      if (as.strongLosses !== bs.strongLosses) {
        return as.strongLosses - bs.strongLosses;
      }

      return bs.tradeable - as.tradeable;
    })
    .map((variant, index) => ({
      ...variant,
      rank: index + 1
    }));
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
      .from("btc_v3_shadow_variant_signals")
      .select("*")
      .order("candle_ts", { ascending: false })
      .limit(2000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []).map(normalize);
    const variants = groupByVariant(rows);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: {
        all: summarize(rows),
        last24h: summarize(withinHours(rows, 24)),
        last7d: summarize(withinHours(rows, 24 * 7)),
        last30d: summarize(withinHours(rows, 24 * 30))
      },
      variants: {
        all: rankVariants(variants, "all"),
        last24h: rankVariants(variants, "last24h"),
        last7d: rankVariants(variants, "last7d"),
        last30d: rankVariants(variants, "last30d")
      },
      recent: rows.slice(0, 100)
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Unknown V3 variant API error"
      },
      { status: 500 }
    );
  }
}