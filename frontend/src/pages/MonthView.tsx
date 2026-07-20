import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Transaction, GroupedCategory, Trip } from '../api/client';
import TripsPanel from '../components/TripsPanel';
import TripDrawer from '../components/TripDrawer';

type SortField = 'date' | 'type' | 'amount';
type SortDir = 'asc' | 'desc';

const SHEET_REMINDER = 'Renamed in the app only — update the Google Sheet manually to match.';

export default function MonthView() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [grouped, setGrouped] = useState<GroupedCategory[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openTripId, setOpenTripId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  useEffect(() => {
    loadTransactions();
    // Selection is per-month; carrying ids across months would be confusing.
    setSelectedIds([]);
  }, [month, year]);

  async function loadTransactions() {
    setLoading(true);
    try {
      const [data, groups, tripList] = await Promise.all([
        api.getTransactions(month, year),
        api.getGroupedTotals(month, year),
        api.getTrips(month, year),
      ]);
      setTransactions(data);
      setGrouped(groups);
      setTrips(tripList);
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

  function startEditing(t: Transaction) {
    setEditingId(t.id);
    setNameDraft(t.type);
  }

  async function commitRename(id: string) {
    const trimmed = nameDraft.trim();
    const original = transactions.find((t) => t.id === id);
    setEditingId(null);
    if (!trimmed || !original || trimmed === original.type) return;

    setSubmitting(true);
    try {
      const updated = await api.renameTransaction(id, trimmed);
      setTransactions((prev) => prev.map((t) => (t.id === id ? updated : t)));
      setNotice(SHEET_REMINDER);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename transaction');
    } finally {
      setSubmitting(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.length === transactions.length ? [] : transactions.map((t) => t.id)));
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'amount' ? 'desc' : 'asc');
    }
  }

  const sorted = [...transactions].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'date') cmp = a.date.localeCompare(b.date);
    else if (sortField === 'type') cmp = a.type.localeCompare(b.type);
    else cmp = a.amount - b.amount;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  const allSelected = transactions.length > 0 && selectedIds.length === transactions.length;

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

      {notice && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 px-4 py-3 rounded-lg flex justify-between items-center">
          <span className="text-sm">{notice}</span>
          <button onClick={() => setNotice(null)} className="text-sm underline ml-4">Dismiss</button>
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

      <TripsPanel
        trips={trips}
        loading={loading}
        month={month}
        year={year}
        selectedIds={selectedIds}
        onClearSelection={() => setSelectedIds([])}
        onChanged={loadTransactions}
        onOpenTrip={setOpenTripId}
      />

      {!loading && grouped.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {grouped.map((group) => (
            <div
              key={group.label}
              className="relative bg-white dark:bg-gray-800 rounded-lg shadow p-3 cursor-pointer"
              onClick={() => setExpandedGroup(expandedGroup === group.label ? null : group.label)}
            >
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{group.label}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                ${group.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-400">{group.count} txns</p>
              {expandedGroup === group.label && group.items.length > 0 && (
                <div className="absolute z-10 top-full left-0 mt-1 w-64 max-h-60 overflow-y-auto bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-3">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{group.label} breakdown:</p>
                  {group.items.slice(0, 20).map((item, i) => (
                    <div key={i} className="flex justify-between text-xs py-0.5">
                      <span className="text-gray-700 dark:text-gray-300 truncate mr-2">{item.type}</span>
                      <span className="text-gray-900 dark:text-gray-100 font-medium whitespace-nowrap">${item.total.toFixed(2)}</span>
                    </div>
                  ))}
                  {group.items.length > 20 && (
                    <p className="text-xs text-gray-400 mt-1">+{group.items.length - 20} more</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  disabled={loading || transactions.length === 0}
                  aria-label="Select all transactions"
                  className="rounded border-gray-300 dark:border-gray-600"
                />
              </th>
              {([['date', 'Date', 'text-left'], ['type', 'Type', 'text-left'], ['amount', 'Amount', 'text-right']] as const).map(([field, label, align]) => (
                <th
                  key={field}
                  onClick={() => toggleSort(field)}
                  className={`px-4 py-3 ${align} text-sm font-medium text-gray-500 dark:text-gray-300 cursor-pointer select-none hover:text-gray-900 dark:hover:text-gray-100`}
                >
                  {label} {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              ))}
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-300">Source</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          {loading ? (
            <tbody>
              {[...Array(8)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </td>
                </tr>
              ))}
            </tbody>
          ) : (
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {sorted.map((t) => (
                <tr key={t.id} className={selectedIds.includes(t.id) ? 'bg-blue-50/60 dark:bg-blue-900/20' : undefined}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(t.id)}
                      onChange={() => toggleSelected(t.id)}
                      aria-label={`Select ${t.type}`}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{t.date}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                    {editingId === t.id ? (
                      <input
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onBlur={() => commitRename(t.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="w-full border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEditing(t)}
                          disabled={submitting}
                          title="Click to rename"
                          className="text-left hover:underline decoration-dotted disabled:opacity-50"
                        >
                          {t.type}
                        </button>
                        {t.trip_id && t.trip_name && (
                          <button
                            onClick={() => setOpenTripId(t.trip_id!)}
                            className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900 whitespace-nowrap"
                          >
                            {t.trip_name}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">${t.amount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{t.account_name || t.source}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(t.id)} disabled={submitting} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm disabled:opacity-50">Delete</button>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No transactions for this month.
                  </td>
                </tr>
              )}
            </tbody>
          )}
        </table>
      </div>

      {openTripId !== null && (
        <TripDrawer
          tripId={openTripId}
          viewMonth={month}
          viewYear={year}
          onClose={() => setOpenTripId(null)}
          onChanged={loadTransactions}
        />
      )}
    </div>
  );
}
