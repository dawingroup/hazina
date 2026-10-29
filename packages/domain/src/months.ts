/** A calendar month as 'YYYY-MM'. Month arithmetic is done on an integer index. */
export type MonthKey = `${number}-${string}`;

export function monthIndex(key: string): number {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error(`Bad month key: ${key}`);
  return y * 12 + (m - 1);
}

export function monthKey(index: number): MonthKey {
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}` as MonthKey;
}

export function addMonths(key: string, n: number): MonthKey {
  return monthKey(monthIndex(key) + n);
}
