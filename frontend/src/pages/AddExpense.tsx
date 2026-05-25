import { useState } from 'react';
import { api } from '../api/client';

export default function AddExpense() {
  const [form, setForm] = useState({ date: '', type: '', amount: '' });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.addCashExpense({
        date: form.date,
        type: form.type,
        amount: Number(form.amount),
      });
      setMessage('Expense added!');
      setError(null);
      setForm({ date: '', type: '', amount: '' });
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add expense');
      setMessage('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8 max-w-md">
      <h1 className="text-3xl font-bold text-gray-900">Add Cash Expense</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="border rounded px-3 py-2 w-full" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <input placeholder="e.g. Coffee, Lunch, Groceries" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="border rounded px-3 py-2 w-full" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
          <input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="border rounded px-3 py-2 w-full" required />
        </div>
        <button type="submit" disabled={submitting} className="w-full bg-blue-600 text-white rounded py-2 hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Adding...' : 'Add Expense'}</button>
        {message && <p className="text-green-600 text-sm text-center">{message}</p>}
      </form>
    </div>
  );
}
