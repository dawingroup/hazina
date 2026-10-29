import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { connect, loadProjectionInput, withTenant } from '@hazina/db';
import { project } from '@hazina/domain';

const QUEUES = { inbound: 'inbound-events', projection: 'projection-runs' } as const;

const dbUrl = process.env.DATABASE_URL_APP;
const redisUrl = process.env.REDIS_URL;
if (!dbUrl || !redisUrl) throw new Error('DATABASE_URL_APP and REDIS_URL are required');

const sql = connect(dbUrl);
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

/**
 * DawinOS events never post straight to the ledger. The worker marks each one
 * for review; the owner approves it in the review queue (sprint 5).
 */
const inbound = new Worker<{ inboundEventId: string }>(
  QUEUES.inbound,
  async (job) => {
    await sql`UPDATE inbound_event SET status = 'needs_review', processed_at = now()
      WHERE id = ${job.data.inboundEventId} AND status = 'received'`;
  },
  { connection },
);

/** Runs the projection engine for one tenant and stores the run with its inputs. */
const projection = new Worker<{ tenantId: string; startMonth: string; horizonMonths?: number }>(
  QUEUES.projection,
  async (job) => {
    const { tenantId, startMonth, horizonMonths } = job.data;
    await withTenant(sql, tenantId, async (tx) => {
      const input = await loadProjectionInput(tx, startMonth, horizonMonths ?? 36);
      const result = project(input);
      await tx`INSERT INTO projection_run (tenant_id, start_month, inputs, result)
        VALUES (${tenantId}, ${startMonth}, ${tx.json(input as never)}, ${tx.json(result as never)})`;
    });
  },
  { connection, concurrency: 2 },
);

for (const w of [inbound, projection]) {
  w.on('failed', (job, err) => console.error(`[${w.name}] job ${job?.id} failed:`, err.message));
}
console.log('Hazina worker listening on', Object.values(QUEUES).join(', '));

const shutdown = async () => {
  await Promise.all([inbound.close(), projection.close()]);
  await sql.end();
  connection.disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
