import { useState } from 'react';
import { api } from '../api/client';

interface ParsedExpense {
  amount: number;
  type: string;
  date: string;
  raw: string;
}

function parseExpenses(text: string): { parsed: ParsedExpense[]; errors: string[] } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const parsed: ParsedExpense[] = [];
  const errors: string[] = [];

  for (const line of lines) {
    // Date is always at the end: M.D.YY, M/D/YY, M.D.YYYY, M/D/YYYY
    const dateMatch = line.match(/^(.+?)\s+(\d{1,2}[./]\d{1,2}[./]\d{2,4})$/);
    if (!dateMatch) {
      errors.push(line);
      continue;
    }
    const [, body, dateStr] = dateMatch;
    const [m, d, y] = dateStr.split(/[./]/);
    const fullYear = y.length === 2 ? `20${y}` : y;
    const date = `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

    // Amount can be anywhere in the body: "$6 pizza" or "pizza $6" or "fish + garlic $16"
    const amountMatch = body.match(/\$(\d+\.?\d*)/);
    if (!amountMatch) {
      errors.push(line);
      continue;
    }
    const amount = parseFloat(amountMatch[1]);
    if (isNaN(amount)) {
      errors.push(line);
      continue;
    }

    const description = body.replace(/\$\d+\.?\d*/, '').replace(/\s{2,}/g, ' ').trim();
    if (!description) {
      errors.push(line);
      continue;
    }

    parsed.push({ amount, type: description, date, raw: line });
  }

  return { parsed, errors };
}

export default function AddExpense() {
  const [form, setForm] = useState({ date: '', type: '', amount: '' });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [bulkText, setBulkText] = useState('');
  const [staged, setStaged] = useState<ParsedExpense[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');

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

  function handleParse() {
    const { parsed, errors } = parseExpenses(bulkText);
    setStaged(parsed);
    setParseErrors(errors);
    setBulkMessage('');
  }

  function removeStaged(index: number) {
    setStaged(prev => prev.filter((_, i) => i !== index));
  }

  async function handleBulkSubmit() {
    if (staged.length === 0) return;
    setBulkSubmitting(true);
    try {
      for (const expense of staged) {
        await api.addCashExpense({
          date: expense.date,
          type: expense.type,
          amount: expense.amount,
        });
      }
      setBulkMessage(`Added ${staged.length} expense${staged.length > 1 ? 's' : ''}!`);
      setStaged([]);
      setBulkText('');
      setParseErrors([]);
      setTimeout(() => setBulkMessage(''), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add bulk expenses');
    } finally {
      setBulkSubmitting(false);
    }
  }

  return (
    <div className="space-y-10">
      <div className="space-y-8 max-w-md">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Add Cash Expense</h1>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
            <input placeholder="e.g. Coffee, Lunch, Groceries" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount</label>
            <input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="border dark:border-gray-600 rounded px-3 py-2 w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
          </div>
          <button type="submit" disabled={submitting} className="w-full bg-blue-600 text-white rounded py-2 hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Adding...' : 'Add Expense'}</button>
          {message && <p className="text-green-600 dark:text-green-400 text-sm text-center">{message}</p>}
        </form>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Bulk Paste</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Paste lines from your notes. Format: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">$6 pizza 5.8.26</code>
        </p>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
          <textarea
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            placeholder={"$6 pizza 5.8.26\n$16 fish + garlic 5.10.26\n$4.50 coffee 5.12.26"}
            rows={6}
            className="border dark:border-gray-600 rounded px-3 py-2 w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm"
          />
          <button
            type="button"
            onClick={handleParse}
            disabled={!bulkText.trim()}
            className="bg-gray-700 dark:bg-gray-600 text-white rounded py-2 px-4 hover:bg-gray-800 dark:hover:bg-gray-500 disabled:opacity-50"
          >
            Parse
          </button>
        </div>

        {parseErrors.length > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300 px-4 py-3 rounded-lg">
            <p className="font-medium text-sm mb-1">Could not parse {parseErrors.length} line{parseErrors.length > 1 ? 's' : ''}:</p>
            <ul className="text-sm list-disc list-inside">
              {parseErrors.map((line, i) => <li key={i} className="font-mono">{line}</li>)}
            </ul>
          </div>
        )}

        {staged.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                {staged.length} expense{staged.length > 1 ? 's' : ''} ready to add
              </p>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-500 dark:text-gray-300">Date</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-500 dark:text-gray-300">Type</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-500 dark:text-gray-300">Amount</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {staged.map((expense, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{expense.date}</td>
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{expense.type}</td>
                    <td className="px-4 py-2 text-sm text-right font-medium text-gray-900 dark:text-gray-100">${expense.amount.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => removeStaged(i)} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
              <button
                onClick={handleBulkSubmit}
                disabled={bulkSubmitting}
                className="bg-blue-600 text-white rounded py-2 px-6 hover:bg-blue-700 disabled:opacity-50"
              >
                {bulkSubmitting ? 'Adding...' : `Add All (${staged.length})`}
              </button>
              <button
                onClick={() => { setStaged([]); setParseErrors([]); }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {bulkMessage && <p className="text-green-600 dark:text-green-400 text-sm">{bulkMessage}</p>}
      </div>
    </div>
  );
}
