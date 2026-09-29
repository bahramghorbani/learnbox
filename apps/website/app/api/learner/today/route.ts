import { Pool } from 'pg';
import { authenticateLearner } from '../../../../lib/learner-auth';
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
    // 1. Today's reviews
    const todayStats = await pool.query(
      `SELECT
         COUNT(*) as reviewed_today,
         COUNT(*) FILTER (WHERE grade = 'remembered') as correct_today,
         MAX(occurred_at) as last_review_at
       FROM review_events
       WHERE user_id = $1 AND occurred_at::date = CURRENT_DATE`,
      [userId],
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
      `SELECT occurred_at::date as day, COUNT(*) as cnt
       FROM review_events
       WHERE user_id = $1 AND occurred_at >= CURRENT_DATE - INTERVAL '6 days'
       GROUP BY day
       ORDER BY day`,
      [userId],
    );
    const weekDays: { day: string; active: boolean }[] = [];
    const persianDayNames = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];
    const activeDays = new Set(
      weeklyActivity.rows.map((r: { day: string }) => new Date(r.day).toISOString().split('T')[0]),
    );
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const dow = d.getDay();
      weekDays.push({
        day: persianDayNames[dow],
        active: activeDays.has(key),
      });
    }

    // Calculate streak
    let streakDays = 0;
    const allActivity = await pool.query(
      `SELECT DISTINCT occurred_at::date as day
       FROM review_events
       WHERE user_id = $1
       ORDER BY day DESC`,
      [userId],
    );
    if (allActivity.rows.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dates = allActivity.rows.map((r: { day: string }) => {
        const d = new Date(r.day);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      });
      // Check if today or yesterday is active (streak can continue)
      const todayMs = today.getTime();
      const yesterdayMs = todayMs - 86400000;
      if (dates.includes(todayMs) || dates.includes(yesterdayMs)) {
        let checkDate = dates.includes(todayMs) ? todayMs : yesterdayMs;
        while (dates.includes(checkDate)) {
          streakDays++;
          checkDate -= 86400000;
        }
      }
    }

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

    // 9. Longest streak
    let longestStreak = streakDays;
    if (allActivity.rows.length > 1) {
      let currentRun = 1;
      const sortedDates = allActivity.rows
        .map((r: { day: string }) => new Date(r.day).getTime())
        .sort((a: number, b: number) => a - b);
      for (let i = 1; i < sortedDates.length; i++) {
        if (sortedDates[i] - sortedDates[i - 1] === 86400000) {
          currentRun++;
          longestStreak = Math.max(longestStreak, currentRun);
        } else {
          currentRun = 1;
        }
      }
    }

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
