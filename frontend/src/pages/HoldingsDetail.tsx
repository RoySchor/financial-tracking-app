import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Holding } from '../api/client';

type SortField = 'ticker' | 'security_name' | 'quantity' | 'cost_basis' | 'institution_value' | 'gain';
type SortDir = 'asc' | 'desc';

export default function HoldingsDetail() {
  const { accountId } = useParams<{ accountId: string }>();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('institution_value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => { loadData(); }, [accountId]);

  async function loadData() {
    setLoading(true);
    try {
      const data = await api.getInvestmentHoldings(accountId);
      setHoldings(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load holdings');
    } finally {
      setLoading(false);
    }
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function arrow(field: SortField) {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  const totalValue = holdings.reduce((sum, h) => sum + (h.institution_value || 0), 0);

  const sorted = [...holdings].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'ticker') cmp = (a.ticker || '').localeCompare(b.ticker || '');
    else if (sortField === 'security_name') cmp = (a.security_name || '').localeCompare(b.security_name || '');
    else if (sortField === 'quantity') cmp = (a.quantity || 0) - (b.quantity || 0);
    else if (sortField === 'cost_basis') cmp = (a.cost_basis || 0) - (b.cost_basis || 0);
    else if (sortField === 'institution_value') cmp = (a.institution_value || 0) - (b.institution_value || 0);
    else if (sortField === 'gain') {
      const gainA = a.cost_basis ? (a.institution_value || 0) - a.cost_basis : 0;
      const gainB = b.cost_basis ? (b.institution_value || 0) - b.cost_basis : 0;
      cmp = gainA - gainB;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const asOf = holdings.length > 0 ? holdings[0].as_of_date : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/portfolio" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 text-sm">&larr; Portfolio</Link>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          {holdings.length > 0 && holdings[0].account_name ? holdings[0].account_name : 'Holdings'}
        </h1>
      </div>

      {asOf && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Data as of {new Date(asOf + 'T00:00:00').toLocaleDateString()}
        </p>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error}
          <button onClick={loadData} className="ml-4 underline text-sm">Retry</button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th onClick={() => toggleSort('ticker')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-100">
                Ticker{arrow('ticker')}
              </th>
              <th onClick={() => toggleSort('security_name')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-100">
                Name{arrow('security_name')}
              </th>
              <th onClick={() => toggleSort('quantity')} className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-100">
                Shares{arrow('quantity')}
              </th>
              <th onClick={() => toggleSort('cost_basis')} className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-100">
                Cost Basis{arrow('cost_basis')}
              </th>
              <th onClick={() => toggleSort('institution_value')} className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-100">
                Value{arrow('institution_value')}
              </th>
              <th onClick={() => toggleSort('gain')} className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-100">
                Gain/Loss{arrow('gain')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                % of Portfolio
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-4 py-3">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  No holdings found.
                </td>
              </tr>
            ) : (
              sorted.map((h) => {
                const gain = h.cost_basis != null ? (h.institution_value || 0) - h.cost_basis : null;
                const pct = totalValue > 0 ? ((h.institution_value || 0) / totalValue) * 100 : 0;
                return (
                  <tr key={`${h.plaid_account_id}-${h.security_id}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {h.ticker || '--'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {h.security_name || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                      {h.quantity?.toLocaleString('en-US', { maximumFractionDigits: 4 }) ?? '--'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                      {h.cost_basis != null ? `$${h.cost_basis.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                      ${(h.institution_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-medium ${gain == null ? 'text-gray-400' : gain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {gain != null ? `${gain >= 0 ? '+' : ''}$${gain.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                      {pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
