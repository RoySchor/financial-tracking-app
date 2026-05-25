import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Asset } from '../api/client';

export default function Assets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    bank_group: '', account_name: '', current_amount: '',
    total_dividends: '0', apy: '0', total_interest: '0', fee: '0', notes: '',
  });

  useEffect(() => {
    loadAssets();
  }, []);

  async function loadAssets() {
    try {
      const data = await api.getAssets();
      setAssets(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assets');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.upsertAsset({
        bank_group: form.bank_group,
        account_name: form.account_name,
        current_amount: Number(form.current_amount),
        total_dividends: Number(form.total_dividends),
        apy: Number(form.apy),
        total_interest: Number(form.total_interest),
        fee: Number(form.fee),
        notes: form.notes || null,
      });
      setForm({ bank_group: '', account_name: '', current_amount: '', total_dividends: '0', apy: '0', total_interest: '0', fee: '0', notes: '' });
      await loadAssets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save asset');
    }
  }

  const totalAssets = assets.reduce((sum, a) => sum + a.current_amount, 0);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Assets</h1>
        <p className="text-xl font-semibold text-green-600">
          Total: ${totalAssets.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
          <button onClick={loadAssets} className="ml-4 underline text-sm">Retry</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <input placeholder="Bank/Group" value={form.bank_group} onChange={e => setForm({ ...form, bank_group: e.target.value })} className="border rounded px-3 py-2" required />
        <input placeholder="Account Name" value={form.account_name} onChange={e => setForm({ ...form, account_name: e.target.value })} className="border rounded px-3 py-2" required />
        <input type="number" step="0.01" placeholder="Current Amount" value={form.current_amount} onChange={e => setForm({ ...form, current_amount: e.target.value })} className="border rounded px-3 py-2" required />
        <input type="number" step="0.01" placeholder="Dividends" value={form.total_dividends} onChange={e => setForm({ ...form, total_dividends: e.target.value })} className="border rounded px-3 py-2" />
        <input type="number" step="0.01" placeholder="APY %" value={form.apy} onChange={e => setForm({ ...form, apy: e.target.value })} className="border rounded px-3 py-2" />
        <input type="number" step="0.01" placeholder="Interest" value={form.total_interest} onChange={e => setForm({ ...form, total_interest: e.target.value })} className="border rounded px-3 py-2" />
        <input type="number" step="0.01" placeholder="Fee" value={form.fee} onChange={e => setForm({ ...form, fee: e.target.value })} className="border rounded px-3 py-2" />
        <input placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="border rounded px-3 py-2" />
        <button type="submit" className="col-span-2 md:col-span-4 bg-blue-600 text-white rounded py-2 hover:bg-blue-700">Add / Update</button>
      </form>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Bank/Group</th>
              <th className="px-3 py-2 text-left">Account</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">Dividends</th>
              <th className="px-3 py-2 text-right">APY</th>
              <th className="px-3 py-2 text-right">Interest</th>
              <th className="px-3 py-2 text-right">Fee</th>
              <th className="px-3 py-2 text-left">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {assets.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2">{a.bank_group}</td>
                <td className="px-3 py-2">{a.account_name}</td>
                <td className="px-3 py-2 text-right font-medium">${a.current_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right">${a.total_dividends.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">{a.apy}%</td>
                <td className="px-3 py-2 text-right">${a.total_interest.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">${a.fee.toFixed(2)}</td>
                <td className="px-3 py-2 text-gray-500">{a.last_updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
