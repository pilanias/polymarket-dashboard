/**
 * LLM Signal — Uses a fast/cheap LLM (Haiku) to predict BTC direction.
 * 
 * Called once per 5-minute market. Caches result for the market window.
 * In shadow mode: logs prediction but doesn't feed into momentum model.
 * 
 * Cost: ~$0.002/call × 288 calls/day = ~$0.58/day with Haiku.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';
const TIMEOUT_MS = 5_000;

// Cache: one prediction per market slug
let _cache = { slug: null, prediction: null, calledAt: null };

/**
 * Get LLM prediction for current market.
 * Returns { direction: 'UP'|'DOWN', confidence: 0.5-1.0, reasoning: string } or null on failure.
 */
export async function getLlmPrediction(marketContext) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const { marketSlug, btcPrice, priceHistory, rsi, orderbookImbalance, polyUp, polyDown, recentTrades, spotDelta1m, spotDelta5s } = marketContext;

  // Cache hit — already called for this market
  if (_cache.slug === marketSlug && _cache.prediction) {
    return _cache.prediction;
  }

  // Build price action string
  const priceStr = Array.isArray(priceHistory) && priceHistory.length > 0
    ? priceHistory.slice(-10).map(p => `$${p.toFixed(0)}`).join(' → ')
    : `$${btcPrice?.toFixed(0) || '?'}`;

  // Recent trades summary
  let tradesStr = 'None';
  if (Array.isArray(recentTrades) && recentTrades.length > 0) {
    tradesStr = recentTrades.slice(-5).map(t => 
      `${t.pnl > 0 ? 'WIN' : 'LOSS'} ${t.side}`
    ).join(', ');
  }

  const prompt = `BTC spot price: $${btcPrice?.toFixed(2) || '?'}
Recent price action (last few minutes): ${priceStr}
1-minute price change: ${spotDelta1m ? (spotDelta1m * 100).toFixed(3) + '%' : '?'}
5-second momentum: ${spotDelta5s ? (spotDelta5s * 100).toFixed(4) + '%' : '?'}
RSI(14): ${rsi?.toFixed(1) || '?'}
Orderbook imbalance: ${orderbookImbalance?.toFixed(2) || '?'} (-1=sellers, +1=buyers)
Polymarket prices: UP ${(polyUp * 100).toFixed(0)}¢ / DOWN ${(polyDown * 100).toFixed(0)}¢
Last trades: ${tradesStr}

Will BTC be HIGHER or LOWER than $${btcPrice?.toFixed(2) || '?'} in exactly 5 minutes?

Think step by step about momentum, support/resistance levels, and market regime. Then respond with ONLY valid JSON:
{"direction":"UP" or "DOWN","confidence":0.50-0.95,"reasoning":"one sentence"}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 150,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[LLM Signal] API error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[LLM Signal] No JSON in response: ${text.slice(0, 100)}`);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const direction = parsed.direction?.toUpperCase();
    const confidence = Math.min(0.95, Math.max(0.5, Number(parsed.confidence) || 0.5));
    const reasoning = parsed.reasoning || '';

    if (direction !== 'UP' && direction !== 'DOWN') {
      console.warn(`[LLM Signal] Invalid direction: ${direction}`);
      return null;
    }

    const prediction = { direction, confidence, reasoning, model: MODEL, calledAt: new Date().toISOString() };

    // Cache it
    _cache = { slug: marketSlug, prediction, calledAt: Date.now() };

    console.log(`[LLM Signal] ${direction} (${(confidence * 100).toFixed(0)}%) — ${reasoning}`);

    return prediction;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[LLM Signal] Timeout');
    } else {
      console.warn(`[LLM Signal] Error: ${err.message}`);
    }
    return null;
  }
}

/**
 * Clear cache (call on market rollover).
 */
export function clearLlmCache() {
  _cache = { slug: null, prediction: null, calledAt: null };
}
