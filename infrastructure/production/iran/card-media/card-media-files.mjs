#!/usr/bin/env node
// Card media files: move bytes out of the database (migration 0061) and verify the result.
//
//   node card-media-files.mjs verify              every row: file (or legacy DB bytes) matches size+checksum
//   node card-media-files.mjs backfill            dry-run: what would move
//   node card-media-files.mjs backfill --apply    move: write file, read back, verify, then NULL the DB bytes
//
// Env: DATABASE_URL (schema owner for backfill), LEARNBOX_CARD_MEDIA_DIR (media root).
// Runs inside the Admin image (uid 1001, `pg` available) with the media root mounted read-write.
// Idempotent and resumable: a row is cleared only after its file is proven identical, and only if
// its checksum still matches (`WHERE object_key=$1 AND checksum=$2 AND bytes IS NOT NULL`).
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(process.env.LEARNBOX_REQUIRE_FROM || import.meta.url);
const { Client } = require('pg');

const KEY = /^admin\/card-media\/[a-z0-9-]{1,128}\/(image|word_audio|sentence_audio)\/[0-9a-f-]{36}\.(png|jpg|mp3)$/;
const sha = (b) => createHash('sha256').update(b).digest('hex');
const [mode, flag] = process.argv.slice(2);
const apply = flag === '--apply';
const root = process.env.LEARNBOX_CARD_MEDIA_DIR;
if (!root || !process.env.DATABASE_URL || !['verify', 'backfill'].includes(mode)) {
  console.error('usage: DATABASE_URL=... LEARNBOX_CARD_MEDIA_DIR=... card-media-files.mjs verify|backfill [--apply]');
  process.exit(2);
}
const base = path.resolve(root);
function fileFor(key) {
  if (!KEY.test(key)) throw new Error(`invalid key ${key}`);
  const f = path.resolve(base, key);
  if (!f.startsWith(base + path.sep)) throw new Error(`invalid key ${key}`);
  return f;
}
async function readOrNull(f) {
  try { return await readFile(f); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
async function writeVerified(key, bytes, checksum) {
  const f = fileFor(key);
  const existing = await readOrNull(f);
  if (existing) {
    if (sha(existing) === checksum) return 'exists';
    throw new Error(`different file already at ${key}`);
  }
  await mkdir(path.dirname(f), { recursive: true, mode: 0o750 });
  const tmp = `${f}.tmp-${randomUUID()}`;
  const h = await open(tmp, 'wx', 0o640);
  try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); }
  try { await rename(tmp, f); } catch (e) { await unlink(tmp).catch(() => {}); throw e; }
  const back = await readFile(f);
  if (back.length !== bytes.length || sha(back) !== checksum) throw new Error(`read-back mismatch ${key}`);
  return 'written';
}

const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const counts = {};
const bump = (k) => (counts[k] = (counts[k] || 0) + 1);
try {
  if (mode === 'verify') {
    const { rows } = await db.query(
      `SELECT object_key, checksum, byte_size, bytes IS NOT NULL AS in_db FROM card_media_objects ORDER BY object_key`,
    );
    for (const r of rows) {
      if (r.in_db) {
        const { rows: [b] } = await db.query('SELECT bytes FROM card_media_objects WHERE object_key=$1', [r.object_key]);
        if (b.bytes.length === r.byte_size && sha(b.bytes) === r.checksum) bump('ok_in_database');
        else { bump('BAD_database_bytes'); console.log('BAD db', r.object_key); }
        continue;
      }
      const f = await readOrNull(fileFor(r.object_key));
      if (!f) { bump('MISSING_file'); console.log('MISSING', r.object_key); }
      else if (f.length !== r.byte_size || sha(f) !== r.checksum) { bump('BAD_file'); console.log('BAD file', r.object_key); }
      else bump('ok_file');
    }
    counts.rows = rows.length;
  } else {
    const { rows } = await db.query(
      `SELECT object_key, checksum, byte_size FROM card_media_objects WHERE bytes IS NOT NULL ORDER BY object_key`,
    );
    counts.candidates = rows.length;
    for (const r of rows) {
      const { rows: [b] } = await db.query(
        'SELECT bytes FROM card_media_objects WHERE object_key=$1 AND bytes IS NOT NULL', [r.object_key]);
      if (!b) { bump('already_moved'); continue; }
      if (b.bytes.length !== r.byte_size || sha(b.bytes) !== r.checksum) {
        bump('SKIPPED_db_bytes_do_not_match_record'); console.log('SKIP', r.object_key); continue;
      }
      if (!apply) { bump('would_move'); continue; }
      bump(`file_${await writeVerified(r.object_key, b.bytes, r.checksum)}`);
      const u = await db.query(
        `UPDATE card_media_objects SET bytes = NULL WHERE object_key=$1 AND checksum=$2 AND bytes IS NOT NULL`,
        [r.object_key, r.checksum]);
      bump(u.rowCount === 1 ? 'moved' : 'update_skipped');
    }
  }
} finally {
  await db.end();
}
console.log(JSON.stringify({ mode, apply, ...counts }));
const bad = Object.keys(counts).some((k) => /^(BAD|MISSING|SKIPPED)/.test(k));
process.exit(bad ? 1 : 0);
