const BASE = import.meta.env.VITE_API_BASE || '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

// Types matching backend Pydantic models
export interface Transaction {
  id: string;
  date: string;
  type: string;
  raw_merchant: string | null;
  amount: number;
  source: string;
  plaid_account_id: string | null;
  account_name: string | null;
  synced_to_sheets: boolean;
  created_at: string | null;
}

export interface PlaidAccount {
  plaid_account_id: string;
  official_name: string | null;
  display_name: string | null;
  institution: string | null;
  account_mask: string | null;
  account_type: string | null;
}

export interface TransactionSummary {
  total: number;
  top5: { type: string; total: number }[];
  by_category: { type: string; total: number; count: number }[];
}

export interface MonthlyTotal {
  month: number;
  total: number;
}

export interface RangeSummary {
  total: number;
  by_category: { type: string; total: number; count: number }[];
  by_month: { month: string; total: number }[];
}

export interface GroupedCategory {
  label: string;
  total: number;
  count: number;
  items: { type: string; total: number }[];
}

export interface CategoryMapping {
  id: number;
  pattern: string;
  category: string;
  priority: number;
}

export interface IncomeEntry {
  id: number;
  date: string;
  type: string;
  gross_pay: number;
  taxes: number;
  pre_tax_deductions: number;
  post_tax_deductions: number;
  net_pay: number;
  information: string | null;
  synced_to_sheets: boolean;
  created_at: string | null;
}

export interface Asset {
  id: number;
  bank_group: string;
  account_name: string;
  current_amount: number;
  total_dividends: number;
  apy: number;
  total_interest: number;
  fee: number;
  notes: string | null;
  last_updated: string;
  synced_to_sheets: boolean;
}

export interface RecurringExpense {
  id: number;
  label: string;
  full_name: string;
  amount: number;
  day_of_month: number;
  updated_at: string | null;
}

export interface AppStatus {
  last_sync: string | null;
  total_transactions: number;
  failed_sheets_writes: number;
  db_size_mb: number;
}

export interface SyncResult {
  added: number;
  modified: number;
  removed: number;
  error?: string;
  investments?: {
    accounts_synced: number;
    holdings_total: number;
    transactions_added: number;
  };
}

export interface Holding {
  plaid_account_id: string;
  security_id: string;
  quantity: number;
  cost_basis: number | null;
  institution_value: number;
  institution_price: number;
  as_of_date: string;
  ticker: string | null;
  security_name: string | null;
  security_type: string | null;
  close_price_as_of: string | null;
  account_name?: string | null;
  institution?: string | null;
}

export interface PortfolioAccount {
  id: string;
  plaid_account_id: string | null;
  asset_id: number | null;
  account_name: string | null;
  institution: string | null;
  total_value: number;
  source: 'plaid' | 'manual';
  last_updated: string | null;
}

export interface InvestmentSummary {
  total_value: number;
  liquid_total: number;
  as_of_date: string | null;
  by_account: PortfolioAccount[];
  by_type: { asset_type: string | null; total_value: number }[];
}

export interface PortfolioSnapshot {
  date: string;
  total_value: number;
}

export interface InvestmentTransaction {
  plaid_investment_transaction_id: string;
  plaid_account_id: string;
  security_id: string | null;
  date: string;
  type: string;
  subtype: string | null;
  quantity: number | null;
  price: number | null;
  amount: number | null;
  name: string | null;
  ticker: string | null;
  security_name: string | null;
  account_name: string | null;
}

export interface Performer {
  ticker: string | null;
  security_name: string | null;
  security_type: string | null;
  cost_basis: number;
  current_value: number;
  gain_loss_pct: number;
  gain_loss_dollar: number;
  account_name: string | null;
  institution: string | null;
}

export interface PerformersResponse {
  top: Performer[];
  bottom: Performer[];
}

