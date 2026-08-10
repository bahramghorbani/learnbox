import { readdir, readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const migrationsDirectory = new URL('../../../database/migrations/', import.meta.url);

async function readOwnerSplashMigration() {
  const files = await readdir(migrationsDirectory);
  const filename = files.find((file) => file === '0011_owner_splash_replacement.sql');

  expect(filename, 'owner splash migration 0011 must exist').toBeDefined();
  return readFile(new URL(filename!, migrationsDirectory), 'utf8');
}

describe('owner splash replacement migration', () => {
  it('stores immutable private splash versions behind one current pointer', async () => {
    const sql = await readOwnerSplashMigration();

    expect(sql).toMatch(/CREATE TABLE splash_versions/i);
    expect(sql).toMatch(/object_key TEXT NOT NULL UNIQUE/i);
    expect(sql).toMatch(/checksum TEXT NOT NULL/i);
    expect(sql).toMatch(/width INTEGER NOT NULL CHECK \(width >= 864\)/i);
    expect(sql).toMatch(/height INTEGER NOT NULL CHECK \(height >= 1600\)/i);
    expect(sql).toMatch(/media_type TEXT NOT NULL CHECK \(media_type = 'image\/webp'\)/i);
    expect(sql).toMatch(/CREATE TABLE current_splash/i);
    expect(sql).toMatch(/singleton_id SMALLINT PRIMARY KEY CHECK \(singleton_id = 1\)/i);
    expect(sql).toMatch(/version_id UUID NOT NULL REFERENCES splash_versions\(id\)/i);
  });

  it('records idempotency and bounded private-media cleanup without object URLs', async () => {
    const sql = await readOwnerSplashMigration();

    expect(sql).toMatch(/CREATE TABLE splash_replacement_actions/i);
    expect(sql).toMatch(/idempotency_key_hash TEXT NOT NULL UNIQUE/i);
    expect(sql).toMatch(/status TEXT NOT NULL CHECK \(status IN \('pending', 'completed'\)\)/i);
    expect(sql).toMatch(/status = 'pending' AND version_id IS NULL AND completed_at IS NULL/i);
    expect(sql).toMatch(
      /status = 'completed' AND version_id IS NOT NULL AND completed_at IS NOT NULL/i,
    );
    expect(sql).toMatch(/CREATE TABLE private_media_cleanup_jobs/i);
    expect(sql).toMatch(
      /attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK \(attempt_count >= 0 AND attempt_count <= 5\)/i,
    );
    expect(sql).toMatch(/last_error_code TEXT/i);
    expect(sql).not.toMatch(/https?:\/\//i);
  });
});
