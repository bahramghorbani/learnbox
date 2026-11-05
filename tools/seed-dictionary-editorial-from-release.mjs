#!/usr/bin/env node
// Loads every entry of a published dictionary release (SQLite) into the Admin editorial table as
// approved, so the panel becomes the single place to see, edit or delete any word. Existing keys
// (AI or manual work) are never overwritten. Also auto-approves AI entries still queued, per the
// owner's AI-first policy: the AI reviewer's verdict approves; "fixed" stays flagged for a look.
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const { Pool } = createRequire(new URL('../apps/admin/package.json', import.meta.url))('pg');

import { idempotencyKey } from './dictionary-editorial-pilot.mjs';
import { readAdminDatabaseConfig } from '../apps/admin/lib/server/admin-database.ts';
import { PostgresDictionaryEditorialStore } from '../apps/admin/lib/server/postgres-dictionary-editorial-store.ts';

const [release, mode] = process.argv.slice(2);
if (!release || !['--dry-run', '--apply'].includes(mode))
  throw new Error(
    'Usage: DATABASE_URL=… ADMIN_ACTOR_USER_ID=… node tools/seed-dictionary-editorial-from-release.mjs dict.sqlite --dry-run|--apply',
  );
const actor = process.env.ADMIN_ACTOR_USER_ID;
if (!actor) throw new Error('ADMIN_ACTOR_USER_ID is required.');

function releaseRecords(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return db
      .prepare('SELECT lemma, article, pos, freq, data FROM entry ORDER BY lemma')
      .all()
      .map((row) => ({
        dictionaryKey: row.lemma,
        payload: {
          lemma: row.lemma,
          article: row.article,
          pos: row.pos,
          freq: row.freq,
          ...JSON.parse(row.data),
        },
      }));
  } finally {
    db.close();
  }
}

const records = releaseRecords(release);
const source = `release/${release
  .split('/')
  .pop()
  .replace(/\.sqlite$/, '')}`;
if (!records.length || records.some((r) => !r.dictionaryKey || !Array.isArray(r.payload.senses)))
  throw new Error('Release has no entries or an entry without senses.');
if (mode === '--dry-run') {
  console.info(`Validated ${records.length} release entries (${source}); no database write.`);
  process.exit(0);
}

const pool = new Pool(readAdminDatabaseConfig(process.env));
try {
  const store = new PostgresDictionaryEditorialStore(pool);
  let inserted = 0;
  for (let i = 0; i < records.length; i += 1000) {
    const batch = records.slice(i, i + 1000);
    const result = await store.seed(actor, {
      records: batch,
      source,
      idempotencyKey: idempotencyKey({ source, keys: batch.map((r) => r.dictionaryKey) }),
    });
    if (result.status === 'forbidden') throw new Error('ADMIN_ACTOR_USER_ID is not a super admin.');
    inserted += result.inserted;
  }
  const all = await store.list(actor);
  let approved = 0;
  for (const item of all.items.filter((x) => x.status === 'queued')) {
    if (!['ok', 'fixed'].includes(String(item.costMetadata.reviewVerdict))) continue;
    const result = await store.update(actor, item.id, {
      revision: item.revision,
      status: 'approved',
      idempotencyKey: idempotencyKey({ approve: item.id, revision: item.revision }),
    });
    if (result.status === 'applied') approved++;
  }
  console.info(
    `Seeded ${inserted} of ${records.length} release entries; auto-approved ${approved} AI entries.`,
  );
} finally {
  await pool.end();
}
