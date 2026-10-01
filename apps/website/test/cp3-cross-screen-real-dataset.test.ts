import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

/**
 * LB-B35 CP3 — cross-screen values on a RESTORED REAL dataset.
 *
 * Read-only. Calls the real Today / Progress / Words / Profile-stats route handlers for every
 * learner in a restored production backup and writes one JSON document of the values each screen
 * shows, so the same numbers can be compared before and after a change. Learners are identified by
 * ordinal only; no id, phone or name is written.
 *
 * Skipped unless LB_REAL_DB_URL is set:
 *   LB_REAL_DB_URL=postgres://postgres:t@localhost:55453/lbreal LB_OUT=/tmp/before.json \
 *     pnpm --filter @learnbox/website exec vitest run test/cp3-cross-screen-real-dataset.test.ts
 *
 * It also records the review_events fingerprint so a run can prove history was not touched.
 */
const h = vi.hoisted(() => ({
  shared: null as null | { query: (...args: unknown[]) => Promise<{ rows: unknown[] }> },
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

const url = process.env.LB_REAL_DB_URL;
const out = process.env.LB_OUT;
const zone = process.env.LB_TZ ?? 'Asia/Tehran';

const call = async (route: (r: Request) => Promise<Response>, path: string) => {
  const res = await route(new Request(`http://localhost${path}`));
  return (await res.json()) as Record<string, unknown>;
};

describe.skipIf(!url)('CP3 cross-screen values on the restored real dataset', () => {
  it('records what every screen shows, per learner', async () => {
    const { Pool } = await vi.importActual<typeof import('pg')>('pg');
    const pool = new Pool({ connectionString: url });
    h.shared = pool as never;
    try {
      const users = (
        await pool.query<{ id: string }>(
          `SELECT u.id FROM users u ORDER BY (SELECT count(*) FROM review_events r WHERE r.user_id = u.id) DESC, u.created_at`,
        )
      ).rows;
      const fingerprint = (
        await pool.query(
          `SELECT count(*)::int AS n, md5(string_agg(id::text || grade || occurred_at::text, ',' ORDER BY id)) AS md5 FROM review_events`,
        )
      ).rows[0];

      const learners: unknown[] = [];
      for (const [index, user] of users.entries()) {
        h.session = { subject: user.id };
        const today = await call(todayRoute, `/api/learner/today?tz=${encodeURIComponent(zone)}`);
        const progress = await call(
          progressRoute,
          `/api/learner/progress?tz=${encodeURIComponent(zone)}`,
        );
        const words = await call(wordsRoute, '/api/learner/words');
        const stats = await call(
          statsRoute,
          `/api/learner/profile/stats?tz=${encodeURIComponent(zone)}`,
        );
        const p = progress as Record<string, Record<string, unknown>>;
        const s = stats as Record<string, Record<string, unknown>>;
        const w = words as { summary: Record<string, number> };
        learners.push({
          learner: index + 1,
          today: {
            reviewedToday: today.reviewedToday,
            correctToday: today.correctToday,
            accuracyPercent: today.accuracyPercent,
            studyMinutesToday: today.studyMinutesToday,
            streakDays: today.streakDays,
            longestStreak: today.longestStreak,
            leitnerBoxes: today.leitnerBoxes,
            weekDays: today.weekDays,
            totalReviews: today.totalReviews,
          },
          progress: {
            leitnerBoxes: p.leitnerBoxes,
            cardStates: p.cardStates,
            streak: p.streak,
            totals: p.totals,
            packs: progress.packs,
            cefr: progress.cefr,
            weeklyActivity: progress.weeklyActivity,
          },
          words: { summary: w.summary },
          profileStats: {
            stats: s.stats,
            packs: stats.packs,
            cefrDistribution: stats.cefrDistribution,
            weeklyActivity: stats.weeklyActivity,
          },
        });
      }
      const document = { zone, reviewEventsFingerprint: fingerprint, learners };
      if (out) {
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
      }
      expect(learners.length).toBeGreaterThan(0);
    } finally {
      await pool.end();
    }
  }, 60_000);
});
