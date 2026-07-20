import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { TripDetail } from '../api/client';
import { MONTH_NAMES, dateRangeLabel, formatCurrency, isSameMonth, shortDate } from '../utils/date';

interface TripDrawerProps {
  tripId: number;
  /** The month currently being viewed — transactions outside it get a month chip. */
  viewMonth: number;
  viewYear: number;
  onClose: () => void;
  onChanged: () => void;
}

export default function TripDrawer({ tripId, viewMonth, viewYear, onClose, onChanged }: TripDrawerProps) {
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  useEffect(() => {
    loadTrip();
  }, [tripId]);

  async function loadTrip() {
    setLoading(true);
    try {
      const data = await api.getTrip(tripId);
      setTrip(data);
      setNameDraft(data.name);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trip');
    } finally {
      setLoading(false);
    }
  }

  async function saveTrip(changes: { name?: string; sheet_month?: number; sheet_year?: number }) {
    setSaving(true);
    try {
      const updated = await api.updateTrip(tripId, changes);
      setTrip(updated);
      setNameDraft(updated.name);
      setError(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update trip');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveTransaction(transactionId: string) {
    setSaving(true);
    try {
      const updated = await api.removeTripTransaction(tripId, transactionId);
      setTrip(updated);
      setError(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove transaction');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTrip() {
    if (!trip) return;
    if (!window.confirm(`Delete trip "${trip.name}"? The transactions themselves are kept.`)) return;
    setSaving(true);
    try {
      await api.deleteTrip(tripId);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete trip');
      setSaving(false);
    }
  }

  function commitName() {
    const trimmed = nameDraft.trim();
    if (!trip || !trimmed || trimmed === trip.name) {
      setNameDraft(trip?.name ?? '');
      return;
    }
    saveTrip({ name: trimmed });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-label="Trip details"
        className="relative z-50 w-full max-w-lg h-full overflow-y-auto bg-white dark:bg-gray-800 shadow-xl p-6 space-y-5"
      >
        <div className="flex justify-between items-start gap-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Trip Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none"
            aria-label="Close trip details"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
            {error}
            <button onClick={loadTrip} className="ml-3 underline">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            ))}
          </div>
        ) : trip ? (
          <>
            <div>
              <label htmlFor="trip-name" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Trip name
              </label>
              <input
                id="trip-name"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') {
                    setNameDraft(trip.name);
                    e.currentTarget.blur();
                  }
                }}
                disabled={saving}
                className="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 disabled:opacity-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="trip-sheet-month" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Spreadsheet month
                </label>
                <select
                  id="trip-sheet-month"
                  value={trip.sheet_month}
                  onChange={(e) => saveTrip({ sheet_month: Number(e.target.value) })}
                  disabled={saving}
                  className="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                >
                  {MONTH_NAMES.map((name, i) => (
                    <option key={name} value={i + 1}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="trip-sheet-year" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Spreadsheet year
                </label>
                <input
                  id="trip-sheet-year"
                  type="number"
                  value={trip.sheet_year}
                  onChange={(e) => saveTrip({ sheet_year: Number(e.target.value) })}
                  disabled={saving}
                  className="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              The trip total is written to this month's sheet tab, even for transactions from other months.
            </p>

            <div className="flex gap-6 border-y border-gray-200 dark:border-gray-700 py-3">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(trip.total)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Dates</p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 pt-1">
                  {dateRangeLabel(trip.start_date, trip.end_date)}
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Transactions ({trip.transaction_count})
              </h3>
              {trip.transactions.length === 0 ? (
                <p className="text-sm text-gray-400 py-4">
                  No transactions yet. Select rows in the month list and add them to this trip.
                </p>
              ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {trip.transactions.map((t) => {
                    const fromOtherMonth = !isSameMonth(t.date, viewMonth, viewYear);
                    return (
                      <li key={t.id} className="flex items-center gap-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{t.type}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                            {shortDate(t.date)}
                            {fromOtherMonth && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                other month
                              </span>
                            )}
                          </p>
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {formatCurrency(t.amount)}
                        </span>
                        <button
                          onClick={() => handleRemoveTransaction(t.id)}
                          disabled={saving}
                          className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <button
              onClick={handleDeleteTrip}
              disabled={saving}
              className="w-full border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded px-4 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
            >
              Delete trip
            </button>
          </>
        ) : null}
      </aside>
    </div>
  );
}
