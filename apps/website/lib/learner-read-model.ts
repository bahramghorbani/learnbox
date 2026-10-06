import {
  BOXES,
  accuracyCountsSql,
  addDaysToDayKey,
  answersProjectingTo,
  boxCaseSql,
  computeAccuracy,
  computeStreak,
  learnedPredicateSql,
  localDayKey,
  masteredPredicateSql,
  normalizeTimeZone,
  resolveLearnerTimeZone,
  summarizeBoxCounts,
  type Accuracy,
  type BoxCounts,
  type StreakSummary,
} from '@learnbox/learning-engine';
import type { Pool } from 'pg';

import { curriculumCteSql, packAccessSql } from './pack-access';

/**
 * Learner read model (LB-B35 CP3).
 *
 * The ONE place the learner-facing read paths (Today, Progress, Words, Profile, the summary
 * endpoint) obtain Box counts, Learned/Mastered, Accuracy, the local learning day and the streak.
 * Every rule comes from the canonical definitions in `@learnbox/learning-engine`; nothing here
 * decides what a Box, "learned" or a streak is. Route handlers only choose which of these values to
 * return, so two screens can no longer show different numbers for the same learner.
 *
 * Read-only: no statement here writes, and `review_events` is never modified.
 *
 * Curriculum scope (one definition for every screen): a card counts if it has a PUBLISHED version
 * and belongs to a pack THIS LEARNER MAY ACCESS, per the canonical rule in `./pack-access`. A
 * schedule row for a card outside that set (retired, in a draft pack, or in a paid pack the learner
 * is not entitled to) is not learner progress and is shown nowhere. The curriculum is therefore
 * per-learner, which is why every query here binds the learner id.
 */

const CURRICULUM_CTE = curriculumCteSql('$1');

export interface CurriculumProgress {
  /** Distinct cards in the curriculum (the denominator of every "x of y"). */
  total: number;
  /** Curriculum cards with a schedule row. */
  started: number;
  /** total - started. */
  new: number;
  /** started - learned (Box 1–3). */
  learning: number;
  /** Box 4+. */
  learned: number;
  /** Box 5. */
  mastered: number;
  boxes: BoxCounts;
}

export async function readCurriculumProgress(
  pool: Pick<Pool, 'query'>,
  userId: string,
): Promise<CurriculumProgress> {
  const result = await pool.query(
    `WITH ${CURRICULUM_CTE}
     SELECT (SELECT count(*) FROM curriculum) AS total,
            ${boxCaseSql('cs.stability_days')} AS box,
            count(*) AS cards
     FROM curriculum c
     JOIN card_schedules cs ON cs.card_id = c.card_id AND cs.user_id = $1
     GROUP BY 2`,
    [userId],
  );
  const counts = [0, 0, 0, 0, 0];
  for (const row of result.rows) {
    const index = Number(row.box) - 1;
    if (index >= 0 && index < BOXES.length) counts[index] = Number(row.cards);
  }
  const boxes = counts as unknown as BoxCounts;
  const summary = summarizeBoxCounts(boxes);
  let total = Number(result.rows[0]?.total ?? Number.NaN);
  if (Number.isNaN(total)) {
    // No scheduled card: the aggregate query returned no row, so ask for the curriculum size alone.
    const only = await pool.query(
      `WITH ${CURRICULUM_CTE} SELECT count(*) AS total FROM curriculum`,
      [userId],
    );
    total = Number(only.rows[0]?.total ?? 0);
  }
  return {
    total,
    started: summary.started,
    new: Math.max(0, total - summary.started),
    learning: summary.started - summary.learned,
    learned: summary.learned,
    mastered: summary.mastered,
    boxes,
  };
}

export interface PackProgress {
  id: string;
  name: string;
  isFree: boolean;
  priceTomans: number | null;
  totalCards: number;
  startedCards: number;
  learnedCards: number;
  masteredCards: number;
}

