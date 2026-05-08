import type { Candle, Signal } from "@/lib/types";

export type V3EffectiveSignal =
  | "Strong Bullish"
  | "Bullish"
  | "Neutral"
  | "Bearish"
  | "Strong Bearish"
  | "No Trade";

export type V3ShadowGrade =
  | "Strong Win"
  | "Small Win"
  | "Flat"
  | "Small Loss"
  | "Strong Loss"
  | "No Trade"
  | "Pending";

export type V3ShadowConfig = {
  version: "V3_SHADOW_001";
  minConfidence: number;
  emaSpreadMinPct: number;
  emaTrendSpreadMinPct: number;
  atrMinPct: number;
  rangeMinPct: number;
  bullishRsiMin: number;
  bearishRsiMax: number;
  macdMode: "loose" | "medium" | "strict";
  minUsefulMovePct: number;
  strongMovePct: number;
};

export type V3ShadowSignal = {
  candle_ts: string;
  raw_signal: Signal["signal"];
  effective_signal: V3EffectiveSignal;
  is_tradeable: boolean;
  confidence: number;
  close: number;
  next_close?: number | null;
  result: "Pending" | "Correct" | "Incorrect" | "Flat" | "No Trade";
  grade: V3ShadowGrade;
  move?: number | null;
  move_pct?: number | null;
  directional_score_pct?: number | null;
  rsi?: number | null;
  ema_9?: number | null;
  ema_21?: number | null;
  ema_50?: number | null;
  macd_histogram?: number | null;
  atr?: number | null;
  support?: number | null;
  resistance?: number | null;
  config: V3ShadowConfig;
  reasons: string[];
};

export const V3_SHADOW_CONFIG: V3ShadowConfig = {
  version: "V3_SHADOW_001",

  // Best optimizer candidate from your current data:
  minConfidence: 85,
  emaSpreadMinPct: 0.02,
  emaTrendSpreadMinPct: 0,
  atrMinPct: 0,
  rangeMinPct: 0,
  bullishRsiMin: 45,
  bearishRsiMax: 48,
  macdMode: "loose",

  // Grading thresholds:
  minUsefulMovePct: 0.1,
  strongMovePct: 0.4
};

const round = (value: number | null | undefined, digits = 3) =>
  value == null || Number.isNaN(value) ? null : Number(value.toFixed(digits));

function getStats(signal: Signal, candles: Candle[]) {
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
      ? Math.max(...recent.map((c) => c.high)) -
        Math.min(...recent.map((c) => c.low))
      : 0;

  const recentRangePct = close ? (recentRange / close) * 100 : 0;

  return {
    rsi,
    ema9,
    ema21,
    ema50,
    macdHist,
    close,
    atr,
    emaSpreadPct,
    emaTrendSpreadPct,
    atrPct,
    recentRangePct
  };
}

function macdPass(
  mode: V3ShadowConfig["macdMode"],
  direction: "bull" | "bear",
  macdHist: number
) {
  if (mode === "loose") {
    return direction === "bull" ? macdHist > -10 : macdHist < 10;
  }

  if (mode === "medium") {
    return direction === "bull" ? macdHist > 0 : macdHist <= 0;
  }

  return direction === "bull" ? macdHist > 8 : macdHist < -8;
}

