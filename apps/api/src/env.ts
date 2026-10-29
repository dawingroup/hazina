import { z } from 'zod';

const Env = z.object({
  DATABASE_URL_APP: z.string().url(),
  REDIS_URL: z.string().url(),
  FIREBASE_PROJECT_ID: z.string().min(1),
  API_PORT: z.coerce.number().int().default(8080),
  /** HMAC secret shared with DawinOS for signed webhooks. */
  DAWINOS_WEBHOOK_SECRET: z.string().min(16).default('local-dev-secret-change-me'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});
export type Env = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return Env.parse(source);
}
