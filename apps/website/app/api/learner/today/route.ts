import { Pool } from 'pg';
import { authenticateLearner } from '../../../../lib/learner-auth';
import {
  dayOfWeekOfKey,
  readCurriculumProgress,
  readLearnerActivity,
  recentDays,
} from '../../../../lib/learner-read-model';
import {
  countUnseenCatalogCards,
  readTodayWorkload,
  todayWorkloadEnabled,
} from '../../../../lib/learner-workload';
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
    // 0. Everything that depends on the learning day (today's count, Accuracy, the week, the
    // streak) comes from ONE read of the learner's history in the learner's own time zone
    // (LB-B35 CP3). Progress, Profile and the summary endpoint read the same model.
    const activity = await readLearnerActivity(
      pool,
      userId,
      new URL(request.url).searchParams.get('tz'),
    );
    const reviewedToday = activity.reviewedToday;
    const correctToday = activity.accuracyToday.known;
    // Canonical Accuracy: known answers (hard/remembered/mastered) over all answers. null = no
    // answer yet; the wire format keeps a number for older clients, which render "—" at 0 reviews.
    const accuracyPercent = activity.accuracyToday.percent ?? 0;
    const lastToday = await pool.query(
      `SELECT MAX(occurred_at) AS last_review_at
       FROM review_events
       WHERE user_id = $1
         AND (occurred_at AT TIME ZONE $2)::date = $3::date`,
      [userId, activity.timeZone, activity.today],
    );
    const lastReviewAt = lastToday.rows[0]?.last_review_at ?? null;

    // 2. Cards due for review (today or overdue)
    const dueCards = await pool.query(
      `SELECT COUNT(*) as due_count
       FROM card_schedules
       WHERE user_id = $1 AND due_at <= NOW()`,
      [userId],
    );
    const dueCount = parseInt(dueCards.rows[0]?.due_count ?? '0', 10);

    // 3. Workload. v1.2.1 (flag off): `newCount` = every unseen published card and
    // `totalTodayCards` = due + that, which is a catalogue size, not the learner's work for today.
    // LB-B35 CP5-A (LEARNBOX_TODAY_WORKLOAD): both are derived from the real session plan.
    const workloadOn = todayWorkloadEnabled(process.env);
    const workload = workloadOn
      ? await readTodayWorkload(pool, userId, {
          requestedTimeZone: new URL(request.url).searchParams.get('tz'),
        })
      : null;
    const newCount = workload
      ? workload.newCardsToday
      : await countUnseenCatalogCards(pool, userId);
    const totalTodayCards = workload ? workload.cardsForToday : dueCount + newCount;

    // 4. Leitner box counts: the same curriculum-scoped canonical projection as every screen.
    const progress = await readCurriculumProgress(pool, userId);
    const boxes = [...progress.boxes];

    // 5. The last 7 local days (oldest first), each marked active if it holds any review.
    const persianDayNames = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];
    const weekDays = recentDays(activity, 7).map(({ day, reviews }) => ({
      day: persianDayNames[dayOfWeekOfKey(day)],
      active: reviews > 0,
    }));

    const streakDays = activity.streak.current;

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
    const totalReviews = activity.totalReviews;
    const longestStreak = activity.streak.longest;

    return Response.json(
      {
        reviewedToday,
        correctToday,
        accuracyPercent,
        // Study time is not measured anywhere (review events carry no duration), so it is
        // reported as unavailable, never estimated.
        studyMinutesToday: null,
        totalTodayCards,
        dueCount,
        newCount,
        ...(workload
          ? {
              cardsForToday: workload.cardsForToday,
              reviewCardsToday: workload.reviewCardsToday,
              newCardsToday: workload.newCardsToday,
              planMode: workload.planMode,
              unseenCatalogCount: workload.unseenCatalogCount,
            }
          : {}),
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
