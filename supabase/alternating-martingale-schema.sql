-- Realtime alternating martingale tracker (starts from service init time, not historical replay)

create table if not exists public.strategy_alternating_martingale_state (
  id integer primary key,
  started_at timestamptz not null,
  starting_capital numeric(18,6) not null default 1000,
  base_stake numeric(18,6) not null default 10,
  next_side text not null check (next_side in ('UP', 'DOWN')),
  next_stake numeric(18,6) not null,
  bankroll numeric(18,6) not null,
  wins integer not null default 0,
  losses integer not null default 0,
  current_loss_streak integer not null default 0,
  longest_loss_streak integer not null default 0,
  max_stake numeric(18,6) not null default 10,
  markets_processed integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.strategy_alternating_martingale_events (
  id bigserial primary key,
  market_slug text not null unique,
  settled_at timestamptz not null,
  bet_side text not null check (bet_side in ('UP', 'DOWN')),
  settlement_side text not null check (settlement_side in ('UP', 'DOWN')),
  won boolean not null,
  stake numeric(18,6) not null,
  pnl numeric(18,6) not null,
  bankroll_after numeric(18,6) not null,
  strategy_started_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_alt_martingale_events_settled_at
  on public.strategy_alternating_martingale_events (settled_at desc);

create index if not exists idx_alt_martingale_events_started_at
  on public.strategy_alternating_martingale_events (strategy_started_at);
