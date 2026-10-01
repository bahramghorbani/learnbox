import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool as PgPool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { guardForcedTeardown } from './support/forced-teardown-guard';

/**
 * LB-B35 CP5-A — Today shows ONE canonical "work for today" count (flag LEARNBOX_TODAY_WORKLOAD).
 *
 * v1.2.1 / CP4 `/api/learner/today` reported `newCount` = every unseen published card in the catalogue
 * and `totalTodayCards` = due + that. Neither is the learner's workload: the session plan is capped at
 * SESSION_CAPACITY_CARDS (12, NOT "12 due + 3 new") and admits at most DAILY_NEW_CARD_ALLOWANCE (3) new
 * cards. `cardsForToday` is the length of the learner's actual session plan — the SAME plan
 * `/api/learner/state` builds the review queue from — so the number on Today is the number of cards the
 * learner will be shown. Real Postgres, every migration applied, REAL route handlers.
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
const dbName = `cp5work_${Math.random().toString(36).slice(2, 10)}`;
const migrationsDir = join(__dirname, '../../../database/migrations');
const CATALOGUE = 20;
const HOUR = 3_600_000;
let pool: PgPool;
let admin: PgPool;
let teardown: ReturnType<typeof guardForcedTeardown>;
const cards: string[] = [];

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://unused/unused');
  const { Pool } = await vi.importActual<typeof import('pg')>('pg');
  admin = new Pool({ connectionString: url, max: 1 });
  guardForcedTeardown(admin);
  await admin.query(`CREATE DATABASE ${dbName}`);
  const scoped = new URL(url as string);
  scoped.pathname = `/${dbName}`;
  pool = new Pool({ connectionString: scoped.toString(), max: 4 });
  teardown = guardForcedTeardown(pool);
  h.shared = pool;
  for (const file of readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()) {
    await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  await pool.query(
    `INSERT INTO packs (id, display_name, target_item_count, status, is_free, published_at)
     VALUES ('cp5-pack', 'CP5 pack', ${CATALOGUE}, 'published', true, now())`,
  );
  for (let i = 0; i < CATALOGUE; i += 1) {
    const name = `start-a1-cp5-${String(i).padStart(2, '0')}`;
    const id = randomUUID();
    await pool.query(`INSERT INTO cards (id, lemma, content_id) VALUES ($1, $2, $2)`, [id, name]);
    await pool.query(
      `INSERT INTO card_versions (card_id, version, status, content_json, source_provider, published_at)
       VALUES ($1, 1, 'published', $2::jsonb, 'editorial', now())`,
      [id, JSON.stringify({ lemma: name, article: 'das', persianMeanings: ['x'], cefr: 'A1' })],
    );
    await pool.query(
      `INSERT INTO pack_cards (pack_id, card_id, sort_order) VALUES ('cp5-pack', $1, $2)`,
      [id, i + 1],
    );
    cards.push(id);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('DATABASE_URL', 'postgres://unused/unused');
});

afterAll(async () => {
  h.shared = null;
  teardown?.beginTeardown();
  await pool?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin?.end();
  vi.unstubAllEnvs();
});

import { GET as progressRoute } from '../app/api/learner/progress/route';
import { GET as todayRoute } from '../app/api/learner/today/route';
import { GET as stateRoute } from '../app/api/learner/state/route';
import { readTodayWorkload } from '../lib/learner-workload';

const T0 = new Date('2026-10-01T09:00:00Z');

async function newLearner(): Promise<string> {
  const id = randomUUID();
  await pool.query('INSERT INTO users (id, phone_e164) VALUES ($1, $2)', [
    id,
    `+98912${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
  ]);
  return id;
}

/** `n` cards that are due at T0, oldest first; returns the card ids used (a window of the catalogue). */
async function dueCards(user: string, from: number, n: number, now: Date = T0): Promise<string[]> {
  const ids = cards.slice(from, from + n);
  for (const [i, id] of ids.entries()) {
    await pool.query(
      `INSERT INTO card_schedules (user_id, card_id, state, stability_days, due_at)
       VALUES ($1, $2, 'review', 3, $3)`,
      [user, id, new Date(now.getTime() - (n - i) * HOUR)],
    );
  }
  return ids;
}

async function scheduleLater(user: string, id: string, now: Date) {
  await pool.query(
    `INSERT INTO card_schedules (user_id, card_id, state, stability_days, due_at)
     VALUES ($1, $2, 'learning', 0.04, $3) ON CONFLICT DO NOTHING`,
    [user, id, new Date(now.getTime() + HOUR)],
  );
}

