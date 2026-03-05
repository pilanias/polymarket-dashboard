/**
 * Order Book Imbalance Signal
 *
 * Reads the Polymarket CLOB orderbook and detects when buy or sell
 * pressure is heavily skewed. Heavy bid volume = smart money expects UP.
 *
 * API: GET https://clob.polymarket.com/book?token_id=<tokenId>
 *
 * Returns: imbalance from -1 (all sellers) to +1 (all buyers)
 * Signal fires when |imbalance| > threshold (default 0.25)
 */

const CLOB_BASE = 'https://clob.polymarket.com';
const CACHE_TTL_MS = 5_000; // Cache for 5s to avoid hammering the API

let _cache = { tokenId: null, ts: 0, imbalance: null, bidVol: 0, askVol: 0 };

/**
 * Fetch orderbook and compute bid/ask imbalance for a token.
 *
 * @param {string} tokenId - CLOB token ID (UP side)
 * @returns {{ imbalance: number, bidVol: number, askVol: number, wallSide: string|null }}
 */
export async function fetchOrderbookImbalance(tokenId) {
  if (!tokenId) return null;

  // Return cached value if fresh
  const now = Date.now();
  if (_cache.tokenId === tokenId && now - _cache.ts < CACHE_TTL_MS) {
    return { imbalance: _cache.imbalance, bidVol: _cache.bidVol, askVol: _cache.askVol, wallSide: _cache.wallSide };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${CLOB_BASE}/book?token_id=${tokenId}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const book = await res.json();
    const bids = Array.isArray(book?.bids) ? book.bids : [];
    const asks = Array.isArray(book?.asks) ? book.asks : [];

    // Sum volume (size * price for dollar-weighted)
    let bidVol = 0, askVol = 0;
    let maxBid = 0, maxAsk = 0;

    for (const b of bids) {
      const size = parseFloat(b.size || 0);
      bidVol += size;
      if (size > maxBid) maxBid = size;
    }
    for (const a of asks) {
      const size = parseFloat(a.size || 0);
      askVol += size;
      if (size > maxAsk) maxAsk = size;
    }

    const total = bidVol + askVol;
    const imbalance = total > 0 ? (bidVol - askVol) / total : 0;

    // Wall detection: single order > 25% of total volume
    let wallSide = null;
    if (total > 0) {
      if (maxBid / total > 0.25) wallSide = 'BID';
      if (maxAsk / total > 0.25) wallSide = 'ASK';
    }

    _cache = { tokenId, ts: now, imbalance, bidVol, askVol, wallSide };

    return { imbalance, bidVol, askVol, wallSide };
  } catch (err) {
    // Silently fail — this is an optional signal
    return null;
  }
}
