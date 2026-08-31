import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = resolve(
  fileURLToPath(
    new URL('../../../database/migrations/0015_event_reconciliation_cursor.sql', import.meta.url),
  ),
);

describe('0015 event reconciliation cursor migration', () => {
  it('adds a nullable non-negative per-event reconciliation cursor without backfilling legacy rows', async () => {
    const sql = await readFile(migration, 'utf8');

    expect(sql).toMatch(/ALTER TABLE review_events/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS reconciliation_cursor BIGINT/i);
    expect(sql).toMatch(/reconciliation_cursor >= 0/i);
    // Legacy rows keep NULL; no UPDATE-based backfill is allowed.
    expect(sql).not.toMatch(/UPDATE review_events/i);
  });

  it('indexes review events for learner + cursor reads', async () => {
    const sql = await readFile(migration, 'utf8');

    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS/i);
    expect(sql).toMatch(/ON review_events\s*\(user_id, reconciliation_cursor\)/i);
  });
});