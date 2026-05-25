import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Transaction } from '../api/client';

export default function MonthView() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTransactions();
  }, [month, year]);

  async function loadTransactions() {
    setLoading(true);
    try {
      const data = await api.getTransactions(month, year);
      setTransactions(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Are you sure you want to delete this transaction?')) return;
    setSubmitting(true);
    try {
      await api.deleteTransaction(id);
      await loadTransactions();
      window.alert('Transaction deleted. Remember to manually remove it from the Google Sheet.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete transaction');
    } finally {
      setSubmitting(false);
    }
  }

  const total = transactions.reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Month View</h1>
        <div className="flex gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i).toLocaleString('default', { month: 'long' })}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border dark:border-gray-600 rounded px-3 py-2 w-24 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error}
          <button onClick={loadTransactions} className="ml-4 underline text-sm">Retry</button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        {loading ? (
          <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        ) : (
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Total: ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-300">Date</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-300">Type</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-300">Amount</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-300">Source</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          {loading ? (
            <tbody>
              {[...Array(8)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </td>
                </tr>
              ))}
            </tbody>
          ) : (
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{t.date}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{t.type}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">${t.amount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{t.account_name || t.source}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(t.id)} disabled={submitting} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm disabled:opacity-50">Delete</button>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && !error && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No transactions for this month.
                  </td>
                </tr>
              )}
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}