export async function readPackProgress(
  pool: Pick<Pool, 'query'>,
  userId: string,
): Promise<PackProgress[]> {
  const result = await pool.query(
    `SELECT p.id, p.display_name, p.is_free, p.price_tomans,
            count(DISTINCT pc.card_id) AS total_cards,
            count(DISTINCT cs.card_id) AS started_cards,
            count(DISTINCT cs.card_id) FILTER (WHERE ${learnedPredicateSql('cs.stability_days')}) AS learned_cards,
            count(DISTINCT cs.card_id) FILTER (WHERE ${masteredPredicateSql('cs.stability_days')}) AS mastered_cards
     FROM packs p
     JOIN pack_cards pc ON pc.pack_id = p.id
     JOIN card_versions cv ON cv.card_id = pc.card_id AND cv.status = 'published'
     LEFT JOIN card_schedules cs ON cs.card_id = pc.card_id AND cs.user_id = $1
     WHERE ${packAccessSql('p', '$1')}
     GROUP BY p.id, p.display_name, p.is_free, p.price_tomans, p.created_at
     ORDER BY p.created_at, p.id`,
    [userId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.display_name,
    isFree: row.is_free,
    priceTomans: row.price_tomans ?? null,
    totalCards: Number(row.total_cards),
    startedCards: Number(row.started_cards),
    learnedCards: Number(row.learned_cards),
    masteredCards: Number(row.mastered_cards),
  }));
}

/** Learned (Box 4+) cards per CEFR level; a card without a level is reported as `unknown`. */
export async function readLearnedByCefr(
  pool: Pick<Pool, 'query'>,
  userId: string,
): Promise<Array<{ level: string; count: number }>> {
  const result = await pool.query(
    `WITH ${CURRICULUM_CTE}
     SELECT COALESCE(NULLIF(cv.content_json->>'cefr', ''), 'unknown') AS level,
            count(DISTINCT cs.card_id) AS cards
     FROM card_schedules cs
     JOIN curriculum c ON c.card_id = cs.card_id
     JOIN card_versions cv ON cv.card_id = cs.card_id AND cv.status = 'published'
     WHERE cs.user_id = $1 AND ${learnedPredicateSql('cs.stability_days')}
     GROUP BY 1
     ORDER BY 1`,
    [userId],
  );
  return result.rows.map((row) => ({ level: row.level, count: Number(row.cards) }));
}

// ---------------------------------------------------------------------------------------------
// Activity: everything derived from the learner's local days
// ---------------------------------------------------------------------------------------------

export interface DayActivity {
  /** `YYYY-MM-DD` in the learner's zone. */
  day: string;
  reviews: number;
  known: number;
  unknown: number;
}

export interface LearnerActivity {
  timeZone: string;
  /** The learner's local "today" as `YYYY-MM-DD`. */
  today: string;
  days: DayActivity[];
  totalReviews: number;
  reviewedToday: number;
  accuracyToday: Accuracy;
  accuracyAllTime: Accuracy;
  streak: StreakSummary;
  bestDay: { day: string; reviews: number } | null;
  firstReviewAt: Date | null;
}

async function queryActivityDays(
  pool: Pick<Pool, 'query'>,
  userId: string,
  timeZone: string,
): Promise<DayActivity[]> {
  const result = await pool.query(
    `SELECT ((occurred_at AT TIME ZONE $2)::date)::text AS day,
            count(*) AS reviews,
            ${accuracyCountsSql('grade')}
     FROM review_events
     WHERE user_id = $1
     GROUP BY 1
     ORDER BY 1`,
    [userId, timeZone],
  );
  return result.rows.map((row) => ({
    day: row.day,
    reviews: Number(row.reviews),
    known: Number(row.known),
    unknown: Number(row.unknown),
  }));
}

/**
 * `LEARNBOX_TZ_PERSIST` (default off): the account's stored zone is authoritative, and a NULL one is
 * filled once from the first valid zone the device reports. Off = the request zone only, exactly as
 * v1.2.1, and the `users.timezone` column is never touched (so the code also runs before migration 0023).
 */
export const timeZonePersistenceEnabled = (
  environment: Record<string, string | undefined> = process.env,
) => environment.LEARNBOX_TZ_PERSIST === 'true';

async function resolveZone(
  pool: Pick<Pool, 'query'>,
  userId: string,
  requested: string | null | undefined,
): Promise<string> {
  if (!timeZonePersistenceEnabled()) return normalizeTimeZone(requested);
  const row = await pool.query('SELECT timezone FROM users WHERE id = $1', [userId]);
  const resolved = resolveLearnerTimeZone(row.rows[0]?.timezone ?? null, requested);
  if (resolved.persist) {
    // Fill-once: never overwrite a zone another request stored first.
    await pool.query('UPDATE users SET timezone = $2 WHERE id = $1 AND timezone IS NULL', [
      userId,
      resolved.persist,
    ]);
  }
  return resolved.timeZone;
}