export function generateV3ShadowSignal(
  currentSignal: Signal,
  candles: Candle[],
  config: V3ShadowConfig = V3_SHADOW_CONFIG
): V3ShadowSignal {
  const reasons: string[] = [];
  const stats = getStats(currentSignal, candles);

  let effectiveSignal: V3EffectiveSignal = currentSignal.signal;

  if (currentSignal.signal === "Neutral") {
    effectiveSignal = "No Trade";
    reasons.push("Raw signal is Neutral.");
  }

  if (currentSignal.confidence < config.minConfidence) {
    effectiveSignal = "No Trade";
    reasons.push(
      `Confidence ${currentSignal.confidence}% is below V3 minimum ${config.minConfidence}%.`
    );
  }

  if (
    effectiveSignal !== "No Trade" &&
    config.emaSpreadMinPct > 0 &&
    stats.emaSpreadPct < config.emaSpreadMinPct
  ) {
    effectiveSignal = "No Trade";
    reasons.push(
      `EMA 9/21 spread ${round(stats.emaSpreadPct)}% is below ${config.emaSpreadMinPct}%.`
    );
  }

  if (
    effectiveSignal !== "No Trade" &&
    config.emaTrendSpreadMinPct > 0 &&
    stats.emaTrendSpreadPct < config.emaTrendSpreadMinPct
  ) {
    effectiveSignal = "No Trade";
    reasons.push(
      `EMA 21/50 trend spread ${round(stats.emaTrendSpreadPct)}% is below ${config.emaTrendSpreadMinPct}%.`
    );
  }

  if (
    effectiveSignal !== "No Trade" &&
    config.atrMinPct > 0 &&
    stats.atrPct < config.atrMinPct
  ) {
    effectiveSignal = "No Trade";
    reasons.push(`ATR ${round(stats.atrPct)}% is below ${config.atrMinPct}%.`);
  }

  if (
    effectiveSignal !== "No Trade" &&
    config.rangeMinPct > 0 &&
    stats.recentRangePct < config.rangeMinPct
  ) {
    effectiveSignal = "No Trade";
    reasons.push(
      `Recent range ${round(stats.recentRangePct)}% is below ${config.rangeMinPct}%.`
    );
  }

  if (effectiveSignal.includes("Bullish")) {
    const trendPass = stats.close > stats.ema9 && stats.ema9 > stats.ema21;
    const rsiPass = stats.rsi >= config.bullishRsiMin && stats.rsi <= 72;
    const macdOk = macdPass(config.macdMode, "bull", stats.macdHist);

    if (!trendPass) {
      effectiveSignal = "No Trade";
      reasons.push("Bullish trend structure failed: close > EMA9 > EMA21 required.");
    }

    if (!rsiPass) {
      effectiveSignal = "No Trade";
      reasons.push(
        `Bullish RSI filter failed. RSI ${round(stats.rsi)}; required ${config.bullishRsiMin}–72.`
      );
    }

    if (!macdOk) {
      effectiveSignal = "No Trade";
      reasons.push(`Bullish MACD ${config.macdMode} filter failed.`);
    }
  }

  if (effectiveSignal.includes("Bearish")) {
    const trendPass = stats.close < stats.ema9 && stats.ema9 < stats.ema21;
    const rsiPass = stats.rsi <= config.bearishRsiMax && stats.rsi >= 28;
    const macdOk = macdPass(config.macdMode, "bear", stats.macdHist);

    if (!trendPass) {
      effectiveSignal = "No Trade";
      reasons.push("Bearish trend structure failed: close < EMA9 < EMA21 required.");
    }

    if (!rsiPass) {
      effectiveSignal = "No Trade";
      reasons.push(
        `Bearish RSI filter failed. RSI ${round(stats.rsi)}; required 28–${config.bearishRsiMax}.`
      );
    }

    if (!macdOk) {
      effectiveSignal = "No Trade";
      reasons.push(`Bearish MACD ${config.macdMode} filter failed.`);
    }
  }

  if (effectiveSignal !== "No Trade") {
    reasons.push("V3 accepted: confidence, EMA, RSI, and MACD filters passed.");
  }

  const isTradeable = effectiveSignal !== "No Trade";

  return {
    candle_ts: currentSignal.candle_ts,
    raw_signal: currentSignal.signal,
    effective_signal: effectiveSignal,
    is_tradeable: isTradeable,
    confidence: currentSignal.confidence,
    close: currentSignal.close,
    next_close: null,
    result: "Pending",
    grade: "Pending",
    move: null,
    move_pct: null,
    directional_score_pct: null,
    rsi: currentSignal.rsi,
    ema_9: currentSignal.ema_9,
    ema_21: currentSignal.ema_21,
    ema_50: currentSignal.ema_50,
    macd_histogram: currentSignal.macd_histogram,
    atr: currentSignal.atr,
    support: currentSignal.support,
    resistance: currentSignal.resistance,
    config,
    reasons
  };
}

function expectedDirection(signal: string): "up" | "down" | "flat" | "none" {
  if (signal === "No Trade") return "none";
  if (signal.includes("Bullish")) return "up";
  if (signal.includes("Bearish")) return "down";
  return "flat";
}

export function scoreV3ShadowSignal(
  signal: Pick<
    V3ShadowSignal,
    "effective_signal" | "close" | "config" | "is_tradeable"
  >,
  nextClose: number
) {
  const move = nextClose - signal.close;
  const movePct = signal.close === 0 ? 0 : (move / signal.close) * 100;

  if (!signal.is_tradeable || signal.effective_signal === "No Trade") {
    return {
      next_close: round(nextClose, 2),
      move: round(move, 2),
      move_pct: round(movePct, 3),
      directional_score_pct: 0,
      result: "No Trade" as const,
      grade: "No Trade" as const
    };
  }

  const direction = expectedDirection(signal.effective_signal);

  let directionalScorePct = 0;

  if (direction === "up") {
    directionalScorePct = movePct;
  } else if (direction === "down") {
    directionalScorePct = -movePct;
  } else {
    directionalScorePct =
      Math.abs(movePct) <= signal.config.minUsefulMovePct
        ? signal.config.minUsefulMovePct
        : -Math.abs(movePct);
  }

  let grade: V3ShadowGrade = "Flat";

  if (directionalScorePct >= signal.config.strongMovePct) {
    grade = "Strong Win";
  } else if (directionalScorePct >= signal.config.minUsefulMovePct) {
    grade = "Small Win";
  } else if (directionalScorePct > -signal.config.minUsefulMovePct) {
    grade = "Flat";
  } else if (directionalScorePct > -signal.config.strongMovePct) {
    grade = "Small Loss";
  } else {
    grade = "Strong Loss";
  }

  const result =
    grade === "Strong Win" || grade === "Small Win"
      ? "Correct"
      : grade === "Flat"
        ? "Flat"
        : "Incorrect";

  return {
    next_close: round(nextClose, 2),
    move: round(move, 2),
    move_pct: round(movePct, 3),
    directional_score_pct: round(directionalScorePct, 3),
    result,
    grade
  };
}