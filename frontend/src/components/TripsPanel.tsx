import { useState } from 'react';
import { api } from '../api/client';
import type { Trip } from '../api/client';
import { dateRangeLabel, formatCurrency } from '../utils/date';

interface TripsPanelProps {
  trips: Trip[];
  loading: boolean;
  month: number;
  year: number;
  /** Transaction ids checked in the month table, ready to be grouped. */
  selectedIds: string[];
  onClearSelection: () => void;
  onChanged: () => void;
  onOpenTrip: (tripId: number) => void;
}

export default function TripsPanel({
  trips,
  loading,
  month,
  year,
  selectedIds,
  onClearSelection,
  onChanged,
  onOpenTrip,
}: TripsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSelection = selectedIds.length > 0;

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.createTrip({
        name,
        sheet_month: month,
        sheet_year: year,
        transaction_ids: selectedIds,
      });
      setNewName('');
      setCreating(false);
      setError(null);
      onClearSelection();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create trip');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddToTrip(tripId: number) {
    setBusy(true);
    try {
      await api.addTripTransactions(tripId, selectedIds);
      setError(null);
      onClearSelection();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add to trip');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100"
          aria-expanded={!collapsed}
        >
          <span className="text-gray-400">{collapsed ? '▸' : '▾'}</span>
          Trips
          <span className="text-xs font-normal text-gray-400">({trips.length})</span>
        </button>

        {hasSelection && (
          <span className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/40 px-2 py-1 rounded-full">
            {selectedIds.length} selected
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {hasSelection && (
        <div className="flex flex-wrap items-center gap-2 border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/20 rounded-lg p-3">
          {creating ? (
            <>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') setCreating(false);
                }}
                placeholder="Trip name"
                disabled={busy}
                className="border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 disabled:opacity-50"
              />
              <button
                onClick={handleCreate}
                disabled={busy || !newName.trim()}
                className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => setCreating(false)}
                disabled={busy}
                className="text-sm text-gray-600 dark:text-gray-300 px-2 disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setCreating(true)}
                disabled={busy}
                className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                New trip from selection
              </button>
              {trips.length > 0 && (
                <select
                  value=""
                  onChange={(e) => e.target.value && handleAddToTrip(Number(e.target.value))}
                  disabled={busy}
                  className="border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                >
                  <option value="">Add to existing trip…</option>
                  {trips.map((trip) => (
                    <option key={trip.id} value={trip.id}>{trip.name}</option>
                  ))}
                </select>
              )}
              <button
                onClick={onClearSelection}
                disabled={busy}
                className="text-sm text-gray-600 dark:text-gray-300 px-2 disabled:opacity-50"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}

      {!collapsed && (
        loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : trips.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">
            No trips for this month. Select transactions below to group them into one.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {trips.map((trip) => {
              const isOtherMonthSheet = trip.sheet_month !== month || trip.sheet_year !== year;
              return (
                <button
                  key={trip.id}
                  onClick={() => onOpenTrip(trip.id)}
                  className="text-left bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3 transition-colors"
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{trip.name}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {formatCurrency(trip.total)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {dateRangeLabel(trip.start_date, trip.end_date)} · {trip.transaction_count} txns
                  </p>
                  {isOtherMonthSheet && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">spans other months</p>
                  )}
                </button>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
