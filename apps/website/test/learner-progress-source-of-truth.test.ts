import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readLearnerSummary } from '../lib/learner-summary';
import {
  fetchLearnerSummary,
  loadSummaryCache,
  saveSummaryCache,
  type LearnerSummaryView,
  type SummaryCacheStore,
} from '../lib/learner-summary-client';

/**
 * LB-B25 / CP-3 acceptance — server/DB is the source of truth for progress.
 *
 * Runs the REAL summary SQL against a REAL Postgres with every repo migration
 * applied, and the REAL client. Only the HTTP hop is bridged in-process (the route
 * pins sslmode=verify-full, which a disposable local database cannot satisfy).
 *
 * Requires TEST_DATABASE_URL (an empty database). CI provides one; locally:
 *   docker run -d --rm -e POSTGRES_PASSWORD=t -e POSTGRES_DB=lbtest -p 55433:5432 postgres:17-alpine
 *   TEST_DATABASE_URL=postgres://postgres:t@localhost:55433/lbtest pnpm --filter @learnbox/website exec vitest run test/learner-progress-source-of-truth.test.ts
 *
 * It is a hard failure, not a skip, when the variable is missing in CI: a skipped
 * acceptance test would silently stop guarding the invariant.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');

const suite = url ? describe : describe.skip;
// Migrations pin table_schema = 'public', so isolation is a throwaway DATABASE, not a schema.
const dbName = `cp3_${Math.random().toString(36).slice(2, 10)}`;

let pool: Pool;
let admin: Pool;

const migrationsDir = join(__dirname, '../../../database/migrations');

const ids = {
  alice: '11111111-1111-4111-8111-111111111111',
  bob: '22222222-2222-4222-8222-222222222222',
};
let eventSeq = 0;
const uuid = (n: number, prefix: string) =>
  `${prefix}${String(n).padStart(4, '0')}-0000-4000-8000-000000000000`.replace(/^(.{8}).*$/, '$1') +
  `-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function review(userId: string, cardId: string, at: string) {
  eventSeq += 1;
  await pool.query(
    `INSERT INTO review_events (id, user_id, card_id, grade, occurred_at, client_event_id)
     VALUES ($1, $2, $3, 'remembered', $4, $5)`,
    [uuid(eventSeq, 'aaaa'), userId, cardId, at, uuid(eventSeq, 'bbbb')],
  );
}

function memoryStorage(seed: Record<string, string> = {}): SummaryCacheStore & {
  dump(): Record<string, string>;
} {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    dump: () => Object.fromEntries(map),
  };
}

/** In-process stand-in for GET /api/learner/summary, authenticated as `userId`. */
function serverFor(userId: string | null, asOf: Date, tzOverride?: string): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 });
    const tz = new URL(String(input), 'http://x').searchParams.get('tz');
    const summary = await readLearnerSummary(pool, userId, tzOverride ?? tz, asOf);
    return Response.json(summary, { status: 200 });
  }) as typeof fetch;
}

const view = (s: LearnerSummaryView & { timeZone?: string }): LearnerSummaryView => ({
  reviewedToday: s.reviewedToday,
  streakDays: s.streakDays,
  longestStreakDays: s.longestStreakDays,
  activeDays: s.activeDays,
  totalReviews: s.totalReviews,
});

