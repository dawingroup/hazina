import { createHmac, timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { withTenant, loadProjectionInput, type Sql } from '@hazina/db';
import { project, convert, type Currency } from '@hazina/domain';
import type { TokenVerifier } from './auth.js';

export interface Identity {
  personId: string;
  tenantId: string;
  role: string;
  displayName: string;
  mfa: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    identity?: Identity;
  }
}

export interface AppDeps {
  sql: Sql;
  verifier: TokenVerifier;
  /** Health probe for the queue backend. */
  pingRedis: () => Promise<boolean>;
  /** Hand a stored inbound event to the worker. */
  enqueueInbound: (inboundEventId: string) => Promise<void>;
  webhookSecret: string;
  /** Require a second factor on every request. On in staging and production. */
  requireMfa?: boolean;
  corsOrigin?: string;
  logger?: boolean;
}

const ErrorBody = Type.Object({ error: Type.String() });

export async function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: deps.logger ?? false }).withTypeProvider<TypeBoxTypeProvider>();

  // Keep the raw body for webhook signature checks.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as FastifyRequest & { rawBody?: Buffer }).rawBody = body as Buffer;
    try {
      done(null, (body as Buffer).length ? JSON.parse((body as Buffer).toString('utf8')) : {});
    } catch (e) {
      done(e as Error, undefined);
    }
  });

  await app.register(cors, { origin: deps.corsOrigin ?? false });
  await app.register(swagger, {
    openapi: {
      info: { title: 'Hazina API', version: '0.1.0' },
      components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  app.get(
    '/health',
    {
      schema: {
        response: {
          200: Type.Object({ status: Type.String(), db: Type.Boolean(), redis: Type.Boolean() }),
          503: Type.Object({ status: Type.String(), db: Type.Boolean(), redis: Type.Boolean() }),
        },
      },
    },
    async (_req, reply) => {
      const db = await deps.sql`SELECT 1`.then(
        () => true,
        () => false,
      );
      const redis = await deps.pingRedis().catch(() => false);
      const ok = db && redis;
      return reply.code(ok ? 200 : 503).send({ status: ok ? 'ok' : 'degraded', db, redis });
    },
  );

  // ---- Authenticated /v1 routes -------------------------------------------------
  app.register(
    async (scope) => {
      const v1 = scope.withTypeProvider<TypeBoxTypeProvider>();
      v1.addHook('onRequest', async (req, reply) => {
        if (req.url.startsWith('/v1/webhooks/')) return;
        const header = req.headers.authorization ?? '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : '';
        if (!token) return reply.code(401).send({ error: 'missing bearer token' });
        let verified;
        try {
          verified = await deps.verifier.verify(token);
        } catch {
          return reply.code(401).send({ error: 'invalid token' });
        }
        if (deps.requireMfa && !verified.mfa)
          return reply.code(403).send({ error: 'second factor required' });
        const [row] = await deps.sql<
          { person_id: string; tenant_id: string; role: string; display_name: string }[]
        >`
        SELECT * FROM app.resolve_identity(${verified.uid})`;
        if (!row) return reply.code(403).send({ error: 'no Hazina access for this account' });
        req.identity = {
          personId: row.person_id,
          tenantId: row.tenant_id,
          role: row.role,
          displayName: row.display_name,
          mfa: verified.mfa,
        };
      });

      const Me = Type.Object({
        personId: Type.String(),
        tenantId: Type.String(),
        role: Type.String(),
        displayName: Type.String(),
        mfa: Type.Boolean(),
      });
      v1.get(
        '/me',
        {
          schema: {
            security: [{ bearer: [] }],
            response: { 200: Me, 401: ErrorBody, 403: ErrorBody },
          },
        },
        async (req) => req.identity!,
      );

      const NetWorth = Type.Object({
        currency: Type.String(),
        assetsMinor: Type.Number(),
        liabilitiesMinor: Type.Number(),
        netWorthMinor: Type.Number(),
        assetCount: Type.Number(),
      });
      v1.get(
        '/net-worth',
        { schema: { security: [{ bearer: [] }], response: { 200: NetWorth } } },
        async (req) => {
          const id = req.identity!;
          return withTenant(deps.sql, id.tenantId, async (tx) => {
            const input = await loadProjectionInput(tx, '2000-01', 1);
            const base = input.baseCurrency;
            const assetsMinor = input.assets.reduce(
              (s, a) => s + convert(a.value, base, input.fx).amountMinor,
              0,
            );
            const liabs = await tx<
              { principal_minor: string; currency: string }[]
            >`SELECT principal_minor, currency FROM liability`;
            const liabilitiesMinor = liabs.reduce(
              (s, l) =>
                s +
                convert(
                  {
                    amountMinor: Number(l.principal_minor),
                    currency: l.currency.trim() as Currency,
                  },
                  base,
                  input.fx,
                ).amountMinor,
              0,
            );
            // Every view of sensitive holdings is audited.
            await tx`INSERT INTO audit_event (tenant_id, actor_person_id, action, entity) VALUES (${id.tenantId}, ${id.personId}, 'view', 'net_worth')`;
            return {
              currency: base,
              assetsMinor,
              liabilitiesMinor,
              netWorthMinor: assetsMinor - liabilitiesMinor,
              assetCount: input.assets.length,
            };
          });
        },
      );

      v1.get(
        '/projection',
        {
          schema: {
            security: [{ bearer: [] }],
            querystring: Type.Object({
              start: Type.String({ pattern: '^\\d{4}-\\d{2}$' }),
              months: Type.Optional(Type.Integer({ minimum: 1, maximum: 120 })),
            }),
          },
        },
        async (req) => {
          const id = req.identity!;
          return withTenant(deps.sql, id.tenantId, async (tx) => {
            const input = await loadProjectionInput(tx, req.query.start, req.query.months ?? 36);
            await tx`INSERT INTO audit_event (tenant_id, actor_person_id, action, entity) VALUES (${id.tenantId}, ${id.personId}, 'view', 'projection')`;
            return project(input);
          });
        },
      );

      // DawinOS -> Hazina signed webhook: verify, store, acknowledge, queue.
      v1.post(
        '/webhooks/dawinos',
        {
          schema: {
            body: Type.Object({
              eventId: Type.String(),
              type: Type.String(),
              data: Type.Unknown(),
            }),
            response: {
              202: Type.Object({ status: Type.String() }),
              200: Type.Object({ status: Type.String() }),
              401: ErrorBody,
            },
          },
        },
        async (req, reply) => {
          const raw = (req as FastifyRequest & { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
          const given = String(req.headers['x-dawinos-signature'] ?? '');
          const expected = createHmac('sha256', deps.webhookSecret).update(raw).digest('hex');
          const ok =
            given.length === expected.length &&
            timingSafeEqual(Buffer.from(given), Buffer.from(expected));
          if (!ok) return reply.code(401).send({ error: 'bad signature' });
          const [row] = await deps.sql<{ id: string }[]>`
          INSERT INTO inbound_event (source, event_id, event_type, payload)
          VALUES ('dawinos', ${req.body.eventId}, ${req.body.type}, ${deps.sql.json(req.body as never)})
          ON CONFLICT (source, event_id) DO NOTHING RETURNING id`;
          if (!row) return reply.code(200).send({ status: 'duplicate' });
          await deps.enqueueInbound(row.id);
          return reply.code(202).send({ status: 'accepted' });
        },
      );
    },
    { prefix: '/v1' },
  );

  return app;
}
