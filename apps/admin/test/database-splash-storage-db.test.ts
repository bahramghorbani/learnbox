import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseSplashStorage } from '../lib/server/database-splash-storage';

/**
 * Splash replacement needed BLOB_READ_WRITE_TOKEN before this storage existed, so it was
 * unusable on a self-hosted deployment with no Vercel Blob account. This runs the real storage
 * under the restricted `learnbox_admin` role (same guard as pack-metadata-role-grants-db.test.ts)
 * so a missing grant on `splash_media_objects` fails here instead of in Production.
 */
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const migrationsDir = join(process.cwd(), '..', '..', 'database', 'migrations');
const rolesFile = join(process.cwd(), '..', '..', 'infrastructure', 'database', 'db-roles-p0.sql');
const grantMigrations = [
  '0032_role_grant_repair.sql',
  '0033_admin_content_management_grants.sql',
  '0034_admin_pack_metadata_grants.sql',
  '0045_splash_media_objects.sql',
];

suite('database-backed splash storage under the restricted learnbox_admin role', () => {
  const dbName = `lb_splash_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  let root: Pool;
  let owner: Pool;
  let restricted: Pool;

  beforeAll(async () => {
    root = new Pool({ connectionString: url, max: 1 });
    root.on('error', () => undefined);
    await root.query(`CREATE DATABASE ${dbName}`);
    const scoped = new URL(url as string);
    scoped.pathname = `/${dbName}`;
    owner = new Pool({ connectionString: scoped.toString(), max: 2 });
    owner.on('error', () => undefined);

    for (const file of readdirSync(migrationsDir)
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort()) {
      await owner.query(readFileSync(join(migrationsDir, file), 'utf8'));
    }
    await owner.query(
      readFileSync(rolesFile, 'utf8')
        .split('\n')
        .filter((line) => !line.startsWith('\\'))
        .join('\n'),
    );
    for (const file of grantMigrations) {
      await owner.query(readFileSync(join(migrationsDir, file), 'utf8'));
    }

    const asAdmin = new URL(scoped.toString());
    asAdmin.searchParams.set('options', '-c role=learnbox_admin');
    restricted = new Pool({ connectionString: asAdmin.toString(), max: 2 });
    restricted.on('error', () => undefined);
  });

  afterAll(async () => {
    await restricted?.end().catch(() => undefined);
    await owner?.end().catch(() => undefined);
    await root?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
    await root?.end().catch(() => undefined);
  });

  it('uploads, reads back and deletes bytes as the restricted role', async () => {
    const storage = createDatabaseSplashStorage(restricted);
    const objectKey = 'admin/splash/db-storage-test.webp';
    const bytes = Buffer.from('fake-webp-bytes');

    await storage.upload(objectKey, bytes, 'image/webp');

    const stream = await storage.read(objectKey);
    expect(stream).toBeDefined();
    const reader = (stream as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      chunks.push(next.value);
    }
    expect(Buffer.concat(chunks).toString()).toBe('fake-webp-bytes');

    await storage.delete(objectKey);
    expect(await storage.read(objectKey)).toBeUndefined();
  });

  it('rejects an object_key that does not match the splash naming convention', async () => {
    const storage = createDatabaseSplashStorage(restricted);
    await expect(
      storage.upload('not-a-splash-key.png', Buffer.from('x'), 'image/webp'),
    ).rejects.toBeDefined();
  });
});
