import { describe, expect, it } from 'vitest';
import { project, type ProjectionInput } from '../src/projection.js';
import { convert } from '../src/money.js';

/**
 * Golden scenario, worked by hand (UGX, rate USD 1 = UGX 3,700):
 *  - Household UGX 5m every month.
 *  - School fees UGX 12m per term (Feb, May, Sep), +8% a year from Feb 2028.
 *  - Salary UGX 10m a month, contractual (weight 1).
 *  - Dividend USD 10,000 each June, expected (weight 0.7) -> UGX 25.9m reliable.
 * Positive net needs are the term months only:
 *  - 2027: 17m - 10m = 7m, three times = 21m                      (liquidity bucket)
 *  - 2028: 17.96m - 10m = 7.96m x 3 = 23.88m; 2029: 8.9968m x 3   (committed bucket)
 *    committed = 23.88m + 26.9904m = 50.8704m
 */
const base: ProjectionInput = {
  startMonth: '2027-01',
  horizonMonths: 36,
  baseCurrency: 'UGX',
  fx: { UGX: 1, USD: 3700 },
  obligations: [
    {
      id: 'household',
      category: 'family',
      priority: 'essential',
      amount: { amountMinor: 5_000_000, currency: 'UGX' },
      schedule: { frequency: 'monthly', startMonth: '2027-01' },
    },
    {
      id: 'school-fees',
      category: 'family',
      priority: 'essential',
      amount: { amountMinor: 12_000_000, currency: 'UGX' },
      schedule: { frequency: 'termly', startMonth: '2027-02', termMonths: [2, 5, 9] },
      escalation: { annualRate: 0.08 },
    },
  ],
  incomes: [
    {
      id: 'salary',
      amount: { amountMinor: 10_000_000, currency: 'UGX' },
      schedule: { frequency: 'monthly', startMonth: '2027-01' },
      reliability: 'contractual',
    },
    {
      id: 'dividend',
      amount: { amountMinor: 1_000_000, currency: 'USD' }, // USD 10,000.00
      schedule: { frequency: 'annual', startMonth: '2027-06' },
      reliability: 'expected',
    },
  ],
  assets: [
    {
      id: 'cash',
      value: { amountMinor: 60_000_000, currency: 'UGX' },
      liquidityTier: 'same_day',
      role: 'matching',
      encumbered: false,
    },
    {
      id: 'tbill',
      value: { amountMinor: 100_000_000, currency: 'UGX' },
      liquidityTier: 'one_year',
      role: 'matching',
      encumbered: false,
    },
    {
      id: 'pledged-fd',
      value: { amountMinor: 50_000_000, currency: 'UGX' },
      liquidityTier: 'one_month',
      role: 'matching',
      encumbered: true,
    },
    {
      id: 'home',
      value: { amountMinor: 900_000_000, currency: 'UGX' },
      liquidityTier: 'illiquid',
      role: 'personal_use',
      encumbered: false,
    },
    {
      id: 'land',
      value: { amountMinor: 400_000_000, currency: 'UGX' },
      liquidityTier: 'illiquid',
      role: 'growth',
      encumbered: false,
    },
  ],
};

describe('convert', () => {
  it('converts minor units through the base rate', () => {
    expect(
      convert({ amountMinor: 1_000_000, currency: 'USD' }, 'UGX', { UGX: 1, USD: 3700 }),
    ).toEqual({
      amountMinor: 37_000_000,
      currency: 'UGX',
    });
  });
});

describe('project (golden scenario)', () => {
  const r = project(base);
  const m = (key: string) => r.months.find((x) => x.month === key)!;

  it('builds a 36-month schedule', () => {
    expect(r.months).toHaveLength(36);
    expect(r.months[0]!.month).toBe('2027-01');
    expect(r.months.at(-1)!.month).toBe('2029-12');
  });

  it('nets reliability-weighted income off obligations', () => {
    expect(m('2027-01').netNeedMinor).toBe(-5_000_000);
    expect(m('2027-02').netNeedMinor).toBe(7_000_000);
    expect(m('2027-06').reliableIncomeMinor).toBe(10_000_000 + 25_900_000);
    expect(m('2027-06').netNeedMinor).toBe(-30_900_000);
  });

  it('escalates school fees once a year from the start month', () => {
    expect(m('2027-09').obligationsMinor).toBe(17_000_000);
    expect(m('2028-02').obligationsMinor).toBe(17_960_000);
    expect(m('2029-09').obligationsMinor).toBe(5_000_000 + 13_996_800);
  });

  it('puts the right present value of need in each bucket', () => {
    const [liq, com, lt] = r.buckets;
    expect(liq).toMatchObject({
      bucket: 'liquidity',
      pvNeedMinor: 21_000_000,
      fundedMinor: 21_000_000,
      fundedRatio: 1,
    });
    expect(com).toMatchObject({
      bucket: 'committed',
      pvNeedMinor: 50_870_400,
      fundedMinor: 50_870_400,
      fundedRatio: 1,
    });
    expect(lt).toMatchObject({ bucket: 'long_term', pvNeedMinor: 0, fundedRatio: null });
    expect(r.pvNetNeedsMinor).toBe(71_870_400);
  });

  it('excludes pledged and personal-use assets from funding', () => {
    expect(r.matchingAssetsMinor).toBe(160_000_000);
    expect(r.liquidAssetsMinor).toBe(60_000_000);
    expect(r.fundedRatio).toBeCloseTo(160_000_000 / 71_870_400, 10);
    expect(r.surplusMinor).toBe(160_000_000 - 71_870_400);
  });

  it('has no gap and a full runway when cash covers every month', () => {
    expect(r.gapMonths).toEqual([]);
    expect(r.runwayMonths).toBe(36);
  });
});

describe('project (cash gap)', () => {
  it('flags the first month the liquid balance goes negative', () => {
    // UGX 1m cash: Jan +5m surplus -> 6m; Feb needs 7m -> -1m.
    const r = project({
      ...base,
      assets: [
        {
          id: 'cash',
          value: { amountMinor: 1_000_000, currency: 'UGX' },
          liquidityTier: 'same_day',
          role: 'matching',
          encumbered: false,
        },
      ],
    });
    expect(r.months[1]!.liquidBalanceMinor).toBe(-1_000_000);
    expect(r.runwayMonths).toBe(1);
    expect(r.gapMonths[0]).toBe('2027-02');
    expect(r.buckets[0]!.fundedRatio).toBeCloseTo(1_000_000 / 21_000_000, 10);
  });

  it('discounts later needs when a discount rate is set', () => {
    const r = project({ ...base, annualDiscountRate: 0.12 });
    expect(r.pvNetNeedsMinor).toBeLessThan(71_870_400);
    expect(r.buckets[0]!.pvNeedMinor).toBeLessThan(21_000_000);
  });
});
