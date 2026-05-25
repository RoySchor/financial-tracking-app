import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { RecurringExpense } from '../api/client';

export default function Recurring() {
  const [expenses, setExpenses] = useState<RecurringExpense[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRecurring();
  }, []);

  async function loadRecurring() {
    try {
      const data = await api.getRecurring();
      setExpenses(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load recurring expenses');
    }
  }

  async function handleSave(id: number) {
    try {
      await api.updateRecurring(id, { amount: Number(editAmount) });
      setEditing(null);
      await loadRecurring();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update expense');
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

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">Label</th>
              <th className="px-4 py-3 text-left">Full Name</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Day</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
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
                      <button onClick={() => handleSave(expense.id)} className="text-green-600 hover:text-green-800 text-sm">Save</button>
                      <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-gray-700 text-sm">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditing(expense.id); setEditAmount(String(expense.amount)); }}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Edit
                    </button>
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
        </table>
      </div>
    </div>
  );
}
