import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { IncomeEntry } from '../api/client';

export default function Income() {
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: '', type: 'Paycheck', gross_pay: '', taxes: '',
    pre_tax_deductions: '', post_tax_deductions: '', net_pay: '', information: '',
  });

  useEffect(() => {
    loadIncome();
  }, [year]);

  async function loadIncome() {
    setLoading(true);
    try {
      const data = await api.getIncome(year);
      setEntries(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load income');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.addIncome({
        ...form,
        gross_pay: Number(form.gross_pay),
        taxes: Number(form.taxes),
        pre_tax_deductions: Number(form.pre_tax_deductions),
        post_tax_deductions: Number(form.post_tax_deductions),
        net_pay: Number(form.net_pay),
        information: form.information || null,
      });
      setForm({ date: '', type: 'Paycheck', gross_pay: '', taxes: '', pre_tax_deductions: '', post_tax_deductions: '', net_pay: '', information: '' });
      await loadIncome();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add income entry');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Income</h1>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border dark:border-gray-600 rounded px-3 py-2 w-24 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        />
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error}
          <button onClick={loadIncome} className="ml-4 underline text-sm">Retry</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
        <input placeholder="Type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
        <input type="number" step="0.01" placeholder="Gross Pay" value={form.gross_pay} onChange={e => setForm({ ...form, gross_pay: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
        <input type="number" step="0.01" placeholder="Taxes" value={form.taxes} onChange={e => setForm({ ...form, taxes: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
        <input type="number" step="0.01" placeholder="Pre-Tax Deductions" value={form.pre_tax_deductions} onChange={e => setForm({ ...form, pre_tax_deductions: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
        <input type="number" step="0.01" placeholder="Post-Tax Deductions" value={form.post_tax_deductions} onChange={e => setForm({ ...form, post_tax_deductions: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
        <input type="number" step="0.01" placeholder="Net Pay" value={form.net_pay} onChange={e => setForm({ ...form, net_pay: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
        <input placeholder="Notes (optional)" value={form.information} onChange={e => setForm({ ...form, information: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
        <button type="submit" disabled={submitting} className="col-span-2 md:col-span-4 bg-blue-600 text-white rounded py-2 hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Adding...' : 'Add Entry'}</button>
      </form>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
        <table className="w-full text-base">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">Date</th>
              <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">Type</th>
              <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">Gross</th>
              <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">Taxes</th>
              <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">Pre-Tax</th>
              <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">Post-Tax</th>
              <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">Net</th>
              <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">Notes</th>
            </tr>
          </thead>
          {loading ? (
            <tbody>
              {[...Array(5)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={8} className="px-3 py-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </td>
                </tr>
              ))}
            </tbody>
          ) : (
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{entry.date}</td>
                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{entry.type}</td>
                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">${entry.gross_pay.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">${entry.taxes.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">${entry.pre_tax_deductions.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">${entry.post_tax_deductions.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">${entry.net_pay.toFixed(2)}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{entry.information}</td>
                </tr>
              ))}
              {entries.length === 0 && !error && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    No income entries for this year.
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
