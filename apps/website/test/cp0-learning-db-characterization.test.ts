import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * LB-B35 CP0 — characterization of the v1.2.1 learning system against a REAL Postgres
 * with every repo migration applied.
 *
 * Purpose: record, reproducibly, what the shipped code does TODAY — including the
 * behavior the learning-system milestone intends to change. Assertions tagged
 * `DEFECT` pin behavior that is believed wrong; they exist so that a later checkpoint
 * has to change them deliberately. Nothing here is an endorsement, and src/ is not
 * modified by CP0.
 *
 * The REAL route handlers, REAL review-ingest service and REAL state service run.
 * Only three seams are replaced: the pg Pool (routes open their own TLS-pinned pool;
 * we hand them the disposable one), session authentication (we choose the learner),
 * and the TLS guard (a disposable local database cannot satisfy verify-full).
 *
 * Requires TEST_DATABASE_URL (an empty database; the suite creates and drops its own
 * throwaway database). Hard failure in CI when missing; skipped locally.
 *   docker run -d --rm --name lbcp0 -e POSTGRES_PASSWORD=t -e POSTGRES_DB=lbtest -p 55440:5432 postgres:17-alpine
 *   TEST_DATABASE_URL=postgres://postgres:t@localhost:55440/lbtest pnpm --filter @learnbox/website exec vitest run test/cp0-learning-db-characterization.test.ts
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
import { readLearnerSummary } from '../lib/learner-summary';
import {
  LearnerStateService,
  type LearnerStateSnapshot,
} from '../../api/src/learner-state/learner-state.service';
import { PostgresLearnerStateRepository } from '../../api/src/learner-state/postgres-learner-state.repository';
import {
  MobileReviewBatchError,
  MobileReviewBatchService,
  type MobileReviewBatchItemOutcome,
} from '../../api/src/reviews/mobile-review-batch.service';
import { PostgresReviewEventStore } from '../../api/src/reviews/postgres-review-event.store';
import { reviewEventsFingerprint } from './support/review-events-fingerprint';

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;

const dbName = `cp0_${Math.random().toString(36).slice(2, 10)}`;
const migrationsDir = join(__dirname, '../../../database/migrations');
const DAY = 86_400_000;

// Catalog: 8 Start cards named so alphabetical order (a..h) is the REVERSE of pack sort_order,
// plus one published card that is not a `start-a1-` card.
const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const contentId = (letter: string) => `start-a1-cp0-${letter}`;
const cardIds: Record<string, string> = {};
const NON_START_CONTENT_ID = 'cp0-nonstart-x';
let nonStartCardId = '';

let pool: PgPool;
let admin: PgPool;
let reviews: MobileReviewBatchService;

