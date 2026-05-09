import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchCoinbaseHourlyCandles } from "@/lib/marketData";
import { generateSignal, scorePriorSignal } from "@/lib/indicators";
import {
  generateV3ShadowSignal,
  generateV3ShadowVariants,
  scoreV3ShadowSignal,
  V3_SHADOW_CONFIG,
  type V3ShadowSignal,
  type V3VariantShadowSignal
} from "@/lib/v3Shadow";
import type { Candle, Signal } from "@/lib/types";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;

  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

function toCandle(r: any): Candle {
  return {
    ts: r.ts,
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume ?? 0),
    source: r.source
  };
}

function toSignalRow(signal: Signal) {
  return {
    candle_ts: signal.candle_ts,
    signal: signal.signal,
    bullish_score: signal.bullish_score,
    bearish_score: signal.bearish_score,
    confidence: signal.confidence,
    probability_bullish: signal.probability_bullish,
    probability_bearish: signal.probability_bearish,
    probability_neutral: signal.probability_neutral,
    close: signal.close,
    result: "Pending",
    rsi: signal.rsi,
    ema_9: signal.ema_9,
    ema_21: signal.ema_21,
    ema_50: signal.ema_50,
    macd: signal.macd,
    macd_signal: signal.macd_signal,
    macd_histogram: signal.macd_histogram,
    bb_upper: signal.bb_upper,
    bb_middle: signal.bb_middle,
    bb_lower: signal.bb_lower,
    atr: signal.atr,
    support: signal.support,
    resistance: signal.resistance,
    notes: signal.notes
  };
}

function toV3Row(v3: V3ShadowSignal) {
  return {
    candle_ts: v3.candle_ts,
    raw_signal: v3.raw_signal,
    effective_signal: v3.effective_signal,
    is_tradeable: v3.is_tradeable,
    confidence: v3.confidence,
    close: v3.close,
    next_close: v3.next_close ?? null,
    result: v3.result,
    grade: v3.grade,
    move: v3.move ?? null,
    move_pct: v3.move_pct ?? null,
    directional_score_pct: v3.directional_score_pct ?? null,
    rsi: v3.rsi ?? null,
    ema_9: v3.ema_9 ?? null,
    ema_21: v3.ema_21 ?? null,
    ema_50: v3.ema_50 ?? null,
    macd_histogram: v3.macd_histogram ?? null,
    atr: v3.atr ?? null,
    support: v3.support ?? null,
    resistance: v3.resistance ?? null,
    config: v3.config,
    reasons: v3.reasons
  };
}

