import { monthIndex } from './months.js';

export type Frequency = 'once' | 'monthly' | 'quarterly' | 'termly' | 'annual';

export interface Schedule {
  frequency: Frequency;
  /** First month the amount falls due, 'YYYY-MM'. */
  startMonth: string;
  /** Last month it can fall due (inclusive). Open-ended when absent. */
  endMonth?: string;
  /**
   * For 'termly' only: calendar months (1-12) when a term payment falls due,
   * e.g. Uganda school terms [2, 5, 9]. Defaults to [1, 5, 9].
   */
  termMonths?: number[];
}

export interface Escalation {
  /** Yearly change as a fraction, e.g. 0.08 for school fees rising 8% a year. */
  annualRate: number;
}

/**
 * True when the schedule falls due in month `idx`.
 */
export function isDue(s: Schedule, idx: number): boolean {
  const start = monthIndex(s.startMonth);
  if (idx < start) return false;
  if (s.endMonth && idx > monthIndex(s.endMonth)) return false;
  const elapsed = idx - start;
  switch (s.frequency) {
    case 'once':
      return elapsed === 0;
    case 'monthly':
      return true;
    case 'quarterly':
      return elapsed % 3 === 0;
    case 'annual':
      return elapsed % 12 === 0;
    case 'termly': {
      const months = s.termMonths ?? [1, 5, 9];
      return months.includes((idx % 12) + 1);
    }
  }
}

/**
 * Escalation steps once per full year since the start month, so a fee set in
 * January 2027 is unchanged through December 2027 and rises in January 2028.
 */
export function escalated(amountMinor: number, s: Schedule, idx: number, e?: Escalation): number {
  if (!e || e.annualRate === 0) return amountMinor;
  const years = Math.floor((idx - monthIndex(s.startMonth)) / 12);
  return Math.round(amountMinor * (1 + e.annualRate) ** Math.max(0, years));
}
