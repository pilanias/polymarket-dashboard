import { useMemo, useState } from 'react';
import useApi from '../hooks/useApi.js';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function toTimestamp(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function normalizeBtcTrades(trades) {
  return (trades || []).map((trade, index) => ({
    id: String(trade?.id || `btc-${index}`),
    market: 'BTC',
    entryTime: trade?.entryTime || trade?.timestamp || null,
    exitTime: trade?.exitTime || trade?.timestamp || null,
    side: String(trade?.side || '--').toUpperCase(),
    stake: Number(trade?.stakeUsd || trade?.stake || trade?.stake_usd || 0),
    entryPrice: Number(trade?.entryPrice || trade?.entry_price || trade?.entryPolyPrice || 0),
    exitDisplay:
      trade?.exitPrice != null
        ? Number(trade.exitPrice)
        : trade?.exit_price != null
          ? Number(trade.exit_price)
          : null,
    pnl: Number(trade?.pnl || 0),
    exitMeta: String(trade?.exitReason || trade?.reason || '--'),
    result:
      trade?.result != null
        ? String(trade.result).toUpperCase()
        : Number(trade?.pnl || 0) >= 0
          ? 'WIN'
          : 'LOSS',
  }));
}

function normalizeWeatherTrades(trades) {
  return (trades || []).map((trade, index) => ({
    id: String(trade?.id || `weather-${index}`),
    market: 'Weather',
    entryTime: trade?.created_at || null,
    exitTime: trade?.resolved_at || null,
    side: String(trade?.side || '--').toUpperCase(),
    stake: Number(trade?.stake_usd || 0),
    entryPrice: Number(trade?.entry_price || 0),
    exitDisplay: '--',
    pnl: Number(trade?.pnl || 0),
    exitMeta: String(trade?.city || '--'),
    result:
      trade?.result != null
        ? String(trade.result).toUpperCase()
        : Number(trade?.pnl || 0) >= 0
          ? 'WIN'
          : 'LOSS',
  }));
}

const sortableColumns = {
  market: (row) => row.market,
  entryTime: (row) => toTimestamp(row.entryTime),
  exitTime: (row) => toTimestamp(row.exitTime),
  side: (row) => row.side,
  stake: (row) => Number(row.stake || 0),
  entryPrice: (row) => Number(row.entryPrice || 0),
  exitDisplay: (row) => (typeof row.exitDisplay === 'number' ? row.exitDisplay : Number.NEGATIVE_INFINITY),
  pnl: (row) => Number(row.pnl || 0),
  exitMeta: (row) => row.exitMeta,
};

export default function Trades() {
  const { data: btcTrades } = useApi('/api/btc/trades');
  const { data: weatherTrades } = useApi('/api/weather/trades');

  const [marketFilter, setMarketFilter] = useState('ALL');
  const [resultFilter, setResultFilter] = useState('ALL');
  const [sideFilter, setSideFilter] = useState('ALL');
  const [pageSize, setPageSize] = useState('20');
  const [sortBy, setSortBy] = useState('exitTime');
  const [sortDir, setSortDir] = useState('desc');

  const unifiedTrades = useMemo(() => {
    return [...normalizeBtcTrades(btcTrades), ...normalizeWeatherTrades(weatherTrades)];
  }, [btcTrades, weatherTrades]);

  const filteredTrades = useMemo(() => {
    return unifiedTrades.filter((row) => {
      if (marketFilter !== 'ALL' && row.market !== marketFilter) return false;
      if (resultFilter !== 'ALL' && row.result !== resultFilter) return false;
      if (sideFilter !== 'ALL' && row.side !== sideFilter) return false;
      return true;
    });
  }, [unifiedTrades, marketFilter, resultFilter, sideFilter]);

  const sortedTrades = useMemo(() => {
    const getter = sortableColumns[sortBy] || sortableColumns.exitTime;
    const direction = sortDir === 'asc' ? 1 : -1;

    return [...filteredTrades].sort((a, b) => {
      const av = getter(a);
      const bv = getter(b);

      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * direction;
      }
      return (Number(av || 0) - Number(bv || 0)) * direction;
    });
  }, [filteredTrades, sortBy, sortDir]);

  const visibleTrades = useMemo(() => {
    if (pageSize === 'ALL') return sortedTrades;
    const limit = Number(pageSize || 20);
    return sortedTrades.slice(0, limit);
  }, [sortedTrades, pageSize]);

  const uniqueSides = useMemo(() => {
    const values = new Set(unifiedTrades.map((trade) => trade.side));
    return Array.from(values).filter(Boolean).sort();
  }, [unifiedTrades]);

  function toggleSort(column) {
    if (sortBy === column) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(column);
    setSortDir('desc');
  }

  function SortHeader({ column, label }) {
    const active = sortBy === column;
    return (
      <button
        type="button"
        onClick={() => toggleSort(column)}
        className="inline-flex items-center gap-1 text-left font-medium text-slate-200 hover:text-white"
      >
        {label}
        <span className="text-xs text-slate-400">{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <h1 className="text-lg font-semibold">Unified Trades</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={marketFilter}
            onChange={(event) => setMarketFilter(event.target.value)}
            className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
          >
            <option value="ALL">Market: ALL</option>
            <option value="BTC">Market: BTC</option>
            <option value="Weather">Market: Weather</option>
          </select>

          <select
            value={resultFilter}
            onChange={(event) => setResultFilter(event.target.value)}
            className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
          >
            <option value="ALL">Result: ALL</option>
            <option value="WIN">Result: WIN</option>
            <option value="LOSS">Result: LOSS</option>
          </select>

          <select
            value={sideFilter}
            onChange={(event) => setSideFilter(event.target.value)}
            className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
          >
            <option value="ALL">Side: ALL</option>
            {uniqueSides.map((side) => (
              <option key={side} value={side}>
                Side: {side}
              </option>
            ))}
          </select>

          <select
            value={pageSize}
            onChange={(event) => setPageSize(event.target.value)}
            className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
          >
            <option value="20">Show: 20</option>
            <option value="50">Show: 50</option>
            <option value="100">Show: 100</option>
            <option value="ALL">Show: All</option>
          </select>
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-900">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-800 text-left">
            <tr>
              <th className="px-3 py-2"><SortHeader column="market" label="Market" /></th>
              <th className="px-3 py-2"><SortHeader column="entryTime" label="Entry Time" /></th>
              <th className="px-3 py-2"><SortHeader column="exitTime" label="Exit Time" /></th>
              <th className="px-3 py-2"><SortHeader column="side" label="Side" /></th>
              <th className="px-3 py-2"><SortHeader column="stake" label="Stake" /></th>
              <th className="px-3 py-2"><SortHeader column="entryPrice" label="Entry Price" /></th>
              <th className="px-3 py-2"><SortHeader column="exitDisplay" label="Exit Price / Result" /></th>
              <th className="px-3 py-2"><SortHeader column="pnl" label="P&L" /></th>
              <th className="px-3 py-2"><SortHeader column="exitMeta" label="Exit Reason / City" /></th>
            </tr>
          </thead>
          <tbody>
            {visibleTrades.map((row) => (
              <tr key={`${row.market}-${row.id}`} className="border-t border-slate-700 bg-slate-950">
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-semibold ${
                      row.market === 'BTC' ? 'bg-orange-500/20 text-orange-300' : 'bg-cyan-500/20 text-cyan-300'
                    }`}
                  >
                    {row.market}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-300">{formatDateTime(row.entryTime)}</td>
                <td className="px-3 py-2 text-slate-300">{formatDateTime(row.exitTime)}</td>
                <td className="px-3 py-2">{row.side}</td>
                <td className="px-3 py-2 text-slate-300">{formatCurrency(row.stake)}</td>
                <td className="px-3 py-2 text-slate-300">{formatCurrency(row.entryPrice)}</td>
                <td className="px-3 py-2 text-slate-300">
                  {typeof row.exitDisplay === 'number' ? formatCurrency(row.exitDisplay) : row.exitDisplay}
                </td>
                <td className={`px-3 py-2 font-medium ${row.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCurrency(row.pnl)}
                </td>
                <td className="px-3 py-2 text-slate-300">{row.exitMeta}</td>
              </tr>
            ))}
            {visibleTrades.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-400">
                  No trades match filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
