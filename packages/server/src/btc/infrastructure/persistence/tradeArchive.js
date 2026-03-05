/**
 * @file Trade Archive — stores historical trades with config version tagging.
 *
 * Instead of deleting trades on config changes, we archive them with the
 * config version and summary stats. This preserves institutional knowledge
 * about what worked and what didn't.
 *
 * Architecture: Infrastructure layer (I/O).
 */

import { createClient } from '@supabase/supabase-js';

let _sb = null;

function getSb() {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  _sb = createClient(url, key, { auth: { persistSession: false } });
  return _sb;
}

/**
 * Ensure archive tables exist. Safe to call multiple times.
 * Uses the service role's ability to run DDL via rpc if available,
 * otherwise relies on tables being pre-created.
 */
export async function ensureArchiveTables() {
  const sb = getSb();
  // Check if tables exist by attempting a select
  const { error: cvErr } = await sb.from('config_versions').select('id').limit(1);
  const { error: taErr } = await sb.from('trade_archive').select('id').limit(1);

  if (!cvErr && !taErr) return true; // Tables exist

  console.warn('[tradeArchive] Archive tables not found. Please run archive-schema.sql in Supabase SQL Editor.');
  console.warn('[tradeArchive] File: packages/server/src/btc/infrastructure/persistence/archive-schema.sql');
  return false;
}

/**
 * Archive all current trades from the `trades` table into `trade_archive`,
 * tagged with a config version. Also saves config summary to `config_versions`.
 *
 * @param {string} version - Config version label (e.g., "v1.0.7-restored")
 * @param {Object} configSnapshot - Full config object to store
 * @param {string} [notes=''] - Human notes about this config run
 * @returns {{ archived: number, version: string, stats: Object }}
 */
export async function archiveTrades(version, configSnapshot = {}, notes = '') {
  const sb = getSb();

  // 1. Fetch all current trades
  const { data: trades, error: fetchErr } = await sb
    .from('trades')
    .select('*')
    .order('createdAt', { ascending: true });

  if (fetchErr) throw new Error(`Failed to fetch trades: ${fetchErr.message}`);
  if (!trades || trades.length === 0) {
    return { archived: 0, version, stats: {} };
  }

  // 2. Compute summary stats
  const closed = trades.filter(t => t.status === 'CLOSED' && t.pnl != null);
  const wins = closed.filter(t => t.pnl > 0);
  const losses = closed.filter(t => t.pnl <= 0);
  const totalPnl = closed.reduce((s, t) => s + t.pnl, 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const winRate = closed.length > 0 ? (wins.length / closed.length * 100) : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  const directionCorrectCount = closed.filter(t => {
    const extra = typeof t.extraJson === 'string' ? JSON.parse(t.extraJson) : (t.extraJson || {});
    return extra.directionCorrect === true;
  }).length;

  const stats = {
    tradeCount: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: +winRate.toFixed(1),
    totalPnl: +totalPnl.toFixed(2),
    profitFactor: profitFactor === Infinity ? 999 : +profitFactor.toFixed(2),
    avgWin: wins.length ? +(grossWin / wins.length).toFixed(2) : 0,
    avgLoss: losses.length ? +(-grossLoss / losses.length).toFixed(2) : 0,
    directionAccuracy: closed.length ? +(directionCorrectCount / closed.length * 100).toFixed(1) : 0,
    exitReasons: {},
  };

  // Exit reason breakdown
  for (const t of closed) {
    const reason = (t.exitReason || 'Unknown').split('(')[0].trim().split('$')[0].trim();
    if (!stats.exitReasons[reason]) stats.exitReasons[reason] = { count: 0, pnl: 0, wins: 0 };
    stats.exitReasons[reason].count++;
    stats.exitReasons[reason].pnl = +(stats.exitReasons[reason].pnl + t.pnl).toFixed(2);
    if (t.pnl > 0) stats.exitReasons[reason].wins++;
  }

  // 3. Save config version
  const firstTrade = trades[0];
  const lastTrade = trades[trades.length - 1];

  const { error: cvErr } = await sb.from('config_versions').insert({
    version,
    config_json: configSnapshot,
    stats_json: stats,
    notes,
    trade_count: closed.length,
    win_rate: stats.winRate,
    total_pnl: stats.totalPnl,
    profit_factor: stats.profitFactor === 999 ? null : stats.profitFactor,
    started_at: firstTrade.entryTime || firstTrade.createdAt,
    ended_at: lastTrade.exitTime || lastTrade.updatedAt || lastTrade.createdAt,
  });

  if (cvErr) {
    console.error('[tradeArchive] Failed to insert config version:', cvErr.message);
    throw cvErr;
  }

  // 4. Archive each trade
  const archiveRows = trades.map(t => ({
    original_id: t.id,
    config_version: version,
    trade_data: t,
    side: t.side,
    pnl: t.pnl,
    status: t.status,
    exit_reason: t.exitReason,
    entry_time: t.entryTime,
    exit_time: t.exitTime,
    market_slug: t.marketSlug,
    max_unrealized_pnl: t.maxUnrealizedPnl,
    min_unrealized_pnl: t.minUnrealizedPnl,
  }));

  // Insert in batches of 100
  for (let i = 0; i < archiveRows.length; i += 100) {
    const batch = archiveRows.slice(i, i + 100);
    const { error: insertErr } = await sb.from('trade_archive').insert(batch);
    if (insertErr) {
      console.error(`[tradeArchive] Failed to insert batch ${i}:`, insertErr.message);
      throw insertErr;
    }
  }

  // 5. Delete trades from live table
  const { error: delErr } = await sb.from('trades').delete().gte('id', '0');
  if (delErr) {
    console.error('[tradeArchive] Failed to delete trades:', delErr.message);
    // Don't throw — trades are archived, just couldn't clean up
  }

  console.log(`[tradeArchive] Archived ${trades.length} trades as "${version}" | ` +
    `WR: ${stats.winRate}% | PnL: $${stats.totalPnl} | PF: ${stats.profitFactor}`);

  return { archived: trades.length, version, stats };
}

/**
 * Get all config versions with their stats.
 * @returns {Array<Object>}
 */
export async function getConfigVersions() {
  const sb = getSb();
  const { data, error } = await sb
    .from('config_versions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get archived trades for a specific config version.
 * @param {string} version
 * @returns {Array<Object>}
 */
export async function getArchivedTrades(version) {
  const sb = getSb();
  const { data, error } = await sb
    .from('trade_archive')
    .select('*')
    .eq('config_version', version)
    .order('entry_time', { ascending: true });

  if (error) throw error;
  return data || [];
}
