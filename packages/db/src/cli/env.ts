import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'migrations',
);

export function ownerUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL (owner role) is not set. Copy .env.example to .env.');
  return url;
}

/** Refuse destructive commands anywhere but a local database. */
export function assertLocal(url: string): void {
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', 'postgres'].includes(host)) {
    throw new Error(`Refusing to run against non-local host "${host}".`);
  }
}
