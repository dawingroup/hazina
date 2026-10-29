import { describe, expect, it } from 'vitest';
import { loanSchedule } from '../src/loan.js';

describe('loanSchedule', () => {
  // UGX 1,200,000 at 12% a year over 12 months, r = 1% a month.
  // Level payment = 1,200,000 x 0.01 / (1 - 1.01^-12) = 106,618.55 -> 106,619.
  const rows = loanSchedule({
    principalMinor: 1_200_000,
    annualRate: 0.12,
    termMonths: 12,
    firstPaymentMonth: '2027-01',
    type: 'annuity',
  });

  it('charges one month of interest on the opening balance first', () => {
    expect(rows[0]).toMatchObject({
      month: '2027-01',
      interestMinor: 12_000,
      principalMinor: 94_619,
      paymentMinor: 106_619,
      balanceMinor: 1_105_381,
    });
  });

  it('repays exactly the principal and ends at zero', () => {
    expect(rows).toHaveLength(12);
    expect(rows.reduce((s, r) => s + r.principalMinor, 0)).toBe(1_200_000);
    expect(rows.at(-1)?.balanceMinor).toBe(0);
    expect(rows.at(-1)?.month).toBe('2027-12');
  });

  it('keeps payments level except for the rounding on the last one', () => {
    const payments = rows.slice(0, -1).map((r) => r.paymentMinor);
    expect(new Set(payments)).toEqual(new Set([106_619]));
    expect(Math.abs((rows.at(-1)?.paymentMinor ?? 0) - 106_619)).toBeLessThanOrEqual(12);
  });

  it('bullet loans pay interest only, then the principal in the last month', () => {
    const b = loanSchedule({
      principalMinor: 10_000_000,
      annualRate: 0.18,
      termMonths: 3,
      firstPaymentMonth: '2027-01',
      type: 'bullet',
    });
    expect(b.map((r) => r.paymentMinor)).toEqual([150_000, 150_000, 10_150_000]);
    expect(b.at(-1)?.balanceMinor).toBe(0);
  });
});
