import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresSplashStore } from '../lib/server/postgres-splash-store.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeOrSkip = databaseUrl ? describe : describe.skip;
const migrationsDir = path.resolve(__dirname, '../../../database/migrations');

describeOrSkip('splash promotion is actually visible to the learner-facing route', () => {
  const pool = new Pool({ connectionString: databaseUrl });
  afterAll(() => pool.end());

  beforeAll(async () => {
    // This test exercises the full splash_replacement_actions -> splash_versions ->
    // current_splash chain, so it needs the whole schema, not a curated subset.
    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const file of files) {
      await pool.query(readFileSync(path.join(migrationsDir, file), 'utf8'));
    }
  });

  it('writes image_data so apps/website/lib/launch-splash.ts finds it (not just object_key)', async () => {
    const store = new PostgresSplashStore(pool);
    const candidate = {
      bytes: Buffer.from('fake-webp-bytes-for-proof'),
      checksum: 'b'.repeat(64),
      width: 864,
      height: 1821,
      byteSize: 25,
      mediaType: 'image/webp' as const,
    };

    const reservation = await store.reserveReplacement({
      idempotencyKeyHash: createHash('sha256').update(`proof-${Date.now()}`).digest('hex'),
      now: new Date(),
    });
    if (reservation.status !== 'reserved') throw new Error('expected a fresh reservation');

    await store.promoteReplacement({
      actionId: reservation.actionId,
      versionId: randomUUID(),
      objectKey: `admin/splash/proof-${Date.now()}.webp`,
      candidate,
      now: new Date(),
    });

    // The exact query the learner-facing route runs — regression guard for the real bug:
    // promoteReplacement used to omit image_data, so this always came back empty and the
    // route fell through to a Blob fallback that doesn't exist on this deployment.
    const result = await pool.query(
      `SELECT sv.image_data, sv.media_type
         FROM current_splash cs
         JOIN splash_versions sv ON sv.id = cs.version_id
        WHERE cs.singleton_id = 1
          AND sv.image_data IS NOT NULL
        LIMIT 1`,
    );
    const row = result.rows[0];
    expect(row).toBeDefined();
    expect(Buffer.from(row.image_data).equals(candidate.bytes)).toBe(true);
    expect(row.media_type).toBe('image/webp');
  });
});
