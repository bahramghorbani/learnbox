import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * LB-B35 CP3 — the learner read paths on the canonical definitions, against a REAL Postgres with
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

import { GET as progressRoute } from '../app/api/learner/progress/route';
import { GET as statsRoute } from '../app/api/learner/profile/stats/route';
import { GET as todayRoute } from '../app/api/learner/today/route';
import { GET as wordsRoute } from '../app/api/learner/words/route';
import { readLearnerActivity } from '../lib/learner-read-model';
import { readLearnerSummary } from '../lib/learner-summary';
import { reviewEventsFingerprint } from './support/review-events-fingerprint';

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;
const dbName = `cp3r_${Math.random().toString(36).slice(2, 10)}`;
const migrationsDir = join(__dirname, '../../../database/migrations');
const DAY = 86_400_000;

let pool: PgPool;
let admin: PgPool;
const cards: string[] = [];
let draftCard = '';

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

async function schedule(user: string, card: string, stabilityDays: number, state = 'review') {
  await pool.query(
    `INSERT INTO card_schedules (user_id, card_id, state, stability_days, due_at)
     VALUES ($1, $2, $3::learning_state, $4, now() + interval '1 day')`,
    [user, card, state, stabilityDays],
  );
}

async function call<T = Record<string, unknown>>(
  handler: (request: Request) => Promise<Response>,
  user: string,
  query = '',
): Promise<T> {
  h.session = { subject: user };
  const response = await handler(new Request(`https://cp3.test/api/learner/x${query}`));
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://unused/unused');
  const { Pool } = await vi.importActual<typeof import('pg')>('pg');
  admin = new Pool({ connectionString: url, max: 1 });
  await admin.query(`CREATE DATABASE ${dbName}`);
  const scoped = new URL(url as string);
  scoped.pathname = `/${dbName}`;
  pool = new Pool({ connectionString: scoped.toString(), max: 4 });
  h.shared = pool;
  for (const file of readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()) {
    await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  await pool.query(
    `INSERT INTO packs (id, display_name, target_item_count, status, is_free, published_at)
     VALUES ('cp3-pack', 'CP3 pack', 4, 'published', true, now()),
            ('cp3-draft', 'CP3 draft', 1, 'draft', false, null)`,
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
  for (const [i, name] of ['cp3-a', 'cp3-b', 'cp3-c', 'cp3-d'].entries()) {
    cards.push(await make(name, 'cp3-pack', i + 1));
  }
  draftCard = await make('cp3-draft-card', 'cp3-draft', 1);
});

afterAll(async () => {
  h.shared = null;
  await pool?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin?.end();
  vi.unstubAllEnvs();
});

suite('CP3 — one answer per question, on every screen', () => {
  it('a card in a draft pack, or without a schedule, never inflates or deflates any screen', async () => {
    const user = await newLearner();
    await schedule(user, cards[0], 25); // Box 5
    await schedule(user, cards[1], 10); // Box 4
    await schedule(user, cards[2], 2); // Box 2
    await schedule(user, draftCard, 30); // scheduled, but NOT in the published curriculum
    const before = await reviewEventsFingerprint(pool, user);

    const words = await call<{ summary: Record<string, number> }>(wordsRoute, user);
    const progress = await call<{
      cardStates: Record<string, number>;
      leitnerBoxes: Record<string, number>;
    }>(progressRoute, user);
    const stats = await call<{ stats: Record<string, number> }>(statsRoute, user);
    const today = await call<{ leitnerBoxes: number[] }>(todayRoute, user);

    const expected = { total: 4, learned: 2, mastered: 1, learning: 1, new: 1 };
    expect(words.summary).toMatchObject(expected);
    expect(progress.cardStates).toEqual(expected);
    expect(stats.stats).toMatchObject({
      totalCards: 4,
      learnedCards: 2,
      masteredCards: 1,
      learningCards: 1,
      newCards: 1,
    });
    // The same five-number Box row everywhere, draft card excluded.
    expect(Object.values(progress.leitnerBoxes)).toEqual([0, 1, 0, 1, 1]);
    expect(today.leitnerBoxes).toEqual([0, 1, 0, 1, 1]);
    // Mastered is a subset of Learned, and Learned + Learning + New = the curriculum.
    expect(expected.mastered).toBeLessThanOrEqual(expected.learned);
    expect(expected.learned + expected.learning + expected.new).toBe(expected.total);
    expect(await reviewEventsFingerprint(pool, user)).toEqual(before);
  });

  it('a schedule row whose stored `state` contradicts its stability is still classified by stability', async () => {
    const user = await newLearner();
    await schedule(user, cards[0], 0.4, 'mastered'); // state says mastered, stability says Box 1
    await schedule(user, cards[1], 40, 'learning'); // state says learning, stability says Box 5
    const progress = await call<{ cardStates: Record<string, number> }>(progressRoute, user);
    expect(progress.cardStates).toMatchObject({ learned: 1, mastered: 1, learning: 1 });
  });

  it('Today, Progress, Profile and the summary endpoint report the same count, streak and Accuracy', async () => {
    const user = await newLearner();
    const tz = 'Asia/Tehran';
    const now = new Date();
    await review(user, cards[0], 'forgot', new Date(now.getTime() - 3 * DAY));
    await review(user, cards[0], 'hard', new Date(now.getTime() - 2 * DAY));
    await review(user, cards[1], 'mastered', new Date(now.getTime() - 60_000));
    await review(user, cards[2], 'forgot', new Date(now.getTime() - 50_000));

    const q = `?tz=${encodeURIComponent(tz)}`;
    const today = await call<{
      reviewedToday: number;
      correctToday: number;
      accuracyPercent: number;
      streakDays: number;
      longestStreak: number;
      totalReviews: number;
    }>(todayRoute, user, q);
    const progress = await call<{
      streak: { current: number; longest: number };
      totals: { reviews: number; todayReviews: number };
    }>(progressRoute, user, q);
    const stats = await call<{
      stats: { streakDays: number; longestStreak: number; totalReviews: number };
    }>(statsRoute, user, q);
    const summary = await readLearnerSummary(pool, user, tz);

    expect(today.totalReviews).toBe(4);
    expect(progress.totals.reviews).toBe(4);
    expect(stats.stats.totalReviews).toBe(4);
    expect(summary.totalReviews).toBe(4);
    expect(today.reviewedToday).toBe(progress.totals.todayReviews);
    expect(today.reviewedToday).toBe(summary.reviewedToday);
    expect(
      new Set([
        today.streakDays,
        progress.streak.current,
        stats.stats.streakDays,
        summary.streakDays,
      ]).size,
    ).toBe(1);
    expect(
      new Set([
        today.longestStreak,
        progress.streak.longest,
        stats.stats.longestStreak,
        summary.longestStreakDays,
      ]).size,
    ).toBe(1);
  });
});

suite('CP3 — canonical Accuracy', () => {
  it('hard, remembered and mastered are known; only forgot is unknown (fixes CP0 D1)', async () => {
    const user = await newLearner();
    const now = Date.now();
    await review(user, cards[0], 'mastered', new Date(now - 5000));
    await review(user, cards[1], 'hard', new Date(now - 4000));
    await review(user, cards[2], 'remembered', new Date(now - 3000));
    await review(user, cards[3], 'forgot', new Date(now - 2000));
    const today = await call<{ correctToday: number; accuracyPercent: number }>(
      todayRoute,
      user,
      '?tz=UTC',
    );
    expect(today.correctToday).toBe(3);
    expect(today.accuracyPercent).toBe(75);
    const stats = await call<{ stats: { accuracyPercent: number | null } }>(
      statsRoute,
      user,
      '?tz=UTC',
    );
    expect(stats.stats.accuracyPercent).toBe(75);
  });

  it('a learner with no answers has no Accuracy (null), not 0%', async () => {
    const user = await newLearner();
    const stats = await call<{ stats: { accuracyPercent: number | null } }>(statsRoute, user);
    expect(stats.stats.accuracyPercent).toBeNull();
  });
});

suite('CP3 — local learning day, midnight edges and zone fallback', () => {
  // Tehran is UTC+03:30 with no DST: local midnight = 20:30:00Z.
  it('the last instant of a Tehran day and the first instant of the next are different days', async () => {
    const user = await newLearner();
    await review(user, cards[0], 'remembered', '2026-10-01T20:29:59Z'); // 23:59:59 Oct 1 Tehran
    await review(user, cards[1], 'remembered', '2026-10-01T20:30:00Z'); // 00:00:00 Oct 2 Tehran
    const a = await readLearnerActivity(
      pool,
      user,
      'Asia/Tehran',
      new Date('2026-10-02T05:00:00Z'),
    );
    expect(a.days.map((d) => [d.day, d.reviews])).toEqual([
      ['2026-10-01', 1],
      ['2026-10-02', 1],
    ]);
    // "Today" flips at exactly the same instant.
    const justBefore = await readLearnerActivity(
      pool,
      user,
      'Asia/Tehran',
      new Date('2026-10-01T20:29:59Z'),
    );
    const atMidnight = await readLearnerActivity(
      pool,
      user,
      'Asia/Tehran',
      new Date('2026-10-01T20:30:00Z'),
    );
    expect(justBefore.today).toBe('2026-10-01');
    expect(justBefore.reviewedToday).toBe(1);
    expect(atMidnight.today).toBe('2026-10-02');
    expect(atMidnight.reviewedToday).toBe(1);
    // The same two events are ONE day in UTC: the zone changes the projection, not the events.
    const utc = await readLearnerActivity(pool, user, 'UTC', new Date('2026-10-02T05:00:00Z'));
    expect(utc.days.map((d) => [d.day, d.reviews])).toEqual([['2026-10-01', 2]]);
    const fingerprint = await reviewEventsFingerprint(pool, user);
    await readLearnerActivity(pool, user, 'America/New_York');
    expect(await reviewEventsFingerprint(pool, user)).toEqual(fingerprint);
  });

  it('Today, Progress and Profile split the same events at the same Tehran midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-02T05:00:00Z') });
    try {
      const user = await newLearner();
      await review(user, cards[0], 'remembered', '2026-10-01T20:29:59Z');
      await review(user, cards[1], 'remembered', '2026-10-01T20:30:00Z');
      const q = '?tz=Asia/Tehran';
      const today = await call<{ reviewedToday: number; weekDays: Array<{ active: boolean }> }>(
        todayRoute,
        user,
        q,
      );
      const progress = await call<{
        weeklyActivity: Array<{ day: string; reviews: number }>;
        totals: { todayReviews: number };
      }>(progressRoute, user, q);
      const stats = await call<{ weeklyActivity: Array<{ day: string; reviews: number }> }>(
        statsRoute,
        user,
        q,
      );
      expect(today.reviewedToday).toBe(1);
      expect(progress.totals.todayReviews).toBe(1);
      expect(progress.weeklyActivity.at(-1)).toEqual({ day: '2026-10-02', reviews: 1 });
      expect(progress.weeklyActivity.at(-2)).toEqual({ day: '2026-10-01', reviews: 1 });
      expect(stats.weeklyActivity).toEqual(progress.weeklyActivity);
      expect(today.weekDays.map((d) => d.active)).toEqual(
        progress.weeklyActivity.map((d) => d.reviews > 0),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('a DST zone follows the local wall clock across the spring-forward night', async () => {
    const user = await newLearner();
    // Berlin 2026-03-29: clocks jump 02:00 -> 03:00 (CET+1 -> CEST+2). Local midnight Mar 29 = 23:00Z Mar 28;
    // local midnight Mar 30 = 22:00Z Mar 29 (only 23 hours later).
    await review(user, cards[0], 'remembered', '2026-03-28T22:59:59Z'); // 23:59:59 Mar 28
    await review(user, cards[1], 'remembered', '2026-03-28T23:00:00Z'); // 00:00:00 Mar 29
    await review(user, cards[2], 'remembered', '2026-03-29T21:59:59Z'); // 23:59:59 Mar 29
    await review(user, cards[3], 'remembered', '2026-03-29T22:00:00Z'); // 00:00:00 Mar 30
    const a = await readLearnerActivity(
      pool,
      user,
      'Europe/Berlin',
      new Date('2026-03-30T12:00:00Z'),
    );
    expect(a.days.map((d) => [d.day, d.reviews])).toEqual([
      ['2026-03-28', 1],
      ['2026-03-29', 2],
      ['2026-03-30', 1],
    ]);
    expect(a.streak).toMatchObject({ current: 3, longest: 3 });
  });

  it('a missing, invalid or oversized zone is documented UTC, and never fails the screen', async () => {
    const user = await newLearner();
    await review(user, cards[0], 'remembered', '2026-10-01T22:00:00Z');
    const asOf = new Date('2026-10-01T23:00:00Z');
    const utc = await readLearnerActivity(pool, user, 'UTC', asOf);
    for (const bad of [null, undefined, '', 'Not/AZone', 'x'.repeat(65), '+03:30', 'Etc/../../x']) {
      const a = await readLearnerActivity(pool, user, bad, asOf);
      expect(a.timeZone).toBe('UTC');
      expect(a.days).toEqual(utc.days);
    }
    const progress = await call<{ timeZone: string }>(progressRoute, user, '?tz=Not/AZone');
    expect(progress.timeZone).toBe('UTC');
  });
});

suite('CP3 — streak (fixes the reproduced future-day defect)', () => {
  it('a clock-skew-accepted review stamped after "today" no longer erases the streak', async () => {
    const user = await newLearner();
    const asOf = new Date('2026-10-01T20:26:00Z'); // 23:56 Oct 1 Tehran
    await review(user, cards[0], 'remembered', '2026-09-29T08:00:00Z');
    await review(user, cards[0], 'remembered', '2026-09-30T08:00:00Z');
    await review(user, cards[0], 'remembered', '2026-10-01T08:00:00Z');
    await review(user, cards[0], 'remembered', '2026-10-01T20:31:00Z'); // +5 min skew -> 00:01 Oct 2
    const summary = await readLearnerSummary(pool, user, 'Asia/Tehran', asOf);
    expect(summary).toMatchObject({ streakDays: 3, longestStreakDays: 3 });
    // v1.2.1 returned streakDays 0 here.
    const a = await readLearnerActivity(pool, user, 'Asia/Tehran', asOf);
    expect(a.bestDay?.day).not.toBe('2026-10-02');
  });

  it('a streak survives an empty today (yesterday counts) and breaks after a full empty day', async () => {
    const user = await newLearner();
    await review(user, cards[0], 'forgot', '2026-10-08T08:00:00Z');
    await review(user, cards[0], 'forgot', '2026-10-09T08:00:00Z');
    expect(
      (await readLearnerSummary(pool, user, 'UTC', new Date('2026-10-10T12:00:00Z'))).streakDays,
    ).toBe(2);
    expect(
      (await readLearnerSummary(pool, user, 'UTC', new Date('2026-10-11T12:00:00Z'))).streakDays,
    ).toBe(0);
  });
});

suite('CP3 — no fabricated numbers', () => {
  it('study time stays unavailable: Today reports null and no route invents a duration', async () => {
    const user = await newLearner();
    await review(user, cards[0], 'remembered', new Date());
    const today = await call<Record<string, unknown>>(todayRoute, user, '?tz=UTC');
    expect(today.studyMinutesToday).toBeNull();
    for (const route of [progressRoute, statsRoute]) {
      const body = JSON.stringify(await call(route, user, '?tz=UTC'));
      expect(body).not.toMatch(/minutes|studyTime|duration/i);
    }
  });

  it('every read leaves review_events untouched', async () => {
    const user = await newLearner();
    await review(user, cards[0], 'hard', new Date());
    await schedule(user, cards[0], 12);
    const before = await reviewEventsFingerprint(pool, user);
    for (const route of [todayRoute, progressRoute, statsRoute, wordsRoute]) {
      await call(route, user, '?tz=Asia/Tehran');
    }
    expect(await reviewEventsFingerprint(pool, user)).toEqual(before);
  });
});
