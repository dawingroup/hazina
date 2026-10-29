import { monthKey, monthIndex, type MonthKey } from './months.js';

export interface LoanTerms {
  principalMinor: number;
  /** Nominal annual rate as a fraction, e.g. 0.18 for 18%. Monthly rate = annual / 12. */
  annualRate: number;
  termMonths: number;
  /** Month of the first repayment, 'YYYY-MM'. */
  firstPaymentMonth: string;
  type: 'annuity' | 'bullet';
}

export interface LoanRow {
  month: MonthKey;
  paymentMinor: number;
  interestMinor: number;
  principalMinor: number;
  balanceMinor: number;
}

/**
 * Repayment schedule in whole minor units. The final row absorbs rounding so the
 * balance ends at exactly zero and total principal equals the amount borrowed.
 */
export function loanSchedule(t: LoanTerms): LoanRow[] {
  if (t.termMonths <= 0) throw new Error('termMonths must be positive');
  const r = t.annualRate / 12;
  const start = monthIndex(t.firstPaymentMonth);
  const rows: LoanRow[] = [];
  let balance = t.principalMinor;

  const level =
    t.type === 'annuity'
      ? r === 0
        ? Math.round(t.principalMinor / t.termMonths)
        : Math.round((t.principalMinor * r) / (1 - (1 + r) ** -t.termMonths))
      : 0;

  for (let i = 0; i < t.termMonths; i++) {
    const interest = Math.round(balance * r);
    const last = i === t.termMonths - 1;
    let principal: number;
    if (t.type === 'bullet') principal = last ? balance : 0;
    else principal = last ? balance : Math.min(balance, level - interest);
    balance -= principal;
    rows.push({
      month: monthKey(start + i),
      paymentMinor: principal + interest,
      interestMinor: interest,
      principalMinor: principal,
      balanceMinor: balance,
    });
  }
  return rows;
}
