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
}

export const api = {
  getTransactions: (month: number, year: number) =>
    request<Transaction[]>(`/transactions?month=${month}&year=${year}`),
  getTransactionSummary: (month: number, year: number) =>
    request<TransactionSummary>(`/transactions/summary?month=${month}&year=${year}`),
  getYearlyTotals: (year: number) =>
    request<MonthlyTotal[]>(`/transactions/yearly?year=${year}`),
  getTransactionsByRange: (start: string, end: string) =>
    request<Transaction[]>(`/transactions/range?start=${start}&end=${end}`),
  getRangeSummary: (start: string, end: string) =>
    request<RangeSummary>(`/transactions/range/summary?start=${start}&end=${end}`),
  addCashExpense: (data: { date: string; type: string; amount: number }) =>
    request<Transaction>('/transactions/cash', { method: 'POST', body: JSON.stringify(data) }),

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

  getAccounts: () => request<PlaidAccount[]>('/accounts'),
  updateAccount: (plaidAccountId: string, displayName: string) =>
    request<PlaidAccount>(`/accounts/${plaidAccountId}`, {
      method: 'PUT',
      body: JSON.stringify({ display_name: displayName }),
    }),

  retrySheets: () => request<{ message: string }>('/sheets/retry', { method: 'POST' }),
};
