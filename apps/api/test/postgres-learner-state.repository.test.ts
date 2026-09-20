import type { Pool } from 'pg';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { PostgresLearnerStateRepository } from '../src/learner-state/postgres-learner-state.repository.js';

const userId = '2efaf676-84e4-45b1-8a13-50735a8df2c8';
const require = createRequire(import.meta.url);
const sqlite = (() => {
  try {
    return require('node:sqlite') as typeof import('node:sqlite');
  } catch {
    return null;
  }
})();
const databaseIt = sqlite ? it : it.skip;

describe('PostgresLearnerStateRepository.readReconciliationCursor', () => {
  it('reads the per-learner cursor as a decimal string through a parameterized query', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return { rows: [{ cursor: '7' }] };
      },
    } as unknown as Pool;
    const repository = new PostgresLearnerStateRepository(pool);

    const cursor = await repository.readReconciliationCursor(userId);

    expect(cursor).toBe('7');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toMatch(/learner_reconciliation_cursors/);
    expect(calls[0]?.sql).toContain('$1');
    expect(calls[0]?.params).toEqual([userId]);
  });

  it('returns the decimal string 0 when no cursor row exists', async () => {
    const pool = {
      query: async () => ({ rows: [] }),
    } as unknown as Pool;
    const repository = new PostgresLearnerStateRepository(pool);

    expect(await repository.readReconciliationCursor(userId)).toBe('0');
  });
});

describe('PostgresLearnerStateRepository.findNewCardCandidates', () => {
  it('returns only bounded approved Start candidates unscheduled for this learner', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return {
          rows: [
            {
              card_id: '11111111-1111-4111-8111-111111111111',
              content_id: 'start-a1-haus',
            },
          ],
        };
      },
    } as unknown as Pool;
    const repository = new PostgresLearnerStateRepository(pool);

    const candidates = await repository.findNewCardCandidates(userId, 12);

    expect(candidates).toEqual([
      {
        cardId: '11111111-1111-4111-8111-111111111111',
        contentId: 'start-a1-haus',
        importance: 1,
      },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.params).toEqual([userId, 'start-a1-%', 12]);
    expect(calls[0]?.sql).toMatch(/cv\.status IN \('approved', 'published'\)/);
    expect(calls[0]?.sql).toMatch(
      /LEFT JOIN card_schedules s\s+ON s\.user_id = \$1 AND s\.card_id = c\.id/,
    );
    expect(calls[0]?.sql).toMatch(/s\.card_id IS NULL/);
    expect(calls[0]?.sql).toMatch(/c\.content_id LIKE \$2/);
    expect(calls[0]?.sql).toMatch(/LIMIT \$3/);
  });

  databaseIt('keeps a card scheduled only by another learner and performs no write', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params: params ?? [] });
        return { rows: [] };
      },
    } as unknown as Pool;

    await new PostgresLearnerStateRepository(pool).findNewCardCandidates(userId, 2);

    expect(calls).toHaveLength(1);
    expect(calls.every(({ sql }) => /^\s*SELECT\b/i.test(sql))).toBe(true);
    const [{ sql, params }] = calls;

    if (!sqlite) throw new Error('node:sqlite unavailable');
    const database = new sqlite.DatabaseSync(':memory:');
    database.exec(`
      CREATE TABLE cards (id TEXT PRIMARY KEY, content_id TEXT NOT NULL);
      CREATE TABLE card_schedules (user_id TEXT NOT NULL, card_id TEXT NOT NULL);
      CREATE TABLE card_versions (card_id TEXT NOT NULL, status TEXT NOT NULL);
      INSERT INTO cards VALUES
        ('card-other-learner', 'start-a1-apfel'),
        ('card-this-learner', 'start-a1-bett'),
        ('card-unscheduled', 'start-a1-brot'),
        ('card-after-limit', 'start-a1-zug'),
        ('card-draft', 'start-a1-danke'),
        ('card-other-pack', 'other-a1-haus');
      INSERT INTO card_schedules VALUES
        ('other-user', 'card-other-learner'),
        ('${userId}', 'card-this-learner');
      INSERT INTO card_versions VALUES
        ('card-other-learner', 'approved'),
        ('card-this-learner', 'published'),
        ('card-unscheduled', 'approved'),
        ('card-after-limit', 'approved'),
        ('card-draft', 'draft'),
        ('card-other-pack', 'approved');
    `);

    const rows = database.prepare(sql).all({ $1: params[0], $2: params[1], $3: params[2] });
    database.close();

    expect(rows).toEqual([
      { card_id: 'card-other-learner', content_id: 'start-a1-apfel' },
      { card_id: 'card-unscheduled', content_id: 'start-a1-brot' },
    ]);
  });

  it('rejects an unbounded or invalid candidate limit before querying', async () => {
    const pool = {
      query: async () => {
        throw new Error('must not query');
      },
    } as unknown as Pool;
    const repository = new PostgresLearnerStateRepository(pool);

    await expect(repository.findNewCardCandidates(userId, 0)).rejects.toThrow('candidate limit');
    await expect(repository.findNewCardCandidates(userId, 13)).rejects.toThrow('candidate limit');
  });
});
