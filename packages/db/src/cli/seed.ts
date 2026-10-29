/**
 * Synthetic demo family for local development and staging. Never real data.
 * Mirrors the golden scenario in packages/domain/test/projection.test.ts.
 */
import { connect, withTenant } from '../client.js';
import { assertLocal, ownerUrl } from './env.js';

export const DEMO_TENANT_ID = '00000000-0000-4000-8000-000000000001';

const url = ownerUrl();
assertLocal(url);
const sql = connect(url, { max: 1 });
try {
  await sql`INSERT INTO tenant (id, name, base_currency) VALUES (${DEMO_TENANT_ID}, 'Demo family (synthetic)', 'UGX') ON CONFLICT (id) DO NOTHING`;
  await withTenant(sql, DEMO_TENANT_ID, async (tx) => {
    const [row] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM asset`;
    const n = row?.n ?? 0;
    if (n > 0) {
      console.log('Demo tenant already seeded.');
      return;
    }
    const [owner] = await tx`INSERT INTO person (tenant_id, display_name, email, role, firebase_uid)
      VALUES (${DEMO_TENANT_ID}, 'Demo Owner', 'owner@example.test', 'owner', 'demo-owner-uid') RETURNING id`;
    const [me] =
      await tx`INSERT INTO legal_entity (tenant_id, name, kind) VALUES (${DEMO_TENANT_ID}, 'Demo Owner', 'individual') RETURNING id`;
    const [hold] =
      await tx`INSERT INTO legal_entity (tenant_id, name, kind, parent_id, ownership_pct)
      VALUES (${DEMO_TENANT_ID}, 'Demo Holdings Ltd', 'holding_company', ${me!.id}, 100) RETURNING id`;
    await tx`INSERT INTO legal_entity (tenant_id, name, kind, parent_id, ownership_pct, dawinos_subsidiary_id)
      VALUES (${DEMO_TENANT_ID}, 'Demo Operating Co', 'company', ${hold!.id}, 60, 'demo-subsidiary')`;

    const assets = [
      ['Current account', 'cash', 'same_day', 'matching', 60_000_000],
      ['364-day T-bill', 'treasury_bill', 'one_year', 'matching', 100_000_000],
      ['Family home', 'property', 'illiquid', 'personal_use', 900_000_000],
      ['Gayaza plot', 'land', 'illiquid', 'growth', 400_000_000],
    ] as const;
    for (const [name, cls, tier, role, value] of assets) {
      const [a] =
        await tx`INSERT INTO asset (tenant_id, name, asset_class, owning_entity_id, currency, liquidity_tier, role)
        VALUES (${DEMO_TENANT_ID}, ${name}, ${cls}, ${me!.id}, 'UGX', ${tier}, ${role}) RETURNING id`;
      await tx`INSERT INTO valuation (tenant_id, asset_id, valued_on, value_minor, currency, method, source, confidence, approved_by)
        VALUES (${DEMO_TENANT_ID}, ${a!.id}, '2026-10-31', ${value}, 'UGX', 'owner_estimate', 'seed', 'medium', ${owner!.id})`;
    }

    await tx`INSERT INTO obligation (tenant_id, name, category, subcategory, amount_minor, currency, frequency, start_month, certainty, priority)
      VALUES (${DEMO_TENANT_ID}, 'Household running costs', 'family', 'household', 5000000, 'UGX', 'monthly', '2027-01', 'committed', 'essential')`;
    await tx`INSERT INTO obligation (tenant_id, name, category, subcategory, beneficiary, amount_minor, currency, frequency, start_month, term_months, escalation_rate, certainty, priority)
      VALUES (${DEMO_TENANT_ID}, 'School fees', 'family', 'education', 'Two children', 12000000, 'UGX', 'termly', '2027-02', ${[2, 5, 9]}, 0.08, 'contractual', 'essential')`;
    await tx`INSERT INTO income_source (tenant_id, name, category, payer, amount_minor, currency, frequency, start_month, reliability)
      VALUES (${DEMO_TENANT_ID}, 'Salary', 'business', 'Demo Operating Co', 10000000, 'UGX', 'monthly', '2027-01', 'contractual')`;
    await tx`INSERT INTO income_source (tenant_id, name, category, payer, amount_minor, currency, frequency, start_month, reliability, source)
      VALUES (${DEMO_TENANT_ID}, 'Dividend', 'business', 'Demo Operating Co', 1000000, 'USD', 'annual', '2027-06', 'expected', 'dawinos')`;
    await tx`INSERT INTO audit_event (tenant_id, actor_person_id, action, entity) VALUES (${DEMO_TENANT_ID}, ${owner!.id}, 'seed', 'tenant')`;
    console.log('Seeded demo tenant', DEMO_TENANT_ID);
  });
  await sql`INSERT INTO fx_rate (currency, rate_date, rate_to_ugx, source) VALUES
    ('UGX', '2026-10-31', 1, 'seed'), ('USD', '2026-10-31', 3700, 'seed (illustrative)'),
    ('GBP', '2026-10-31', 4900, 'seed (illustrative)'), ('KES', '2026-10-31', 28.6, 'seed (illustrative)')
    ON CONFLICT DO NOTHING`;
} finally {
  await sql.end();
}