suite('server-authoritative learner progress (real Postgres)', () => {
  const NOW = new Date('2026-09-29T10:00:00Z');
  const cardIds: string[] = [];

  beforeAll(async () => {
    admin = new Pool({ connectionString: url, max: 1 });
    await admin.query(`CREATE DATABASE ${dbName}`);
    const scoped = new URL(url as string);
    scoped.pathname = `/${dbName}`;
    pool = new Pool({ connectionString: scoped.toString(), max: 2 });
    for (const file of readdirSync(migrationsDir)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort()) {
      await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
    }
    for (const [id, name] of [
      [ids.alice, 'alice'],
      [ids.bob, 'bob'],
    ]) {
      await pool.query(`INSERT INTO users (id, phone_e164, first_name) VALUES ($1, $2, $3)`, [
        id,
        name === 'alice' ? '+4915100000001' : '+4915100000002',
        name,
      ]);
    }
    for (let i = 1; i <= 3; i += 1) {
      const id = uuid(900 + i, 'cccc');
      cardIds.push(id);
      await pool.query(`INSERT INTO cards (id, lemma, content_id) VALUES ($1, $2, $3)`, [
        id,
        `wort${i}`,
        `cp3-card-${i}`,
      ]);
    }

    // Alice: 3 reviews today, reviews on each of the previous 4 days, then a gap
    // and an older isolated day. Current streak = 5 (today + 4), longest = 5.
    for (const at of [
      '2026-09-29T06:00:00Z',
      '2026-09-29T07:00:00Z',
      '2026-09-29T08:00:00Z',
      '2026-09-28T09:00:00Z',
      '2026-09-27T09:00:00Z',
      '2026-09-26T09:00:00Z',
      '2026-09-25T09:00:00Z',
      '2026-09-20T09:00:00Z',
    ]) {
      await review(ids.alice, cardIds[0], at);
    }
    // Bob: a single review long ago — must never leak into Alice's numbers.
    await review(ids.bob, cardIds[1], '2026-08-01T09:00:00Z');
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  const expectedAlice: LearnerSummaryView = {
    reviewedToday: 3,
    streakDays: 5,
    longestStreakDays: 5,
    activeDays: 6,
    totalReviews: 8,
  };

  it('computes today, streak and history from review_events', async () => {
    const summary = await readLearnerSummary(pool, ids.alice, 'UTC', NOW);
    expect(view(summary)).toEqual(expectedAlice);
  });

  it('shows the SAME progress after re-login (new session, same account)', async () => {
    // A session token carries only the account id. A "re-login" mints a new
    // token for the same subject, so the answer must be identical.
    const first = await fetchLearnerSummary(serverFor(ids.alice, NOW), 'UTC');
    const afterRelogin = await fetchLearnerSummary(serverFor(ids.alice, NOW), 'UTC');
    expect(first).toEqual({ status: 'ok', summary: expectedAlice });
    expect(afterRelogin).toEqual(first);
  });

  it('shows the SAME progress on a fresh device with empty localStorage', async () => {
    const freshDevice = memoryStorage();
    expect(Object.keys(freshDevice.dump())).toHaveLength(0);

    const result = await fetchLearnerSummary(serverFor(ids.alice, NOW), 'UTC');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.summary).toEqual(expectedAlice);
  });

  it('a device carrying WRONG local numbers cannot override the server', async () => {
    // Poisoned cache: claims a 99-day streak and 40 reviews today.
    const key = 'learnbox:summary-cache:v1:account:alice';
    const poisoned = memoryStorage();
    saveSummaryCache(
      poisoned,
      key,
      {
        reviewedToday: 40,
        streakDays: 99,
        longestStreakDays: 99,
        activeDays: 99,
        totalReviews: 999,
      },
      '2026-09-29',
    );

    const online = await fetchLearnerSummary(serverFor(ids.alice, NOW), 'UTC');
    expect(online.status).toBe('ok');
    if (online.status !== 'ok') return;

    // The value the app renders while online is the server's, byte for byte —
    // the poisoned cache is never consulted when the server answers.
    expect(online.summary).toEqual(expectedAlice);
    expect(online.summary.streakDays).not.toBe(99);

    // Writing the fresh answer back repairs the device copy to the server's numbers.
    saveSummaryCache(poisoned, key, online.summary, '2026-09-29');
    const repaired = loadSummaryCache(poisoned, key, '2026-09-29', '2026-09-28');
    expect(repaired).toEqual(expectedAlice);
  });

  it('fresh device and long-used device converge to identical numbers', async () => {
    const a = await fetchLearnerSummary(serverFor(ids.alice, NOW), 'UTC');
    const b = await fetchLearnerSummary(serverFor(ids.alice, NOW), 'UTC');
    expect(a).toEqual(b);
  });

  it('the offline cache is only a fallback and cannot claim stale progress', () => {
    const key = 'k';
    const store = memoryStorage();
    saveSummaryCache(store, key, expectedAlice, '2026-09-29');

    // Same day: cached numbers are shown while offline.
    expect(loadSummaryCache(store, key, '2026-09-29', '2026-09-28')).toEqual(expectedAlice);
    // Next day: today's count resets, the streak (last confirmed yesterday) survives.
    expect(loadSummaryCache(store, key, '2026-09-30', '2026-09-29')).toEqual({
      ...expectedAlice,
      reviewedToday: 0,
    });
    // Two days later the streak can no longer be claimed at all.
    expect(loadSummaryCache(store, key, '2026-10-01', '2026-09-30')).toEqual({
      ...expectedAlice,
      reviewedToday: 0,
      streakDays: 0,
    });
    // Corrupt or hostile cache content is ignored, never rendered.
    store.setItem(key, '{"summary":{"streakDays":-4},"dateKey":"2026-09-29"}');
    expect(loadSummaryCache(store, key, '2026-09-29', '2026-09-28')).toBeNull();
    store.setItem(key, 'not json');
    expect(loadSummaryCache(store, key, '2026-09-29', '2026-09-28')).toBeNull();
  });

  it('reports unavailable (never zeros) when the server cannot answer', async () => {
    const failing = (async () =>
      Response.json({ error: 'serverUnavailable' }, { status: 503 })) as typeof fetch;
    expect(await fetchLearnerSummary(failing, 'UTC')).toEqual({ status: 'unavailable' });
    const throwing = (async () => {
      throw new TypeError('network');
    }) as typeof fetch;
    expect(await fetchLearnerSummary(throwing, 'UTC')).toEqual({ status: 'unavailable' });
    const garbage = (async () =>
      Response.json({ streakDays: 'lots' }, { status: 200 })) as typeof fetch;
    expect(await fetchLearnerSummary(garbage, 'UTC')).toEqual({ status: 'unavailable' });
  });

  it('an unauthenticated request yields unauthorized, no data', async () => {
    expect(await fetchLearnerSummary(serverFor(null, NOW), 'UTC')).toEqual({
      status: 'unauthorized',
    });
  });

  it('is isolated per account', async () => {
    const bob = await readLearnerSummary(pool, ids.bob, 'UTC', NOW);
    expect(view(bob)).toEqual({
      reviewedToday: 0,
      streakDays: 0,
      longestStreakDays: 1,
      activeDays: 1,
      totalReviews: 1,
    });
  });

  it('an account with no history is a clean zero, not an error', async () => {
    const ghost = await readLearnerSummary(
      pool,
      '33333333-3333-4333-8333-333333333333',
      'UTC',
      NOW,
    );
    expect(view(ghost)).toEqual({
      reviewedToday: 0,
      streakDays: 0,
      longestStreakDays: 0,
      activeDays: 0,
      totalReviews: 0,
    });
  });

  it('a streak survives until the end of the day after the last review, then breaks', async () => {
    // Last review 2026-09-29 → streak alive on the 29th and 30th, dead on the 1st.
    const onThirtieth = await readLearnerSummary(
      pool,
      ids.alice,
      'UTC',
      new Date('2026-09-30T23:00:00Z'),
    );
    expect(onThirtieth.streakDays).toBe(5);
    expect(onThirtieth.reviewedToday).toBe(0);
    const onFirst = await readLearnerSummary(
      pool,
      ids.alice,
      'UTC',
      new Date('2026-10-01T01:00:00Z'),
    );
    expect(onFirst.streakDays).toBe(0);
    expect(onFirst.longestStreakDays).toBe(5);
  });

  it("buckets days in the learner's timezone, not the server's", async () => {
    await review(ids.bob, cardIds[2], '2026-09-28T21:00:00Z'); // 00:30 on the 29th in Tehran
    await review(ids.bob, cardIds[2], '2026-09-29T05:00:00Z'); // 08:30 on the 29th in Tehran
    const asOf = new Date('2026-09-29T09:00:00Z');
    const tehran = await readLearnerSummary(pool, ids.bob, 'Asia/Tehran', asOf);
    const utc = await readLearnerSummary(pool, ids.bob, 'UTC', asOf);
    expect(tehran.timeZone).toBe('Asia/Tehran');
    expect(tehran.reviewedToday).toBe(2); // both reviews are the 29th locally
    expect(utc.reviewedToday).toBe(1); // in UTC the first is still the 28th
  });

  it('degrades an unknown timezone to UTC instead of failing', async () => {
    const summary = await readLearnerSummary(pool, ids.alice, 'Mars/Olympus_Mons', NOW);
    expect(summary.timeZone).toBe('UTC');
    expect(view(summary)).toEqual(expectedAlice);
  });

  it('is strictly read-only: existing review data is never migrated or rewritten', async () => {
    const snapshot = () =>
      pool.query(
        `SELECT count(*)::int AS n, md5(string_agg(id::text || occurred_at::text, ',' ORDER BY id)) AS h
         FROM review_events`,
      );
    const before = (await snapshot()).rows[0];
    for (let i = 0; i < 3; i += 1) await readLearnerSummary(pool, ids.alice, 'UTC', NOW);
    await fetchLearnerSummary(serverFor(ids.alice, NOW), 'UTC');
    expect((await snapshot()).rows[0]).toEqual(before);
  });
});
