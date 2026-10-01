import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool as PgPool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * LB-B35 CP4 — server-owned daily new-card allowance (flag LEARNBOX_SERVER_SESSION_PLAN) on the real Postgres repository, against a REAL Postgres with
 * every repo migration applied. The REAL route handlers run; only the pg Pool, session authentication
 * and the TLS guard are replaced (same seams as the CP0 characterization suite).
 *
 * Requires TEST_DATABASE_URL (an empty database; the suite creates and drops its own database).
 */
const h = vi.hoisted(() => ({
  shared: null as null | { query: (...args: unknown[]) => Promise<unknown> },
  session: null as null | { subject: string },
}));

vi.mock('pg', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pg')>();
  class SharedPool {
    constructor() {
      return {
        query: (...args: unknown[]) => h.shared!.query(...args),
        end: async () => undefined,
      } as never;
    }
  }
  return { ...actual, default: { ...actual, Pool: SharedPool }, Pool: SharedPool };
});
vi.mock('../lib/learner-auth', () => ({ authenticateLearner: async () => h.session }));
vi.mock('../../api/dist/database/migration-runner.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireVerifiedDatabaseTls: (value: string) => value,
}));

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;
const dbName = `cp4plan_${Math.random().toString(36).slice(2, 10)}`;
const migrationsDir = join(__dirname, '../../../database/migrations');
let pool: PgPool;
let admin: PgPool;
const cards: string[] = [];

async function newLearner(): Promise<string> {
  const id = randomUUID();
  await pool.query('INSERT INTO users (id, phone_e164) VALUES ($1, $2)', [
    id,
    `+98912${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
  ]);
  return id;
}

async function review(user: string, card: string, grade: string, at: string | Date) {
  await pool.query(
    `INSERT INTO review_events (id, user_id, card_id, grade, occurred_at, client_event_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), user, card, grade, at, randomUUID()],
  );
}

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://unused/unused');
  const { Pool } = await vi.importActual<typeof import('pg')>('pg');
  admin = new Pool({ connectionString: url, max: 1 });
  admin.on('error', () => undefined);
  await admin.query(`CREATE DATABASE ${dbName}`);
  const scoped = new URL(url as string);
  scoped.pathname = `/${dbName}`;
  pool = new Pool({ connectionString: scoped.toString(), max: 4 });
  pool.on('error', () => undefined);
  h.shared = pool;
  for (const file of readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()) {
    await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  await pool.query(
    `INSERT INTO packs (id, display_name, target_item_count, status, is_free, published_at)
     VALUES ('cp4-pack', 'CP4 pack', 4, 'published', true, now()),
            ('cp4-draft', 'CP4 draft', 1, 'draft', false, null)`,
  );
  const make = async (name: string, pack: string, sort: number) => {
    const id = randomUUID();
    await pool.query(`INSERT INTO cards (id, lemma, content_id) VALUES ($1, $2, $2)`, [id, name]);
    await pool.query(
      `INSERT INTO card_versions (card_id, version, status, content_json, source_provider, published_at)
       VALUES ($1, 1, 'published', $2::jsonb, 'editorial', now())`,
      [id, JSON.stringify({ lemma: name, article: 'das', persianMeanings: ['x'], cefr: 'A1' })],
    );
    await pool.query(`INSERT INTO pack_cards (pack_id, card_id, sort_order) VALUES ($1, $2, $3)`, [
      pack,
      id,
      sort,
    ]);
    return id;
  };
  for (const [i, name] of [
    'start-a1-cp4-a',
    'start-a1-cp4-b',
    'start-a1-cp4-c',
    'start-a1-cp4-d',
  ].entries()) {
    cards.push(await make(name, 'cp4-pack', i + 1));
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('DATABASE_URL', 'postgres://unused/unused');
});

afterAll(async () => {
  h.shared = null;
  await pool?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin?.end();
  vi.unstubAllEnvs();
});

