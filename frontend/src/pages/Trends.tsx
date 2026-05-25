import { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api/client';
import type { MonthlyTotal, Transaction } from '../api/client';

interface DailySpend {
  day: number;
  total: number;
}

export default function Trends() {
  const [yearly, setYearly] = useState<MonthlyTotal[]>([]);
  const [daily, setDaily] = useState<DailySpend[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [error, setError] = useState<string | null>(null);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  useEffect(() => {
    loadData();
  }, [year, selectedMonth]);

  async function loadData() {
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

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Trends</h1>
        <div className="flex gap-2">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="border rounded px-3 py-2"
          >
            {monthNames.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border rounded px-3 py-2 w-24"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
          <button onClick={loadData} className="ml-4 underline text-sm">Retry</button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Monthly Expenses ({year})</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={yearly.map(d => ({ ...d, name: monthNames[d.month - 1] }))}>
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(val) => `$${Number(val).toFixed(2)}`} />
            <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Daily Spending ({monthNames[selectedMonth - 1]} {year})
        </h2>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={daily}>
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip formatter={(val) => `$${Number(val).toFixed(2)}`} />
            <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
