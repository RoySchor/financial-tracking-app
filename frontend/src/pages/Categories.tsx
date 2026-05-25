import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { CategoryMapping } from '../api/client';

export default function Categories() {
  const [mappings, setMappings] = useState<CategoryMapping[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ pattern: '', category: '', priority: '0' });

  useEffect(() => {
    loadCategories();
  }, []);

  async function loadCategories() {
    try {
      const data = await api.getCategories();
      setMappings(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load categories');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.deleteCategory(id);
      await loadCategories();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete category');
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
        <button type="submit" className="bg-blue-600 text-white rounded px-6 py-2 hover:bg-blue-700">Add</button>
      </form>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">Pattern</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-right">Priority</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {mappings.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-mono text-sm">{m.pattern}</td>
                <td className="px-4 py-3">{m.category}</td>
                <td className="px-4 py-3 text-right">{m.priority}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(m.id)} className="text-red-500 hover:text-red-700 text-sm">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
