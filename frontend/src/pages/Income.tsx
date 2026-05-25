import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { IncomeEntry } from '../api/client';

export default function Income() {
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
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
    try {
      const data = await api.getIncome(year);
      setEntries(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load income');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Income</h1>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border rounded px-3 py-2 w-24"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
          <button onClick={loadIncome} className="ml-4 underline text-sm">Retry</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="border rounded px-3 py-2" required />
        <input placeholder="Type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="border rounded px-3 py-2" required />
        <input type="number" step="0.01" placeholder="Gross Pay" value={form.gross_pay} onChange={e => setForm({ ...form, gross_pay: e.target.value })} className="border rounded px-3 py-2" required />
        <input type="number" step="0.01" placeholder="Taxes" value={form.taxes} onChange={e => setForm({ ...form, taxes: e.target.value })} className="border rounded px-3 py-2" required />
        <input type="number" step="0.01" placeholder="Pre-Tax Deductions" value={form.pre_tax_deductions} onChange={e => setForm({ ...form, pre_tax_deductions: e.target.value })} className="border rounded px-3 py-2" required />
        <input type="number" step="0.01" placeholder="Post-Tax Deductions" value={form.post_tax_deductions} onChange={e => setForm({ ...form, post_tax_deductions: e.target.value })} className="border rounded px-3 py-2" required />
        <input type="number" step="0.01" placeholder="Net Pay" value={form.net_pay} onChange={e => setForm({ ...form, net_pay: e.target.value })} className="border rounded px-3 py-2" required />
        <input placeholder="Notes (optional)" value={form.information} onChange={e => setForm({ ...form, information: e.target.value })} className="border rounded px-3 py-2" />
        <button type="submit" className="col-span-2 md:col-span-4 bg-blue-600 text-white rounded py-2 hover:bg-blue-700">Add Entry</button>
      </form>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-right">Gross</th>
              <th className="px-3 py-2 text-right">Taxes</th>
              <th className="px-3 py-2 text-right">Pre-Tax</th>
              <th className="px-3 py-2 text-right">Post-Tax</th>
              <th className="px-3 py-2 text-right">Net</th>
              <th className="px-3 py-2 text-left">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="px-3 py-2">{entry.date}</td>
                <td className="px-3 py-2">{entry.type}</td>
                <td className="px-3 py-2 text-right">${entry.gross_pay.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">${entry.taxes.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">${entry.pre_tax_deductions.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">${entry.post_tax_deductions.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-medium">${entry.net_pay.toFixed(2)}</td>
                <td className="px-3 py-2 text-gray-500">{entry.information}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
