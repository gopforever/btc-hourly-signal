import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { generateSignal } from "@/lib/indicators";
import type { Candle, Signal } from "@/lib/types";

type BacktestGrade =
  | "Strong Win"
  | "Small Win"
  | "Flat"
  | "Small Loss"
  | "Strong Loss"
  | "No Trade";

type BacktestRow = {
  candle_ts: string;
  next_ts: string;
  signal: Signal["signal"];
  effectiveSignal: Signal["signal"] | "No Trade";
  confidence: number;
  close: number;
  next_close: number;
  move: number;
  movePct: number;
  expectedDirection: "up" | "down" | "flat" | "none";
  directionalScorePct: number;
  grade: BacktestGrade;
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

const round = (value: number, digits = 3) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;

function expectedDirection(signal: string): "up" | "down" | "flat" {
  const s = signal.toLowerCase();
  if (s.includes("bull")) return "up";
  if (s.includes("bear")) return "down";
  return "flat";
}

function applyTradeFilter(signal: Signal, minConfidence: number) {
  if (signal.signal === "Neutral") return "No Trade";
  if (signal.confidence < minConfidence) return "No Trade";
  return signal.signal;
}

function gradeBacktestSignal(
  signal: Signal,
  next: Candle,
  minConfidence: number,
  minUsefulMovePct: number,
  strongMovePct: number
): BacktestRow {
  const effectiveSignal = applyTradeFilter(signal, minConfidence);
  const move = next.close - signal.close;
  const movePct = signal.close === 0 ? 0 : (move / signal.close) * 100;

  const isTradeable = effectiveSignal !== "No Trade";

  if (!isTradeable) {
    return {
      candle_ts: signal.candle_ts,
      next_ts: next.ts,
      signal: signal.signal,
      effectiveSignal,
      confidence: signal.confidence,
      close: signal.close,
      next_close: next.close,
      move,
      movePct: round(movePct),
      expectedDirection: "none",
      directionalScorePct: 0,
      grade: "No Trade",
      isTradeable: false,
      isCorrect: false,
      isUsefulWin: false,
      isUsefulLoss: false,
      rsi: signal.rsi,
      ema_9: signal.ema_9,
      ema_21: signal.ema_21,
      ema_50: signal.ema_50,
      macd_histogram: signal.macd_histogram,
      support: signal.support,
      resistance: signal.resistance,
      notes: signal.notes ?? []
    };
  }

  const direction = expectedDirection(effectiveSignal);

  let directionalScorePct = 0;

  if (direction === "up") {
    directionalScorePct = movePct;
  } else if (direction === "down") {
    directionalScorePct = -movePct;
  } else {
    directionalScorePct = Math.abs(movePct) <= minUsefulMovePct ? minUsefulMovePct : -Math.abs(movePct);
  }

  let grade: BacktestGrade = "Flat";

  if (directionalScorePct >= strongMovePct) grade = "Strong Win";
  else if (directionalScorePct >= minUsefulMovePct) grade = "Small Win";
  else if (directionalScorePct > -minUsefulMovePct) grade = "Flat";
  else if (directionalScorePct > -strongMovePct) grade = "Small Loss";
  else grade = "Strong Loss";

  const isCorrect = grade === "Strong Win" || grade === "Small Win" || grade === "Flat";
  const isUsefulWin = grade === "Strong Win" || grade === "Small Win";
  const isUsefulLoss = grade === "Strong Loss" || grade === "Small Loss";

  return {
    candle_ts: signal.candle_ts,
    next_ts: next.ts,
    signal: signal.signal,
    effectiveSignal,
    confidence: signal.confidence,
    close: signal.close,
    next_close: next.close,
    move,
    movePct: round(movePct),
    expectedDirection: direction,
    directionalScorePct: round(directionalScorePct),
    grade,
    isTradeable,
    isCorrect,
    isUsefulWin,
    isUsefulLoss,
    rsi: signal.rsi,
    ema_9: signal.ema_9,
    ema_21: signal.ema_21,
    ema_50: signal.ema_50,
    macd_histogram: signal.macd_histogram,
    support: signal.support,
    resistance: signal.resistance,
    notes: signal.notes ?? []
  };
}

function summarize(rows: BacktestRow[]): Summary {
  const tradeable = rows.filter((r) => r.isTradeable);
  const noTrade = rows.filter((r) => !r.isTradeable);
  const correct = tradeable.filter((r) => r.isCorrect);
  const usefulWins = tradeable.filter((r) => r.isUsefulWin);
  const usefulLosses = tradeable.filter((r) => r.isUsefulLoss);
  const flat = tradeable.filter((r) => r.grade === "Flat");
  const strongWins = tradeable.filter((r) => r.grade === "Strong Win");
  const smallWins = tradeable.filter((r) => r.grade === "Small Win");
  const smallLosses = tradeable.filter((r) => r.grade === "Small Loss");
  const strongLosses = tradeable.filter((r) => r.grade === "Strong Loss");

  const avg = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

  const usefulResolved = usefulWins.length + usefulLosses.length;

  return {
    totalPeriods: rows.length,
    tradeableSignals: tradeable.length,
    noTradeSignals: noTrade.length,
    correct: correct.length,
    incorrect: tradeable.length - correct.length,
    usefulWins: usefulWins.length,
    usefulLosses: usefulLosses.length,
    flat: flat.length,
    strongWins: strongWins.length,
    smallWins: smallWins.length,
    smallLosses: smallLosses.length,
    strongLosses: strongLosses.length,
    directionalAccuracyPct: tradeable.length
      ? Math.round((correct.length / tradeable.length) * 100)
      : 0,
    usefulAccuracyPct: usefulResolved
      ? Math.round((usefulWins.length / usefulResolved) * 100)
      : 0,
    avgDirectionalEdgePct: round(avg(tradeable.map((r) => r.directionalScorePct))),
    avgWinPct: round(avg(usefulWins.map((r) => r.directionalScorePct))),
    avgLossPct: round(avg(usefulLosses.map((r) => r.directionalScorePct)))
  };
}

function bySignal(rows: BacktestRow[]) {
  const labels = ["Strong Bullish", "Bullish", "Bearish", "Strong Bearish", "Neutral"];

  return labels.map((signal) => {
    const group = rows.filter((r) => r.signal === signal);
    return {
      signal,
      ...summarize(group)
    };
  });
}

function thresholdComparison(
  signals: Array<{ signal: Signal; next: Candle }>,
  minUsefulMovePct: number,
  strongMovePct: number
) {
  const thresholds = [50, 55, 60, 65, 70, 75, 80, 85];

  return thresholds.map((threshold) => {
    const rows = signals.map(({ signal, next }) =>
      gradeBacktestSignal(signal, next, threshold, minUsefulMovePct, strongMovePct)
    );

    return {
      threshold,
      ...summarize(rows)
    };
  });
}

function pickBestThreshold(
  rows: ReturnType<typeof thresholdComparison>
) {
  const candidates = rows.filter((r) => r.tradeableSignals >= 10);

  if (!candidates.length) {
    return rows[0] ?? null;
  }

  return candidates
    .slice()
    .sort((a, b) => {
      if (b.usefulAccuracyPct !== a.usefulAccuracyPct) {
        return b.usefulAccuracyPct - a.usefulAccuracyPct;
      }

      if (b.avgDirectionalEdgePct !== a.avgDirectionalEdgePct) {
        return b.avgDirectionalEdgePct - a.avgDirectionalEdgePct;
      }

      return b.tradeableSignals - a.tradeableSignals;
    })[0];
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase admin client is not configured." },
        { status: 500 }
      );
    }

    const url = new URL(req.url);

    const limit = Number(url.searchParams.get("limit") ?? 500);
    const minConfidence = Number(url.searchParams.get("minConfidence") ?? 70);
    const minUsefulMovePct = Number(url.searchParams.get("minMovePct") ?? 0.1);
    const strongMovePct = Number(url.searchParams.get("strongMovePct") ?? 0.4);

    const safeLimit = Math.min(Math.max(limit, 80), 2000);
    const safeMinConfidence = Math.min(Math.max(minConfidence, 0), 100);
    const safeMinUsefulMovePct = Math.min(Math.max(minUsefulMovePct, 0.01), 5);
    const safeStrongMovePct = Math.min(Math.max(strongMovePct, safeMinUsefulMovePct), 10);

    const { data, error } = await supabase
      .from("btc_hourly_candles")
      .select("ts,open,high,low,close,volume,source")
      .order("ts", { ascending: false })
      .limit(safeLimit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const candles: Candle[] = (data ?? [])
      .map((r) => ({
        ts: String(r.ts),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: Number(r.volume ?? 0),
        source: String(r.source ?? "coinbase")
      }))
      .reverse();

    if (candles.length < 80) {
      return NextResponse.json({
        error: "Not enough candles for backtesting. Run hourly ingest until you have at least 80 candles.",
        candleCount: candles.length
      }, { status: 400 });
    }

    const signalPairs: Array<{ signal: Signal; next: Candle }> = [];

    for (let i = 50; i < candles.length - 1; i++) {
      const start = Math.max(0, i - 239);
      const history = candles.slice(start, i + 1);
      const signal = generateSignal(history);
      const next = candles[i + 1];

      if (signal) {
        signalPairs.push({ signal, next });
      }
    }

    const rows = signalPairs.map(({ signal, next }) =>
      gradeBacktestSignal(
        signal,
        next,
        safeMinConfidence,
        safeMinUsefulMovePct,
        safeStrongMovePct
      )
    );

    const thresholdRows = thresholdComparison(
      signalPairs,
      safeMinUsefulMovePct,
      safeStrongMovePct
    );

    const bestThreshold = pickBestThreshold(thresholdRows);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      config: {
        limit: safeLimit,
        minConfidence: safeMinConfidence,
        minUsefulMovePct: safeMinUsefulMovePct,
        strongMovePct: safeStrongMovePct,
        candleCount: candles.length,
        testedPeriods: rows.length
      },
      summary: summarize(rows),
      bySignal: bySignal(rows),
      thresholdComparison: thresholdRows,
      bestThreshold,
      recent: rows.slice().reverse().slice(0, 100)
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Unknown backtest API error"
      },
      { status: 500 }
    );
  }
}