export const api = {
  getTransactions: (month: number, year: number) =>
    request<Transaction[]>(`/transactions?month=${month}&year=${year}`),
  getTransactionSummary: (month: number, year: number) =>
    request<TransactionSummary>(`/transactions/summary?month=${month}&year=${year}`),
  getGroupedTotals: (month: number, year: number) =>
    request<GroupedCategory[]>(`/transactions/grouped?month=${month}&year=${year}`),
  getYearlyTotals: (year: number) =>
    request<MonthlyTotal[]>(`/transactions/yearly?year=${year}`),
  getTransactionsByRange: (start: string, end: string) =>
    request<Transaction[]>(`/transactions/range?start=${start}&end=${end}`),
  getRangeSummary: (start: string, end: string) =>
    request<RangeSummary>(`/transactions/range/summary?start=${start}&end=${end}`),
  getRangeGrouped: (start: string, end: string) =>
    request<GroupedCategory[]>(`/transactions/range/grouped?start=${start}&end=${end}`),
  addCashExpense: (data: { date: string; type: string; amount: number }) =>
    request<Transaction>('/transactions/cash', { method: 'POST', body: JSON.stringify(data) }),
  deleteTransaction: (id: string) =>
    request<{ deleted: boolean }>(`/transactions/${id}`, { method: 'DELETE' }),

  triggerSync: () => request<SyncResult>('/sync', { method: 'POST' }),
  getStatus: () => request<AppStatus>('/status'),

  getCategories: () => request<CategoryMapping[]>('/categories'),
  upsertCategory: (data: { pattern: string; category: string; priority: number }) =>
    request<CategoryMapping>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  deleteCategory: (id: number) =>
    request<{ deleted: boolean }>(`/categories/${id}`, { method: 'DELETE' }),

  getRecurring: () => request<RecurringExpense[]>('/recurring'),
  createRecurring: (data: { label: string; full_name: string; amount: number; day_of_month: number }) =>
    request<RecurringExpense>('/recurring', { method: 'POST', body: JSON.stringify(data) }),
  updateRecurring: (id: number, data: { amount: number; full_name?: string; day_of_month?: number }) =>
    request<RecurringExpense>(`/recurring/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRecurring: (id: number) =>
    request<{ deleted: boolean }>(`/recurring/${id}`, { method: 'DELETE' }),

  getIncome: (year: number) => request<IncomeEntry[]>(`/income?year=${year}`),
  addIncome: (data: Omit<IncomeEntry, 'id' | 'synced_to_sheets' | 'created_at'>) =>
    request<IncomeEntry>('/income', { method: 'POST', body: JSON.stringify(data) }),

  getAssets: () => request<Asset[]>('/assets'),
  upsertAsset: (data: Omit<Asset, 'id' | 'last_updated' | 'synced_to_sheets'>) =>
    request<Asset>('/assets', { method: 'POST', body: JSON.stringify(data) }),
  deleteAsset: (id: number) =>
    request<{ deleted: boolean }>(`/assets/${id}`, { method: 'DELETE' }),
  quickUpdateAsset: (id: number, data: { current_amount: number; notes?: string | null }) =>
    request<Asset>(`/assets/${id}/quick`, { method: 'PATCH', body: JSON.stringify(data) }),

  getAccounts: () => request<PlaidAccount[]>('/accounts'),
  updateAccount: (plaidAccountId: string, displayName: string) =>
    request<PlaidAccount>(`/accounts/${plaidAccountId}`, {
      method: 'PUT',
      body: JSON.stringify({ display_name: displayName }),
    }),

  retrySheets: () => request<{ message: string }>('/sheets/retry', { method: 'POST' }),

  getPerformers: (limit: number = 5) =>
    request<PerformersResponse>(`/investments/performers?limit=${limit}`),
  getInvestmentHoldings: (accountId?: string) =>
    request<Holding[]>(accountId ? `/investments/holdings?account_id=${accountId}` : '/investments/holdings'),
  getInvestmentSummary: () =>
    request<InvestmentSummary>('/investments/summary'),
  getPortfolioHistory: (months: number = 12) =>
    request<PortfolioSnapshot[]>(`/investments/history?months=${months}`),
  getInvestmentTransactions: (start: string, end: string, accountId?: string, type?: string) => {
    let url = `/investments/transactions?start=${start}&end=${end}`;
    if (accountId) url += `&account_id=${accountId}`;
    if (type) url += `&type=${type}`;
    return request<InvestmentTransaction[]>(url);
  },
};
