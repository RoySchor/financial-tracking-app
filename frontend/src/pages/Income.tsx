import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { IncomeEntry } from '../api/client';
import { formatCurrency } from '../utils/date';

const EMPTY_FORM = {
  date: '', type: 'Paycheck', gross_pay: '', taxes: '',
  pre_tax_deductions: '', post_tax_deductions: '', net_pay: '', information: '',
};

const INPUT_CLASS = 'border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100';

export default function Income() {
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);
  // Snapshot rather than a lookup into `entries`: switching the year mid-edit
  // replaces that list, and the form should keep its identity and its banner.
  const [editingEntry, setEditingEntry] = useState<IncomeEntry | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const editingId = editingEntry?.id ?? null;
  const busy = submitting || deletingId !== null;

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

  function startEdit(entry: IncomeEntry) {
    setEditingEntry(entry);
    setForm({
      date: entry.date,
      type: entry.type,
      gross_pay: String(entry.gross_pay),
      taxes: String(entry.taxes),
      pre_tax_deductions: String(entry.pre_tax_deductions),
      post_tax_deductions: String(entry.post_tax_deductions),
      net_pay: String(entry.net_pay),
      information: entry.information ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingEntry(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      ...form,
      gross_pay: Number(form.gross_pay),
      taxes: Number(form.taxes),
      pre_tax_deductions: Number(form.pre_tax_deductions),
      post_tax_deductions: Number(form.post_tax_deductions),
      net_pay: Number(form.net_pay),
      information: form.information || null,
    };
    try {
      if (editingId === null) {
        await api.addIncome(payload);
      } else {
        await api.updateIncome(editingId, payload);
      }
      cancelEdit();
      // A saved date can fall outside the year being viewed — on an edit that moves
      // the entry, on an add that back-dates one. Follow it either way rather than
      // letting the row land somewhere the table isn't showing.
      const savedYear = Number(payload.date.slice(0, 4));
      if (savedYear !== year) {
        setYear(savedYear);
      } else {
        await loadIncome();
      }
    } catch (e) {
      const action = editingId === null ? 'add' : 'update';
      setError(e instanceof Error ? e.message : `Failed to ${action} income entry`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(entry: IncomeEntry) {
    const sheetsWarning = entry.synced_to_sheets
      ? ' Its row in Google Sheets is already written and must be deleted by hand.'
      : '';
    if (!window.confirm(`Delete the ${entry.date} ${entry.type} entry?${sheetsWarning}`)) return;
    setDeletingId(entry.id);
    try {
      await api.deleteIncome(entry.id);
      if (editingId === entry.id) cancelEdit();
      await loadIncome();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete income entry');
    } finally {
      setDeletingId(null);
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
        {editingEntry && (
          editingEntry.synced_to_sheets ? (
            <p className="col-span-2 md:col-span-4 text-sm text-amber-700 dark:text-amber-400">
              This entry is already written to Google Sheets — saving only changes this app, so the sheet row has to be corrected by hand.
            </p>
          ) : editingEntry.sheets_retry_exhausted ? (
            <p className="col-span-2 md:col-span-4 text-sm text-amber-700 dark:text-amber-400">
              Google Sheets writes for this entry failed {editingEntry.sheets_retry_count} times and are no longer retried — it never reached the sheet and has to be added by hand.
            </p>
          ) : (
            <p className="col-span-2 md:col-span-4 text-sm text-gray-500 dark:text-gray-400">
              This entry hasn't reached Google Sheets yet, so a pending retry will pick up these edits.
            </p>
          )
        )}
        <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={INPUT_CLASS} required />
        <input placeholder="Type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={INPUT_CLASS} required />
        <input type="number" step="0.01" placeholder="Gross Pay" value={form.gross_pay} onChange={e => setForm({ ...form, gross_pay: e.target.value })} className={INPUT_CLASS} required />
        <input type="number" step="0.01" placeholder="Taxes" value={form.taxes} onChange={e => setForm({ ...form, taxes: e.target.value })} className={INPUT_CLASS} required />
        <input type="number" step="0.01" placeholder="Pre-Tax Deductions" value={form.pre_tax_deductions} onChange={e => setForm({ ...form, pre_tax_deductions: e.target.value })} className={INPUT_CLASS} required />
        <input type="number" step="0.01" placeholder="Post-Tax Deductions" value={form.post_tax_deductions} onChange={e => setForm({ ...form, post_tax_deductions: e.target.value })} className={INPUT_CLASS} required />
        <input type="number" step="0.01" placeholder="Net Pay" value={form.net_pay} onChange={e => setForm({ ...form, net_pay: e.target.value })} className={INPUT_CLASS} required />
        <input placeholder="Notes (optional)" value={form.information} onChange={e => setForm({ ...form, information: e.target.value })} className={INPUT_CLASS} />
        <div className="col-span-2 md:col-span-4 flex gap-3">
          <button type="submit" disabled={busy} className="flex-1 bg-blue-600 text-white rounded py-2 hover:bg-blue-700 disabled:opacity-50">
            {submitting ? 'Saving...' : editingId === null ? 'Add Entry' : 'Save Changes'}
          </button>
          {editingId !== null && (
            <button type="button" onClick={cancelEdit} className="px-6 rounded border dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancel
            </button>
          )}
        </div>
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
              <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          {loading ? (
            <tbody>
              {[...Array(5)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={9} className="px-3 py-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </td>
                </tr>
              ))}
            </tbody>
          ) : (
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {entries.map((entry) => (
                <tr key={entry.id} className={editingId === entry.id ? 'bg-blue-50 dark:bg-blue-900/20' : undefined}>
                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{entry.date}</td>
                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{entry.type}</td>
                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{formatCurrency(entry.gross_pay)}</td>
                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{formatCurrency(entry.taxes)}</td>
                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{formatCurrency(entry.pre_tax_deductions)}</td>
                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{formatCurrency(entry.post_tax_deductions)}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">{formatCurrency(entry.net_pay)}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{entry.information}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => startEdit(entry)} disabled={busy} className="text-blue-600 dark:text-blue-400 hover:underline text-sm disabled:opacity-50 disabled:no-underline">Edit</button>
                    <button onClick={() => handleDelete(entry)} disabled={busy} className="ml-3 text-red-600 dark:text-red-400 hover:underline text-sm disabled:opacity-50 disabled:no-underline">
                      {deletingId === entry.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && !error && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
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
