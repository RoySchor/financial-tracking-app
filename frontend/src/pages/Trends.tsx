import { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api/client';
import type { MonthlyTotal, Transaction, RangeSummary } from '../api/client';

interface DailySpend {
  day: number;
  total: number;
}

type ViewMode = 'month' | 'range';

export default function Trends() {
  const [mode, setMode] = useState<ViewMode>('month');
  const [yearly, setYearly] = useState<MonthlyTotal[]>([]);
  const [daily, setDaily] = useState<DailySpend[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rangeSummary, setRangeSummary] = useState<RangeSummary | null>(null);
  const [loadingRange, setLoadingRange] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  useEffect(() => {
    if (mode === 'month') loadMonthData();
  }, [year, selectedMonth, mode]);

  async function loadMonthData() {
    try {
      const [yearlyData, txns] = await Promise.all([
        api.getYearlyTotals(year),
        api.getTransactions(selectedMonth, year),
      ]);
      setYearly(yearlyData);

      const byDay: Record<string, number> = {};
      txns.forEach((t: Transaction) => {
        const day = t.date.split('-')[2];
        byDay[day] = (byDay[day] || 0) + t.amount;
      });
      setDaily(
        Object.entries(byDay)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([day, total]) => ({ day: Number(day), total }))
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trends');
    }
  }

  async function loadRangeData() {
    if (!startDate || !endDate) return;
    setLoadingRange(true);
    try {
      const summary = await api.getRangeSummary(startDate, endDate);
      setRangeSummary(summary);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load range data');
    } finally {
      setLoadingRange(false);
    }
  }

  function formatMonthLabel(ym: string) {
    const [y, m] = ym.split('-');
    return `${monthNames[Number(m) - 1]} ${y}`;
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Trends</h1>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setMode('month')}
            className={`px-3 py-2 rounded ${mode === 'month' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}
          >
            Single Month
          </button>
          <button
            onClick={() => setMode('range')}
            className={`px-3 py-2 rounded ${mode === 'range' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}
          >
            Date Range
          </button>
        </div>
      </div>

      {mode === 'month' && (
        <div className="flex gap-2 items-center">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            {monthNames.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border dark:border-gray-600 rounded px-3 py-2 w-24 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>
      )}

      {mode === 'range' && (
        <div className="flex gap-2 items-center flex-wrap">
          <label className="text-gray-600 dark:text-gray-400">From:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          <label className="text-gray-600 dark:text-gray-400">To:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          <button
            onClick={loadRangeData}
            disabled={loadingRange}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loadingRange ? 'Loading...' : 'Load'}
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error}
          <button onClick={mode === 'month' ? loadMonthData : loadRangeData} className="ml-4 underline text-sm">Retry</button>
        </div>
      )}

      {mode === 'month' && (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Monthly Expenses ({year})</h2>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={yearly.map(d => ({ ...d, name: monthNames[d.month - 1] }))} margin={{ top: 10, right: 20, bottom: 30, left: 30 }}>
                <XAxis dataKey="name" stroke="#9ca3af" label={{ value: 'Month', position: 'bottom', offset: 15, fill: '#9ca3af' }} />
                <YAxis stroke="#9ca3af" label={{ value: 'Amount ($)', angle: -90, position: 'left', offset: 15, dy: -20, fill: '#9ca3af' }} />
                <Tooltip formatter={(val) => `$${Number(val).toFixed(2)}`} />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Daily Spending ({monthNames[selectedMonth - 1]} {year})
            </h2>
            <ResponsiveContainer width="100%" height={290}>
              <LineChart data={daily} margin={{ top: 10, right: 20, bottom: 30, left: 30 }}>
                <XAxis dataKey="day" stroke="#9ca3af" label={{ value: 'Day of Month', position: 'bottom', offset: 15, fill: '#9ca3af' }} />
                <YAxis stroke="#9ca3af" label={{ value: 'Amount ($)', angle: -90, position: 'left', offset: 15, dy: -20, fill: '#9ca3af' }} />
                <Tooltip formatter={(val) => `$${Number(val).toFixed(2)}`} />
                <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {mode === 'range' && rangeSummary && (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Total Spending: ${rangeSummary.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">{startDate} to {endDate}</p>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={rangeSummary.by_month.map(d => ({ ...d, name: formatMonthLabel(d.month) }))} margin={{ top: 10, right: 20, bottom: 30, left: 30 }}>
                <XAxis dataKey="name" stroke="#9ca3af" label={{ value: 'Month', position: 'bottom', offset: 15, fill: '#9ca3af' }} />
                <YAxis stroke="#9ca3af" label={{ value: 'Amount ($)', angle: -90, position: 'left', offset: 15, dy: -20, fill: '#9ca3af' }} />
                <Tooltip formatter={(val) => `$${Number(val).toFixed(2)}`} />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Spending by Category</h2>
            <div className="space-y-2">
              {rangeSummary.by_category.map((cat) => (
                <div key={cat.type} className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-gray-800 dark:text-gray-200">{cat.type}</span>
                  <div className="text-right">
                    <span className="font-medium text-gray-900 dark:text-gray-100">${cat.total.toFixed(2)}</span>
                    <span className="text-gray-400 text-sm ml-2">({cat.count}x)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
