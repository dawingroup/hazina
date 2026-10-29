import { connect } from '../client.js';
import { migrate } from '../migrate.js';
import { MIGRATIONS_DIR, ownerUrl } from './env.js';

const sql = connect(ownerUrl(), { max: 1 });
try {
  const applied = await migrate(sql, MIGRATIONS_DIR);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
} finally {
  await sql.end();
}
