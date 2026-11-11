import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { guardForcedTeardown } from './support/forced-teardown-guard';
import { readLeague } from '../lib/league';

/**
 * Regression for the production incident where the league nav tab silently vanished for
 * everyone: `readLeague` held one connection from its own tiny pool (`max: 2` in the route)
 * for the whole function, then also ran extra queries through the shared pool. Two concurrent
 * requests exhausted the pool and deadlocked forever — no error, no timeout, just a hang that
 * never recovered until the process restarted. The fix makes `readLeague` use only the one
 * connection it already holds, so it never needs more than `max: 1` regardless of concurrency.
 *
 * Requires TEST_DATABASE_URL (see learner-progress-source-of-truth.test.ts for the local recipe).
 */
const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');

const suite = url ? describe : describe.skip;
const dbName = `league_${Math.random().toString(36).slice(2, 10)}`;
const migrationsDir = join(__dirname, '../../../database/migrations');

let pool: Pool;
let admin: Pool;
let teardown: ReturnType<typeof guardForcedTeardown>;

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const cardId = '33333333-3333-4333-8333-333333333333';

suite('league read is safe under a pool no bigger than it needs (real Postgres)', () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: url, max: 1 });
    guardForcedTeardown(admin);
    await admin.query(`CREATE DATABASE ${dbName}`);
    const scoped = new URL(url as string);
    scoped.pathname = `/${dbName}`;
    // The same max:2 the production route uses — the whole point is that readLeague must not
    // need more than one connection per call, concurrent or not.
    pool = new Pool({ connectionString: scoped.toString(), max: 2 });
    teardown = guardForcedTeardown(pool);
    for (const file of readdirSync(migrationsDir)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort()) {
      await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
    }
    await pool.query(`INSERT INTO users (id, phone_e164, first_name) VALUES ($1, $2, $3)`, [
      userA,
      '+491****0001',
      'alice',
    ]);
    await pool.query(`INSERT INTO users (id, phone_e164, first_name) VALUES ($1, $2, $3)`, [
      userB,
      '+491****0002',
      'bob',
    ]);
    await pool.query(`INSERT INTO cards (id, lemma, content_id) VALUES ($1, $2, $3)`, [
      cardId,
      'wort',
      'league-card-1',
    ]);
    await pool.query(
      `INSERT INTO review_events (id, user_id, card_id, grade, occurred_at, client_event_id)
       VALUES ($1, $2, $3, 'remembered', now(), $4)`,
      [
        '44444444-4444-4444-8444-444444444444',
        userA,
        cardId,
        '55555555-5555-4555-8555-555555555555',
      ],
    );
  });

  afterAll(async () => {
    teardown?.beginTeardown();
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  it('two concurrent reads both complete (would previously deadlock the pool forever)', async () => {
    const [a, b] = await Promise.all([readLeague(pool, userA), readLeague(pool, userB)]);
    expect(a.xp.total).toBeGreaterThan(0);
    expect(b.xp.total).toBe(0);
  }, 15_000);

  it('a third read after that still completes (the pool was not left exhausted)', async () => {
    const view = await readLeague(pool, userA);
    expect(view.xp.total).toBeGreaterThan(0);
  }, 15_000);
});
