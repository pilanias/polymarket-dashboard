import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatDate(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
}

function parseBucketCenter(label) {
  const text = String(label || '');
  const nums = text.match(/-?\$?\d+(?:\.\d+)?/g) || [];
  const values = nums.map((n) => Number(String(n).replace('$', '')));

  if (values.length >= 2) return (values[0] + values[1]) / 2;
  if (values.length === 1) {
    if (text.includes('<')) return values[0] - 10;
    if (text.includes('>')) return values[0] + 10;
    return values[0];
  }
  return 0;
}

function buildDistributionBars(bucketMap) {
  return Object.entries(bucketMap || {}).map(([bucket, count], index) => ({
    index,
    bucket,
    count: Number(count || 0),
    center: parseBucketCenter(bucket),
  }));
}

function findClosestBucketIndex(rows, target) {
  if (!rows.length) return 0;
  let best = rows[0];
  let bestDelta = Math.abs(rows[0].center - Number(target || 0));

  for (const row of rows) {
    const delta = Math.abs(row.center - Number(target || 0));
    if (delta < bestDelta) {
      best = row;
      bestDelta = delta;
    }
  }
  return best.index;
}

function toHourMap(hourlyRows) {
  const map = new Map();
  for (const row of hourlyRows || []) {
    map.set(Number(row?.hour || 0), {
      hour: Number(row?.hour || 0),
      pnl: Number(row?.pnl || 0),
      trades: Number(row?.trades || 0),
      winRate: Number(row?.winRate || 0),
    });
  }

  return Array.from({ length: 24 }, (_, hour) => {
    const item = map.get(hour);
    return item || { hour, pnl: 0, trades: 0, winRate: 0 };
  });
}

function heatCellClass(value, maxAbs) {
  if (maxAbs <= 0) return 'bg-slate-800 text-slate-200';
  const intensity = Math.min(Math.abs(value) / maxAbs, 1);
  if (value >= 0) {
    if (intensity > 0.66) return 'bg-emerald-500/60 text-emerald-50';
    if (intensity > 0.33) return 'bg-emerald-500/35 text-emerald-50';
    return 'bg-emerald-500/15 text-emerald-100';
  }
  if (intensity > 0.66) return 'bg-red-500/60 text-red-50';
  if (intensity > 0.33) return 'bg-red-500/35 text-red-50';
  return 'bg-red-500/15 text-red-100';
}

function sizeBuckets(rows) {
  if (!rows.length) return [];
  const stakes = rows.map((row) => Number(row.stake || 0));
  const maxStake = Math.max(...stakes, 1);
  const bucketCount = 6;
  const step = Math.max(Math.ceil(maxStake / bucketCount), 1);

  const buckets = Array.from({ length: bucketCount }, (_, idx) => ({
    min: idx * step,
    max: (idx + 1) * step,
    wins: 0,
    total: 0,
  }));

  for (const row of rows) {
    const stake = Number(row.stake || 0);
    const index = Math.min(Math.floor(stake / step), bucketCount - 1);
    const bucket = buckets[index];
    bucket.total += 1;
    if (row.win) bucket.wins += 1;
  }

  return buckets.map((bucket) => ({
    label: `${bucket.min}-${bucket.max}`,
    winRate: bucket.total > 0 ? (bucket.wins / bucket.total) * 100 : 0,
    trades: bucket.total,
  }));
}

function normalizeEquity(series, normalized) {
  const rows = (series || []).map((point) => ({
    date: formatDate(point?.date),
    equity: Number(point?.equity || 0),
    pnl: Number(point?.pnl || 0),
    market: String(point?.market || 'combined').toLowerCase(),
  }));

  if (!normalized || rows.length === 0) return rows;
  const base = rows[0].equity || 1;
  return rows.map((row) => ({
    ...row,
    equity: (row.equity / base) * 100,
  }));
}

const tabList = [
  { id: 'distribution', label: 'Distribution & Edge' },
  { id: 'timing', label: 'Timing' },
  { id: 'size', label: 'Trade Size' },
  { id: 'equity', label: 'Equity Curve' },
];

