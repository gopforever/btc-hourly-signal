create table if not exists btc_hourly_candles (
  id bigserial primary key,
  ts timestamptz not null unique,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric not null default 0,
  source text not null default 'coinbase',
  created_at timestamptz not null default now()
);

create table if not exists btc_hourly_signals (
  id bigserial primary key,
  candle_ts timestamptz not null references btc_hourly_candles(ts) on delete cascade,
  signal text not null check (signal in ('Strong Bullish','Bullish','Neutral','Bearish','Strong Bearish')),
  bullish_score numeric not null default 0,
  bearish_score numeric not null default 0,
  confidence numeric not null default 0,
  probability_bullish numeric not null default 0,
  probability_bearish numeric not null default 0,
  probability_neutral numeric not null default 0,
  close numeric not null,
  next_close numeric,
  result text check (result in ('Correct','Incorrect','Neutral','Pending')) default 'Pending',
  rsi numeric,
  ema_9 numeric,
  ema_21 numeric,
  ema_50 numeric,
  macd numeric,
  macd_signal numeric,
  macd_histogram numeric,
  bb_upper numeric,
  bb_middle numeric,
  bb_lower numeric,
  atr numeric,
  support numeric,
  resistance numeric,
  notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(candle_ts)
);

create index if not exists idx_btc_hourly_candles_ts on btc_hourly_candles(ts desc);
create index if not exists idx_btc_hourly_signals_candle_ts on btc_hourly_signals(candle_ts desc);

alter table btc_hourly_candles enable row level security;
alter table btc_hourly_signals enable row level security;

create policy "Public read candles" on btc_hourly_candles for select using (true);
create policy "Public read signals" on btc_hourly_signals for select using (true);
