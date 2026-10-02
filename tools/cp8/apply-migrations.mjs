// CP8 staging helper. Applies migrations exactly the way the repository's own DB suite does:
// one migration file = one pool.query, so dollar-quoted blocks and temp tables stay intact.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../..');
// Resolve `pg` from the website workspace (pnpm keeps it there, not at the repo root).
const require = createRequire(join(repo, 'apps/website/package.json'));
const pg = require('pg');
const dir = join(repo, 'database/migrations');
// Range is inclusive: `node apply-migrations.mjs 0001 0022` then later `... 0023 0023`.
// Earlier migrations are NOT idempotent, so re-running from 0001 fails by design; always
// pass the exact range you intend to apply.
const from = process.argv[3] ? process.argv[2] : '0000';
const upTo = process.argv[3] ?? process.argv[2] ?? '0022';
const pool = new pg.Pool({ connectionString: process.env.STAGING_DATABASE_URL });
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f.slice(0, 4) >= from && f.slice(0, 4) <= upTo);
for (const f of files) {
  await pool.query(readFileSync(join(dir, f), 'utf8'));
  console.log('applied ' + f);
}
await pool.end();
