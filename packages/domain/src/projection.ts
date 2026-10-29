import { convert, type Currency, type FxRates, type Money } from './money.js';
import { monthIndex, monthKey, type MonthKey } from './months.js';
import { escalated, isDue, type Escalation, type Schedule } from './recurrence.js';

export type ObligationCategory = 'family' | 'personal' | 'business';
export type Priority = 'essential' | 'important' | 'discretionary';
export type Reliability = 'contractual' | 'expected' | 'variable' | 'one_off';
export type LiquidityTier = 'same_day' | 'one_month' | 'one_year' | 'illiquid';
export type AssetRole = 'matching' | 'growth' | 'personal_use';
export type Bucket = 'liquidity' | 'committed' | 'long_term';

export interface ObligationInput {
  id: string;
  category: ObligationCategory;
  priority: Priority;
  amount: Money;
  schedule: Schedule;
  escalation?: Escalation;
}

export interface IncomeInput {
  id: string;
  /** Net of withholding tax. */
  amount: Money;
  schedule: Schedule;
  escalation?: Escalation;
  reliability: Reliability;
}

export interface AssetInput {
  id: string;
  value: Money;
  liquidityTier: LiquidityTier;
  role: AssetRole;
  /** Pledged as security. Pledged assets cannot fund other needs. */
  encumbered: boolean;
}

export interface ProjectionInput {
  startMonth: string;
  horizonMonths?: number;
  baseCurrency: Currency;
  fx: FxRates;
  obligations: ObligationInput[];
  incomes: IncomeInput[];
  assets: AssetInput[];
  /** Weight applied to each reliability class. Owner and adviser set these. */
  reliabilityWeights?: Partial<Record<Reliability, number>>;
  /** Annual rate used to discount future needs to present value. 0 = undiscounted. */
  annualDiscountRate?: number;
}

export interface ProjectedMonth {
  month: MonthKey;
  obligationsMinor: number;
  obligationsByCategory: Record<ObligationCategory, number>;
  incomeMinor: number;
  reliableIncomeMinor: number;
  /** Obligations minus reliability-weighted income. Negative = surplus month. */
  netNeedMinor: number;
  /** Liquid assets plus cumulative surpluses minus cumulative needs. */
  liquidBalanceMinor: number;
  gap: boolean;
}

export interface BucketResult {
  bucket: Bucket;
  fromMonth: number;
  toMonth: number;
  pvNeedMinor: number;
  fundedMinor: number;
  /** null when the bucket has no need inside the horizon. */
  fundedRatio: number | null;
}

export interface ProjectionResult {
  baseCurrency: Currency;
  months: ProjectedMonth[];
  pvNetNeedsMinor: number;
  matchingAssetsMinor: number;
  liquidAssetsMinor: number;
  /** Matching assets / PV of net cash needs. null when there is no need. */
  fundedRatio: number | null;
  /** Matching assets minus PV of net needs. Negative = shortfall. */
  surplusMinor: number;
  buckets: BucketResult[];
  /** Whole months covered before the first gap; equals the horizon when none. */
  runwayMonths: number;
  gapMonths: MonthKey[];
}

export const DEFAULT_RELIABILITY_WEIGHTS: Record<Reliability, number> = {
  contractual: 1,
  expected: 0.7,
  variable: 0,
  one_off: 0,
};

/** Bucket boundaries in months from the start (inclusive). Illustrative defaults. */
export const BUCKETS: { bucket: Bucket; from: number; to: number; eligible: LiquidityTier[] }[] = [
  { bucket: 'liquidity', from: 0, to: 11, eligible: ['same_day', 'one_month'] },
  { bucket: 'committed', from: 12, to: 59, eligible: ['same_day', 'one_month', 'one_year'] },
  {
    bucket: 'long_term',
    from: 60,
    to: Number.MAX_SAFE_INTEGER,
    eligible: ['same_day', 'one_month', 'one_year', 'illiquid'],
  },
];

const TIER_ORDER: LiquidityTier[] = ['same_day', 'one_month', 'one_year', 'illiquid'];

const usable = (a: AssetInput) => !a.encumbered && a.role !== 'personal_use';