async function newLearner(): Promise<string> {
  const id = randomUUID();
  const phone = `+98912${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  await pool.query('INSERT INTO users (id, phone_e164) VALUES ($1, $2)', [id, phone]);
  return id;
}

async function submit(
  userId: string,
  letter: string,
  grade: 'forgot' | 'hard' | 'remembered' | 'mastered',
  occurredAt: Date,
  clientEventId: string = randomUUID(),
): Promise<MobileReviewBatchItemOutcome> {
  const [outcome] = await reviews.submit({
    userId,
    items: [{ contentId: contentId(letter), grade, occurredAt, clientEventId }],
  });
  return outcome;
}

async function scheduleFor(userId: string, letter: string) {
  const { rows } = await pool.query(
    `SELECT state, stability_days, difficulty, lapses, due_at
       FROM card_schedules WHERE user_id = $1 AND card_id = $2`,
    [userId, cardIds[letter]],
  );
  return rows[0] as
    | { state: string; stability_days: number; difficulty: number; lapses: number; due_at: Date }
    | undefined;
}

async function putSchedule(
  userId: string,
  letter: string,
  state: string,
  stabilityDays: number,
  dueAt: Date = new Date(Date.now() + DAY),
) {
  await pool.query(
    `INSERT INTO card_schedules (user_id, card_id, state, stability_days, due_at)
     VALUES ($1, $2, $3::learning_state, $4, $5)`,
    [userId, cardIds[letter], state, stabilityDays, dueAt],
  );
}

async function call<T = Record<string, unknown>>(
  handler: (request: Request) => Promise<Response>,
  userId: string,
  query = '',
): Promise<T> {
  h.session = { subject: userId };
  const response = await handler(new Request(`https://cp0.test/api/learner/x${query}`));
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
     VALUES ('cp0-pack', 'CP0 pack', 8, 'published', true, now())`,
  );
  const make = async (content: string, sortOrder: number, inPack = true) => {
    const id = randomUUID();
    await pool.query(`INSERT INTO cards (id, lemma, content_id) VALUES ($1, $2, $3)`, [
      id,
      content,
      content,
    ]);
    await pool.query(
      `INSERT INTO card_versions (card_id, version, status, content_json, source_provider, published_at)
       VALUES ($1, 1, 'published', $2::jsonb, 'editorial', now())`,
      [id, JSON.stringify({ lemma: content, article: 'das', persianMeanings: ['x'], cefr: 'A1' })],
    );
    if (inPack)
      await pool.query(
        `INSERT INTO pack_cards (pack_id, card_id, sort_order) VALUES ($1, $2, $3)`,
        ['cp0-pack', id, sortOrder],
      );
    return id;
  };
  for (const [index, letter] of letters.entries()) {
    // Curriculum order in the pack is the REVERSE of alphabetical content-id order.
    cardIds[letter] = await make(contentId(letter), letters.length - index);
  }
  nonStartCardId = await make(NON_START_CONTENT_ID, 99);

  reviews = new MobileReviewBatchService(new PostgresReviewEventStore(pool));
});

afterAll(async () => {
  h.shared = null;
  await pool?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin?.end();
  vi.unstubAllEnvs();
});

suite('CP0 — four different answers to "how many words has the learner learned?"', () => {
  it('FIXED in CP3: Words, Progress, pack progress, Profile and Today give one answer for the same learner', async () => {
    const user = await newLearner();
    await putSchedule(user, 'a', 'review', 10); // Box 4
    await putSchedule(user, 'b', 'mastered', 30); // Box 5
    await putSchedule(user, 'c', 'review', 30); // Box 5, reachable with remembered-only
    await putSchedule(user, 'd', 'learning', 0.5); // Box 1
    await putSchedule(user, 'e', 'relearning', 2); // Box 2
    const before = await reviewEventsFingerprint(pool, user);

    const words = await call<{ summary: Record<string, number> }>(wordsRoute, user);
    const progress = await call<{
      cardStates: Record<string, number>;
      leitnerBoxes: Record<string, number>;
      packs: Array<Record<string, number>>;
    }>(progressRoute, user);
    const stats = await call<{ stats: Record<string, number> }>(statsRoute, user);
    const today = await call<{ leitnerBoxes: number[] }>(todayRoute, user);

    // Canonical: Learned = Box 4+ (a, b, c), Mastered = Box 5 (b, c), Learning = Box 1-3 (d, e),
    // New = in the curriculum without a schedule. Curriculum = 9 published pack cards.
    const expected = { total: 9, learned: 3, mastered: 2, learning: 2, new: 4 };
    expect(words.summary).toMatchObject(expected);
    expect(progress.cardStates).toEqual(expected);
    expect(stats.stats).toMatchObject({
      totalCards: 9,
      learnedCards: 3,
      masteredCards: 2,
      learningCards: 2,
      newCards: 4,
    });
    expect(progress.packs[0]).toMatchObject({
      totalCards: 9,
      startedCards: 5,
      learnedCards: 3,
      masteredCards: 2,
    });
    expect(progress.leitnerBoxes).toEqual({ box1: 1, box2: 1, box3: 0, box4: 1, box5: 2 });
    expect(today.leitnerBoxes).toEqual([1, 1, 0, 1, 2]);

    // Every screen's "learned" is the same number.
    const learned = [
      words.summary.learned,
      progress.cardStates.learned,
      progress.packs[0].learnedCards,
      stats.stats.learnedCards,
    ];
    expect(new Set(learned).size).toBe(1);

    // Reading never writes.
    expect(await reviewEventsFingerprint(pool, user)).toEqual(before);
  });

  it('FIXED in CP3: the Progress ring denominator is the curriculum, not the number of scheduled cards', async () => {
    const user = await newLearner();
    await putSchedule(user, 'a', 'mastered', 30);
    const progress = await call<{
      cardStates: { learned: number; total: number };
      packs: Array<{ totalCards: number }>;
    }>(progressRoute, user);
    // ProgressScreen computes the ring as cardStates.learned / cardStates.total: 1 of 9, not 1 of 1.
    expect(progress.cardStates.total).toBe(9);
    expect(progress.cardStates.learned / progress.cardStates.total).toBeCloseTo(1 / 9, 5);
    expect(progress.cardStates.total).toBe(progress.packs[0].totalCards);
  });

  it('FIXED in CP3: a card reachable with remembered-only answers is Box 5, and Progress counts it as mastered', async () => {
    const user = await newLearner();
    // Real ingest path, remembered only, each answer on time against the card's own due date.
    let at = new Date(Date.now() - 88 * DAY);
    for (let i = 0; i < 14; i += 1) {
      const outcome = await submit(user, 'a', 'remembered', at);
      expect(outcome.status).toBe('acknowledged');
      const schedule = await scheduleFor(user, 'a');
      at = schedule!.due_at;
      if (at.getTime() > Date.now() - 1000) break;
    }
    const schedule = await scheduleFor(user, 'a');
    expect(schedule!.stability_days).toBeGreaterThanOrEqual(21); // Box 5
    // The stored `state` column still says 'review' (this checkpoint changes no write path), but
    // no screen reads it any more: Mastered is Box 5, whatever `state` says.
    expect(schedule!.state).toBe('review');
    const progress = await call<{ cardStates: { mastered: number; learned: number } }>(
      progressRoute,
      user,
    );
    expect(progress.cardStates).toMatchObject({ mastered: 1, learned: 1 });
  });
});

suite('CP0 — Accuracy', () => {
  it('FIXED in CP3: /today counts hard, remembered and mastered as known', async () => {
    const user = await newLearner();
    const now = Date.now();
    await submit(user, 'a', 'mastered', new Date(now - 4000));
    await submit(user, 'b', 'mastered', new Date(now - 3000));
    await submit(user, 'c', 'remembered', new Date(now - 2000));
    await submit(user, 'd', 'forgot', new Date(now - 1000));
    const today = await call<{
      reviewedToday: number;
      correctToday: number;
      accuracyPercent: number;
    }>(todayRoute, user, '?tz=UTC');
    expect(today.reviewedToday).toBe(4);
    expect(today.correctToday).toBe(3);
    expect(today.accuracyPercent).toBe(75); // 3 of 4 answers were "knew it" under the approved projection
  });

  it('FIXED in CP3: a learner who answers only "mastered" sees 100% accuracy', async () => {
    const user = await newLearner();
    const now = Date.now();
    await submit(user, 'a', 'mastered', new Date(now - 3000));
    await submit(user, 'b', 'mastered', new Date(now - 2000));
    await submit(user, 'c', 'mastered', new Date(now - 1000));
    const today = await call<{ accuracyPercent: number }>(todayRoute, user, '?tz=UTC');
    expect(today.accuracyPercent).toBe(100);
  });

  it('historical projection to apply later: forgot -> unknown; hard/remembered/mastered -> known', async () => {
    // Recorded as data, not code: CP2 implements it once, in the domain module.
    const projection: Record<string, 'known' | 'unknown'> = {
      forgot: 'unknown',
      hard: 'known',
      remembered: 'known',
      mastered: 'known',
    };
    const user = await newLearner();
    const now = Date.now();
    await submit(user, 'a', 'mastered', new Date(now - 4000));
    await submit(user, 'b', 'hard', new Date(now - 3000));
    await submit(user, 'c', 'remembered', new Date(now - 2000));
    await submit(user, 'd', 'forgot', new Date(now - 1000));
    const { rows } = await pool.query(
      `SELECT grade, count(*)::int AS n FROM review_events WHERE user_id = $1 GROUP BY grade`,
      [user],
    );
    const known = rows
      .filter((row) => projection[row.grade] === 'known')
      .reduce((sum, row) => sum + row.n, 0);
    expect(known).toBe(3);
  });
});

suite('CP0 — day bucketing, timezone and streak', () => {
  // Three events on one UTC day that straddle Tehran (UTC+3:30, no DST) midnight:
  //   10:00Z -> Tehran 13:30 same day;  21:30Z and 22:30Z -> Tehran 01:00/02:00 NEXT day.
  async function seedStraddlingLearner() {
    const user = await newLearner();
    const utcMidnight = new Date(
      new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z',
    ).getTime();
    const base = utcMidnight - 2 * DAY; // always inside every 7-day window
    await submit(user, 'a', 'remembered', new Date(base + 10 * 3_600_000));
    await submit(user, 'b', 'remembered', new Date(base + 21.5 * 3_600_000));
    await submit(user, 'c', 'remembered', new Date(base + 22.5 * 3_600_000));
    return { user, base };
  }

  it('FIXED in CP3: Today, Progress and Profile bucket the SAME events into the same learner-local days', async () => {
    const { user } = await seedStraddlingLearner();

    const utcSummary = await readLearnerSummary(pool, user, 'UTC');
    const tehranSummary = await readLearnerSummary(pool, user, 'Asia/Tehran');
    expect(utcSummary.activeDays).toBe(1);
    expect(tehranSummary.activeDays).toBe(2);
    expect(utcSummary.totalReviews).toBe(3);
    expect(tehranSummary.totalReviews).toBe(3);

    const todayTehran = await call<{ weekDays: Array<{ active: boolean }> }>(
      todayRoute,
      user,
      '?tz=Asia/Tehran',
    );
    const todayUtc = await call<{ weekDays: Array<{ active: boolean }> }>(
      todayRoute,
      user,
      '?tz=UTC',
    );
    expect(todayTehran.weekDays.filter((d) => d.active)).toHaveLength(2);
    expect(todayUtc.weekDays.filter((d) => d.active)).toHaveLength(1);

    // Progress and Profile read the same model and honour the same `tz`.
    const progressTehran = await call<{ weeklyActivity: Array<{ day: string; reviews: number }> }>(
      progressRoute,
      user,
      '?tz=Asia/Tehran',
    );
    const progressUtc = await call<{ weeklyActivity: Array<{ day: string; reviews: number }> }>(
      progressRoute,
      user,
      '?tz=UTC',
    );
    const statsTehran = await call<{ weeklyActivity: Array<{ day: string; reviews: number }> }>(
      statsRoute,
      user,
      '?tz=Asia/Tehran',
    );
    const active = (rows: Array<{ reviews: number }>) => rows.filter((row) => row.reviews > 0);
    expect(active(progressTehran.weeklyActivity)).toHaveLength(2);
    expect(active(progressUtc.weeklyActivity)).toHaveLength(1);
    expect(active(progressUtc.weeklyActivity)[0].reviews).toBe(3);
    // The two Tehran days split the three events 1 + 2; Today, Progress and Profile agree.
    expect(active(progressTehran.weeklyActivity).map((row) => row.reviews)).toEqual([1, 2]);
    expect(statsTehran.weeklyActivity).toEqual(progressTehran.weeklyActivity);
    expect(todayTehran.weekDays.map((day) => day.active)).toEqual(
      progressTehran.weeklyActivity.map((row) => row.reviews > 0),
    );
  });

  it('an unknown or oversized timezone name silently degrades to UTC', async () => {
    const { user } = await seedStraddlingLearner();
    const utc = await readLearnerSummary(pool, user, 'UTC');
    expect(await readLearnerSummary(pool, user, 'Not/AZone')).toEqual(utc);
    expect(await readLearnerSummary(pool, user, 'x'.repeat(65))).toEqual(utc);
    expect(await readLearnerSummary(pool, user, null)).toEqual(utc);
    expect(utc.timeZone).toBe('UTC');
  });

  it('a streak day is any day with at least one review of ANY grade, including forgot', async () => {
    const user = await newLearner();
    const asOf = new Date('2026-10-10T12:00:00.000Z');
    await pool.query(
      `INSERT INTO review_events (id, user_id, card_id, grade, occurred_at, client_event_id)
      VALUES ($1,$2,$3,'forgot','2026-10-09T08:00:00Z',$4), ($5,$2,$3,'forgot','2026-10-10T08:00:00Z',$6)`,
      [randomUUID(), user, cardIds.a, randomUUID(), randomUUID(), randomUUID()],
    );
    const summary = await readLearnerSummary(pool, user, 'UTC', asOf);
    expect(summary).toMatchObject({ streakDays: 2, reviewedToday: 1 });
  });

  it('the streak survives today being empty (yesterday counts) and breaks after a full empty day', async () => {
    const user = await newLearner();
    await pool.query(
      `INSERT INTO review_events (id, user_id, card_id, grade, occurred_at, client_event_id)
      VALUES ($1,$2,$3,'remembered','2026-10-08T08:00:00Z',$4), ($5,$2,$3,'remembered','2026-10-09T08:00:00Z',$6)`,
      [randomUUID(), user, cardIds.a, randomUUID(), randomUUID(), randomUUID()],
    );
    expect(
      (await readLearnerSummary(pool, user, 'UTC', new Date('2026-10-10T12:00:00Z'))).streakDays,
    ).toBe(2);
    expect(
      (await readLearnerSummary(pool, user, 'UTC', new Date('2026-10-11T12:00:00Z'))).streakDays,
    ).toBe(0);
  });

  it('the streak day depends on the requested timezone: one review, two different "today"s', async () => {
    const user = await newLearner();
    // 22:00Z on Oct 9 = 01:30 on Oct 10 in Tehran.
    await pool.query(
      `INSERT INTO review_events (id, user_id, card_id, grade, occurred_at, client_event_id)
      VALUES ($1,$2,$3,'remembered','2026-10-09T22:00:00Z',$4)`,
      [randomUUID(), user, cardIds.a, randomUUID()],
    );
    const asOf = new Date('2026-10-09T23:00:00Z'); // Oct 9 in UTC, Oct 10 in Tehran
    expect((await readLearnerSummary(pool, user, 'UTC', asOf)).reviewedToday).toBe(1);
    expect((await readLearnerSummary(pool, user, 'Asia/Tehran', asOf)).reviewedToday).toBe(1);
    const nextUtcMorning = new Date('2026-10-10T02:00:00Z'); // Oct 10 UTC, 05:30 Oct 10 Tehran
    expect((await readLearnerSummary(pool, user, 'UTC', nextUtcMorning)).reviewedToday).toBe(0);
    expect(
      (await readLearnerSummary(pool, user, 'Asia/Tehran', nextUtcMorning)).reviewedToday,
    ).toBe(1);
  });
});

suite('CP0 — daily queue and new-card limit', () => {
  const stateFor = (user: string): Promise<LearnerStateSnapshot> =>
    new LearnerStateService(new PostgresLearnerStateRepository(pool)).readLearnerState(user);

  /** The planner sorts equal-importance candidates by card UUID (localeCompare). */
  const byUuid = (letters_: string[]) =>
    letters_.map((l) => cardIds[l]).sort((x, y) => x.localeCompare(y));

  it('DEFECT: which 3 new cards are offered is decided by random card UUID, not by curriculum order', async () => {
    const user = await newLearner();
    const state = await stateFor(user);
    expect(state.plan.mode).toBe('normal');
    // Every candidate has the constant importance 1 (placeholder in the service), so the planner's
    // tie-break is cardId.localeCompare — the lowest UUIDs among the pool win.
    expect(state.plan.newCardIds).toEqual(byUuid(letters).slice(0, 3));
    // The repository pool is the first 12 start cards by content_id; the pack's own sort_order
    // (h..a here) and importance are never consulted.
    const { rows } = await pool.query(
      `SELECT c.content_id FROM pack_cards pc JOIN cards c ON c.id = pc.card_id
        WHERE pc.pack_id = 'cp0-pack' ORDER BY pc.sort_order LIMIT 3`,
    );
    expect(rows.map((r) => r.content_id)).toEqual(['h', 'g', 'f'].map(contentId));
  });

  it('DEFECT: there is no per-user-day cap; every request with spare capacity grants 3 new cards again', async () => {
    const user = await newLearner();
    const offeredSessions: string[][] = [];
    for (let session = 0; session < 3; session += 1) {
      const state = await stateFor(user);
      const offered = state.newCards.map((c) => c.contentId.replace('start-a1-cp0-', ''));
      offeredSessions.push(offered);
      for (const letter of offered) await submit(user, letter, 'remembered', new Date());
    }
    expect(offeredSessions.map((o) => o.length)).toEqual([3, 3, 2]);
    // 8 brand-new cards introduced within ONE calendar day from a "3 per session" rule,
    // with no daily ledger anywhere.
    const { rows } = await pool.query(
      `SELECT count(DISTINCT card_id)::int AS n FROM review_events WHERE user_id = $1`,
      [user],
    );
    expect(rows[0].n).toBe(8);
  });

  it('repeated plan requests without answering are stable (same 3), i.e. the planner itself has no memory', async () => {
    const user = await newLearner();
    const first = await stateFor(user);
    const second = await stateFor(user);
    expect(second.plan.newCardIds).toEqual(first.plan.newCardIds);
  });

  it('DEFECT: two definitions of "new": /today counts every published unscheduled card; the planner offers at most 3 start-a1 cards', async () => {
    const user = await newLearner();
    const today = await call<{ newCount: number; dueCount: number; totalTodayCards: number }>(
      todayRoute,
      user,
      '?tz=UTC',
    );
    // 8 start-a1 cards + 1 non-start published card, all unscheduled.
    expect(today.newCount).toBe(9);
    expect(today.totalTodayCards).toBe(9); // comment in route says "capped at daily goal": it is not
    const state = await stateFor(user);
    expect(state.plan.newCardIds).toHaveLength(3);
    expect(state.plan.newCardIds).not.toContain(nonStartCardId);
  });

  it('DEFECT: /today dueCount includes suspended schedules that the planner excludes', async () => {
    const user = await newLearner();
    await putSchedule(user, 'a', 'suspended', 1, new Date(Date.now() - DAY));
    await putSchedule(user, 'b', 'review', 1, new Date(Date.now() - DAY));
    const today = await call<{ dueCount: number }>(todayRoute, user, '?tz=UTC');
    expect(today.dueCount).toBe(2);
    const state = await stateFor(user);
    expect(state.plan.reviewCardIds).toEqual([cardIds.b]);
  });

  it('suspended/archived are never written by any production path (no learner code writes them)', async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM card_schedules WHERE state IN ('suspended','archived')
         AND user_id IN (SELECT user_id FROM review_events)`,
    );
    // Only the synthetic rows inserted directly by this suite could exist; none came from review ingest.
    expect(rows[0].n).toBe(0);
  });

  it('more than 12 due cards switches to recovery and offers zero new cards', async () => {
    const user = await newLearner();
    // Only 9 cards exist, so build the backlog from extra synthetic cards.
    const extra: string[] = [];
    for (let i = 0; i < 13; i += 1) {
      const id = randomUUID();
      extra.push(id);
      await pool.query(`INSERT INTO cards (id, lemma, content_id) VALUES ($1,$2,$3)`, [
        id,
        `bk${i}`,
        `start-a1-backlog-${String(i).padStart(2, '0')}`,
      ]);
      await pool.query(
        `INSERT INTO card_schedules (user_id, card_id, state, stability_days, due_at)
         VALUES ($1,$2,'review',1,$3)`,
        [user, id, new Date(Date.now() - (i + 1) * 3_600_000)],
      );
    }
    const state = await stateFor(user);
    expect(state.plan.mode).toBe('recovery');
    expect(state.plan.reviewCardIds).toHaveLength(12);
    expect(state.plan.newCardIds).toEqual([]);
    expect(state.newCards).toEqual([]);
  });
});

