import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api/client';
import type { TransactionSummary, MonthlyTotal, AppStatus } from '../api/client';

export default function Dashboard() {
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [yearly, setYearly] = useState<MonthlyTotal[]>([]);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  useEffect(() => {
    loadData().then((st) => {
      if (!st?.last_sync) {
        triggerSync();
        return;
      }
      const elapsed = Date.now() - new Date(st.last_sync).getTime();
      if (elapsed >= 30 * 60 * 1000) triggerSync();
    });
  }, []);

  async function loadData(): Promise<AppStatus | null> {
    setLoading(true);
    try {
      const [s, y, st] = await Promise.all([
        api.getTransactionSummary(month, year),
        api.getYearlyTotals(year),
        api.getStatus(),
      ]);
      setSummary(s);
      setYearly(y);
      setStatus(st);
      setError(null);
      return st;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function triggerSync() {
    setSyncing(true);
    try {
      await api.triggerSync();
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <div className="flex items-center gap-4">
          {status && status.failed_sheets_writes > 0 && (
            <span className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-1 rounded-full">
              {status.failed_sheets_writes} failed Sheets writes
            </span>
          )}
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="text-sm bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error}
          <button onClick={loadData} className="ml-4 underline text-sm">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {loading ? (
          <>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
                <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <p className="text-sm text-gray-500 dark:text-gray-400">Monthly Expenses</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                ${summary?.total?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '0.00'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <p className="text-sm text-gray-500 dark:text-gray-400">Last Sync</p>
              <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
                {status?.last_sync ? new Date(status.last_sync).toLocaleString() : 'Never'}
              </p>
            </div>
          </>
        )}
      </div>

      {summary && summary.top5.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Top 5 Expenses This Month</h2>
          <div className="space-y-3">
            {summary.top5.map((item, i) => (
              <div key={i} className="flex justify-between items-center">
                <span className="text-gray-700 dark:text-gray-300">{item.type}</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">${item.total.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {yearly.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{year} Monthly Expenses</h2>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={yearly.map(d => ({ ...d, name: monthNames[d.month - 1] }))} margin={{ top: 10, right: 20, bottom: 30, left: 30 }}>
              <XAxis dataKey="name" stroke="#9ca3af" label={{ value: 'Month', position: 'bottom', offset: 15, fill: '#9ca3af' }} />
              <YAxis stroke="#9ca3af" label={{ value: 'Amount ($)', angle: -90, position: 'left', offset: 15, dy: -20, fill: '#9ca3af' }} />
              <Tooltip formatter={(val) => `$${Number(val).toFixed(2)}`} />
              <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
