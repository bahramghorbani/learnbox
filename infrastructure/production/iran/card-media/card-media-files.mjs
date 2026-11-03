#!/usr/bin/env node
// Card media files: prove every database row has its file (migrations 0061/0062).
//
//   node card-media-files.mjs verify    every row has a file matching its size + checksum (exit 1 if not)
//
// Env: DATABASE_URL, LEARNBOX_CARD_MEDIA_DIR (absolute media root). Runs inside the Admin image
// (uid 1001, `pg` resolved from LEARNBOX_REQUIRE_FROM). The one-off move of database bytes to files
// ran on 2026-11-04 (2,590 rows); migration 0062 forbids bytes in the database, so nothing is left
// to move.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(process.env.LEARNBOX_REQUIRE_FROM || import.meta.url);
const { Client } = require('pg');

const KEY =
  /^admin\/card-media\/[a-z0-9-]{1,128}\/(image|word_audio|sentence_audio)\/[0-9a-f-]{36}\.(png|jpg|mp3)$/;
const sha = (b) => createHash('sha256').update(b).digest('hex');
const root = process.env.LEARNBOX_CARD_MEDIA_DIR;
if (!root || !path.isAbsolute(root) || !process.env.DATABASE_URL || process.argv[2] !== 'verify') {
  console.error('usage: DATABASE_URL=... LEARNBOX_CARD_MEDIA_DIR=/abs/path card-media-files.mjs verify');
  process.exit(2);
}
const base = path.resolve(root);

const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const counts = { rows: 0, ok_file: 0 };
try {
  const { rows } = await db.query(
    'SELECT object_key, checksum, byte_size FROM card_media_objects ORDER BY object_key',
  );
  counts.rows = rows.length;
  for (const r of rows) {
    const file = path.resolve(base, r.object_key);
    let problem;
    if (!KEY.test(r.object_key) || !file.startsWith(base + path.sep)) problem = 'BAD_key';
    else {
      const bytes = await readFile(file).catch((e) => (e.code === 'ENOENT' ? null : Promise.reject(e)));
      if (!bytes) problem = 'MISSING_file';
      else if (bytes.length !== r.byte_size || sha(bytes) !== r.checksum) problem = 'BAD_file';
    }
    if (problem) {
      counts[problem] = (counts[problem] || 0) + 1;
      console.log(problem, r.object_key);
    } else counts.ok_file += 1;
  }
} finally {
  await db.end();
}
console.log(JSON.stringify({ mode: 'verify', ...counts }));
process.exit(counts.ok_file === counts.rows ? 0 : 1);
