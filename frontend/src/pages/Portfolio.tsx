import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis } from 'recharts';
import { api } from '../api/client';
import type { InvestmentSummary, PortfolioSnapshot, PortfolioAccount } from '../api/client';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

export default function Portfolio() {
  const [summary, setSummary] = useState<InvestmentSummary | null>(null);
  const [history, setHistory] = useState<PortfolioSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [s, h] = await Promise.all([
        api.getInvestmentSummary(),
        api.getPortfolioHistory(12),
      ]);
      setSummary(s);
      setHistory(h);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load portfolio data');
    } finally {
      setLoading(false);
    }
  }

  const allocationData = summary?.by_type
    .filter(t => t.total_value > 0)
    .map(t => ({ name: t.asset_type || 'Unknown', value: t.total_value })) ?? [];

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Portfolio</h1>
        <Link
          to="/portfolio/activity"
          className="text-sm bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700"
        >
          View Activity
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error}
          <button onClick={loadData} className="ml-4 underline text-sm">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
              <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : summary && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Portfolio Value</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                ${summary.total_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              {summary.as_of_date && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  As of {new Date(summary.as_of_date + 'T00:00:00').toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Liquid Assets</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                ${summary.liquid_total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <p className="text-sm text-gray-500 dark:text-gray-400">Accounts</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {summary.by_account.length}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <p className="text-sm text-gray-500 dark:text-gray-400">Asset Types</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {summary.by_type.filter(t => t.total_value > 0).length}
              </p>
            </div>
          </div>

          {summary.by_account.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">By Account</h2>
              <div className="space-y-3">
                {summary.by_account.map((acct: PortfolioAccount) => (
                  <Link
                    key={acct.id}
                    to={acct.source === 'manual' ? `/portfolio/manual/${acct.asset_id}` : `/portfolio/${acct.plaid_account_id}`}
                    className="flex justify-between items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900 dark:text-gray-100 font-medium">
                          {acct.account_name || 'Unknown Account'}
                        </span>
                        {acct.institution && (
                          <span className="text-gray-500 dark:text-gray-400 text-sm">
                            {acct.institution}
                          </span>
                        )}
                        {acct.source === 'manual' && (
                          <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded font-medium">
                            Manual
                          </span>
                        )}
                      </div>
                      {acct.source === 'manual' && acct.last_updated && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          Last updated: {new Date(acct.last_updated + 'T00:00:00').toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      ${acct.total_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {allocationData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Asset Allocation</h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={allocationData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                  >
                    {allocationData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {history.length > 1 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Portfolio Value Over Time</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={history} margin={{ top: 10, right: 20, bottom: 30, left: 30 }}>
                  <XAxis
                    dataKey="date"
                    stroke="#9ca3af"
                    tickFormatter={(d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis
                    stroke="#9ca3af"
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip formatter={(val) => `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                  <Line type="monotone" dataKey="total_value" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : history.length === 1 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Portfolio Value Over Time</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                First snapshot recorded today. Check back tomorrow to see trends.
              </p>
            </div>
          )}
        </>
      )}

      {!loading && summary && summary.total_value === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-lg">No investment data yet.</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">
            Connect an investment account (Schwab, Betterment, Wealthfront) and run a sync to see your portfolio here.
          </p>
        </div>
      )}
    </div>
  );
}
