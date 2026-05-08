import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type SignalRow = {
  id: number;
  candle_ts: string;
  signal: string;
  confidence: number | null;
  close: number | null;
  next_close: number | null;
  result: string | null;
  probability_bullish: number | null;
  probability_bearish: number | null;
  probability_neutral: number | null;
  rsi: number | null;
  ema_9: number | null;
  ema_21: number | null;
  ema_50: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  support: number | null;
  resistance: number | null;
  notes: string[] | null;
  created_at: string;
};

type GradedSignal = SignalRow & {
  move: number | null;
  movePct: number | null;
  expectedDirection: "up" | "down" | "flat";
  directionalScore: number | null;
  grade: "Strong Win" | "Small Win" | "Flat" | "Small Loss" | "Strong Loss" | "Pending";
  isResolved: boolean;
  isCorrect: boolean;
  isUsefulWin: boolean;
  isUsefulLoss: boolean;
};

function expectedDirection(signal: string): "up" | "down" | "flat" {
  const s = signal.toLowerCase();
  if (s.includes("bull")) return "up";
  if (s.includes("bear")) return "down";
  return "flat";
}

function gradeSignal(row: SignalRow): GradedSignal {
  const direction = expectedDirection(row.signal);

  if (row.close == null || row.next_close == null) {
    return {
      ...row,
      move: null,
      movePct: null,
      expectedDirection: direction,
      directionalScore: null,
      grade: "Pending",
      isResolved: false,
      isCorrect: false,
      isUsefulWin: false,
      isUsefulLoss: false
    };
  }

  const move = row.next_close - row.close;
  const movePct = row.close === 0 ? 0 : (move / row.close) * 100;

  let directionalScore = 0;

  if (direction === "up") {
    directionalScore = movePct;
  } else if (direction === "down") {
    directionalScore = -movePct;
  } else {
    directionalScore = Math.abs(movePct) <= 0.1 ? 0.1 : -Math.abs(movePct);
  }

  let grade: GradedSignal["grade"] = "Flat";

  if (directionalScore >= 0.4) grade = "Strong Win";
  else if (directionalScore >= 0.1) grade = "Small Win";
  else if (directionalScore > -0.1) grade = "Flat";
  else if (directionalScore > -0.4) grade = "Small Loss";
  else grade = "Strong Loss";

  const isCorrect = row.result === "Correct" || grade === "Strong Win" || grade === "Small Win";
  const isUsefulWin = grade === "Strong Win" || grade === "Small Win";
  const isUsefulLoss = grade === "Strong Loss" || grade === "Small Loss";

  return {
    ...row,
    move,
    movePct,
    expectedDirection: direction,
    directionalScore,
    grade,
    isResolved: true,
    isCorrect,
    isUsefulWin,
    isUsefulLoss
  };
}

function summarize(rows: GradedSignal[]) {
  const resolved = rows.filter((r) => r.isResolved);
  const pending = rows.filter((r) => !r.isResolved);
  const correct = resolved.filter((r) => r.isCorrect);
  const usefulWins = resolved.filter((r) => r.isUsefulWin);
  const usefulLosses = resolved.filter((r) => r.isUsefulLoss);
  const flats = resolved.filter((r) => r.grade === "Flat");

  const avg = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  const avgDirectionalScore = avg(
    resolved
      .map((r) => r.directionalScore)
      .filter((v): v is number => typeof v === "number")
  );

  const avgWinPct = avg(
    usefulWins
      .map((r) => r.directionalScore)
      .filter((v): v is number => typeof v === "number")
  );

  const avgLossPct = avg(
    usefulLosses
      .map((r) => r.directionalScore)
      .filter((v): v is number => typeof v === "number")
  );

  const usefulResolved = resolved.filter((r) => r.grade !== "Flat");

  return {
    total: rows.length,
    resolved: resolved.length,
    pending: pending.length,
    correct: correct.length,
    incorrect: resolved.length - correct.length,
    flats: flats.length,
    usefulWins: usefulWins.length,
    usefulLosses: usefulLosses.length,
    accuracyPct: resolved.length ? Math.round((correct.length / resolved.length) * 100) : 0,
    usefulAccuracyPct: usefulResolved.length
      ? Math.round((usefulWins.length / usefulResolved.length) * 100)
      : 0,
    avgDirectionalScorePct: Number(avgDirectionalScore.toFixed(3)),
    avgWinPct: Number(avgWinPct.toFixed(3)),
    avgLossPct: Number(avgLossPct.toFixed(3))
  };
}

function bucketBySignal(rows: GradedSignal[]) {
  const groups = ["Bullish", "Bearish", "Neutral"];

  return groups.map((signal) => {
    const group = rows.filter((r) => r.signal === signal);
    return {
      signal,
      ...summarize(group)
    };
  });
}

function bucketByConfidence(rows: GradedSignal[]) {
  const buckets = [
    { label: "90%+", min: 90, max: 100 },
    { label: "80–89%", min: 80, max: 89.999 },
    { label: "70–79%", min: 70, max: 79.999 },
    { label: "60–69%", min: 60, max: 69.999 },
    { label: "<60%", min: 0, max: 59.999 }
  ];

  return buckets.map((b) => {
    const group = rows.filter((r) => {
      const c = r.confidence ?? 0;
      return c >= b.min && c <= b.max;
    });

    return {
      label: b.label,
      ...summarize(group)
    };
  });
}

function withinHours(rows: GradedSignal[], hours: number) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return rows.filter((r) => new Date(r.candle_ts).getTime() >= cutoff);
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("btc_hourly_signals")
      .select(
        `
        id,
        candle_ts,
        signal,
        confidence,
        close,
        next_close,
        result,
        probability_bullish,
        probability_bearish,
        probability_neutral,
        rsi,
        ema_9,
        ema_21,
        ema_50,
        macd,
        macd_signal,
        macd_histogram,
        support,
        resistance,
        notes,
        created_at
      `
      )
      .order("candle_ts", { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = ((data ?? []) as SignalRow[]).map(gradeSignal);

    const payload = {
      generatedAt: new Date().toISOString(),
      summary: {
        all: summarize(rows),
        last24h: summarize(withinHours(rows, 24)),
        last7d: summarize(withinHours(rows, 24 * 7)),
        last30d: summarize(withinHours(rows, 24 * 30))
      },
      bySignal: bucketBySignal(rows),
      byConfidence: bucketByConfidence(rows),
      recent: rows.slice(0, 100)
    };

    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Unknown accuracy API error"
      },
      { status: 500 }
    );
  }
}