import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  accuracyCountsSql,
  accuracyFromAnswers,
  boxCaseSql,
  boxFromStabilityDays,
  computeAccuracy,
  computeStreak,
  isLearnedStability,
  isMasteredStability,
  learnedPredicateSql,
  localDayKey,
  masteredPredicateSql,
  REVIEW_GRADES,
  toBinaryResponse,
} from '@learnbox/learning-engine';
import type { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readLearnerSummary } from '../lib/learner-summary';
import { reviewEventsFingerprint } from './support/review-events-fingerprint';

/**
 * LB-B35 CP2 — TypeScript / database agreement for the canonical learning definitions.
 *
 * Runs against a REAL Postgres with every repo migration applied. Every claim of the form
 * "TypeScript and SQL compute the same Box / Learned / Mastered / Accuracy / local day / streak"
 * is proven here on the real engine, not asserted. Read-only with respect to learner data:
 * `review_events` is fingerprinted before and after.
 *
 * Requires TEST_DATABASE_URL (an empty database; the suite creates and drops its own throwaway
 * database). Hard failure in CI when missing; skipped locally.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;

const dbName = `cp2_${Math.random().toString(36).slice(2, 10)}`;
const migrationsDir = join(__dirname, '../../../database/migrations');
const DAY = 86_400_000;

let pool: PgPool;
let admin: PgPool;

beforeAll(async () => {
  const { Pool } = await import('pg');
  admin = new Pool({ connectionString: url, max: 1 });
  await admin.query(`CREATE DATABASE ${dbName}`);
  const scoped = new URL(url as string);
  scoped.pathname = `/${dbName}`;
  pool = new Pool({ connectionString: scoped.toString(), max: 4 });
  for (const file of readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()) {
    await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
  }
});

afterAll(async () => {
  await pool?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin?.end();
});

async function newLearner(): Promise<string> {
  const id = randomUUID();
  const phone = `+98912${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  await pool.query('INSERT INTO users (id, phone_e164) VALUES ($1, $2)', [id, phone]);
  return id;
}

async function newCard(): Promise<string> {
  const id = randomUUID();
  await pool.query('INSERT INTO cards (id, lemma, content_id) VALUES ($1, $2, $2)', [
    id,
    `cp2-${id}`,
  ]);
  return id;
}

async function review(userId: string, cardId: string, grade: string, at: Date) {
  await pool.query(
    `INSERT INTO review_events (id, user_id, card_id, grade, occurred_at, client_event_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), userId, cardId, grade, at, randomUUID()],
  );
}

suite('CP2 — canonical Box / Learned / Mastered: TypeScript equals SQL', () => {
  it('agrees on every boundary, a dense sweep and random values (real Postgres numeric semantics)', async () => {
    const values: number[] = [
      0, 0.0416666667, 0.9999999999, 1, 2.999999999, 3, 6.9999, 7, 20.9999999, 21, 180, 1e6,
    ];
    for (let v = 0.001; v < 400; v += 0.0731) values.push(Number(v.toFixed(6)));
    let seed = 20261001;
    for (let i = 0; i < 2000; i += 1) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      values.push(Number(((seed / 4294967296) * 60).toFixed(9)));
    }
    const { rows } = await pool.query(
      `SELECT v::float8 AS v,
              ${boxCaseSql('v')} AS box,
              (${learnedPredicateSql('v')}) AS learned,
              (${masteredPredicateSql('v')}) AS mastered
         FROM unnest($1::float8[]) AS t(v)`,
      [values],
    );
    expect(rows).toHaveLength(values.length);
    for (const row of rows) {
      expect(Number(row.box), `box(${row.v})`).toBe(boxFromStabilityDays(row.v));
      expect(row.learned, `learned(${row.v})`).toBe(isLearnedStability(row.v));
      expect(row.mastered, `mastered(${row.v})`).toBe(isMasteredStability(row.v));
    }
  });

  it('agrees on the REAL card_schedules column type, including Mastered independent of state', async () => {
    const user = await newLearner();
    const stabilities = [0.04, 0.99, 1, 2.9, 3, 6.9, 7, 20.9, 21, 35, 181];
    for (const [index, stability] of stabilities.entries()) {
      const card = await newCard();
      // Deliberately wrong-looking `state` values: Box must ignore them.
      const state = index % 2 === 0 ? 'review' : 'mastered';
      await pool.query(
        `INSERT INTO card_schedules (user_id, card_id, state, stability_days, due_at)
         VALUES ($1, $2, $3::learning_state, $4, now())`,
        [user, card, state, stability],
      );
    }
    const { rows } = await pool.query(
      `SELECT stability_days, ${boxCaseSql('stability_days')} AS box,
              (${learnedPredicateSql('stability_days')}) AS learned,
              (${masteredPredicateSql('stability_days')}) AS mastered
         FROM card_schedules WHERE user_id = $1`,
      [user],
    );
    expect(rows).toHaveLength(stabilities.length);
    for (const row of rows) {
      expect(Number(row.box)).toBe(boxFromStabilityDays(Number(row.stability_days)));
      expect(row.learned).toBe(isLearnedStability(Number(row.stability_days)));
      expect(row.mastered).toBe(isMasteredStability(Number(row.stability_days)));
    }
  });

  it('matches what the SHIPPED progress route computes today, so adopting it moves no card', async () => {
    const user = await newLearner();
    for (const stability of [0.04, 0.5, 1, 2, 3, 5, 7, 12, 21, 40, 200]) {
      const card = await newCard();
      await pool.query(
        `INSERT INTO card_schedules (user_id, card_id, state, stability_days, due_at)
         VALUES ($1, $2, 'review', $3, now())`,
        [user, card, stability],
      );
    }
    // Verbatim shape of apps/website/app/api/learner/progress/route.ts (the legacy copy #1).
    const shipped = (
      await pool.query(
        `SELECT count(*) FILTER (WHERE stability_days < 1) as box1,
                count(*) FILTER (WHERE stability_days >= 1 AND stability_days < 3) as box2,
                count(*) FILTER (WHERE stability_days >= 3 AND stability_days < 7) as box3,
                count(*) FILTER (WHERE stability_days >= 7 AND stability_days < 21) as box4,
                count(*) FILTER (WHERE stability_days >= 21) as box5
           FROM card_schedules WHERE user_id = $1`,
        [user],
      )
    ).rows[0];
    const canonical = (
      await pool.query(
        `SELECT ${[1, 2, 3, 4, 5]
          .map((b) => `count(*) FILTER (WHERE ${boxCaseSql('stability_days')} = ${b}) as box${b}`)
          .join(', ')}
           FROM card_schedules WHERE user_id = $1`,
        [user],
      )
    ).rows[0];
    expect(canonical).toEqual(shipped);
  });
});

suite('CP2 — canonical Accuracy: TypeScript equals SQL and fixes CP0 D1', () => {
  it('counts the same known/unknown in SQL and TS for every stored grade, once per answer', async () => {
    const user = await newLearner();
    const card = await newCard();
    const plan: Array<[string, number]> = [
      ['forgot', 3],
      ['hard', 2],
      ['remembered', 4],
      ['mastered', 5],
    ];
    let offset = 0;
    const tsAnswers: string[] = [];
    for (const [grade, times] of plan) {
      for (let i = 0; i < times; i += 1) {
        await review(user, card, grade, new Date(Date.UTC(2026, 8, 1) + offset++ * 60_000));
        tsAnswers.push(grade);
      }
    }
    const { rows } = await pool.query(
      `SELECT ${accuracyCountsSql('grade')} FROM review_events WHERE user_id = $1`,
      [user],
    );
    const fromSql = computeAccuracy({
      known: Number(rows[0].known),
      unknown: Number(rows[0].unknown),
    });
    expect(fromSql).toEqual(accuracyFromAnswers(tsAnswers));
    expect(fromSql).toMatchObject({ known: 11, unknown: 3, total: 14, percent: 79 });
  });

  it('every CHECK-constrained stored grade is classified, and SQL and TS classify it identically', async () => {
    const { rows } = await pool.query(
      `SELECT g AS grade,
              (g IN (SELECT unnest($1::text[]))) AS sql_known
         FROM unnest($2::text[]) AS t(g)`,
      [['hard', 'remembered', 'mastered', 'known'], [...REVIEW_GRADES]],
    );
    for (const row of rows) {
      expect(row.sql_known).toBe(toBinaryResponse(row.grade) === 'known');
    }
    // The database CHECK accepts exactly the four historical grades — no more, no fewer.
    const check = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'review_events'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%grade%'`,
    );
    const allowed = [...String(check.rows[0].def).matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
    expect(allowed).toEqual([...REVIEW_GRADES].sort());
  });

  it('FIXES CP0 D1: an all-"mastered" learner is 100% accurate, not 0%', async () => {
    const user = await newLearner();
    const card = await newCard();
    for (let i = 0; i < 5; i += 1)
      await review(user, card, 'mastered', new Date(Date.UTC(2026, 8, 2, 10, i)));
    const { rows } = await pool.query(
      `SELECT ${accuracyCountsSql('grade')} FROM review_events WHERE user_id = $1`,
      [user],
    );
    expect(
      computeAccuracy({ known: Number(rows[0].known), unknown: Number(rows[0].unknown) }).percent,
    ).toBe(100);
  });
});

suite('CP2 — canonical local day and streak: TypeScript equals SQL', () => {
  it('localDayKey equals (ts AT TIME ZONE tz)::date across zones, DST edges and midnight boundaries', async () => {
    const zones = [
      'Asia/Tehran',
      'UTC',
      'America/New_York',
      'Europe/Berlin',
      'Pacific/Auckland',
      'Asia/Kolkata',
    ];
    const instants: Date[] = [];
    for (const iso of [
      '2026-03-08T06:59:59Z',
      '2026-03-08T07:00:00Z',
      '2026-03-29T00:59:59Z',
      '2026-03-29T01:00:00Z',
      '2026-10-25T00:59:59Z',
      '2026-10-25T01:00:00Z',
      '2026-09-21T20:29:59Z',
      '2026-09-21T20:30:00Z',
      '2026-12-31T23:59:59Z',
      '2027-01-01T00:00:00Z',
      '2028-02-29T12:00:00Z',
    ])
      instants.push(new Date(iso));
    for (let i = 0; i < 300; i += 1)
      instants.push(new Date(Date.UTC(2026, 0, 1) + i * 7 * 3_600_000 + i * 1_337));
    for (const zone of zones) {
      const { rows } = await pool.query(
        `SELECT t::text AS t, ((t::timestamptz) AT TIME ZONE $2)::date::text AS day
           FROM unnest($1::text[]) AS x(t)`,
        [instants.map((d) => d.toISOString()), zone],
      );
      expect(rows).toHaveLength(instants.length);
      for (const [i, row] of rows.entries()) {
        expect(localDayKey(instants[i]!, zone), `${zone} ${row.t}`).toBe(row.day);
      }
    }
  });

  it('computeStreak equals the shipped server-authoritative summary SQL on varied histories', async () => {
    const zone = 'Asia/Tehran';
    const asOf = new Date('2026-10-01T09:00:00Z');
    const today = localDayKey(asOf, zone);
    const histories: Record<string, number[]> = {
      endsToday: [0, -1, -2, -5],
      endsYesterday: [-1, -2, -3],
      brokenTwoDaysAgo: [-2, -3, -4, -9, -10],
      singleOldRun: [-20, -21, -22, -23],
      sparse: [0, -2, -4, -6],
      nothing: [],
    };
    for (const [name, offsets] of Object.entries(histories)) {
      const user = await newLearner();
      const card = await newCard();
      for (const offset of offsets) {
        // Two reviews per local day, both at or before `asOf`: 00:30 local (21:00Z the previous UTC
        // day — stresses the IRST/UTC split CP0 D3 found) and 06:30 local (03:00Z).
        const day = new Date(asOf.getTime() + offset * DAY);
        const midnightish = new Date(day);
        midnightish.setUTCDate(midnightish.getUTCDate() - 1);
        midnightish.setUTCHours(21, 0, 0, 0);
        const morning = new Date(day);
        morning.setUTCHours(3, 0, 0, 0);
        await review(user, card, 'remembered', midnightish);
        await review(user, card, 'forgot', morning);
      }
      const { rows } = await pool.query(
        `SELECT (occurred_at AT TIME ZONE $2)::date::text AS day FROM review_events WHERE user_id = $1`,
        [user, zone],
      );
      const fromTs = computeStreak(
        rows.map((r) => r.day as string),
        today,
      );
      const summary = await readLearnerSummary(pool, user, zone, asOf);
      expect({
        name,
        current: fromTs.current,
        longest: fromTs.longest,
        activeDays: fromTs.activeDays,
      }).toEqual({
        name,
        current: summary.streakDays,
        longest: summary.longestStreakDays,
        activeDays: summary.activeDays,
      });
    }
  });
});

suite('CP2 — streak edge: a review stamped after "today" (ingest allows +5 min clock skew)', () => {
  it('DEFECT pinned: shipped SQL loses the streak when a skewed event lands on tomorrow; canonical TS ignores future days', async () => {
    const zone = 'Asia/Tehran';
    const asOf = new Date('2026-10-01T20:26:00Z'); // 23:56 local Oct 1; local midnight (20:30Z) is 4 minutes away
    const user = await newLearner();
    const card = await newCard();
    await review(user, card, 'remembered', new Date('2026-09-29T08:00:00Z'));
    await review(user, card, 'remembered', new Date('2026-09-30T08:00:00Z'));
    await review(user, card, 'remembered', new Date('2026-10-01T08:00:00Z')); // today (local Oct 1)
    await review(user, card, 'remembered', new Date('2026-10-01T20:31:00Z')); // +5 min skew: 00:01 local Oct 2
    const { rows } = await pool.query(
      `SELECT (occurred_at AT TIME ZONE $2)::date::text AS day FROM review_events WHERE user_id = $1`,
      [user, zone],
    );
    const today = localDayKey(asOf, zone);
    expect(today).toBe('2026-10-01');
    const canonical = computeStreak(
      rows.map((r) => r.day as string),
      today,
    );
    const shipped = await readLearnerSummary(pool, user, zone, asOf);
    expect(canonical.current).toBe(3);
    // The shipped query's run ends on a day after "today", so its BETWEEN filter drops the whole run.
    expect(shipped.streakDays).toBe(0);
  });
});

suite('CP2 — append-only history is untouched by every canonical read', () => {
  it('projects history without writing: the review_events fingerprint is unchanged', async () => {
    const user = await newLearner();
    const card = await newCard();
    for (const [i, grade] of (['forgot', 'hard', 'remembered', 'mastered'] as const).entries()) {
      await review(user, card, grade, new Date(Date.UTC(2026, 8, 5, 8, i)));
    }
    const before = await reviewEventsFingerprint(pool, user);
    await pool.query(`SELECT ${accuracyCountsSql('grade')} FROM review_events WHERE user_id = $1`, [
      user,
    ]);
    await pool.query(
      `SELECT ${boxCaseSql('stability_days')} FROM card_schedules WHERE user_id = $1`,
      [user],
    );
    await readLearnerSummary(pool, user, 'Asia/Tehran');
    expect(await reviewEventsFingerprint(pool, user)).toEqual(before);
    expect(before.count).toBe(4);
  });

  it('the stored answers remain the four historical grades (no rewrite to binary values)', async () => {
    const { rows } = await pool.query(`SELECT DISTINCT grade FROM review_events ORDER BY grade`);
    for (const row of rows) expect(REVIEW_GRADES).toContain(row.grade);
  });
});
