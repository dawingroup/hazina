/**
 * Proves tenant isolation at the database, through the same role the API uses.
 * Needs a migrated database: DATABASE_URL (owner) and DATABASE_URL_APP (app role).
 * Skipped when they are absent so `pnpm test` works without Docker; CI sets both.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, withTenant, type Sql } from '../src/client.js';

const ownerUrl = process.env.DATABASE_URL;
const appUrl = process.env.DATABASE_URL_APP;
const A = '00000000-0000-4000-8000-0000000000aa';
const B = '00000000-0000-4000-8000-0000000000bb';

describe.skipIf(!ownerUrl || !appUrl)('row-level security', () => {
  let owner: Sql;
  let app: Sql;

  beforeAll(async () => {
    owner = connect(ownerUrl!, { max: 1 });
    app = connect(appUrl!, { max: 2 });
    await owner`DELETE FROM asset WHERE tenant_id IN (${A}, ${B})`;
    await owner`DELETE FROM tenant WHERE id IN (${A}, ${B})`;
    await owner`INSERT INTO tenant (id, name) VALUES (${A}, 'RLS test A'), (${B}, 'RLS test B')`;
    await owner`INSERT INTO asset (tenant_id, name, asset_class, currency, liquidity_tier, role) VALUES
      (${A}, 'A cash', 'cash', 'UGX', 'same_day', 'matching'),
      (${B}, 'B land', 'land', 'UGX', 'illiquid', 'growth')`;
  });

  afterAll(async () => {
    await owner`DELETE FROM asset WHERE tenant_id IN (${A}, ${B})`;
    await owner`DELETE FROM tenant WHERE id IN (${A}, ${B})`;
    await Promise.all([owner.end(), app.end()]);
  });

  it('the app role cannot bypass RLS', async () => {
    const [r] = await app<{ rolbypassrls: boolean; rolsuper: boolean }[]>`
      SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`;
    expect(r).toEqual({ rolbypassrls: false, rolsuper: false });
  });

  it('sees only its own tenant', async () => {
    const rows = await withTenant(
      app,
      A,
      (tx) => tx`SELECT name FROM asset WHERE tenant_id IN (${A}, ${B})`,
    );
    expect(rows.map((r) => r.name)).toEqual(['A cash']);
  });

  it('sees nothing when no tenant is set', async () => {
    const rows = await app`SELECT name FROM asset WHERE tenant_id IN (${A}, ${B})`;
    expect(rows).toHaveLength(0);
  });

  it('cannot write into another tenant', async () => {
    await expect(
      withTenant(
        app,
        A,
        (tx) => tx`INSERT INTO asset (tenant_id, name, asset_class, currency, liquidity_tier, role)
        VALUES (${B}, 'smuggled', 'cash', 'UGX', 'same_day', 'matching')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('cannot rewrite the audit trail', async () => {
    await expect(withTenant(app, A, (tx) => tx`DELETE FROM audit_event`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it('refuses an unbalanced ledger transaction at commit', async () => {
    await expect(
      withTenant(app, A, async (tx) => {
        const [t] = await tx`INSERT INTO ledger_transaction (tenant_id, occurred_on, description)
          VALUES (${A}, '2026-10-31', 'unbalanced') RETURNING id`;
        await tx`INSERT INTO ledger_line (tenant_id, transaction_id, account, amount_minor, currency)
          VALUES (${A}, ${t!.id}, 'cash', 1000, 'UGX')`;
      }),
    ).rejects.toThrow(/does not balance/);
  });
});
