/**
 * Position Service — checks Polymarket data API for:
 * 1. Current open positions (conditional token value)
 * 2. Redeemable positions (stuck tokens after settlement)
 *
 * Uses the public data API (no auth needed):
 * https://data-api.polymarket.com/positions?user=<address>
 */

const DATA_API = 'https://data-api.polymarket.com';
const CACHE_TTL_MS = 30_000; // 30s cache to avoid hammering

let _cache = { positions: null, redeemable: null, ts: 0 };

/**
 * Fetch current positions for a user address.
 * Returns { positions: [...], redeemable: [...], totalInPositions, totalRedeemable }
 */
export async function getPositionSummary(userAddress) {
  if (!userAddress) return null;

  // Return cache if fresh
  if (Date.now() - _cache.ts < CACHE_TTL_MS && _cache.positions !== null) {
    return _cache.result;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    // Fetch all positions
    const posRes = await fetch(
      `${DATA_API}/positions?user=${userAddress}&sizeThreshold=0.01&limit=500`,
      { signal: controller.signal }
    );
    clearTimeout(timer);

    if (!posRes.ok) {
      console.warn(`[PositionService] Data API returned ${posRes.status}`);
      return null;
    }

    const allPositions = await posRes.json();

    // Separate redeemable from active
    const redeemable = [];
    const active = [];

    for (const pos of allPositions) {
      const size = Number(pos.size || 0);
      if (size <= 0) continue;

      if (pos.redeemable) {
        // Redeemable: market resolved. But only WINNING side has value.
        // pos.payout > 0 means winning side. If no payout field, check curPrice.
        // Losing side tokens settle at $0 — share count ≠ dollar value.
        const payout = Number(pos.payout || 0);
        const curPrice = Number(pos.curPrice || pos.price || 0);
        // Winning tokens: payout > 0, or curPrice ~ 1.0
        const isWinner = payout > 0 || curPrice > 0.5;
        const value = isWinner ? (payout > 0 ? payout : size) : 0;

        redeemable.push({
          market: pos.market?.question || pos.conditionId || 'Unknown',
          conditionId: pos.conditionId,
          size,
          outcome: pos.outcome || pos.asset,
          value,
          isWinner,
        });
      } else {
        const curPrice = Number(pos.curPrice || pos.price || 0);
        active.push({
          market: pos.market?.question || pos.conditionId || 'Unknown',
          conditionId: pos.conditionId,
          size,
          outcome: pos.outcome || pos.asset,
          currentPrice: curPrice,
          value: size * curPrice,
        });
      }
    }

    const totalInPositions = active.reduce((sum, p) => sum + p.value, 0);
    const totalRedeemable = redeemable.reduce((sum, p) => sum + p.value, 0);

    const result = {
      positions: active,
      redeemable,
      totalInPositions: Math.round(totalInPositions * 100) / 100,
      totalRedeemable: Math.round(totalRedeemable * 100) / 100,
      positionCount: active.length,
      redeemableCount: redeemable.length,
      checkedAt: new Date().toISOString(),
    };

    _cache = { positions: active, redeemable, ts: Date.now(), result };
    return result;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[PositionService] Data API timeout');
    } else {
      console.error(`[PositionService] Error: ${err.message}`);
    }
    return null;
  }
}
