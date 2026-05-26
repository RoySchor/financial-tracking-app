import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Asset } from '../api/client';

export default function ManualAccountDetail() {
  const { assetId } = useParams<{ assetId: string }>();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({ current_amount: '', notes: '' });

  useEffect(() => { loadAsset(); }, [assetId]);

  async function loadAsset() {
    setLoading(true);
    try {
      const assets = await api.getAssets();
      const match = assets.find(a => a.id === Number(assetId));
      if (!match) {
        setError('Asset not found');
        return;
      }
      setAsset(match);
      setForm({
        current_amount: String(match.current_amount),
        notes: match.notes || '',
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load asset');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!assetId) return;
    setSaving(true);
    setSuccess(false);
    try {
      const updated = await api.quickUpdateAsset(Number(assetId), {
        current_amount: Number(form.current_amount),
        notes: form.notes || null,
      });
      setAsset(updated);
      setSuccess(true);
      setError(null);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="space-y-4">
        <Link to="/portfolio" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">&larr; Back to Portfolio</Link>
        <p className="text-red-500">{error || 'Asset not found'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/portfolio" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">&larr; Back to Portfolio</Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{asset.account_name}</h1>
        <p className="text-gray-500 dark:text-gray-400">{asset.bank_group}</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">Current Value</p>
        <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          ${asset.current_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Last updated: {new Date(asset.last_updated + 'T00:00:00').toLocaleDateString()}
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
          This account requires manual updates — it is not synced via Plaid.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg">
          Saved successfully.
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Update Value</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Current Amount ($)</label>
            <input
              type="number"
              step="0.01"
              value={form.current_amount}
              onChange={e => setForm({ ...form, current_amount: e.target.value })}
              className="border dark:border-gray-600 rounded px-3 py-2 w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Notes</label>
            <input
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              className="border dark:border-gray-600 rounded px-3 py-2 w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="Optional notes"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </form>

      <p className="text-sm text-gray-400 dark:text-gray-500">
        Need to edit dividends, APY, or other fields?{' '}
        <Link to="/assets" className="text-blue-600 dark:text-blue-400 hover:underline">Edit on Non-Synced Accounts page</Link>
      </p>
    </div>
  );
}
