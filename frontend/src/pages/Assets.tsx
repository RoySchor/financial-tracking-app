import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Asset } from '../api/client';

export default function Assets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    bank_group: '', account_name: '', current_amount: '',
    total_dividends: '', apy: '', total_interest: '', fee: '', notes: '',
  });

  const [selectedAsset, setSelectedAsset] = useState('');
  const uniqueAssets = assets.map(a => ({ bank_group: a.bank_group, account_name: a.account_name, notes: a.notes }));

  function handleSelectExisting(value: string) {
    setSelectedAsset(value);
    if (!value) {
      setForm({ bank_group: '', account_name: '', current_amount: '', total_dividends: '', apy: '', total_interest: '', fee: '', notes: '' });
      return;
    }
    const match = assets.find(a => `${a.bank_group}|||${a.account_name}` === value);
    if (match) {
      setForm(prev => ({
        ...prev,
        bank_group: match.bank_group,
        account_name: match.account_name,
        notes: match.notes || '',
      }));
    }
  }

  useEffect(() => {
    loadAssets();
  }, []);

  async function loadAssets() {
    setLoading(true);
    try {
      const data = await api.getAssets();
      setAssets(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.upsertAsset({
        bank_group: form.bank_group,
        account_name: form.account_name,
        current_amount: Number(form.current_amount),
        total_dividends: Number(form.total_dividends || 0),
        apy: Number(form.apy || 0),
        total_interest: Number(form.total_interest || 0),
        fee: Number(form.fee || 0),
        notes: form.notes || null,
      });
      setForm({ bank_group: '', account_name: '', current_amount: '', total_dividends: '', apy: '', total_interest: '', fee: '', notes: '' });
      await loadAssets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save asset');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Are you sure you want to delete this asset?')) return;
    setSubmitting(true);
    try {
      await api.deleteAsset(id);
      await loadAssets();
      window.alert('Asset deleted. Remember to manually remove it from the Google Sheet.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete asset');
    } finally {
      setSubmitting(false);
    }
  }

  const totalAssets = assets.reduce((sum, a) => sum + a.current_amount, 0);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Non-Synced Accounts</h1>
        <p className="text-xl font-semibold text-green-600 dark:text-green-400">
          Total: ${totalAssets.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error}
          <button onClick={loadAssets} className="ml-4 underline text-sm">Retry</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
        <div>
          <select
            onChange={e => handleSelectExisting(e.target.value)}
            className="border dark:border-gray-600 rounded px-3 py-2 w-full text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700"
            value={selectedAsset}
          >
            <option value="">Select existing account to update...</option>
            {uniqueAssets.map(a => (
              <option key={`${a.bank_group}|||${a.account_name}`} value={`${a.bank_group}|||${a.account_name}`}>
                {a.bank_group} — {a.account_name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <input placeholder="Bank / Holding Group" value={form.bank_group} onChange={e => setForm({ ...form, bank_group: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
          <input placeholder="Account Name" value={form.account_name} onChange={e => setForm({ ...form, account_name: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
          <input type="number" step="0.01" placeholder="Current Amount ($)" value={form.current_amount} onChange={e => setForm({ ...form, current_amount: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
          <input type="number" step="0.01" placeholder="Total Dividends ($)" value={form.total_dividends} onChange={e => setForm({ ...form, total_dividends: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          <input type="number" step="0.01" placeholder="APY (%)" value={form.apy} onChange={e => setForm({ ...form, apy: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          <input type="number" step="0.01" placeholder="Total Interest Earned ($)" value={form.total_interest} onChange={e => setForm({ ...form, total_interest: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          <input type="number" step="0.01" placeholder="Fee (%)" value={form.fee} onChange={e => setForm({ ...form, fee: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          <input placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
        </div>
        <button type="submit" disabled={submitting} className="w-full bg-blue-600 text-white rounded py-2 hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Saving...' : 'Add / Update Asset'}</button>
      </form>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
        <table className="w-full text-base">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">Bank/Group</th>
              <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">Account</th>
              <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">Amount</th>
              <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">Dividends</th>
              <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">APY</th>
              <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">Interest</th>
              <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">Fee</th>
              <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">Notes</th>
              <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">Updated</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          {loading ? (
            <tbody>
              {[...Array(5)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={10} className="px-3 py-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </td>
                </tr>
              ))}
            </tbody>
          ) : (
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {assets.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{a.bank_group}</td>
                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{a.account_name}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">${a.current_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">${a.total_dividends.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{a.apy}%</td>
                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">${a.total_interest.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">${a.fee.toFixed(2)}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400 max-w-xs whitespace-normal">{a.notes}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{a.last_updated}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => handleDelete(a.id)} disabled={submitting} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm disabled:opacity-50">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}
