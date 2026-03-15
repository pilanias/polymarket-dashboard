import { createClient } from '@supabase/supabase-js';

const STATE_ID = 1;
const STARTING_CAPITAL = 1000;
const BASE_STAKE = 10;

let _instance = null;

function toggleSide(side) {
  return String(side || '').toUpperCase() === 'UP' ? 'DOWN' : 'UP';
}

function toIso(value) {
  const t = new Date(value || Date.now());
  return Number.isNaN(t.getTime()) ? new Date().toISOString() : t.toISOString();
}

function parseSettlementSide(trade) {
  const top = String(trade?.settlementSide || '').toUpperCase();
  if (top === 'UP' || top === 'DOWN') return top;

  try {
    const extra = trade?.extraJson ? JSON.parse(trade.extraJson) : null;
    const nested = String(extra?.settlementSide || '').toUpperCase();
    if (nested === 'UP' || nested === 'DOWN') return nested;
  } catch {
    // ignore malformed JSON
  }

  return null;
}

function getSettledAt(trade) {
  return toIso(trade?.exitTime || trade?.updatedAt || trade?.timestamp || trade?.entryTime || Date.now());
}

function buildUnavailableSnapshot(reason = 'supabase_not_configured') {
  return {
    enabled: false,
    reason,
    config: {
      startingCapital: STARTING_CAPITAL,
      baseStake: BASE_STAKE,
      entryPrice: 0.5,
      mode: 'realtime_from_now',
    },
    totals: {
      bankroll: STARTING_CAPITAL,
      netPnl: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      nextSide: 'UP',
      nextStake: BASE_STAKE,
      maxStake: BASE_STAKE,
      longestLossStreak: 0,
      marketsProcessed: 0,
      halted: false,
      haltedReason: null,
    },
    history: [],
  };
}

class AlternatingMartingaleService {
  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    this.available = Boolean(url && key);
    this.client = this.available
      ? createClient(url, key, { auth: { persistSession: false } })
      : null;

