import { Pool } from 'pg';
import { authenticateLearner } from '../../../../lib/learner-auth';
import { requireVerifiedDatabaseTls } from '../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return new Pool({ connectionString: requireVerifiedDatabaseTls(url), max: 1 });
}

export async function GET(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  const userId = session?.subject ?? null;
  if (!userId) {
    return Response.json(
      { error: 'unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const pool = getPool();
  try {
    // 1. Leitner box distribution
    const boxDist = await pool.query(
      `SELECT
        count(*) FILTER (WHERE stability_days < 1) as box1,
        count(*) FILTER (WHERE stability_days >= 1 AND stability_days < 3) as box2,
        count(*) FILTER (WHERE stability_days >= 3 AND stability_days < 7) as box3,
        count(*) FILTER (WHERE stability_days >= 7 AND stability_days < 21) as box4,
        count(*) FILTER (WHERE stability_days >= 21) as box5
      FROM card_schedules WHERE user_id = $1`,
      [userId],
    );

    // 2. Card state distribution
    const stateDist = await pool.query(
      `SELECT
        count(*) FILTER (WHERE state = 'new') as new_count,
        count(*) FILTER (WHERE state = 'learning' OR state = 'relearning') as learning_count,
        count(*) FILTER (WHERE state = 'review') as review_count,
        count(*) FILTER (WHERE state = 'mastered') as mastered_count,
        count(*) as total
      FROM card_schedules WHERE user_id = $1`,
      [userId],
    );

    // 3. Weekly activity (7 days)
    const weeklyActivity = await pool.query(
      `SELECT
        date_trunc('day', occurred_at)::date as day,
        count(*) as reviews
      FROM review_events
      WHERE user_id = $1 AND occurred_at >= now() - interval '7 days'
      GROUP BY date_trunc('day', occurred_at)::date
      ORDER BY day`,
      [userId],
    );

    // 4. Monthly activity (30 days)
    const monthlyActivity = await pool.query(
      `SELECT
        date_trunc('day', occurred_at)::date as day,
        count(*) as reviews
      FROM review_events
      WHERE user_id = $1 AND occurred_at >= now() - interval '30 days'
      GROUP BY date_trunc('day', occurred_at)::date
      ORDER BY day`,
      [userId],
    );

    // 5. Study pattern - hour of day
    const hourPattern = await pool.query(
      `SELECT
        extract(hour FROM occurred_at) as hour,
        count(*) as reviews
      FROM review_events WHERE user_id = $1
      GROUP BY extract(hour FROM occurred_at)
      ORDER BY hour`,
      [userId],
    );

    // 6. Study pattern - day of week
    const dayPattern = await pool.query(
      `SELECT
        extract(dow FROM occurred_at) as dow,
        count(*) as reviews
      FROM review_events WHERE user_id = $1
      GROUP BY extract(dow FROM occurred_at)
      ORDER BY reviews DESC`,
      [userId],
    );

    // 7. Streak + records
    const streakResult = await pool.query(
      `WITH daily AS (
        SELECT DISTINCT date_trunc('day', occurred_at)::date as day
        FROM review_events WHERE user_id = $1
      ),
      numbered AS (
        SELECT day, day - (ROW_NUMBER() OVER (ORDER BY day))::int as grp
        FROM daily
      ),
      streaks AS (
        SELECT grp, count(*) as streak_length, max(day) as last_day
        FROM numbered GROUP BY grp
      )
      SELECT streak_length, last_day FROM streaks
      ORDER BY last_day DESC LIMIT 1`,
      [userId],
    );
    const currentStreak = streakResult.rows[0];
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const lastDay = currentStreak?.last_day?.toISOString?.()?.split?.('T')?.[0] ?? '';
    const streakDays =
      lastDay === today || lastDay === yesterday ? Number(currentStreak?.streak_length ?? 0) : 0;

    const longestStreak = await pool.query(
      `WITH daily AS (
        SELECT DISTINCT date_trunc('day', occurred_at)::date as day
        FROM review_events WHERE user_id = $1
      ),
      numbered AS (
        SELECT day, day - (ROW_NUMBER() OVER (ORDER BY day))::int as grp
        FROM daily
      ),
      streaks AS (
        SELECT count(*) as streak_length FROM numbered GROUP BY grp
      )
      SELECT max(streak_length) as longest FROM streaks`,
      [userId],
    );

    // 8. Best day
    const bestDay = await pool.query(
      `SELECT date_trunc('day', occurred_at)::date as day, count(*) as reviews
      FROM review_events WHERE user_id = $1
      GROUP BY date_trunc('day', occurred_at)::date
      ORDER BY reviews DESC LIMIT 1`,
      [userId],
    );

    // 9. Total reviews + today's reviews
    const totalReviews = await pool.query(
      'SELECT count(*) as total FROM review_events WHERE user_id = $1',
      [userId],
    );
    const todayReviews = await pool.query(
      `SELECT count(*) as today FROM review_events
       WHERE user_id = $1 AND occurred_at >= date_trunc('day', now())`,
      [userId],
    );

    // 10. First review date
    const firstReview = await pool.query(
      'SELECT min(occurred_at) as first FROM review_events WHERE user_id = $1',
      [userId],
    );

    // 11. Pack progress
    const packs = await pool.query(
      `SELECT p.id, p.display_name,
        count(pc.card_id) as total_cards,
        count(cs.card_id) FILTER (WHERE cs.state IS NOT NULL) as started_cards,
        count(cs.card_id) FILTER (WHERE cs.state IN ('review','mastered')) as learned_cards
      FROM packs p
      JOIN pack_cards pc ON pc.pack_id = p.id
      LEFT JOIN card_schedules cs ON cs.card_id = pc.card_id AND cs.user_id = $1
      WHERE p.status = 'published'
      GROUP BY p.id, p.display_name
      ORDER BY p.created_at`,
      [userId],
    );

    // 12. CEFR
    const cefr = await pool.query(
      `SELECT cv.content_json->>'cefr' as cefr_level, count(*) as count
      FROM card_schedules cs
      JOIN card_versions cv ON cv.card_id = cs.card_id AND cv.status = 'published'
      WHERE cs.user_id = $1 AND cs.state IN ('review','mastered')
      GROUP BY cv.content_json->>'cefr'
      ORDER BY cefr_level`,
      [userId],
    );

    // 13. Daily average (last 30 days with activity)
    const dailyAvg = await pool.query(
      `SELECT round(avg(cnt)) as avg_daily FROM (
        SELECT count(*) as cnt FROM review_events
        WHERE user_id = $1 AND occurred_at >= now() - interval '30 days'
        GROUP BY date_trunc('day', occurred_at)::date
      ) sub`,
      [userId],
    );

    const dowNames = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
    const boxes = boxDist.rows[0];
    const states = stateDist.rows[0];

    return Response.json(
      {
        leitnerBoxes: {
          box1: Number(boxes.box1),
          box2: Number(boxes.box2),
          box3: Number(boxes.box3),
          box4: Number(boxes.box4),
          box5: Number(boxes.box5),
        },
        cardStates: {
          new: Number(states.new_count),
          learning: Number(states.learning_count),
          review: Number(states.review_count),
          mastered: Number(states.mastered_count),
          total: Number(states.total),
        },
        weeklyActivity: weeklyActivity.rows.map((r) => ({
          day: r.day,
          reviews: Number(r.reviews),
        })),
        monthlyActivity: monthlyActivity.rows.map((r) => ({
          day: r.day,
          reviews: Number(r.reviews),
        })),
        studyPattern: {
          bestHour:
            hourPattern.rows.length > 0
              ? Number(
                  hourPattern.rows.sort((a, b) => Number(b.reviews) - Number(a.reviews))[0].hour,
                )
              : null,
          bestDay: dayPattern.rows.length > 0 ? dowNames[Number(dayPattern.rows[0].dow)] : null,
          hourDistribution: hourPattern.rows.map((r) => ({
            hour: Number(r.hour),
            reviews: Number(r.reviews),
          })),
        },
        streak: {
          current: streakDays,
          longest: Number(longestStreak.rows[0]?.longest ?? 0),
          bestDayReviews: Number(bestDay.rows[0]?.reviews ?? 0),
          bestDayDate: bestDay.rows[0]?.day ?? null,
        },
        totals: {
          reviews: Number(totalReviews.rows[0].total),
          todayReviews: Number(todayReviews.rows[0].today),
          dailyAverage: Number(dailyAvg.rows[0]?.avg_daily ?? 0),
          firstReviewDate: firstReview.rows[0]?.first ?? null,
        },
        packs: packs.rows.map((p) => ({
          id: p.id,
          name: p.display_name,
          totalCards: Number(p.total_cards),
          startedCards: Number(p.started_cards),
          learnedCards: Number(p.learned_cards),
        })),
        cefr: cefr.rows.map((r) => ({
          level: r.cefr_level,
          count: Number(r.count),
        })),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('[learner/progress] failed:', error);
    return Response.json(
      { error: 'server_error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  } finally {
    await pool.end();
  }
}
