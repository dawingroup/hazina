import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { connect } from '@hazina/db';
import { buildApp } from './app.js';
import { firebaseVerifier } from './auth.js';
import { loadEnv } from './env.js';
import { QUEUES } from './queues.js';

const env = loadEnv();
const sql = connect(env.DATABASE_URL_APP);
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
await redis.connect().catch(() => undefined);
const inbound = new Queue(QUEUES.inbound, { connection: redis });

const app = await buildApp({
  sql,
  verifier: firebaseVerifier(env.FIREBASE_PROJECT_ID),
  pingRedis: async () => (await redis.ping()) === 'PONG',
  enqueueInbound: async (id) => {
    await inbound.add(
      'dawinos',
      { inboundEventId: id },
      { jobId: id, attempts: 5, backoff: { type: 'exponential', delay: 2000 } },
    );
  },
  webhookSecret: env.DAWINOS_WEBHOOK_SECRET,
  requireMfa: process.env.NODE_ENV === 'production',
  corsOrigin: env.CORS_ORIGIN,
  logger: true,
});

await app.listen({ host: '0.0.0.0', port: env.API_PORT });
