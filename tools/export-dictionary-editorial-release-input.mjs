#!/usr/bin/env node
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';

const { Pool } = createRequire(new URL('../apps/admin/package.json', import.meta.url))('pg');

import { releaseInput } from './dictionary-editorial-pilot.mjs';
import { readAdminDatabaseConfig } from '../apps/admin/lib/server/admin-database.ts';
import { PostgresDictionaryEditorialStore } from '../apps/admin/lib/server/postgres-dictionary-editorial-store.ts';

const [output] = process.argv.slice(2);
if (!output)
  throw new Error(
    'Usage: DATABASE_URL=… ADMIN_ACTOR_USER_ID=… node tools/export-dictionary-editorial-release-input.mjs RELEASE-INPUT.json',
  );
if (!process.env.ADMIN_ACTOR_USER_ID) throw new Error('ADMIN_ACTOR_USER_ID is required.');
const pool = new Pool(readAdminDatabaseConfig(process.env));
try {
  const result = await new PostgresDictionaryEditorialStore(pool).list(
    process.env.ADMIN_ACTOR_USER_ID,
  );
  if (result.status === 'forbidden') throw new Error('ADMIN_ACTOR_USER_ID is not a super admin.');
  const release = releaseInput(result.items);
  await writeFile(output, `${JSON.stringify(release, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.info(`Wrote ${release.entries.length} approved effective payloads to ${output}.`);
} finally {
  await pool.end();
}