function toV3VariantRow(v3: V3VariantShadowSignal) {
  return {
    candle_ts: v3.candle_ts,
    variant_key: v3.variant_key,
    variant_name: v3.variant_name,
    raw_signal: v3.raw_signal,
    effective_signal: v3.effective_signal,
    is_tradeable: v3.is_tradeable,
    confidence: v3.confidence,
    close: v3.close,
    next_close: v3.next_close ?? null,
    result: v3.result,
    grade: v3.grade,
    move: v3.move ?? null,
    move_pct: v3.move_pct ?? null,
    directional_score_pct: v3.directional_score_pct ?? null,
    rsi: v3.rsi ?? null,
    ema_9: v3.ema_9 ?? null,
    ema_21: v3.ema_21 ?? null,
    ema_50: v3.ema_50 ?? null,
    macd_histogram: v3.macd_histogram ?? null,
    atr: v3.atr ?? null,
    support: v3.support ?? null,
    resistance: v3.resistance ?? null,
    config: v3.config,
    reasons: v3.reasons
  };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase env vars are not configured." },
      { status: 500 }
    );
  }

  const fetched = await fetchCoinbaseHourlyCandles(240);

  const rows = fetched.map((c) => ({
    ts: c.ts,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
    source: "coinbase"
  }));

  const { error: upsertError } = await supabase
    .from("btc_hourly_candles")
    .upsert(rows, { onConflict: "ts" });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const { data: candleRows, error: candleError } = await supabase
    .from("btc_hourly_candles")
    .select("ts,open,high,low,close,volume,source")
    .order("ts", { ascending: false })
    .limit(240);

  if (candleError) {
    return NextResponse.json({ error: candleError.message }, { status: 500 });
  }

  const candles: Candle[] = (candleRows ?? []).map(toCandle).reverse();

  const signal = generateSignal(candles);

  if (!signal) {
    return NextResponse.json({
      insertedCandles: rows.length,
      signal: null,
      v3Shadow: null,
      v3Variants: []
    });
  }

  const { data: pendingRows } = await supabase
    .from("btc_hourly_signals")
    .select("*")
    .eq("result", "Pending")
    .order("candle_ts", { ascending: true })
    .limit(50);

  const currentUpdates = [];

  for (const pending of pendingRows ?? []) {
    const next = candles.find(
      (c) => new Date(c.ts).getTime() > new Date(pending.candle_ts).getTime()
    );

    if (!next) continue;

    const ps: Signal = {
      ...pending,
      close: Number(pending.close),
      notes: Array.isArray(pending.notes) ? pending.notes : []
    };

    currentUpdates.push(
      supabase
        .from("btc_hourly_signals")
        .update({
          next_close: next.close,
          result: scorePriorSignal(ps, next.close)
        })
        .eq("candle_ts", pending.candle_ts)
    );
  }

  await Promise.all(currentUpdates);

  const { data: pendingV3Rows } = await supabase
    .from("btc_v3_shadow_signals")
    .select("*")
    .eq("result", "Pending")
    .order("candle_ts", { ascending: true })
    .limit(100);

  const v3Updates = [];

  for (const pending of pendingV3Rows ?? []) {
    const next = candles.find(
      (c) => new Date(c.ts).getTime() > new Date(pending.candle_ts).getTime()
    );

    if (!next) continue;

    const scored = scoreV3ShadowSignal(
      {
        effective_signal: pending.effective_signal,
        is_tradeable: Boolean(pending.is_tradeable),
        close: Number(pending.close),
        config: pending.config ?? V3_SHADOW_CONFIG
      },
      next.close
    );

    v3Updates.push(
      supabase
        .from("btc_v3_shadow_signals")
        .update(scored)
        .eq("candle_ts", pending.candle_ts)
    );
  }

  await Promise.all(v3Updates);

  const { data: pendingVariantRows } = await supabase
    .from("btc_v3_shadow_variant_signals")
    .select("*")
    .eq("result", "Pending")
    .order("candle_ts", { ascending: true })
    .limit(400);

  const variantUpdates = [];

  for (const pending of pendingVariantRows ?? []) {
    const next = candles.find(
      (c) => new Date(c.ts).getTime() > new Date(pending.candle_ts).getTime()
    );

    if (!next) continue;

    const scored = scoreV3ShadowSignal(
      {
        effective_signal: pending.effective_signal,
        is_tradeable: Boolean(pending.is_tradeable),
        close: Number(pending.close),
        config: pending.config ?? V3_SHADOW_CONFIG
      },
      next.close
    );

    variantUpdates.push(
      supabase
        .from("btc_v3_shadow_variant_signals")
        .update(scored)
        .eq("candle_ts", pending.candle_ts)
        .eq("variant_key", pending.variant_key)
    );
  }

  await Promise.all(variantUpdates);

  const { error: signalError } = await supabase
    .from("btc_hourly_signals")
    .upsert(toSignalRow(signal), { onConflict: "candle_ts" });

  if (signalError) {
    return NextResponse.json({ error: signalError.message }, { status: 500 });
  }

  const v3Shadow = generateV3ShadowSignal(signal, candles);

  const { error: v3Error } = await supabase
    .from("btc_v3_shadow_signals")
    .upsert(toV3Row(v3Shadow), { onConflict: "candle_ts" });

  if (v3Error) {
    return NextResponse.json({ error: v3Error.message }, { status: 500 });
  }

  const v3Variants = generateV3ShadowVariants(signal, candles);

  const { error: variantError } = await supabase
    .from("btc_v3_shadow_variant_signals")
    .upsert(v3Variants.map(toV3VariantRow), {
      onConflict: "candle_ts,variant_key"
    });

  if (variantError) {
    return NextResponse.json({ error: variantError.message }, { status: 500 });
  }

  return NextResponse.json({
    insertedCandles: rows.length,
    updatedPendingSignals: currentUpdates.length,
    updatedPendingV3ShadowSignals: v3Updates.length,
    updatedPendingV3VariantSignals: variantUpdates.length,
    signal,
    v3Shadow,
    v3Variants
  });
}