import { LearnerStateService } from '../../api/dist/learner-state/learner-state.service.js';
import { PostgresLearnerStateRepository } from '../../api/dist/learner-state/postgres-learner-state.repository.js';
import { handleWebLearnerStateGet } from '../lib/learner-state-web-http';
import { webLearnerStateDependenciesFromEnvironment } from '../lib/learner-state-web-runtime';
import { reviewEventsFingerprint } from './support/review-events-fingerprint';

const T0 = new Date('2026-10-01T09:00:00Z');
const service = (now: Date) => {
  const repo = new PostgresLearnerStateRepository(pool as never);
  return new LearnerStateService(repo, () => now, repo);
};
const flagOff = (now: Date) =>
  new LearnerStateService(new PostgresLearnerStateRepository(pool as never), () => now);
const answer = async (user: string, card: string, at: Date) => {
  await pool.query(
    `INSERT INTO card_schedules (user_id, card_id, state, stability_days, due_at)
     VALUES ($1, $2, 'learning', 0.04, $3) ON CONFLICT DO NOTHING`,
    [user, card, new Date(at.getTime() + 3_600_000)],
  );
  await review(user, card, 'remembered', at);
};
const plans = async (user: string) =>
  (
    await pool.query(
      `SELECT local_day::text AS day, time_zone, new_card_ids FROM learner_daily_plans WHERE user_id = $1 ORDER BY local_day`,
      [user],
    )
  ).rows;

