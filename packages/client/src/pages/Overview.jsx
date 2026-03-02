import StatCard from '../components/StatCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useApi } from '../hooks/useApi.js';

const currency = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));

const resolve = (data) => (data && typeof data === 'object' && data.data ? data.data : data);

export default function Overview() {
  const btc = useApi('/api/btc/status');
  const weather = useApi('/api/weather/status');

  if (btc.loading || weather.loading) return <p className="text-slate-300">Loading...</p>;
  if (btc.error || weather.error) {
    return <p className="text-red-400">{btc.error || weather.error}</p>;
  }

  const b = resolve(btc.data) || {};
  const w = resolve(weather.data) || {};

  // BTC fields from assembleStatus()
  const btcPnl = b.balance?.realized ?? b.ledgerSummary?.totalPnL ?? 0;
  const btcTradeCount = b.ledgerSummary?.totalTrades ?? 0;
  const btcMode = b.mode ?? 'Unknown';
  const btcEnabled = b.tradingEnabled ?? false;
  const btcBalance = b.balance?.balance ?? 0;
  const btcWinRate = b.ledgerSummary?.winRate ?? 0;

  // Weather fields from weather status endpoint
  const weatherBankroll = w.bankroll ?? 0;
  const weatherOpenTrades = w.openTrades ?? 0;
  const weatherMode = w.tradingMode ?? 'Unknown';

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Overview</h2>
        <p className="text-slate-400">Combined status for BTC and Weather trading bots.</p>
      </header>

      {/* BTC Section */}
      <div>
        <h3 className="mb-3 text-lg font-semibold text-slate-200">BTC 5-Min Trader</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Status</p>
            <StatusBadge status={btcEnabled ? 'Running' : 'Stopped'} />
            <p className="mt-1 text-xs text-slate-500">Mode: {btcMode}</p>
          </div>
          <StatCard
            label="Balance"
            value={currency(btcBalance)}
          />
          <StatCard
            label="Realized P&L"
            value={currency(btcPnl)}
            color={btcPnl >= 0 ? 'profit' : 'loss'}
          />
          <StatCard label="Trades" value={btcTradeCount} trend={`Win rate: ${(btcWinRate * 100).toFixed(1)}%`} />
        </div>
      </div>

      {/* Weather Section */}
      <div>
        <h3 className="mb-3 text-lg font-semibold text-slate-200">Weather Bot</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Status</p>
            <StatusBadge status={w.tradingEnabled !== false ? 'Running' : 'Stopped'} />
            <p className="mt-1 text-xs text-slate-500">Mode: {weatherMode}</p>
          </div>
          <StatCard
            label="Bankroll"
            value={currency(weatherBankroll)}
          />
          <StatCard label="Open Trades" value={weatherOpenTrades} />
          <StatCard
            label="Uptime"
            value={w.uptime ? `${Math.floor(w.uptime / 60)}m` : '—'}
          />
        </div>
      </div>
    </section>
  );
}
