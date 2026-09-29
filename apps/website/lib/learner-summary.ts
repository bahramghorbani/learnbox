import type { Pool } from 'pg';

/**
 * Server-authoritative learning summary (LB-B11, CP-3).
 *
 * The database — specifically the append-only `review_events` history — is the
 * single source of truth for today's count, the current streak and history
 * totals. Device storage may cache these values for offline display, but must
 * never be the origin of them: a learner who signs in on a fresh device, or
 * re-logs in after clearing storage, must see exactly the same numbers.
 *
 * Days are bucketed in the LEARNER's timezone, not the server's. A learner in
 * Tehran finishing a review at 00:30 local time is on a new local day even though
 * it is still the previous day in UTC; bucketing in UTC would break streaks or
 * reset "today" at the wrong hour.
 */

export interface LearnerSummary {
  reviewedToday: number;
  streakDays: number;
  longestStreakDays: number;
  activeDays: number;
  totalReviews: number;
  timeZone: string;
}

const summarySql = `
WITH per_day AS (
  SELECT (occurred_at AT TIME ZONE $2)::date AS day, count(*) AS reviews
  FROM review_events
  WHERE user_id = $1
  GROUP BY 1
),
today AS (SELECT (($3::timestamptz) AT TIME ZONE $2)::date AS d),
numbered AS (
  SELECT day, day - (ROW_NUMBER() OVER (ORDER BY day))::int AS grp
  FROM per_day
),
runs AS (
  SELECT count(*) AS len, max(day) AS last_day
  FROM numbered
  GROUP BY grp
)
SELECT
  coalesce((SELECT reviews FROM per_day, today WHERE per_day.day = today.d), 0) AS reviewed_today,
  coalesce(
    (SELECT len FROM runs, today
      WHERE runs.last_day BETWEEN today.d - 1 AND today.d
      ORDER BY runs.last_day DESC LIMIT 1),
    0
  ) AS streak_days,
  coalesce((SELECT max(len) FROM runs), 0) AS longest_streak_days,
  (SELECT count(*) FROM per_day) AS active_days,
  coalesce((SELECT sum(reviews) FROM per_day), 0) AS total_reviews
`;

/** IANA zone name if the runtime recognises it, otherwise UTC. */
export function normalizeTimeZone(candidate: string | null | undefined): string {
  if (!candidate || candidate.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch {
    return 'UTC';
  }
}

async function run(pool: Pool, userId: string, timeZone: string, asOf: Date) {
  return pool.query(summarySql, [userId, timeZone, asOf.toISOString()]);
}

export async function readLearnerSummary(
  pool: Pool,
  userId: string,
  requestedTimeZone: string | null | undefined,
  asOf: Date = new Date(),
): Promise<LearnerSummary> {
  let timeZone = normalizeTimeZone(requestedTimeZone);
  let result;
  try {
    result = await run(pool, userId, timeZone, asOf);
  } catch (error) {
    // Postgres can reject a zone name the JS runtime accepts. Degrade to UTC
    // rather than failing the learner's whole home screen over a display detail.
    if ((error as { code?: string }).code !== '22023' || timeZone === 'UTC') throw error;
    timeZone = 'UTC';
    result = await run(pool, userId, timeZone, asOf);
  }
  const row = result.rows[0] ?? {};
  return {
    reviewedToday: Number(row.reviewed_today ?? 0),
    streakDays: Number(row.streak_days ?? 0),
    longestStreakDays: Number(row.longest_streak_days ?? 0),
    activeDays: Number(row.active_days ?? 0),
    totalReviews: Number(row.total_reviews ?? 0),
    timeZone,
  };
}