suite('CP4 — daily new-card allowance on real Postgres', () => {
  it('first read freezes ONE row of 3; refreshes return the same cards (flag-on)', async () => {
    const user = await newLearner();
    const a = await service(T0).readLearnerState(user, { requestedTimeZone: 'Asia/Tehran' });
    const b = await service(T0).readLearnerState(user, { requestedTimeZone: 'Asia/Tehran' });
    expect(a.plan.newCardIds).toHaveLength(3);
    expect(b.plan.newCardIds).toEqual(a.plan.newCardIds);
    const rows = await plans(user);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ day: '2026-10-01', time_zone: 'Asia/Tehran' });
    expect(rows[0].new_card_ids).toEqual(expect.arrayContaining(a.plan.newCardIds));
  });

  it('concurrent first reads (two devices at once) converge on ONE allowance', async () => {
    const user = await newLearner();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        service(T0).readLearnerState(user, { requestedTimeZone: 'UTC' }),
      ),
    );
    const sets = new Set(results.map((r) => JSON.stringify(r.plan.newCardIds)));
    expect(sets.size).toBe(1);
    expect(await plans(user)).toHaveLength(1);
  });

  it("answering new cards and re-reading never grants more than the day's 3; next day grants 3 more", async () => {
    const user = await newLearner();
    const day1 = (await service(T0).readLearnerState(user, { requestedTimeZone: 'UTC' })).plan
      .newCardIds;
    for (const id of day1) await answer(user, id, T0);
    const again = await service(new Date(T0.getTime() + 600_000)).readLearnerState(user, {
      requestedTimeZone: 'UTC',
    });
    expect(again.plan.newCardIds).toEqual([]);
    // Flag OFF is the v1.2.1 defect: it keeps granting.
    const legacy = await flagOff(new Date(T0.getTime() + 600_000)).readLearnerState(user);
    expect(legacy.plan.newCardIds.length).toBeGreaterThan(0);
    const tomorrow = await service(new Date(T0.getTime() + 24 * 3_600_000)).readLearnerState(user, {
      requestedTimeZone: 'UTC',
    });
    expect(tomorrow.plan.newCardIds).toHaveLength(Math.min(3, cards.length - 3));
    expect((await plans(user)).map((p) => p.day)).toEqual(['2026-10-01', '2026-10-02']);
  });

  it('the day boundary follows the stored zone (Tehran 20:30Z), not the device zone', async () => {
    const user = await newLearner();
    await pool.query(`UPDATE users SET timezone = 'Asia/Tehran' WHERE id = $1`, [user]);
    await service(new Date('2026-09-29T20:29:59Z')).readLearnerState(user, {
      requestedTimeZone: 'UTC',
    });
    await service(new Date('2026-09-29T20:30:00Z')).readLearnerState(user, {
      requestedTimeZone: 'UTC',
    });
    expect((await plans(user)).map((p) => [p.day, p.time_zone])).toEqual([
      ['2026-09-29', 'Asia/Tehran'],
      ['2026-09-30', 'Asia/Tehran'],
    ]);
  });

  it('recovery mode spends no allowance; due cards are always offered', async () => {
    const user = await newLearner();
    // 13 due cards need 13 scheduled cards; use extra catalogue cards.
    const extra: string[] = [];
    for (let i = 0; i < 13; i += 1) {
      const id = randomUUID();
      await pool.query(`INSERT INTO cards (id, lemma, content_id) VALUES ($1, $2, $2)`, [
        id,
        `cp4-extra-${i}-${id.slice(0, 6)}`,
      ]);
      await pool.query(
        `INSERT INTO card_versions (card_id, version, status, content_json, source_provider, published_at)
         VALUES ($1, 1, 'published', '{}'::jsonb, 'editorial', now())`,
        [id],
      );
      await pool.query(
        `INSERT INTO card_schedules (user_id, card_id, state, stability_days, due_at)
         VALUES ($1, $2, 'review', 2, $3)`,
        [user, id, new Date(T0.getTime() - 86_400_000)],
      );
      extra.push(id);
    }
    const state = await service(T0).readLearnerState(user, { requestedTimeZone: 'UTC' });
    expect(state.plan.mode).toBe('recovery');
    expect(state.plan.reviewCardIds).toHaveLength(12);
    expect(state.plan.newCardIds).toEqual([]);
    expect(await plans(user)).toHaveLength(0);
  });

  it('the review history is never touched by planning', async () => {
    const user = await newLearner();
    await review(user, cards[0], 'remembered', '2026-09-30T10:00:00Z');
    const before = await reviewEventsFingerprint(pool, user);
    await service(T0).readLearnerState(user, { requestedTimeZone: 'UTC' });
    await service(new Date(T0.getTime() + 86_400_000)).readLearnerState(user, {
      requestedTimeZone: 'UTC',
    });
    expect(await reviewEventsFingerprint(pool, user)).toEqual(before);
  });

  it('the HTTP route is flag-gated: off writes nothing to learner_daily_plans or users.timezone', async () => {
    const user = await newLearner();
    vi.stubEnv('WEB_LEARNER_STATE_ENABLED', 'true');
    vi.stubEnv('LEARNBOX_SESSION_SECRET', 'x'.repeat(40));
    vi.stubEnv('DATABASE_URL', 'postgres://unused/unused');
    vi.stubEnv('LEARNBOX_SERVER_SESSION_PLAN', '');
    const off = webLearnerStateDependenciesFromEnvironment()!;
    const resOff = await handleWebLearnerStateGet(
      new Request('https://cp4.test/api/learner/state?tz=Asia/Tehran'),
      off,
      () => user,
    );
    expect(resOff.status).toBe(200);
    expect(await plans(user)).toHaveLength(0);
    expect(
      (await pool.query('SELECT timezone FROM users WHERE id=$1', [user])).rows[0].timezone,
    ).toBeNull();

    vi.stubEnv('LEARNBOX_SERVER_SESSION_PLAN', 'true');
    const on = webLearnerStateDependenciesFromEnvironment()!;
    const resOn = await handleWebLearnerStateGet(
      new Request('https://cp4.test/api/learner/state?tz=Asia/Tehran'),
      on,
      () => user,
    );
    expect(resOn.status).toBe(200);
    expect(await plans(user)).toHaveLength(1);
    expect(
      (await pool.query('SELECT timezone FROM users WHERE id=$1', [user])).rows[0].timezone,
    ).toBe('Asia/Tehran');
  });
});
