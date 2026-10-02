// Drop and recreate the staging public schema. ISOLATED STAGING ONLY.
// Refuses any DSN that is not the local staging port, so this can never touch Production.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../..');
// `pg` resolves from the website workspace, matching tools/cp8/lib.mjs.
const pg = createRequire(join(repo, 'apps/website/package.json'))('pg');

const dsn = process.env.STAGING_DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1):55443\//.test(dsn)) {
  console.error('REFUSING: DSN is not the local isolated staging database.');
  process.exit(2);
}
const pool = new pg.Pool({ connectionString: dsn });
await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
console.log('schema_dropped=ok');
await pool.end();
