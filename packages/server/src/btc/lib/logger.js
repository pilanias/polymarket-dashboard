/**
 * BTC bot logger — silences verbose output in unified dashboard mode.
 * Set BTC_VERBOSE=1 to see all logs.
 */
const verbose = process.env.BTC_VERBOSE === '1' || process.env.BTC_VERBOSE === 'true';

const originalLog = console.log;
const originalWarn = console.warn;

let installed = false;

export function installQuietMode() {
  if (installed) return;
  installed = true;

  if (verbose) return; // Don't modify anything in verbose mode

  // Suppress verbose console.log AND repetitive console.warn
  const originalWarnFn = console.warn;
  console.warn = (...args) => {
    const msg = args[0];
    if (typeof msg === 'string' && msg.includes('RECONCILIATION DISCREPANCY')) {
      // Log once per minute max
      const now = Date.now();
      if (!console._lastReconWarn || now - console._lastReconWarn > 60000) {
        console._lastReconWarn = now;
        return originalWarnFn(...args);
      }
      return; // suppress
    }
    return originalWarnFn(...args);
  };

  console.log = (...args) => {
    const msg = args[0];
    if (typeof msg !== 'string') return originalLog(...args);

    // Always show critical messages
    if (
      msg.includes('[Boot]') ||
      msg.includes('[BTC]') ||
      msg.includes('[Weather]') ||
      msg.includes('=== Dashboard') ||
      msg.includes('=== Polymarket') ||
      msg.includes('TRADE') ||
      msg.includes('ERROR') ||
      msg.includes('FATAL') ||
      msg.includes('RECONCIL') ||
      msg.includes('[TradeStore]')
    ) {
      return originalLog(...args);
    }

    // Suppress everything else
  };
}

export function restoreConsole() {
  console.log = originalLog;
  console.warn = originalWarn;
}
