import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = resolve(
  fileURLToPath(
    new URL('../../../database/migrations/0012_mobile_learner_sessions.sql', import.meta.url),
  ),
);

describe('0012 mobile learner sessions migration', () => {
  it('adds only hash-only, family-revocable mobile session persistence', async () => {
    const sql = await readFile(migration, 'utf8');

    expect(sql).toMatch(/CREATE TABLE mobile_learner_sessions/i);
    expect(sql).toMatch(/refresh_token_hash TEXT NOT NULL/i);
    expect(sql).toMatch(/installation_id TEXT NOT NULL/i);
    expect(sql).toMatch(/absolute_expires_at TIMESTAMPTZ NOT NULL/i);
    expect(sql).toMatch(/idle_expires_at TIMESTAMPTZ NOT NULL/i);
    expect(sql).toMatch(/family_generation INTEGER NOT NULL DEFAULT 0/i);
    expect(sql).toMatch(/revoked_at TIMESTAMPTZ/i);
    expect(sql).toMatch(/UNIQUE \(refresh_token_hash\)/i);
    expect(sql).not.toMatch(/review_events|content_id|client_event_id/i);
  });
});
