import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = resolve(
  fileURLToPath(
    new URL('../../../database/migrations/0013_native_review_transport.sql', import.meta.url),
  ),
);

describe('0013 native review transport migration', () => {
  it('preserves mobile IDs and scopes idempotency to one learner', async () => {
    const sql = await readFile(migration, 'utf8');

    expect(sql).toMatch(/ALTER COLUMN client_event_id TYPE TEXT USING client_event_id::text/i);
    expect(sql).toMatch(/CHECK \(char_length\(client_event_id\) BETWEEN 1 AND 128\)/i);
    expect(sql).toMatch(/UNIQUE \(user_id, client_event_id\)/i);
    expect(sql).not.toMatch(/UNIQUE \(client_event_id\)/i);
  });

  it('maps immutable canonical content and bootstraps approved schedules', async () => {
    const sql = await readFile(migration, 'utf8');

    expect(sql).toMatch(/ADD COLUMN content_id TEXT/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX cards_content_id_unique/i);
    expect(sql).toMatch(/content_id is immutable/i);
    expect(sql).toMatch(/status IN \('approved', 'published'\)/i);
    expect(sql).toMatch(/INSERT INTO card_schedules/i);
    expect(sql).toMatch(/ON CONFLICT \(user_id, card_id\) DO NOTHING/i);
    expect(sql).toMatch(/ADD COLUMN applied_at TIMESTAMPTZ NOT NULL DEFAULT now\(\)/i);
  });
});
