# BTC Hourly Signal Dashboard

A deployable Next.js + Supabase dashboard for BTC hourly tracking, signal generation, and accuracy scoring.

## What it does

- Pulls BTC-USD hourly candles from Coinbase public candles.
- Pulls current BTC/USD price from CoinGecko simple price.
- Stores candles and signals in Supabase Postgres.
- Calculates EMA, RSI, MACD, Bollinger Bands, ATR, support, resistance, and volume context.
- Generates a next-hour Bullish / Neutral / Bearish bias with probability estimates.
- Scores saved signals against the next hourly close.
- Includes Vercel Cron config to run hourly.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Supabase

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.
4. Add env vars locally and in Vercel.

```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
CRON_SECRET=...
```

## Manual ingest

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/ingest/hourly
```

## Deploy

1. Push this folder to GitHub.
2. Import the repo into Vercel.
3. Add the env vars.
4. Deploy.
5. Run `/api/ingest/hourly` once manually, then let the cron run hourly.

## Disclaimer

This is a technical-analysis signal tool, not financial advice. It estimates probability and directional bias; it does not guarantee price movement.
