#!/usr/bin/env node
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const { Pool } = createRequire(new URL('../apps/admin/package.json', import.meta.url))('pg');

import { pilotRecords, idempotencyKey } from './dictionary-editorial-pilot.mjs';
import { readAdminDatabaseConfig } from '../apps/admin/lib/server/admin-database.ts';
import { PostgresDictionaryEditorialStore } from '../apps/admin/lib/server/postgres-dictionary-editorial-store.ts';

const [input, mode] = process.argv.slice(2);
if (!input || !['--dry-run', '--apply'].includes(mode))
  throw new Error(
    'Usage: DATABASE_URL=… ADMIN_ACTOR_USER_ID=… LEARNBOX_ADMIN_DICTIONARY_EDITORIAL_ENABLED=true node tools/import-dictionary-editorial-pilot.mjs PILOT.json --dry-run|--apply',
  );
if (process.env.LEARNBOX_ADMIN_DICTIONARY_EDITORIAL_ENABLED !== 'true')
  throw new Error(
    'Dictionary editorial is disabled. Set LEARNBOX_ADMIN_DICTIONARY_EDITORIAL_ENABLED=true explicitly.',
  );
if (!process.env.ADMIN_ACTOR_USER_ID) throw new Error('ADMIN_ACTOR_USER_ID is required.');
const records = pilotRecords(JSON.parse(await readFile(input, 'utf8')));
if (mode === '--dry-run') {
  console.info(`Validated ${records.length} queued records; no database write performed.`);
  process.exit(0);
}
const pool = new Pool(readAdminDatabaseConfig(process.env));
try {
  const store = new PostgresDictionaryEditorialStore(pool);
  for (const record of records)
    await store.create(process.env.ADMIN_ACTOR_USER_ID, {
      ...record,
      idempotencyKey: idempotencyKey(record),
    });
  console.info(`Imported ${records.length} queued records.`);
} finally {
  await pool.end();
}