const stateRouteEnv = () => {
  vi.stubEnv('WEB_LEARNER_STATE_ENABLED', 'true');
  vi.stubEnv('LEARNBOX_SESSION_SECRET', 'x'.repeat(40));
  vi.stubEnv('DATABASE_URL', 'postgres://unused/unused');
};
const planFlagsOn = () => {
  stateRouteEnv();
  vi.stubEnv('LEARNBOX_SERVER_SESSION_PLAN', 'true');
  vi.stubEnv('LEARNBOX_TODAY_WORKLOAD', 'true');
};

async function call<T = Record<string, unknown>>(
  handler: (request: Request) => Promise<Response>,
  user: string,
  query = '?tz=UTC',
): Promise<T> {
  h.session = { subject: user };
  const response = await handler(new Request(`https://cp5.test/api/learner/x${query}`));
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}

const workload = (user: string, now: Date, tz = 'UTC') =>
  readTodayWorkload(pool as never, user, { now, requestedTimeZone: tz, environment: process.env });

suite('CP5-A — canonical Today workload on real Postgres', () => {
  it('a brand-new learner: 0 due + the daily allowance of 3 (never the whole catalogue)', async () => {
    planFlagsOn();
    const user = await newLearner();
    const w = await workload(user, T0);
    expect(w).toMatchObject({
      cardsForToday: 3,
      reviewCardsToday: 0,
      newCardsToday: 3,
      planMode: 'normal',
      unseenCatalogCount: CATALOGUE,
    });
  });

  it('due < 12: new cards fill only the spare capacity, max 3 (10 due → 10 + 2 = 12 session capacity)', async () => {
    planFlagsOn();
    const user = await newLearner();
    await dueCards(user, 0, 10);
    expect(await workload(user, T0)).toMatchObject({
      cardsForToday: 12,
      reviewCardsToday: 10,
      newCardsToday: 2,
    });
  });

  it('5 due → 5 + 3 new = 8 (the max-3 cap binds before the capacity cap)', async () => {
    planFlagsOn();
    const user = await newLearner();
    await dueCards(user, 0, 5);
    expect(await workload(user, T0)).toMatchObject({
      cardsForToday: 8,
      reviewCardsToday: 5,
      newCardsToday: 3,
    });
  });

  it('exactly 12 due → 12 today and 0 new (capacity is 12, NOT "12 due + 3 new" = 15)', async () => {
    planFlagsOn();
    const user = await newLearner();
    await dueCards(user, 0, 12);
    expect(await workload(user, T0)).toMatchObject({
      cardsForToday: 12,
      reviewCardsToday: 12,
      newCardsToday: 0,
      planMode: 'normal',
    });
  });

  it('recovery mode (>12 overdue): the plan is capped at 12, no new cards, mode reported', async () => {
    planFlagsOn();
    const user = await newLearner();
    await dueCards(user, 0, 16);
    expect(await workload(user, T0)).toMatchObject({
      cardsForToday: 12,
      reviewCardsToday: 12,
      newCardsToday: 0,
      planMode: 'recovery',
    });
  });

  it('no unseen cards remaining and nothing due → 0 cards for today (and 0 unseen)', async () => {
    planFlagsOn();
    const user = await newLearner();
    for (const id of cards) {
      await pool.query(
        `INSERT INTO card_schedules (user_id, card_id, state, stability_days, due_at)
         VALUES ($1, $2, 'review', 30, $3)`,
        [user, id, new Date(T0.getTime() + 30 * 24 * HOUR)],
      );
    }
    expect(await workload(user, T0)).toMatchObject({
      cardsForToday: 0,
      reviewCardsToday: 0,
      newCardsToday: 0,
      unseenCatalogCount: 0,
    });
  });

  it('refresh and a second device agree and share ONE frozen allowance row', async () => {
    planFlagsOn();
    const user = await newLearner();
    const reads = await Promise.all(Array.from({ length: 6 }, () => workload(user, T0)));
    expect(new Set(reads.map((r) => JSON.stringify(r))).size).toBe(1);
    const rows = await pool.query(`SELECT 1 FROM learner_daily_plans WHERE user_id = $1`, [user]);
    expect(rows.rowCount).toBe(1);
  });

  it("answering today's new cards reduces the remaining work and never re-grants new ones the same day", async () => {
    planFlagsOn();
    const user = await newLearner();
    const first = await workload(user, T0);
    expect(first.cardsForToday).toBe(3);
    const state = await call<{ plan: { newCardIds: string[] } }>(stateRoute, user);
    for (const id of state.plan.newCardIds) await scheduleLater(user, id, T0);
    const later = await workload(user, new Date(T0.getTime() + 10 * 60_000));
    expect(later).toMatchObject({ cardsForToday: 0, newCardsToday: 0 });
  });

  it('learner-local midnight: the new day grants a fresh allowance at 00:00 Tehran (20:30Z), not at 00:00 UTC', async () => {
    planFlagsOn();
    const user = await newLearner();
    await pool.query(`UPDATE users SET timezone = 'Asia/Tehran' WHERE id = $1`, [user]);
    const before = await workload(user, new Date('2026-09-30T20:29:59Z'), 'UTC');
    for (const id of cards.slice(0, before.newCardsToday)) await scheduleLater(user, id, T0);
    // Same Tehran day (23:59:59.9 local): still the same frozen allowance, now answered → 0.
    const sameDay = await workload(user, new Date('2026-09-30T20:29:59.900Z'), 'UTC');
    expect(sameDay.newCardsToday).toBe(0);
    // 20:30Z = 00:00 next day in Tehran → a new frozen allowance of 3.
    const nextDay = await workload(user, new Date('2026-09-30T20:30:00Z'), 'UTC');
    expect(nextDay.newCardsToday).toBe(3);
    const rows = await pool.query(
      `SELECT local_day::text AS day FROM learner_daily_plans WHERE user_id = $1 ORDER BY local_day`,
      [user],
    );
    expect(rows.rows.map((r: { day: string }) => r.day)).toEqual(['2026-09-30', '2026-10-01']);
  });

  it('Today ↔ state ↔ Progress consistency (flag-on): one workload, one set of boxes, one reviewed count', async () => {
    planFlagsOn();
    const user = await newLearner();
    await dueCards(user, 0, 7, new Date());
    const today = await call<Record<string, unknown> & { leitnerBoxes: number[] }>(
      todayRoute,
      user,
    );
    const state = await call<{ plan: { reviewCardIds: string[]; newCardIds: string[] } }>(
      stateRoute,
      user,
    );
    const progress = await call<{
      leitnerBoxes: Record<string, number>;
      totals: { todayReviews: number };
    }>(progressRoute, user);
    expect(today.cardsForToday).toBe(
      state.plan.reviewCardIds.length + state.plan.newCardIds.length,
    );
    expect(today.cardsForToday).toBe(10);
    expect(today.reviewCardsToday).toBe(7);
    expect(today.newCardsToday).toBe(3);
    expect(today.totalTodayCards).toBe(today.cardsForToday);
    expect(today.newCount).toBe(today.newCardsToday);
    expect(today.unseenCatalogCount).toBe(CATALOGUE - 7);
    expect(Object.values(progress.leitnerBoxes)).toEqual(today.leitnerBoxes);
    expect(progress.totals.todayReviews).toBe(today.reviewedToday);
  });

  it('flag OFF: the v1.2.1 Today payload is byte-for-byte what it was (catalogue count, due+new, no new fields)', async () => {
    const user = await newLearner();
    await dueCards(user, 0, 4, new Date());
    const today = await call<Record<string, unknown>>(todayRoute, user);
    expect(today.newCount).toBe(CATALOGUE - 4);
    expect(today.dueCount).toBe(4);
    expect(today.totalTodayCards).toBe(CATALOGUE);
    for (const key of [
      'cardsForToday',
      'reviewCardsToday',
      'newCardsToday',
      'planMode',
      'unseenCatalogCount',
    ]) {
      expect(today).not.toHaveProperty(key);
    }
  });

  it('flag ON without the session-plan flag: still the canonical plan length, never due + catalogue', async () => {
    stateRouteEnv();
    vi.stubEnv('LEARNBOX_TODAY_WORKLOAD', 'true');
    const user = await newLearner();
    await dueCards(user, 0, 4, new Date());
    const today = await call<Record<string, number>>(todayRoute, user);
    // Without the frozen allowance the engine still admits at most 3 new → 4 + 3.
    expect(today.cardsForToday).toBe(7);
    expect(today.totalTodayCards).toBe(7);
  });
});
