export type Candle = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source?: string;
};

export type Signal = {
  candle_ts: string;
  signal: "Strong Bullish" | "Bullish" | "Neutral" | "Bearish" | "Strong Bearish";
  bullish_score: number;
  bearish_score: number;
  confidence: number;
  probability_bullish: number;
  probability_bearish: number;
  probability_neutral: number;
  close: number;
  next_close?: number | null;
  result?: "Correct" | "Incorrect" | "Neutral" | "Pending" | null;
  rsi?: number | null;
  ema_9?: number | null;
  ema_21?: number | null;
  ema_50?: number | null;
  macd?: number | null;
  macd_signal?: number | null;
  macd_histogram?: number | null;
  bb_upper?: number | null;
  bb_middle?: number | null;
  bb_lower?: number | null;
  atr?: number | null;
  support?: number | null;
  resistance?: number | null;
  notes: string[];
};

export type DashboardPayload = {
  livePrice: number | null;
  liveChange24h: number | null;
  candles: Candle[];
  latestSignal: Signal | null;
  recentSignals: Signal[];
  accuracy: {
    total: number;
    correct: number;
    incorrect: number;
    pending: number;
    percent: number;
  };
  generatedAt: string;
  usingDemoData: boolean;
};