import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = resolve(
  fileURLToPath(
    new URL('../../../database/migrations/0014_learner_reconciliation_cursor.sql', import.meta.url),
  ),
);

describe('0014 learner reconciliation cursor migration', () => {
  it('creates a learner-scoped monotonic bigint cursor with safe default 0 and FK to users', async () => {
    const sql = await readFile(migration, 'utf8');

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS learner_reconciliation_cursors/i);
    expect(sql).toMatch(/user_id UUID PRIMARY KEY/i);
    expect(sql).toMatch(/REFERENCES users\(id\)/i);
    expect(sql).toMatch(/cursor BIGINT NOT NULL DEFAULT 0/i);
    expect(sql).toMatch(/CHECK \(cursor >= 0\)/i);
  });

  it('advances the cursor exactly one per call and never rewinds', async () => {
    const sql = await readFile(migration, 'utf8');

    expect(sql).toMatch(/advance_learner_reconciliation_cursor\(/i);
    expect(sql).toMatch(/cursor = learner_reconciliation_cursors\.cursor \+ 1/i);
    expect(sql).toMatch(
      /ON CONFLICT \(user_id\) DO UPDATE\s+SET cursor = learner_reconciliation_cursors\.cursor \+ 1/i,
    );
    expect(sql).toMatch(/RETURNING cursor/i);
  });
});
