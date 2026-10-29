import type { Currency, Frequency, ProjectionInput } from '@hazina/domain';
import type { Tx } from './client.js';

const freq = (f: string) => f as Frequency;
const ccy = (c: string) => c.trim() as Currency;

/**
 * Builds the projection engine's input from the tenant's registers.
 * Must run inside withTenant(), so RLS limits every read to one tenant.
 */
export async function loadProjectionInput(
  tx: Tx,
  startMonth: string,
  horizonMonths = 36,
): Promise<ProjectionInput> {
  const [tenant] = await tx<{ base_currency: string }[]>`SELECT base_currency FROM tenant`;
  if (!tenant) throw new Error('No tenant in scope');

  const fxRows = await tx<{ currency: string; rate: string }[]>`
    SELECT DISTINCT ON (currency) currency, rate_to_ugx::text AS rate FROM fx_rate ORDER BY currency, rate_date DESC`;
  const fx: ProjectionInput['fx'] = { UGX: 1 };
  for (const r of fxRows) fx[ccy(r.currency)] = Number(r.rate);

  const obligations = await tx`SELECT * FROM obligation`;
  const incomes = await tx`SELECT * FROM income_source`;
  const assets = await tx`
    SELECT a.id, a.liquidity_tier, a.role, a.pledged_to_liability_id, v.value_minor, v.currency
    FROM asset a
    JOIN LATERAL (SELECT value_minor, currency FROM valuation WHERE asset_id = a.id ORDER BY valued_on DESC, created_at DESC LIMIT 1) v ON true`;

  return {
    startMonth,
    horizonMonths,
    baseCurrency: ccy(tenant.base_currency),
    fx,
    obligations: obligations.map((o) => ({
      id: o.id,
      category: o.category,
      priority: o.priority,
      amount: { amountMinor: Number(o.amount_minor), currency: ccy(o.currency) },
      schedule: {
        frequency: freq(o.frequency),
        startMonth: o.start_month,
        endMonth: o.end_month ?? undefined,
        termMonths: o.term_months ?? undefined,
      },
      escalation: { annualRate: Number(o.escalation_rate) },
    })),
    incomes: incomes.map((i) => ({
      id: i.id,
      reliability: i.reliability,
      amount: { amountMinor: Number(i.amount_minor), currency: ccy(i.currency) },
      schedule: {
        frequency: freq(i.frequency),
        startMonth: i.start_month,
        endMonth: i.end_month ?? undefined,
        termMonths: i.term_months ?? undefined,
      },
      escalation: { annualRate: Number(i.escalation_rate) },
    })),
    assets: assets.map((a) => ({
      id: a.id,
      liquidityTier: a.liquidity_tier,
      role: a.role,
      encumbered: a.pledged_to_liability_id !== null,
      value: { amountMinor: Number(a.value_minor), currency: ccy(a.currency) },
    })),
  };
}
