import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { CategoryMapping } from '../api/client';

export default function Categories() {
  const [mappings, setMappings] = useState<CategoryMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ pattern: '', category: '', priority: '0' });

  useEffect(() => {
    loadCategories();
  }, []);

  async function loadCategories() {
    setLoading(true);
    try {
      const data = await api.getCategories();
      setMappings(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.upsertCategory({
        pattern: form.pattern,
        category: form.category,
        priority: Number(form.priority),
      });
      setForm({ pattern: '', category: '', priority: '0' });
      await loadCategories();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save category');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    setSubmitting(true);
    try {
      await api.deleteCategory(id);
      await loadCategories();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete category');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-900">Category Mappings</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
          <button onClick={loadCategories} className="ml-4 underline text-sm">Retry</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 flex gap-4 flex-wrap">
        <input placeholder="Pattern (e.g. UBER EATS)" value={form.pattern} onChange={e => setForm({ ...form, pattern: e.target.value })} className="border rounded px-3 py-2 flex-1 min-w-48" required />
        <input placeholder="Category name" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="border rounded px-3 py-2 flex-1 min-w-36" required />
        <input type="number" placeholder="Priority" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className="border rounded px-3 py-2 w-24" />
        <button type="submit" disabled={submitting} className="bg-blue-600 text-white rounded px-6 py-2 hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Saving...' : 'Add'}</button>
      </form>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-base">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">Pattern</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-right">Priority</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          {loading ? (
            <tbody>
              {[...Array(5)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={4} className="px-4 py-3">
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                  </td>
                </tr>
              ))}
            </tbody>
          ) : (
            <tbody className="divide-y">
              {mappings.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 font-mono text-sm">{m.pattern}</td>
                  <td className="px-4 py-3">{m.category}</td>
                  <td className="px-4 py-3 text-right">{m.priority}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(m.id)} disabled={submitting} className="text-red-500 hover:text-red-700 text-sm disabled:opacity-50">Delete</button>
                  </td>
                </tr>
              ))}
              {mappings.length === 0 && !error && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    No category mappings configured.
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