suite('CP0 — review ingest, idempotency and the scheduler on the real write path', () => {
  it('writes the event and the schedule together, from the CLIENT timestamp, not the server clock', async () => {
    const user = await newLearner();
    const occurredAt = new Date(Date.now() - 2 * DAY);
    const outcome = await submit(user, 'a', 'remembered', occurredAt);
    expect(outcome).toMatchObject({ status: 'acknowledged', idempotent: false });
    const schedule = await scheduleFor(user, 'a');
    expect(schedule!.state).toBe('learning');
    expect(schedule!.stability_days).toBeCloseTo(0.0416666667 * 1.8, 9);
    // due = answer time + stability, so a 2-day-old answer is already overdue.
    expect(schedule!.due_at.getTime()).toBeCloseTo(
      occurredAt.getTime() + 0.0416666667 * 1.8 * DAY,
      -3,
    );
    expect(schedule!.due_at.getTime()).toBeLessThan(Date.now());
  });

  it('replaying the same clientEventId is idempotent and does not change the schedule', async () => {
    const user = await newLearner();
    const id = randomUUID();
    const at = new Date(Date.now() - 1000);
    expect(await submit(user, 'a', 'remembered', at, id)).toMatchObject({ idempotent: false });
    const after = await scheduleFor(user, 'a');
    expect(await submit(user, 'a', 'remembered', at, id)).toMatchObject({
      status: 'acknowledged',
      idempotent: true,
    });
    expect(await scheduleFor(user, 'a')).toEqual(after);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM review_events WHERE user_id=$1`,
      [user],
    );
    expect(rows[0].n).toBe(1);
  });

  it('the same clientEventId with a different grade is an idempotency conflict', async () => {
    const user = await newLearner();
    const id = randomUUID();
    const at = new Date(Date.now() - 1000);
    await submit(user, 'a', 'remembered', at, id);
    expect(await submit(user, 'a', 'forgot', at, id)).toMatchObject({
      status: 'idempotencyConflict',
    });
  });

  it('rejects answers older than 90 days (validation) and more than 5 minutes in the future (clockSkew)', async () => {
    const user = await newLearner();
    expect(await submit(user, 'a', 'remembered', new Date(Date.now() - 91 * DAY))).toMatchObject({
      status: 'validation',
    });
    expect(await submit(user, 'a', 'remembered', new Date(Date.now() + 10 * 60_000))).toMatchObject(
      {
        status: 'clockSkew',
      },
    );
    expect(await scheduleFor(user, 'a')).toBeUndefined();
  });

  it('the API accepts only the four legacy grades today: a binary value is a validation error', async () => {
    const user = await newLearner();
    await expect(
      reviews.submit({
        userId: user,
        items: [
          {
            contentId: contentId('a'),
            grade: 'known' as never,
            occurredAt: new Date(),
            clientEventId: randomUUID(),
          },
        ],
      }),
    ).rejects.toBeInstanceOf(MobileReviewBatchError);
  });

  it('the database CHECK constraint also admits only the four legacy grades', async () => {
    const user = await newLearner();
    await expect(
      pool.query(
        `INSERT INTO review_events (id, user_id, card_id, grade, occurred_at, client_event_id)
         VALUES ($1,$2,$3,'known',now(),$4)`,
        [randomUUID(), user, cardIds.a, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('DEFECT: an out-of-order answer is applied on top of the newest schedule, so due_at can move EARLIER', async () => {
    const user = await newLearner();
    const t0 = Date.now();
    await submit(user, 'a', 'mastered', new Date(t0 - 1000));
    const afterNewest = await scheduleFor(user, 'a');
    // A delayed offline answer with an OLDER timestamp arrives second.
    await submit(user, 'a', 'mastered', new Date(t0 - 10 * DAY));
    const afterOlder = await scheduleFor(user, 'a');
    expect(afterOlder!.stability_days).toBeGreaterThan(afterNewest!.stability_days); // still multiplied
    expect(afterOlder!.due_at.getTime()).toBeLessThan(afterNewest!.due_at.getTime() + 1); // ...but anchored 10 days earlier
  });

  it('the review_events table has no rating/created_at columns, only grade/occurred_at/applied_at', async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'review_events' ORDER BY column_name`,
    );
    const columns = rows.map((r) => r.column_name);
    expect(columns).toEqual(
      expect.arrayContaining([
        'id',
        'user_id',
        'card_id',
        'grade',
        'occurred_at',
        'client_event_id',
      ]),
    );
    expect(columns).not.toContain('rating');
    expect(columns).not.toContain('created_at');
  });
});

