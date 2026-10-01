import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool as PgPool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * LB-B35 CP4 — per-learner IANA timezone persistence (flag LEARNBOX_TZ_PERSIST) through the learner read paths, against a REAL Postgres with
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
import { GET as summaryRoute } from '../app/api/learner/summary/route';
import { readLearnerActivity } from '../lib/learner-read-model';
import { reviewEventsFingerprint } from './support/review-events-fingerprint';

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;
const dbName = `cp4tz_${Math.random().toString(36).slice(2, 10)}`;
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
  for (const [i, name] of ['cp4-a', 'cp4-b', 'cp4-c', 'cp4-d'].entries()) {
    cards.push(await make(name, 'cp4-pack', i + 1));
  }
  draftCard = await make('cp4-draft-card', 'cp4-draft', 1);
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

const tzOf = async (user: string) =>
  (await pool.query('SELECT timezone FROM users WHERE id = $1', [user])).rows[0].timezone as
    string | null;
const stamps = async (user: string) =>
  (
    await pool.query('SELECT id, occurred_at FROM review_events WHERE user_id = $1 ORDER BY id', [
      user,
    ])
  ).rows;

// 2026-09-29T20:29:59Z = 23:59:59 Tehran Sep 29 (UTC+3:30); 20:30:00Z = 00:00:00 Tehran Sep 30.
const BEFORE_MIDNIGHT = '2026-09-29T20:29:59Z';
const AFTER_MIDNIGHT = '2026-09-29T20:30:00Z';

