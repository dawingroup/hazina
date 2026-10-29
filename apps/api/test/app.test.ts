/**
 * API behaviour against a real, migrated and seeded database (pnpm db:migrate && pnpm db:seed).
 * Auth and queues are fakes; the database and RLS are real.
 */
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, type Sql } from '@hazina/db';
import { buildApp } from '../src/app.js';

const appUrl = process.env.DATABASE_URL_APP;
const DEMO_TENANT = '00000000-0000-4000-8000-000000000001';
const SECRET = 'test-secret-at-least-16';

describe.skipIf(!appUrl)('api', () => {
  let sql: Sql;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const queued: string[] = [];

  beforeAll(async () => {
    sql = connect(appUrl!, { max: 2 });
    app = await buildApp({
      sql,
      verifier: {
        async verify(token) {
          if (token === 'demo-owner') return { uid: 'demo-owner-uid', mfa: true };
          if (token === 'stranger') return { uid: 'nobody', mfa: true };
          if (token === 'no-mfa') return { uid: 'demo-owner-uid', mfa: false };
          throw new Error('bad token');
        },
      },
      pingRedis: async () => true,
      enqueueInbound: async (id) => void queued.push(id),
      webhookSecret: SECRET,
      requireMfa: true,
    });
  });

  afterAll(async () => {
    await app.close();
    await sql.end();
  });

  const as = (token: string) => ({ authorization: `Bearer ${token}` });

  it('reports health', async () => {
    const r = await app.inject({ url: '/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: 'ok', db: true, redis: true });
  });

  it('serves the OpenAPI spec', async () => {
    const r = await app.inject({ url: '/openapi.json' });
    expect(r.statusCode).toBe(200);
    expect(Object.keys(r.json().paths)).toEqual(
      expect.arrayContaining(['/v1/me', '/v1/net-worth', '/v1/projection']),
    );
  });

  it('rejects missing, invalid, unknown and single-factor callers', async () => {
    expect((await app.inject({ url: '/v1/me' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/v1/me', headers: as('forged') })).statusCode).toBe(401);
    expect((await app.inject({ url: '/v1/me', headers: as('stranger') })).statusCode).toBe(403);
    expect((await app.inject({ url: '/v1/me', headers: as('no-mfa') })).statusCode).toBe(403);
  });

  it('resolves the caller to their tenant', async () => {
    const r = await app.inject({ url: '/v1/me', headers: as('demo-owner') });
    expect(r.json()).toMatchObject({ tenantId: DEMO_TENANT, role: 'owner', mfa: true });
  });

  it('returns net worth from the latest valuations and audits the view', async () => {
    const r = await app.inject({ url: '/v1/net-worth', headers: as('demo-owner') });
    expect(r.statusCode).toBe(200);
    // Seed: 60m + 100m + 900m + 400m UGX, no liabilities.
    expect(r.json()).toMatchObject({
      currency: 'UGX',
      assetsMinor: 1_460_000_000,
      liabilitiesMinor: 0,
      assetCount: 4,
    });
  });

  it('runs the projection on the seeded registers', async () => {
    const r = await app.inject({ url: '/v1/projection?start=2027-01', headers: as('demo-owner') });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.months).toHaveLength(36);
    // Same numbers as the domain golden scenario.
    expect(body.pvNetNeedsMinor).toBe(71_870_400);
    expect(body.matchingAssetsMinor).toBe(160_000_000);
    expect(body.runwayMonths).toBe(36);
  });

  describe('DawinOS webhook', () => {
    const eventId = `evt-${Date.now()}`;
    const body = JSON.stringify({
      eventId,
      type: 'dividend.declared',
      data: { subsidiaryId: 'demo-subsidiary', amountMinor: 1000000, currency: 'USD' },
    });
    const sign = (b: string) => createHmac('sha256', SECRET).update(b).digest('hex');
    const post = (sig: string) =>
      app.inject({
        method: 'POST',
        url: '/v1/webhooks/dawinos',
        payload: body,
        headers: { 'content-type': 'application/json', 'x-dawinos-signature': sig },
      });

    it('refuses a bad signature', async () => {
      expect((await post('0'.repeat(64))).statusCode).toBe(401);
    });

    it('stores, acknowledges and queues a signed event once', async () => {
      const first = await post(sign(body));
      expect(first.statusCode).toBe(202);
      expect(queued).toHaveLength(1);
      const again = await post(sign(body));
      expect(again.statusCode).toBe(200);
      expect(again.json()).toEqual({ status: 'duplicate' });
      expect(queued).toHaveLength(1);
    });
  });
});
