import { readdir, readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const migrationsDirectory = new URL('../../../database/migrations/', import.meta.url);

async function readOwnerPasskeyMigration() {
  const files = await readdir(migrationsDirectory);
  const filename = files.find((file) => file === '0009_owner_passkey_auth.sql');

  expect(filename, 'owner passkey migration 0009 must exist').toBeDefined();
  return readFile(new URL(filename!, migrationsDirectory), 'utf8');
}

describe('owner passkey migration', () => {
  it('enforces one owner and unique credentials', async () => {
    const sql = await readOwnerPasskeyMigration();

    expect(sql).toMatch(/CREATE TABLE admin_owner/i);
    expect(sql).toMatch(/singleton_id SMALLINT PRIMARY KEY CHECK \(singleton_id = 1\)/i);
    expect(sql).toMatch(/webauthn_user_handle BYTEA NOT NULL UNIQUE/i);
    expect(sql).toMatch(/CREATE TABLE admin_passkey_credentials/i);
    expect(sql).toMatch(/credential_id BYTEA PRIMARY KEY/i);
    expect(sql).toMatch(/owner_singleton_id SMALLINT NOT NULL REFERENCES admin_owner/i);
  });

  it('stores one-use expiring challenges without plaintext challenge values', async () => {
    const sql = await readOwnerPasskeyMigration();

    expect(sql).toMatch(/CREATE TABLE admin_webauthn_challenges/i);
    expect(sql).toMatch(/challenge_hash TEXT NOT NULL UNIQUE/i);
    expect(sql).toMatch(/browser_nonce_hash TEXT NOT NULL/i);
    expect(sql).toMatch(/expires_at TIMESTAMPTZ NOT NULL/i);
    expect(sql).toMatch(/consumed_at TIMESTAMPTZ/i);
    expect(sql).not.toMatch(/\bchallenge\s+TEXT/i);
    expect(sql).not.toMatch(/\bbrowser_nonce\s+TEXT/i);
  });

  it('stores only hashed revocable sessions with bounded lifetime timestamps', async () => {
    const sql = await readOwnerPasskeyMigration();

    expect(sql).toMatch(/CREATE TABLE admin_sessions/i);
    expect(sql).toMatch(/token_hash TEXT PRIMARY KEY/i);
    expect(sql).toMatch(/csrf_hash TEXT NOT NULL/i);
    expect(sql).toMatch(/last_seen_at TIMESTAMPTZ NOT NULL/i);
    expect(sql).toMatch(/absolute_expires_at TIMESTAMPTZ NOT NULL/i);
    expect(sql).toMatch(/revoked_at TIMESTAMPTZ/i);
    expect(sql).toMatch(/recent_authenticated_at TIMESTAMPTZ NOT NULL/i);
    expect(sql).not.toMatch(/\bsession_token\b/i);
    expect(sql).not.toMatch(/\bcsrf_token\b/i);
  });
});
