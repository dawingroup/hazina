import postgres from 'postgres';

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

export function connect(url: string, opts: postgres.Options<Record<string, never>> = {}): Sql {
  return postgres(url, { max: 10, idle_timeout: 20, onnotice: () => {}, ...opts });
}

/**
 * Run `fn` inside a transaction scoped to one tenant. Row-level security reads
 * `app.tenant_id`, which is set LOCAL to this transaction only, so a pooled
 * connection never carries one tenant's scope into another request.
 */
export async function withTenant<T>(
  sql: Sql,
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}
