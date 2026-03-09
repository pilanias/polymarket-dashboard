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

  const { marketSlug, btcPrice, priceHistory, rsi, orderbookImbalance, polyUp, polyDown, recentTrades, spotDelta1m, spotDelta5s, candles5m, candles1m } = marketContext;

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

  // Build candle summary for longer-timeframe context
  let candleContext = '';
  if (Array.isArray(candles1m) && candles1m.length >= 3) {
    const recent = candles1m.slice(-15); // last 15 minutes of 1m candles
    const highs = recent.map(c => c.high || c.close || 0);
    const lows = recent.map(c => c.low || c.close || 0);
    const closes = recent.map(c => c.close || 0);
    const high15m = Math.max(...highs);
    const low15m = Math.min(...lows.filter(l => l > 0));
    const open15m = closes[0] || 0;
    const close15m = closes[closes.length - 1] || 0;
    const trend15m = close15m > open15m ? 'RISING' : close15m < open15m ? 'FALLING' : 'FLAT';
    const range15m = high15m - low15m;
    
    // Detect momentum exhaustion: last 3 candles getting smaller
    const lastThree = recent.slice(-3);
    const ranges = lastThree.map(c => Math.abs((c.high || c.close) - (c.low || c.close)));
    const exhaustion = ranges.length === 3 && ranges[2] < ranges[1] && ranges[1] < ranges[0];
    
    candleContext = `
15-minute structure: ${trend15m} (open $${open15m.toFixed(0)} → close $${close15m.toFixed(0)}, range $${range15m.toFixed(0)})
15m high: $${high15m.toFixed(0)} | 15m low: $${low15m.toFixed(0)}
Last 3 candle ranges: $${ranges.map(r => r.toFixed(0)).join(', ')} ${exhaustion ? '(SHRINKING — momentum fading)' : ''}
Current price vs 15m range: ${btcPrice >= high15m - range15m * 0.2 ? 'NEAR RESISTANCE' : btcPrice <= low15m + range15m * 0.2 ? 'NEAR SUPPORT' : 'MID-RANGE'}`;
  }

  const prompt = `You are a BTC price prediction model. Analyze this data and predict the next 5 minutes.

CURRENT STATE:
BTC spot: $${btcPrice?.toFixed(2) || '?'}
1-minute change: ${spotDelta1m ? (spotDelta1m * 100).toFixed(3) + '%' : '?'}
5-second momentum: ${spotDelta5s ? (spotDelta5s * 100).toFixed(4) + '%' : '?'}
RSI(14): ${rsi?.toFixed(1) || '?'}
${candleContext}

MARKET DATA:
Orderbook imbalance: ${orderbookImbalance?.toFixed(2) || '?'} (-1=sellers dominant, +1=buyers dominant)
Polymarket prices: UP ${(polyUp * 100).toFixed(0)}¢ / DOWN ${(polyDown * 100).toFixed(0)}¢
Recent tick prices: ${priceStr}

CRITICAL RULES:
- If price is NEAR RESISTANCE after a rally, favor DOWN (mean reversion)
- If price is NEAR SUPPORT after a drop, favor UP (bounce)
- If momentum is FADING (shrinking candle ranges), favor reversal
- If RSI > 70, overbought → favor DOWN. If RSI < 30, oversold → favor UP
- Polymarket prices above 75¢ often revert — be contrarian

Will BTC be HIGHER or LOWER than $${btcPrice?.toFixed(2) || '?'} in exactly 5 minutes?
Respond with ONLY valid JSON:
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
