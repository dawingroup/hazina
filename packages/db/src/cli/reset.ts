import { connect } from '../client.js';
import { assertLocal, ownerUrl } from './env.js';

const url = ownerUrl();
assertLocal(url);
const sql = connect(url, { max: 1 });
try {
  await sql.unsafe(
    'DROP SCHEMA IF EXISTS app CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
  );
  console.log('Local database reset. Run pnpm db:migrate && pnpm db:seed.');
} finally {
  await sql.end();
}