export default function Analytics() {
  const { data: distributions } = useApi('/api/analytics/distributions');
  const { data: combinedAnalytics } = useApi('/api/analytics/combined');

  const [activeTab, setActiveTab] = useState('distribution');
  const [distributionFilter, setDistributionFilter] = useState('all');
  const [timingFilter, setTimingFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [equityFilter, setEquityFilter] = useState('combined');
  const [normalizedEquity, setNormalizedEquity] = useState(false);

  const pnlDist = distributions?.pnlDistribution?.[distributionFilter] || { buckets: {}, mean: 0, median: 0 };
  const histogramData = buildDistributionBars(pnlDist.buckets || {});
  const meanIndex = findClosestBucketIndex(histogramData, pnlDist.mean);
  const medianIndex = findClosestBucketIndex(histogramData, pnlDist.median);

  const metricsSource =
    distributionFilter === 'bitcoin'
      ? combinedAnalytics?.bitcoin?.metrics
      : distributionFilter === 'weather'
        ? combinedAnalytics?.weather?.metrics
        : combinedAnalytics?.combined?.metrics;

  const timingHourlyRows = toHourMap(distributions?.hourly?.[timingFilter] || []);
  const hourlyMaxAbs = Math.max(...timingHourlyRows.map((row) => Math.abs(row.pnl)), 1);
  const dayRows = (distributions?.dayOfWeek?.[timingFilter] || []).map((row) => ({
    day: String(row?.day || '--'),
    pnl: Number(row?.pnl || 0),
    trades: Number(row?.trades || 0),
    winRate: Number(row?.winRate || 0),
  }));

  const filteredSizes = (distributions?.sizePerformance || []).filter((row) => {
    if (sizeFilter === 'all') return true;
    return String(row?.market || '').toLowerCase() === sizeFilter;
  });

  const scatterWins = filteredSizes
    .filter((row) => Boolean(row?.win))
    .map((row) => ({ x: Number(row?.stake || 0), y: Number(row?.pnl || 0) }));

  const scatterLosses = filteredSizes
    .filter((row) => !Boolean(row?.win))
    .map((row) => ({ x: Number(row?.stake || 0), y: Number(row?.pnl || 0) }));

  const sizeWinRateBars = sizeBuckets(
    filteredSizes.map((row) => ({
      stake: Number(row?.stake || 0),
      win: Boolean(row?.win),
    }))
  );

  const rawEquitySeries =
    equityFilter === 'bitcoin'
      ? combinedAnalytics?.bitcoin?.equitySeries
      : equityFilter === 'weather'
        ? combinedAnalytics?.weather?.equitySeries
        : combinedAnalytics?.combined?.equitySeries;

  const equityRows = normalizeEquity(rawEquitySeries || [], normalizedEquity);

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap gap-2 rounded-lg border border-slate-700 bg-slate-900 p-3">
        {tabList.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              activeTab === tab.id
                ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </section>

      {activeTab === 'distribution' ? (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <article className="rounded-lg border border-slate-700 bg-slate-900 p-4 xl:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">PnL Distribution Histogram</h2>
              <div className="flex gap-2">
                {['all', 'bitcoin', 'weather'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDistributionFilter(key)}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      distributionFilter === key
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {key === 'all' ? 'ALL' : key === 'bitcoin' ? 'Bitcoin' : 'Weather'}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histogramData} margin={{ top: 12, right: 8, left: 0, bottom: 56 }}>
                  <CartesianGrid stroke="#334155" strokeDasharray="4 4" />
                  <XAxis
                    dataKey="index"
                    type="number"
                    stroke="#94a3b8"
                    tickFormatter={(value) => histogramData[value]?.bucket || ''}
                    domain={[0, Math.max(histogramData.length - 1, 1)]}
                    ticks={histogramData.map((row) => row.index)}
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={62}
                  />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#020617', border: '1px solid #334155', borderRadius: 8 }}
                    formatter={(value) => [String(value), 'Count']}
                    labelFormatter={(value) => histogramData[value]?.bucket || '--'}
                  />
                  <ReferenceLine x={meanIndex} stroke="#fbbf24" strokeDasharray="6 4" label="Mean" />
                  <ReferenceLine x={medianIndex} stroke="#a78bfa" strokeDasharray="6 4" label="Median" />
                  <Bar dataKey="count">
                    {histogramData.map((row) => (
                      <Cell key={row.bucket} fill={row.center >= 0 ? '#34d399' : '#f87171'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="rounded-lg border border-slate-700 bg-slate-900 p-4">
            <h3 className="text-base font-semibold">Win/Loss Size</h3>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-3">
                <p className="text-xs uppercase tracking-wide text-emerald-200">Avg Win</p>
                <p className="mt-1 text-2xl font-semibold text-emerald-300">{formatCurrency(metricsSource?.avgWin)}</p>
              </div>
              <div className="rounded border border-red-500/40 bg-red-500/10 p-3">
                <p className="text-xs uppercase tracking-wide text-red-200">Avg Loss</p>
                <p className="mt-1 text-2xl font-semibold text-red-300">{formatCurrency(metricsSource?.avgLoss)}</p>
              </div>
              <div className="rounded border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">
                <p>Profit Factor: {Number(metricsSource?.profitFactor || 0).toFixed(2)}</p>
                <p>Win Rate: {formatPercent(metricsSource?.winRate)}</p>
              </div>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === 'timing' ? (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <article className="rounded-lg border border-slate-700 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Hour-of-Day Heatmap</h2>
              <div className="flex gap-2">
                {['all', 'bitcoin', 'weather'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTimingFilter(key)}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      timingFilter === key ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {key === 'all' ? 'ALL' : key === 'bitcoin' ? 'Bitcoin' : 'Weather'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-6">
              {timingHourlyRows.map((row) => (
                <div
                  key={row.hour}
                  className={`rounded border border-slate-700 p-2 text-center text-xs ${heatCellClass(row.pnl, hourlyMaxAbs)}`}
                  title={`Hour ${row.hour}: ${formatCurrency(row.pnl)} | Trades ${row.trades}`}
                >
                  <p className="font-semibold">{row.hour}</p>
                  <p>{formatCurrency(row.pnl)}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-lg border border-slate-700 bg-slate-900 p-4">
            <h2 className="mb-3 text-lg font-semibold">Day-of-Week Performance</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dayRows} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid stroke="#334155" strokeDasharray="4 4" />
                  <XAxis type="number" stroke="#94a3b8" />
                  <YAxis type="category" dataKey="day" stroke="#94a3b8" width={42} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#020617', border: '1px solid #334155', borderRadius: 8 }}
                    formatter={(value) => formatCurrency(value)}
                  />
                  <Bar dataKey="pnl">
                    {dayRows.map((row) => (
                      <Cell key={row.day} fill={row.pnl >= 0 ? '#34d399' : '#f87171'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === 'size' ? (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <article className="rounded-lg border border-slate-700 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Stake vs PnL Scatter</h2>
              <div className="flex gap-2">
                {['all', 'bitcoin', 'weather'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSizeFilter(key)}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      sizeFilter === key ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {key === 'all' ? 'ALL' : key === 'bitcoin' ? 'Bitcoin' : 'Weather'}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid stroke="#334155" strokeDasharray="4 4" />
                  <XAxis type="number" dataKey="x" name="Stake" stroke="#94a3b8" />
                  <YAxis type="number" dataKey="y" name="PnL" stroke="#94a3b8" />
                  <Tooltip
                    cursor={{ strokeDasharray: '4 4' }}
                    contentStyle={{ backgroundColor: '#020617', border: '1px solid #334155', borderRadius: 8 }}
                    formatter={(value, name) => [formatCurrency(value), name === 'y' ? 'PnL' : 'Stake']}
                  />
                  <Scatter name="Wins" data={scatterWins} fill="#34d399" />
                  <Scatter name="Losses" data={scatterLosses} fill="#f87171" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="rounded-lg border border-slate-700 bg-slate-900 p-4">
            <h2 className="mb-3 text-lg font-semibold">Win Rate by Size Bucket</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sizeWinRateBars}>
                  <CartesianGrid stroke="#334155" strokeDasharray="4 4" />
                  <XAxis dataKey="label" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" tickFormatter={(value) => `${Number(value).toFixed(0)}%`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#020617', border: '1px solid #334155', borderRadius: 8 }}
                    formatter={(value, name) =>
                      name === 'winRate' ? `${Number(value).toFixed(2)}%` : String(Number(value || 0))
                    }
                  />
                  <Bar dataKey="winRate">
                    {sizeWinRateBars.map((row) => (
                      <Cell key={row.label} fill={row.winRate >= 50 ? '#34d399' : '#f87171'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === 'equity' ? (
        <section className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Equity Curve</h2>
            <div className="flex flex-wrap items-center gap-2">
              {['combined', 'bitcoin', 'weather'].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setEquityFilter(key)}
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    equityFilter === key ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {key === 'combined' ? 'Combined' : key === 'bitcoin' ? 'BTC Only' : 'Weather Only'}
                </button>
              ))}
              <label className="inline-flex items-center gap-1 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={normalizedEquity}
                  onChange={(event) => setNormalizedEquity(event.target.checked)}
                  className="h-4 w-4 accent-emerald-500"
                />
                Normalized
              </label>
            </div>
          </div>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={equityRows}>
                <CartesianGrid stroke="#334155" strokeDasharray="4 4" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis
                  stroke="#94a3b8"
                  tickFormatter={(value) =>
                    normalizedEquity ? `${Number(value).toFixed(1)}%` : formatCurrency(value)
                  }
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#020617', border: '1px solid #334155', borderRadius: 8 }}
                  formatter={(value, name) => {
                    if (name === 'equity') {
                      return [normalizedEquity ? `${Number(value).toFixed(2)}%` : formatCurrency(value), 'Equity'];
                    }
                    return [formatCurrency(value), 'PnL'];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="equity"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={(props) => {
                    const pnl = Number(props?.payload?.pnl || 0);
                    const market = String(props?.payload?.market || '').toLowerCase();
                    const fill =
                      market === 'bitcoin'
                        ? '#f97316'
                        : market === 'weather'
                          ? '#06b6d4'
                          : '#10b981';
                    return (
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={Math.abs(pnl) > 20 ? 4 : 2.2}
                        fill={fill}
                        stroke="none"
                      />
                    );
                  }}
                />
                <Scatter dataKey="equity" fill="transparent" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}
    </div>
  );
}
