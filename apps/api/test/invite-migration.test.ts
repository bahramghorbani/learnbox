import { readdir, readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const migrationsDirectory = new URL('../../../database/migrations/', import.meta.url);

async function readInviteAccessMigration() {
  const files = await readdir(migrationsDirectory);
  const filename = files.find((file) => file === '0010_invite_access.sql');

  expect(filename, 'invite access migration 0010 must exist').toBeDefined();
  return readFile(new URL(filename!, migrationsDirectory), 'utf8');
}

describe('invite access migration', () => {
  it('stores invite codes as keyed hashes with bounded use', async () => {
    const sql = await readInviteAccessMigration();

    expect(sql).toMatch(/CREATE TABLE invite_codes/i);
    expect(sql).toMatch(/code_hash TEXT PRIMARY KEY/i);
    expect(sql).toMatch(/max_uses INTEGER NOT NULL CHECK \(max_uses >= 1 AND max_uses <= 20\)/i);
    expect(sql).toMatch(/used_count INTEGER NOT NULL DEFAULT 0/i);
    expect(sql).toMatch(/used_count <= max_uses/i);
  });

  it('records consent acknowledgements keyed to the code', async () => {
    const sql = await readInviteAccessMigration();

    expect(sql).toMatch(/CREATE TABLE invite_consents/i);
    expect(sql).toMatch(/code_hash TEXT NOT NULL REFERENCES invite_codes\(code_hash\)/i);
    expect(sql).toMatch(/consent_version TEXT NOT NULL/i);
    expect(sql).toMatch(/PRIMARY KEY \(code_hash, consent_version\)/i);
  });

  it('tracks opaque rate-limit request events without raw subjects', async () => {
    const sql = await readInviteAccessMigration();

    expect(sql).toMatch(/CREATE TABLE invite_request_events/i);
    expect(sql).toMatch(/ip_hash TEXT NOT NULL/i);
    expect(sql).toMatch(/CREATE INDEX invite_request_events_ip_window_idx/i);
  });

  it('never stores plaintext invite codes, phones or consent text', async () => {
    const sql = await readInviteAccessMigration();

    expect(sql).not.toMatch(/\bcode\s+TEXT/i);
    expect(sql).not.toMatch(/\bphone\s+TEXT/i);
    expect(sql).not.toMatch(/consent_text/i);
  });
});
