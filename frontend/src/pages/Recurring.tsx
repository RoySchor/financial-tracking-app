import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { RecurringExpense } from '../api/client';

export default function Recurring() {
  const [expenses, setExpenses] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ label: '', full_name: '', amount: '', day_of_month: '' });

  useEffect(() => {
    loadRecurring();
  }, []);

  async function loadRecurring() {
    setLoading(true);
    try {
      const data = await api.getRecurring();
      setExpenses(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load recurring expenses');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(id: number) {
    setSubmitting(true);
    try {
      await api.updateRecurring(id, { amount: Number(editAmount) });
      setEditing(null);
      await loadRecurring();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update expense');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createRecurring({
        label: form.label,
        full_name: form.full_name,
        amount: Number(form.amount),
        day_of_month: Number(form.day_of_month),
      });
      setForm({ label: '', full_name: '', amount: '', day_of_month: '' });
      await loadRecurring();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create expense');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    setSubmitting(true);
    try {
      await api.deleteRecurring(id);
      await loadRecurring();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete expense');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-900">Recurring Expenses</h1>
      <p className="text-gray-500">
        Changes here update both the database and the _Expenses Template in Google Sheets.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
          <button onClick={loadRecurring} className="ml-4 underline text-sm">Retry</button>
        </div>
      )}

      <form onSubmit={handleCreate} className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold mb-3">Add Recurring Expense</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            type="text"
            placeholder="Label (e.g. 401k)"
            value={form.label}
            onChange={(e) => setForm(prev => ({ ...prev, label: e.target.value }))}
            className="border rounded px-3 py-2"
            required
          />
          <input
            type="text"
            placeholder="Full Name"
            value={form.full_name}
            onChange={(e) => setForm(prev => ({ ...prev, full_name: e.target.value }))}
            className="border rounded px-3 py-2"
            required
          />
          <input
            type="number"
            step="0.01"
            placeholder="Amount ($)"
            value={form.amount}
            onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
            className="border rounded px-3 py-2"
            required
          />
          <input
            type="number"
            min="1"
            max="31"
            placeholder="Day (1-31)"
            value={form.day_of_month}
            onChange={(e) => setForm(prev => ({ ...prev, day_of_month: e.target.value }))}
            className="border rounded px-3 py-2"
            required
          />
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Adding...' : 'Add'}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-base">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">Label</th>
              <th className="px-4 py-3 text-left">Full Name</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Day</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          {loading ? (
            <tbody>
              {[...Array(4)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                  </td>
                </tr>
              ))}
            </tbody>
          ) : (
            <tbody className="divide-y">
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td className="px-4 py-3 font-medium">{expense.label}</td>
                  <td className="px-4 py-3 text-gray-600">{expense.full_name}</td>
                  <td className="px-4 py-3 text-right">
                    {editing === expense.id ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editAmount}
                        onChange={(ev) => setEditAmount(ev.target.value)}
                        className="border rounded px-2 py-1 w-28 text-right"
                        autoFocus
                      />
                    ) : (
                      `$${expense.amount.toFixed(2)}`
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{expense.day_of_month}</td>
                  <td className="px-4 py-3 text-right">
                    {editing === expense.id ? (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleSave(expense.id)}
                          disabled={submitting}
                          className="text-green-600 hover:text-green-800 text-sm disabled:opacity-50"
                        >
                          {submitting ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-gray-700 text-sm">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => { setEditing(expense.id); setEditAmount(String(expense.amount)); }}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(expense.id)}
                          disabled={submitting}
                          className="text-red-600 hover:text-red-800 text-sm disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && !error && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No recurring expenses configured yet.
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
