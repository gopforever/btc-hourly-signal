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

type ModelName = "Current Model" | "Tuned Model V2";

type BacktestRow = {
  model: ModelName;
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
  v2Reasons?: string[];
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

type TunedSignal = Signal & {
  effectiveSignal: Signal["signal"] | "No Trade";
  v2Reasons: string[];
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

function applyTunedModelV2(signal: Signal, candles: Candle[], minConfidence: number): TunedSignal {
  const reasons: string[] = [];

  const rsi = signal.rsi ?? 50;
  const ema9 = signal.ema_9 ?? signal.close;
  const ema21 = signal.ema_21 ?? signal.close;
  const ema50 = signal.ema_50 ?? signal.close;
  const macdHist = signal.macd_histogram ?? 0;
  const close = signal.close;
  const atr = signal.atr ?? 0;

  const emaSpreadPct = close ? (Math.abs(ema9 - ema21) / close) * 100 : 0;
  const emaTrendSpreadPct = close ? (Math.abs(ema21 - ema50) / close) * 100 : 0;
  const atrPct = close ? (atr / close) * 100 : 0;

  const recent = candles.slice(-8);
  const recentRange =
    recent.length > 0
      ? Math.max(...recent.map((c) => c.high)) - Math.min(...recent.map((c) => c.low))
      : 0;
  const recentRangePct = close ? (recentRange / close) * 100 : 0;

  let effectiveSignal: Signal["signal"] | "No Trade" = applyTradeFilter(signal, minConfidence);

  if (effectiveSignal === "No Trade") {
    reasons.push(`Below confidence threshold or neutral raw signal.`);
    return { ...signal, effectiveSignal, v2Reasons: reasons };
  }

  if (emaSpreadPct < 0.08) {
    effectiveSignal = "No Trade";
    reasons.push(`EMA 9/21 spread is too tight (${round(emaSpreadPct)}%), indicating chop.`);
  }

  if (emaTrendSpreadPct < 0.10) {
    effectiveSignal = "No Trade";
    reasons.push(`EMA 21/50 spread is too tight (${round(emaTrendSpreadPct)}%), weak trend structure.`);
  }

  if (atrPct < 0.18) {
    effectiveSignal = "No Trade";
    reasons.push(`ATR is low (${round(atrPct)}%), reducing hourly movement potential.`);
  }

  if (recentRangePct < 0.35) {
    effectiveSignal = "No Trade";
    reasons.push(`Recent 8-hour range is compressed (${round(recentRangePct)}%), likely sideways action.`);
  }

  if (effectiveSignal.includes("Bullish")) {
    const bullishAgreement =
      close > ema9 &&
      ema9 > ema21 &&
      ema21 >= ema50 * 0.995 &&
      macdHist > 0 &&
      rsi >= 48 &&
      rsi <= 72;

    if (!bullishAgreement) {
      effectiveSignal = "No Trade";
      reasons.push(`Bullish setup failed V2 agreement filter.`);
    }

    if (rsi > 72) {
      effectiveSignal = "No Trade";
      reasons.push(`RSI is overextended above 72; avoiding bullish chase.`);
    }
  }

  if (effectiveSignal.includes("Bearish")) {
    const bearishAgreement =
      close < ema9 &&
      ema9 < ema21 &&
      ema21 <= ema50 * 1.005 &&
      macdHist <= 0 &&
      rsi <= 52 &&
      rsi >= 28;

    const weakBearishMomentum =
      close < ema9 &&
      ema9 < ema21 &&
      rsi <= 48 &&
      macdHist < 8;

    if (!bearishAgreement && !weakBearishMomentum) {
      effectiveSignal = "No Trade";
      reasons.push(`Bearish setup failed V2 agreement filter.`);
    }

    if (rsi < 28) {
      effectiveSignal = "No Trade";
      reasons.push(`RSI is oversold below 28; avoiding bearish chase.`);
    }
  }

  if (effectiveSignal !== "No Trade" && signal.confidence < 75) {
    effectiveSignal = "No Trade";
    reasons.push(`V2 requires at least 75% confidence for tradeable signals.`);
  }

  if (effectiveSignal !== "No Trade") {
    reasons.push(`V2 accepted: trend, momentum, volatility, and confidence filters passed.`);
  }

  return {
    ...signal,
    effectiveSignal,
    v2Reasons: reasons
  };
}

function gradeBacktestSignal(
  model: ModelName,
  signal: Signal,
  next: Candle,
  minConfidence: number,
  minUsefulMovePct: number,
  strongMovePct: number,
  effectiveOverride?: Signal["signal"] | "No Trade",
  v2Reasons?: string[]
): BacktestRow {
  const effectiveSignal =
    effectiveOverride ?? applyTradeFilter(signal, minConfidence);

  const move = next.close - signal.close;
  const movePct = signal.close === 0 ? 0 : (move / signal.close) * 100;

  const isTradeable = effectiveSignal !== "No Trade";

  if (!isTradeable) {
    return {
      model,
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
      notes: signal.notes ?? [],
      v2Reasons
    };
  }

  const direction = expectedDirection(effectiveSignal);

  let directionalScorePct = 0;

  if (direction === "up") {
    directionalScorePct = movePct;
  } else if (direction === "down") {
    directionalScorePct = -movePct;
  } else {
    directionalScorePct =
      Math.abs(movePct) <= minUsefulMovePct
        ? minUsefulMovePct
        : -Math.abs(movePct);
  }

  let grade: BacktestGrade = "Flat";

  if (directionalScorePct >= strongMovePct) grade = "Strong Win";
  else if (directionalScorePct >= minUsefulMovePct) grade = "Small Win";
  else if (directionalScorePct > -minUsefulMovePct) grade = "Flat";
  else if (directionalScorePct > -strongMovePct) grade = "Small Loss";
  else grade = "Strong Loss";

  const isCorrect =
    grade === "Strong Win" || grade === "Small Win" || grade === "Flat";
  const isUsefulWin = grade === "Strong Win" || grade === "Small Win";
  const isUsefulLoss = grade === "Strong Loss" || grade === "Small Loss";

  return {
    model,
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
    notes: signal.notes ?? [],
    v2Reasons
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
  const labels = [
    "Strong Bullish",
    "Bullish",
    "Bearish",
    "Strong Bearish",
    "Neutral"
  ];

  return labels.map((signal) => {
    const group = rows.filter((r) => r.signal === signal);
    return {
      signal,
      ...summarize(group)
    };
  });
}

function thresholdComparison(
  signals: Array<{ signal: Signal; next: Candle; history: Candle[] }>,
  minUsefulMovePct: number,
  strongMovePct: number,
  model: ModelName
) {
  const thresholds = [50, 55, 60, 65, 70, 75, 80, 85, 90];

  return thresholds.map((threshold) => {
    const rows = signals.map(({ signal, next, history }) => {
      if (model === "Tuned Model V2") {
        const tuned = applyTunedModelV2(signal, history, threshold);

        return gradeBacktestSignal(
          model,
          signal,
          next,
          threshold,
          minUsefulMovePct,
          strongMovePct,
          tuned.effectiveSignal,
          tuned.v2Reasons
        );
      }

      return gradeBacktestSignal(
        model,
        signal,
        next,
        threshold,
        minUsefulMovePct,
        strongMovePct
      );
    });

    return {
      threshold,
      ...summarize(rows)
    };
  });
}

function pickBestThreshold(rows: ReturnType<typeof thresholdComparison>) {
  const candidates = rows.filter((r) => r.tradeableSignals >= 8);

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

      if (a.strongLosses !== b.strongLosses) {
        return a.strongLosses - b.strongLosses;
      }

      return b.tradeableSignals - a.tradeableSignals;
    })[0];
}

function improvement(current: Summary, tuned: Summary) {
  return {
    tradeableSignalsDelta: tuned.tradeableSignals - current.tradeableSignals,
    noTradeDelta: tuned.noTradeSignals - current.noTradeSignals,
    usefulAccuracyDelta: tuned.usefulAccuracyPct - current.usefulAccuracyPct,
    directionalAccuracyDelta:
      tuned.directionalAccuracyPct - current.directionalAccuracyPct,
    avgDirectionalEdgeDelta: round(
      tuned.avgDirectionalEdgePct - current.avgDirectionalEdgePct
    ),
    strongLossDelta: tuned.strongLosses - current.strongLosses,
    usefulWinDelta: tuned.usefulWins - current.usefulWins,
    usefulLossDelta: tuned.usefulLosses - current.usefulLosses
  };
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
    const safeStrongMovePct = Math.min(
      Math.max(strongMovePct, safeMinUsefulMovePct),
      10
    );

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
      return NextResponse.json(
        {
          error:
            "Not enough candles for backtesting. Run hourly ingest until you have at least 80 candles.",
          candleCount: candles.length
        },
        { status: 400 }
      );
    }

    const signalPairs: Array<{ signal: Signal; next: Candle; history: Candle[] }> =
      [];

    for (let i = 50; i < candles.length - 1; i++) {
      const start = Math.max(0, i - 239);
      const history = candles.slice(start, i + 1);
      const signal = generateSignal(history);
      const next = candles[i + 1];

      if (signal) {
        signalPairs.push({ signal, next, history });
      }
    }

    const currentRows = signalPairs.map(({ signal, next }) =>
      gradeBacktestSignal(
        "Current Model",
        signal,
        next,
        safeMinConfidence,
        safeMinUsefulMovePct,
        safeStrongMovePct
      )
    );

    const tunedRows = signalPairs.map(({ signal, next, history }) => {
      const tuned = applyTunedModelV2(signal, history, safeMinConfidence);

      return gradeBacktestSignal(
        "Tuned Model V2",
        signal,
        next,
        safeMinConfidence,
        safeMinUsefulMovePct,
        safeStrongMovePct,
        tuned.effectiveSignal,
        tuned.v2Reasons
      );
    });

    const currentSummary = summarize(currentRows);
    const tunedSummary = summarize(tunedRows);

    const currentThresholdRows = thresholdComparison(
      signalPairs,
      safeMinUsefulMovePct,
      safeStrongMovePct,
      "Current Model"
    );

    const tunedThresholdRows = thresholdComparison(
      signalPairs,
      safeMinUsefulMovePct,
      safeStrongMovePct,
      "Tuned Model V2"
    );

    const currentBestThreshold = pickBestThreshold(currentThresholdRows);
    const tunedBestThreshold = pickBestThreshold(tunedThresholdRows);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      config: {
        limit: safeLimit,
        minConfidence: safeMinConfidence,
        minUsefulMovePct: safeMinUsefulMovePct,
        strongMovePct: safeStrongMovePct,
        candleCount: candles.length,
        testedPeriods: currentRows.length
      },
      current: {
        summary: currentSummary,
        bySignal: bySignal(currentRows),
        thresholdComparison: currentThresholdRows,
        bestThreshold: currentBestThreshold,
        recent: currentRows.slice().reverse().slice(0, 100)
      },
      tunedV2: {
        summary: tunedSummary,
        bySignal: bySignal(tunedRows),
        thresholdComparison: tunedThresholdRows,
        bestThreshold: tunedBestThreshold,
        recent: tunedRows.slice().reverse().slice(0, 100)
      },
      comparison: improvement(currentSummary, tunedSummary)
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