    this.state = null;
    this.processed = new Set();
    this.initialized = false;
  }

  async _init() {
    if (this.initialized || !this.available) return;

    const { data: stateRow, error: stateErr } = await this.client
      .from('strategy_alternating_martingale_state')
      .select('*')
      .eq('id', STATE_ID)
      .maybeSingle();

    if (stateErr) {
      throw new Error(`[AltMartingale] failed to load state: ${stateErr.message}`);
    }

    if (stateRow) {
      this.state = stateRow;
    } else {
      const startedAt = new Date().toISOString();
      const initial = {
        id: STATE_ID,
        started_at: startedAt,
        starting_capital: STARTING_CAPITAL,
        base_stake: BASE_STAKE,
        next_side: 'UP',
        next_stake: BASE_STAKE,
        bankroll: STARTING_CAPITAL,
        wins: 0,
        losses: 0,
        current_loss_streak: 0,
        longest_loss_streak: 0,
        max_stake: BASE_STAKE,
        markets_processed: 0,
      };
      const { data: inserted, error: insertErr } = await this.client
        .from('strategy_alternating_martingale_state')
        .insert(initial)
        .select('*')
        .single();

      if (insertErr) {
        throw new Error(`[AltMartingale] failed to create state: ${insertErr.message}`);
      }
      this.state = inserted;
    }

    const { data: events, error: eventsErr } = await this.client
      .from('strategy_alternating_martingale_events')
      .select('market_slug');

    if (eventsErr) {
      throw new Error(`[AltMartingale] failed to load events: ${eventsErr.message}`);
    }

    this.processed = new Set((events || []).map((e) => e.market_slug).filter(Boolean));
    this.initialized = true;
  }

  async syncAndGet(trades = []) {
    if (!this.available) return buildUnavailableSnapshot();

    await this._init();

    const candidates = (Array.isArray(trades) ? trades : [])
      .filter((trade) => String(trade?.status || '').toUpperCase() === 'CLOSED')
      .map((trade) => ({
        trade,
        settlementSide: parseSettlementSide(trade),
        marketSlug: String(trade?.marketSlug || '').trim(),
        settledAt: getSettledAt(trade),
      }))
      .filter((row) => row.marketSlug && row.settlementSide)
      .filter((row) => new Date(row.settledAt).getTime() >= new Date(this.state.started_at).getTime())
      .sort((a, b) => new Date(a.settledAt).getTime() - new Date(b.settledAt).getTime());

    let changed = false;

    for (const row of candidates) {
      if (this.processed.has(row.marketSlug)) continue;

      const bankroll = Number(this.state.bankroll || 0);
      const nextStake = Number(this.state.next_stake || BASE_STAKE);
      const baseStake = Number(this.state.base_stake || BASE_STAKE);
      const betSide = String(this.state.next_side || 'UP').toUpperCase() === 'DOWN' ? 'DOWN' : 'UP';

      if (bankroll < nextStake) {
        // no more capital to follow doubling rule
        break;
      }

      const won = betSide === row.settlementSide;
      const pnl = won ? nextStake : -nextStake;
      const bankrollAfter = bankroll + pnl;
      const losses = Number(this.state.losses || 0) + (won ? 0 : 1);
      const wins = Number(this.state.wins || 0) + (won ? 1 : 0);
      const currentLossStreak = won ? 0 : Number(this.state.current_loss_streak || 0) + 1;
      const longestLossStreak = Math.max(Number(this.state.longest_loss_streak || 0), currentLossStreak);
      const updatedNextStake = won ? baseStake : nextStake * 2;
      const maxStake = Math.max(Number(this.state.max_stake || baseStake), updatedNextStake, nextStake);

      const { error: eventErr } = await this.client
        .from('strategy_alternating_martingale_events')
        .insert({
          market_slug: row.marketSlug,
          settled_at: row.settledAt,
          bet_side: betSide,
          settlement_side: row.settlementSide,
          won,
          stake: nextStake,
          pnl,
          bankroll_after: bankrollAfter,
          strategy_started_at: this.state.started_at,
        });

      if (eventErr) {
        // conflict means already inserted by another process
        if (!String(eventErr.message || '').toLowerCase().includes('duplicate')) {
          throw new Error(`[AltMartingale] failed to insert event: ${eventErr.message}`);
        }
      }

      this.processed.add(row.marketSlug);
      this.state = {
        ...this.state,
        bankroll: bankrollAfter,
        wins,
        losses,
        current_loss_streak: currentLossStreak,
        longest_loss_streak: longestLossStreak,
        next_stake: updatedNextStake,
        next_side: toggleSide(betSide),
        max_stake: maxStake,
        markets_processed: Number(this.state.markets_processed || 0) + 1,
        updated_at: new Date().toISOString(),
      };
      changed = true;
    }

    if (changed) {
      const { error: saveErr } = await this.client
        .from('strategy_alternating_martingale_state')
        .update({
          bankroll: this.state.bankroll,
          wins: this.state.wins,
          losses: this.state.losses,
          current_loss_streak: this.state.current_loss_streak,
          longest_loss_streak: this.state.longest_loss_streak,
          next_stake: this.state.next_stake,
          next_side: this.state.next_side,
          max_stake: this.state.max_stake,
          markets_processed: this.state.markets_processed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', STATE_ID);
      if (saveErr) {
        throw new Error(`[AltMartingale] failed to save state: ${saveErr.message}`);
      }
    }

    const { data: recent, error: recentErr } = await this.client
      .from('strategy_alternating_martingale_events')
      .select('market_slug,settled_at,bet_side,settlement_side,won,stake,pnl,bankroll_after')
      .eq('strategy_started_at', this.state.started_at)
      .order('settled_at', { ascending: false })
      .limit(12);

    if (recentErr) {
      throw new Error(`[AltMartingale] failed to load recent events: ${recentErr.message}`);
    }

    const executed = Number(this.state.markets_processed || 0);
    const wins = Number(this.state.wins || 0);
    const losses = Number(this.state.losses || 0);
    const winRate = executed > 0 ? (wins / executed) * 100 : 0;
    const bankroll = Number(this.state.bankroll || STARTING_CAPITAL);
    const nextStake = Number(this.state.next_stake || BASE_STAKE);

    return {
      enabled: true,
      reason: null,
      config: {
        startedAt: this.state.started_at,
        startingCapital: Number(this.state.starting_capital || STARTING_CAPITAL),
        baseStake: Number(this.state.base_stake || BASE_STAKE),
        entryPrice: 0.5,
        mode: 'realtime_from_now',
      },
      totals: {
        marketsProcessed: executed,
        wins,
        losses,
        winRate,
        bankroll,
        netPnl: bankroll - Number(this.state.starting_capital || STARTING_CAPITAL),
        nextSide: this.state.next_side,
        nextStake,
        maxStake: Number(this.state.max_stake || BASE_STAKE),
        longestLossStreak: Number(this.state.longest_loss_streak || 0),
        halted: bankroll < nextStake,
        haltedReason: bankroll < nextStake ? `Insufficient bankroll for next stake (${nextStake})` : null,
      },
      history: (recent || []).map((r, idx) => ({
        idx: executed - idx,
        marketSlug: r.market_slug,
        settledAt: r.settled_at,
        side: r.bet_side,
        settlementSide: r.settlement_side,
        won: Boolean(r.won),
        stake: Number(r.stake || 0),
        pnl: Number(r.pnl || 0),
        bankroll: Number(r.bankroll_after || 0),
      })),
    };
  }
}

export function getAlternatingMartingaleService() {
  if (_instance) return _instance;
  _instance = new AlternatingMartingaleService();
  return _instance;
}
