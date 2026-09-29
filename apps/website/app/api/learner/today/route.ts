import { Pool } from 'pg';
import { authenticateLearner } from '../../../../lib/learner-auth';
import { readLearnerSummary } from '../../../../lib/learner-summary';
import { requireVerifiedDatabaseTls } from '../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return new Pool({ connectionString: requireVerifiedDatabaseTls(url), max: 1 });
}

/**
 * GET /api/learner/today
 * Returns all data needed for the Today screen:
 * - daily goal progress
 * - leitner box counts
 * - weekly streak
 * - quick stats
 * - due soon cards
 * - last activity
 */
export async function GET(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  if (!session) {
    return Response.json(
      { error: 'unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const userId = session.subject;
  const pool = getPool();

  try {
    // 0. Authoritative count/streak, bucketed in the LEARNER's timezone. Every
    // surface (Today, Profile, home header) derives these from this one function,
    // so they can never disagree with each other or with another device.
    const summary = await readLearnerSummary(
      pool,
      userId,
      new URL(request.url).searchParams.get('tz'),
    );

    // 1. Today's reviews (same learner-local day as the summary above)
    const todayStats = await pool.query(
      `SELECT
         COUNT(*) as reviewed_today,
         COUNT(*) FILTER (WHERE grade = 'remembered') as correct_today,
         MAX(occurred_at) as last_review_at
       FROM review_events
       WHERE user_id = $1
         AND (occurred_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date`,
      [userId, summary.timeZone],
    );

    const reviewedToday = parseInt(todayStats.rows[0]?.reviewed_today ?? '0', 10);
    const correctToday = parseInt(todayStats.rows[0]?.correct_today ?? '0', 10);
    const lastReviewAt = todayStats.rows[0]?.last_review_at ?? null;

    const accuracyPercent =
      reviewedToday > 0 ? Math.round((correctToday / reviewedToday) * 100) : 0;

    // 2. Cards due for review (today or overdue)
    const dueCards = await pool.query(
      `SELECT COUNT(*) as due_count
       FROM card_schedules
       WHERE user_id = $1 AND due_at <= NOW()`,
      [userId],
    );
    const dueCount = parseInt(dueCards.rows[0]?.due_count ?? '0', 10);

    // 3. New cards (published but no schedule yet)
    const newCards = await pool.query(
      `SELECT COUNT(*) as new_count
       FROM card_versions cv
       JOIN pack_cards pc ON pc.card_id = cv.card_id
       WHERE cv.status = 'published'
         AND NOT EXISTS (
           SELECT 1 FROM card_schedules cs
           WHERE cs.card_id = cv.card_id AND cs.user_id = $1
         )`,
      [userId],
    );
    const newCount = parseInt(newCards.rows[0]?.new_count ?? '0', 10);

    // Total cards to review today = due + new (capped at daily goal)
    const totalTodayCards = dueCount + newCount;

    // 4. Leitner box counts
    const leitnerBoxes = await pool.query(
      `SELECT
         CASE
           WHEN stability_days < 1 THEN 1
           WHEN stability_days < 3 THEN 2
           WHEN stability_days < 7 THEN 3
           WHEN stability_days < 21 THEN 4
           ELSE 5
         END as box,
         COUNT(*) as cnt
       FROM card_schedules
       WHERE user_id = $1
       GROUP BY box
       ORDER BY box`,
      [userId],
    );
    const boxes = [0, 0, 0, 0, 0];
    for (const row of leitnerBoxes.rows) {
      const idx = parseInt(row.box, 10) - 1;
      if (idx >= 0 && idx < 5) boxes[idx] = parseInt(row.cnt, 10);
    }

    // 5. Weekly streak (last 7 days)
    const weeklyActivity = await pool.query(
      `SELECT (occurred_at AT TIME ZONE $2)::date as day, COUNT(*) as cnt
       FROM review_events
       WHERE user_id = $1
         AND (occurred_at AT TIME ZONE $2)::date >= (now() AT TIME ZONE $2)::date - 6
       GROUP BY day
       ORDER BY day`,
      [userId, summary.timeZone],
    );
    const weekDays: { day: string; active: boolean }[] = [];
    const persianDayNames = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];
    // Calendar days as plain YYYY-MM-DD in the learner's zone; no server-clock or
    // UTC conversion, which would shift the day for learners east of UTC.
    const localDay = (offsetDays: number) => {
      const key = new Intl.DateTimeFormat('en-CA', {
        timeZone: summary.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(Date.now() - offsetDays * 86_400_000));
      return { key, dow: new Date(`${key}T12:00:00Z`).getUTCDay() };
    };
    const ymd = (value: unknown) =>
      value instanceof Date
        ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
        : String(value).slice(0, 10);
    const activeDays = new Set(weeklyActivity.rows.map((r: { day: unknown }) => ymd(r.day)));
    for (let i = 6; i >= 0; i--) {
      const { key, dow } = localDay(i);
      weekDays.push({
        day: persianDayNames[dow],
        active: activeDays.has(key),
      });
    }

    const streakDays = summary.streakDays;

    // 6. Due soon cards (top 3 closest to forgetting)
    const dueSoon = await pool.query(
      `SELECT cv.card_id, cv.content_json, cs.due_at, cs.stability_days
       FROM card_schedules cs
       JOIN card_versions cv ON cv.card_id = cs.card_id AND cv.status = 'published'
       WHERE cs.user_id = $1 AND cs.due_at <= NOW() + INTERVAL '1 day'
       ORDER BY cs.due_at ASC
       LIMIT 3`,
      [userId],
    );
    const dueSoonCards = dueSoon.rows.map(
      (r: {
        card_id: string;
        content_json: { lemma?: string; article?: string; persianMeanings?: string[] };
        due_at: string;
      }) => {
        const c = r.content_json ?? {};
        const article = c.article ?? '';
        const lemma = c.lemma ?? '';
        return {
          cardId: r.card_id,
          german: article ? `${article} ${lemma}` : lemma,
          persian: (c.persianMeanings ?? [])[0] ?? '',
          dueAt: r.due_at,
        };
      },
    );

    // 7. Days since last activity (for smart recovery)
    let daysSinceLastActivity = 0;
    if (lastReviewAt) {
      daysSinceLastActivity = 0; // Active today
    } else {
      const lastEver = await pool.query(
        `SELECT MAX(occurred_at) as last_at FROM review_events WHERE user_id = $1`,
        [userId],
      );
      if (lastEver.rows[0]?.last_at) {
        const diff = Date.now() - new Date(lastEver.rows[0].last_at).getTime();
        daysSinceLastActivity = Math.floor(diff / 86400000);
      } else {
        daysSinceLastActivity = -1; // Never reviewed
      }
    }

    // 8. Total stats (all time)
    const totalStats = await pool.query(
      `SELECT COUNT(*) as total_reviews FROM review_events WHERE user_id = $1`,
      [userId],
    );
    const totalReviews = parseInt(totalStats.rows[0]?.total_reviews ?? '0', 10);

    const longestStreak = summary.longestStreakDays;

    return Response.json(
      {
        reviewedToday,
        correctToday,
        accuracyPercent,
        studyMinutesToday: null, // Duration is not measured by the review-event schema.
        totalTodayCards,
        dueCount,
        newCount,
        dailyGoal: null, // No persisted per-learner goal exists yet.
        leitnerBoxes: boxes,
        weekDays,
        streakDays,
        longestStreak,
        dueSoonCards,
        daysSinceLastActivity,
        lastReviewAt,
        totalReviews,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err) {
    console.error('[today] API error:', err);
    return Response.json(
      { error: 'internal_error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  } finally {
    await pool.end();
  }
}
