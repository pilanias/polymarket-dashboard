-- Trade Archive Schema
-- Run this in Supabase SQL Editor to create the archive tables.

-- Config versions table — stores config snapshots with performance stats
CREATE TABLE IF NOT EXISTS config_versions (
  id BIGSERIAL PRIMARY KEY,
  version TEXT NOT NULL,
  config_json JSONB NOT NULL DEFAULT '{}',
  stats_json JSONB NOT NULL DEFAULT '{}',
  notes TEXT DEFAULT '',
  trade_count INTEGER DEFAULT 0,
  win_rate NUMERIC(5,1) DEFAULT 0,
  total_pnl NUMERIC(12,2) DEFAULT 0,
  profit_factor NUMERIC(6,2),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trade archive table — stores all trades with config version reference
CREATE TABLE IF NOT EXISTS trade_archive (
  id BIGSERIAL PRIMARY KEY,
  original_id TEXT,
  config_version TEXT NOT NULL,
  trade_data JSONB NOT NULL DEFAULT '{}',
  -- Key fields denormalized for easy querying
  side TEXT,
  pnl NUMERIC(12,4),
  status TEXT,
  exit_reason TEXT,
  entry_time TIMESTAMPTZ,
  exit_time TIMESTAMPTZ,
  market_slug TEXT,
  max_unrealized_pnl NUMERIC(12,4),
  min_unrealized_pnl NUMERIC(12,4),
  archived_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_trade_archive_version ON trade_archive(config_version);
CREATE INDEX IF NOT EXISTS idx_trade_archive_entry_time ON trade_archive(entry_time);
CREATE INDEX IF NOT EXISTS idx_config_versions_version ON config_versions(version);

-- Enable RLS but allow service role full access
ALTER TABLE config_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_archive ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "service_role_config_versions" ON config_versions
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_trade_archive" ON trade_archive
  FOR ALL USING (true) WITH CHECK (true);