export function project(input: ProjectionInput): ProjectionResult {
  const horizon = input.horizonMonths ?? 36;
  const base = input.baseCurrency;
  const weights = { ...DEFAULT_RELIABILITY_WEIGHTS, ...input.reliabilityWeights };
  const monthlyDiscount = (input.annualDiscountRate ?? 0) / 12;
  const start = monthIndex(input.startMonth);
  const toBase = (amountMinor: number, currency: Currency) =>
    convert({ amountMinor, currency }, base, input.fx).amountMinor;

  const liquidAssetsMinor = input.assets
    .filter((a) => usable(a) && (a.liquidityTier === 'same_day' || a.liquidityTier === 'one_month'))
    .reduce((s, a) => s + toBase(a.value.amountMinor, a.value.currency), 0);

  const months: ProjectedMonth[] = [];
  let balance = liquidAssetsMinor;
  for (let i = 0; i < horizon; i++) {
    const idx = start + i;
    const byCategory: Record<ObligationCategory, number> = { family: 0, personal: 0, business: 0 };
    for (const o of input.obligations) {
      if (!isDue(o.schedule, idx)) continue;
      const amt = escalated(o.amount.amountMinor, o.schedule, idx, o.escalation);
      byCategory[o.category] += toBase(amt, o.amount.currency);
    }
    let income = 0;
    let reliable = 0;
    for (const inc of input.incomes) {
      if (!isDue(inc.schedule, idx)) continue;
      const amt = toBase(
        escalated(inc.amount.amountMinor, inc.schedule, idx, inc.escalation),
        inc.amount.currency,
      );
      income += amt;
      reliable += Math.round(amt * weights[inc.reliability]);
    }
    const obligations = byCategory.family + byCategory.personal + byCategory.business;
    const netNeed = obligations - reliable;
    balance -= netNeed;
    months.push({
      month: monthKey(idx),
      obligationsMinor: obligations,
      obligationsByCategory: byCategory,
      incomeMinor: income,
      reliableIncomeMinor: reliable,
      netNeedMinor: netNeed,
      liquidBalanceMinor: balance,
      gap: balance < 0,
    });
  }

  const pv = (m: ProjectedMonth, i: number) =>
    Math.max(0, m.netNeedMinor) / (1 + monthlyDiscount) ** i;

  // Allocate matching assets to buckets, most liquid first, earliest bucket first.
  const pool = input.assets
    .filter((a) => usable(a) && a.role === 'matching')
    .map((a) => ({ tier: a.liquidityTier, left: toBase(a.value.amountMinor, a.value.currency) }))
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
  const matchingAssetsMinor = pool.reduce((s, a) => s + a.left, 0);

  const buckets: BucketResult[] = BUCKETS.map((b) => {
    const need = Math.round(
      months.reduce((s, m, i) => (i >= b.from && i <= b.to ? s + pv(m, i) : s), 0),
    );
    let funded = 0;
    for (const a of pool) {
      if (funded >= need) break;
      if (!b.eligible.includes(a.tier)) continue;
      const take = Math.min(a.left, need - funded);
      a.left -= take;
      funded += take;
    }
    return {
      bucket: b.bucket,
      fromMonth: b.from,
      toMonth: Math.min(b.to, horizon - 1),
      pvNeedMinor: need,
      fundedMinor: funded,
      fundedRatio: need === 0 ? null : funded / need,
    };
  });

  const pvNetNeedsMinor = buckets.reduce((s, b) => s + b.pvNeedMinor, 0);
  const firstGap = months.findIndex((m) => m.gap);

  return {
    baseCurrency: base,
    months,
    pvNetNeedsMinor,
    matchingAssetsMinor,
    liquidAssetsMinor,
    fundedRatio: pvNetNeedsMinor === 0 ? null : matchingAssetsMinor / pvNetNeedsMinor,
    surplusMinor: matchingAssetsMinor - pvNetNeedsMinor,
    buckets,
    runwayMonths: firstGap === -1 ? horizon : firstGap,
    gapMonths: months.filter((m) => m.gap).map((m) => m.month),
  };
}