/**
 * Days are bucketed in the learner's IANA zone. A zone the JS runtime accepts but Postgres rejects
 * (SQLSTATE 22023) degrades to UTC rather than failing the whole screen over a display detail.
 */
export async function readLearnerActivity(
  pool: Pick<Pool, 'query'>,
  userId: string,
  requestedTimeZone: string | null | undefined,
  asOf: Date = new Date(),
): Promise<LearnerActivity> {
  let timeZone = await resolveZone(pool, userId, requestedTimeZone);
  let days: DayActivity[];
  try {
    days = await queryActivityDays(pool, userId, timeZone);
  } catch (error) {
    if ((error as { code?: string }).code !== '22023' || timeZone === 'UTC') throw error;
    timeZone = 'UTC';
    days = await queryActivityDays(pool, userId, timeZone);
  }

  const today = localDayKey(asOf, timeZone);
  const totals = days.reduce(
    (sum, day) => ({
      reviews: sum.reviews + day.reviews,
      known: sum.known + day.known,
      unknown: sum.unknown + day.unknown,
    }),
    { reviews: 0, known: 0, unknown: 0 },
  );
  const todayRow = days.find((day) => day.day === today);

  // Best day: most reviews; ties resolved to the EARLIEST such day so the answer never flaps.
  // A clock-skewed review on a day after "today" is not yet a learning day and is ignored here,
  // exactly as it is for the streak.
  let bestDay: LearnerActivity['bestDay'] = null;
  for (const day of days) {
    if (day.day > today) continue;
    if (!bestDay || day.reviews > bestDay.reviews) bestDay = { day: day.day, reviews: day.reviews };
  }

  const first = await pool.query(
    'SELECT min(occurred_at) AS first_at FROM review_events WHERE user_id = $1',
    [userId],
  );

  return {
    timeZone,
    today,
    days,
    totalReviews: totals.reviews,
    reviewedToday: todayRow?.reviews ?? 0,
    accuracyToday: computeAccuracy({
      known: todayRow?.known ?? 0,
      unknown: todayRow?.unknown ?? 0,
    }),
    accuracyAllTime: computeAccuracy({ known: totals.known, unknown: totals.unknown }),
    streak: computeStreak(
      days.map((day) => day.day),
      today,
    ),
    bestDay,
    firstReviewAt: first.rows[0]?.first_at ?? null,
  };
}

/** The last `count` local days ending today (oldest first), zero-filled. */
export function recentDays(
  activity: LearnerActivity,
  count: number,
): Array<{ day: string; reviews: number }> {
  const byDay = new Map(activity.days.map((day) => [day.day, day.reviews]));
  return Array.from({ length: count }, (_, index) => {
    const day = addDaysToDayKey(activity.today, index - (count - 1));
    return { day, reviews: byDay.get(day) ?? 0 };
  });
}

/** Whole-number average of reviews per ACTIVE day over the last 30 local days (0 if none). */
export function dailyAverageOverActiveDays(activity: LearnerActivity): number {
  const active = recentDays(activity, 30).filter((day) => day.reviews > 0);
  if (active.length === 0) return 0;
  return Math.round(active.reduce((sum, day) => sum + day.reviews, 0) / active.length);
}

/** Day of week of a `YYYY-MM-DD` key: 0 = Sunday … 6 = Saturday (calendar arithmetic, no zone). */
export function dayOfWeekOfKey(key: string): number {
  return new Date(`${key}T12:00:00Z`).getUTCDay();
}

/** Reviews by LOCAL hour of day, for the study-pattern view. */
export async function readReviewHours(
  pool: Pick<Pool, 'query'>,
  userId: string,
  timeZone: string,
): Promise<Array<{ hour: number; reviews: number }>> {
  const result = await pool.query(
    `SELECT extract(hour FROM occurred_at AT TIME ZONE $2)::int AS hour, count(*) AS reviews
     FROM review_events
     WHERE user_id = $1
     GROUP BY 1
     ORDER BY 1`,
    [userId, timeZone],
  );
  return result.rows.map((row) => ({ hour: Number(row.hour), reviews: Number(row.reviews) }));
}

/** SQL fragment: number of historical answers that project to Unknown (used for per-card counts). */
export const unknownGradesSql = answersProjectingTo('unknown')
  .map((grade) => `'${grade.replace(/'/g, "''")}'`)
  .join(', ');