suite('CP0 — Admin reads the learning tables with its own queries (LB-B34 input)', () => {
  it('FINDING: Admin user-detail selects review_events.rating / created_at, which do not exist -> the query fails', async () => {
    const user = await newLearner();
    await submit(user, 'a', 'remembered', new Date(Date.now() - 1000));
    // Verbatim from apps/admin/app/api/users/[userId]/route.ts (stats + recentReviews queries).
    await expect(
      pool.query(
        `SELECT
           (SELECT count(*) FROM card_schedules WHERE user_id = $1) as cards_started,
           (SELECT count(*) FROM review_events WHERE user_id = $1) as total_reviews,
           (SELECT max(created_at) FROM review_events WHERE user_id = $1) as last_review_at`,
        [user],
      ),
    ).rejects.toThrow(/created_at/);
    await expect(
      pool.query(
        `SELECT card_id, rating, created_at FROM review_events WHERE user_id = $1
          ORDER BY created_at DESC LIMIT 20`,
        [user],
      ),
    ).rejects.toThrow(/rating|created_at/);
  });

  it('Admin user-list counts (review_count, cards_started, last_activity) are plain counts with no learned/mastered/accuracy/streak semantics', async () => {
    const user = await newLearner();
    await submit(user, 'a', 'mastered', new Date(Date.now() - 1000));
    const { rows } = await pool.query(
      `SELECT COALESCE(r.cnt, 0) as review_count, COALESCE(cs.cnt, 0) as cards_started, r.last_at as last_activity
         FROM users u
         LEFT JOIN (SELECT user_id, count(*) as cnt, max(occurred_at) as last_at FROM review_events GROUP BY user_id) r ON r.user_id = u.id
         LEFT JOIN (SELECT user_id, count(*) as cnt FROM card_schedules GROUP BY user_id) cs ON cs.user_id = u.id
        WHERE u.id = $1`,
      [user],
    );
    expect(Number(rows[0].review_count)).toBe(1);
    expect(Number(rows[0].cards_started)).toBe(1);
  });

  it('Admin source has no learning rules: it never imports the engine and never mentions mastery, accuracy, streak or boxes', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(process.cwd(), '..', 'admin', 'app');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name)) files.push(full);
      }
    };
    walk(root);
    const source = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(source).not.toMatch(/@learnbox\/learning-engine/);
    expect(source).not.toMatch(/stability_days|scheduleReview|createDailySessionPlan/);
    expect(source).not.toMatch(/streak|mastered|leitner/i);
  });
});

suite('CP0 — data-preservation harness', () => {
  it('fingerprint is stable across reads and changes only when an event is appended', async () => {
    const user = await newLearner();
    await submit(user, 'a', 'hard', new Date(Date.now() - 2000));
    const first = await reviewEventsFingerprint(pool, user);
    await call(todayRoute, user, '?tz=UTC');
    await call(progressRoute, user);
    await call(wordsRoute, user);
    await call(statsRoute, user);
    await readLearnerSummary(pool, user, 'UTC');
    expect(await reviewEventsFingerprint(pool, user)).toEqual(first);
    await submit(user, 'b', 'hard', new Date(Date.now() - 1000));
    const second = await reviewEventsFingerprint(pool, user);
    expect(second.count).toBe(first.count + 1);
    expect(second.digest).not.toBe(first.digest);
  });
});
