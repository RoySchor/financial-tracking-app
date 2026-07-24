const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Parse a 'YYYY-MM-DD' date without the UTC shift `new Date(str)` introduces. */
export function parseISODate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** 'Jun 14' — the month label used to flag transactions from outside the current view. */
export function shortDate(value: string): string {
  const parsed = parseISODate(value);
  if (!parsed) return value;
  return `${MONTH_SHORT[parsed.month - 1]} ${parsed.day}`;
}

/** 'Jun 14 – Jul 2', collapsing to a single date when the range is one day. */
export function dateRangeLabel(start: string | null, end: string | null): string {
  if (!start || !end) return 'No transactions';
  const from = shortDate(start);
  const to = shortDate(end);
  return from === to ? from : `${from} – ${to}`;
}

export function isSameMonth(value: string, month: number, year: number): boolean {
  const parsed = parseISODate(value);
  if (!parsed) return false;
  return parsed.month === month && parsed.year === year;
}

export function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