describe('CP4 timezone persistence', () => {
  it('flag OFF (default): the stored column is never read or written — v1.2.1 behaviour', async () => {
    vi.stubEnv('LEARNBOX_TZ_PERSIST', '');
    const user = await newLearner();
    await pool.query(`UPDATE users SET timezone = 'Asia/Tehran' WHERE id = $1`, [user]);
    const body = await call<{ timeZone: string }>(progressRoute, user, '?tz=Europe/Berlin');
    expect(body.timeZone).toBe('Europe/Berlin'); // request zone wins, stored ignored
    const fresh = await newLearner();
    await call(progressRoute, fresh, '?tz=Europe/Berlin');
    expect(await tzOf(fresh)).toBeNull(); // nothing persisted
  });

  it('flag ON: a NULL stored zone is filled ONCE from the first valid device zone', async () => {
    vi.stubEnv('LEARNBOX_TZ_PERSIST', 'true');
    const user = await newLearner();
    expect(await tzOf(user)).toBeNull();
    const first = await call<{ timeZone: string }>(progressRoute, user, '?tz=Asia/Tehran');
    expect(first.timeZone).toBe('Asia/Tehran');
    expect(await tzOf(user)).toBe('Asia/Tehran');
    // A later request from another zone (a trip) does NOT move the learner's day.
    const later = await call<{ timeZone: string }>(progressRoute, user, '?tz=Europe/Berlin');
    expect(later.timeZone).toBe('Asia/Tehran');
    expect(await tzOf(user)).toBe('Asia/Tehran');
    // ... and the request needs no tz at all once stored.
    expect((await call<{ timeZone: string }>(statsRoute, user)).timeZone).toBe('Asia/Tehran');
  });

  it('flag ON: missing, invalid, offset or oversized device zones persist nothing and use UTC', async () => {
    vi.stubEnv('LEARNBOX_TZ_PERSIST', 'true');
    for (const bad of ['', '?tz=%2B03:30', '?tz=Nope/Nope', `?tz=${'x'.repeat(70)}`, '?tz=../x']) {
      const user = await newLearner();
      const body = await call<{ timeZone: string }>(progressRoute, user, bad);
      expect(body.timeZone, bad).toBe('UTC');
      expect(await tzOf(user), bad).toBeNull();
    }
  });

  it('flag ON: an existing learner with NULL zone keeps working and reads identically to flag OFF', async () => {
    const user = await newLearner();
    await review(user, cards[0], 'remembered', BEFORE_MIDNIGHT);
    vi.stubEnv('LEARNBOX_TZ_PERSIST', '');
    const off = await call(progressRoute, user, '?tz=Asia/Tehran');
    await pool.query(`UPDATE users SET timezone = NULL WHERE id = $1`, [user]);
    vi.stubEnv('LEARNBOX_TZ_PERSIST', 'true');
    const on = await call(progressRoute, user, '?tz=Asia/Tehran');
    expect(on).toEqual(off);
  });

  it('Summary (Today), Progress and Profile agree on the stored zone and the Tehran midnight edge', async () => {
    vi.stubEnv('LEARNBOX_TZ_PERSIST', 'true');
    const user = await newLearner();
    await pool.query(`UPDATE users SET timezone = 'Asia/Tehran' WHERE id = $1`, [user]);
    await review(user, cards[0], 'remembered', BEFORE_MIDNIGHT);
    await review(user, cards[1], 'remembered', AFTER_MIDNIGHT);
    // The device lies (UTC): the stored zone still decides the learning day.
    const progress = await call<{ timeZone: string; streak: { current: number } }>(
      progressRoute,
      user,
      '?tz=UTC',
    );
    const stats = await call<{ timeZone: string; streak: { current: number } }>(
      statsRoute,
      user,
      '?tz=UTC',
    );
    const summary = await call<{ timeZone: string }>(summaryRoute, user, '?tz=UTC');
    expect(progress.timeZone).toBe('Asia/Tehran');
    expect(stats.timeZone).toBe('Asia/Tehran');
    expect(summary.timeZone).toBe('Asia/Tehran');
    // The two reviews are on TWO Tehran days (Sep 29 and Sep 30) but ONE UTC day.
    const asTehran = await readLearnerActivity(pool, user, null);
    expect(asTehran.days.map((d) => d.day)).toEqual(['2026-09-29', '2026-09-30']);
    vi.stubEnv('LEARNBOX_TZ_PERSIST', '');
    const asUtc = await readLearnerActivity(pool, user, 'UTC');
    expect(asUtc.days.map((d) => d.day)).toEqual(['2026-09-29']);
  });

  it('changing the stored zone re-buckets days but never rewrites a historical timestamp or event', async () => {
    vi.stubEnv('LEARNBOX_TZ_PERSIST', 'true');
    const user = await newLearner();
    await review(user, cards[0], 'remembered', BEFORE_MIDNIGHT);
    await review(user, cards[1], 'forgot', AFTER_MIDNIGHT);
    await review(user, cards[2], 'hard', '2026-09-30T05:00:00Z');
    const fingerprint = await reviewEventsFingerprint(pool, user);
    const stampsBefore = await stamps(user);
    await pool.query(`UPDATE users SET timezone = 'Asia/Tehran' WHERE id = $1`, [user]);
    const tehran = await readLearnerActivity(pool, user, null);
    await pool.query(`UPDATE users SET timezone = 'America/Los_Angeles' WHERE id = $1`, [user]);
    const la = await readLearnerActivity(pool, user, null);
    expect(tehran.days.map((d) => d.day)).not.toEqual(la.days.map((d) => d.day));
    expect(tehran.totalReviews).toBe(3);
    expect(la.totalReviews).toBe(3);
    expect(await reviewEventsFingerprint(pool, user)).toEqual(fingerprint);
    expect(await stamps(user)).toEqual(stampsBefore);
  });

  it('flag ON: the stored zone alone is enough — no device zone is needed on later requests', async () => {
    vi.stubEnv('LEARNBOX_TZ_PERSIST', 'true');
    const user = await newLearner();
    await pool.query(`UPDATE users SET timezone = 'Asia/Tehran' WHERE id = $1`, [user]);
    const body = await call<{ timeZone: string }>(progressRoute, user);
    expect(body.timeZone).toBe('Asia/Tehran');
  });
});
