import { Pool } from 'pg';
import { readLearnerSession } from '../../../../../lib/server-session';
import { requireVerifiedDatabaseTls } from '../../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return new Pool({ connectionString: requireVerifiedDatabaseTls(url) });
}

export async function GET(request: Request): Promise<Response> {
  const session = readLearnerSession(request);
  const userId = session?.subject ?? null;
  if (!userId) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: privateHeaders });
  }

  const pool = getPool();
  try {
    // User info
    const userResult = await pool.query(
      'SELECT first_name, phone_e164, created_at FROM users WHERE id = $1',
      [userId],
    );
    const user = userResult.rows[0];
    if (!user) {
      return Response.json({ error: 'user_not_found' }, { status: 404, headers: privateHeaders });
    }

    // Card stats by state
    const cardStats = await pool.query(
      `SELECT 
        count(*) FILTER (WHERE state = 'new') as new_cards,
        count(*) FILTER (WHERE state = 'learning') as learning_cards,
        count(*) FILTER (WHERE state = 'review') as learned_cards,
        count(*) as total_cards
      FROM card_schedules WHERE user_id = $1`,
      [userId],
    );

    // Total reviews
    const reviewCount = await pool.query(
      'SELECT count(*) as total FROM review_events WHERE user_id = $1',
      [userId],
    );

    // Weekly activity (last 7 days)
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

    // Streak calculation
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

    // Best day ever
    const bestDay = await pool.query(
      `SELECT date_trunc('day', occurred_at)::date as day, count(*) as reviews
      FROM review_events WHERE user_id = $1
      GROUP BY date_trunc('day', occurred_at)::date
      ORDER BY reviews DESC LIMIT 1`,
      [userId],
    );

    // Longest streak ever
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

    // Packs with progress
    const packs = await pool.query(
      `SELECT p.id, p.display_name, p.is_free, p.price_tomans, p.target_item_count,
        count(cs.card_id) FILTER (WHERE cs.state IS NOT NULL) as started_cards,
        count(cs.card_id) FILTER (WHERE cs.state = 'review') as learned_cards,
        count(pc.card_id) as total_cards
      FROM packs p
      JOIN pack_cards pc ON pc.pack_id = p.id
      LEFT JOIN card_schedules cs ON cs.card_id = pc.card_id AND cs.user_id = $1
      WHERE p.status = 'published'
      GROUP BY p.id, p.display_name, p.is_free, p.price_tomans, p.target_item_count
      ORDER BY p.created_at`,
      [userId],
    );

    // CEFR level estimation
    const cefrDistribution = await pool.query(
      `SELECT cv.cefr_level, count(*) as count
      FROM card_schedules cs
      JOIN card_versions cv ON cv.card_id = cs.card_id AND cv.status = 'published'
      WHERE cs.user_id = $1 AND cs.state = 'review'
      GROUP BY cv.cefr_level
      ORDER BY cv.cefr_level`,
      [userId],
    );

    // Mask phone
    const phone = user.phone_e164 as string;
    const phoneMatch = /^\+989(\d{2})\d{3}(\d{4})$/.exec(phone);
    const maskedPhone = phoneMatch ? `۰۹${phoneMatch[1]}****${phoneMatch[2]}` : null;

    const stats = cardStats.rows[0];

    return Response.json(
      {
        profile: {
          firstName: user.first_name,
          maskedPhone,
          createdAt: user.created_at,
        },
        stats: {
          newCards: Number(stats.new_cards),
          learningCards: Number(stats.learning_cards),
          learnedCards: Number(stats.learned_cards),
          totalCards: Number(stats.total_cards),
          totalReviews: Number(reviewCount.rows[0].total),
          streakDays,
          longestStreak: Number(longestStreak.rows[0]?.longest ?? 0),
          bestDayReviews: Number(bestDay.rows[0]?.reviews ?? 0),
          bestDayDate: bestDay.rows[0]?.day ?? null,
        },
        weeklyActivity: weeklyActivity.rows.map((r) => ({
          day: r.day,
          reviews: Number(r.reviews),
        })),
        packs: packs.rows.map((p) => ({
          id: p.id,
          name: p.display_name,
          isFree: p.is_free,
          priceTomans: p.price_tomans,
          totalCards: Number(p.total_cards),
          startedCards: Number(p.started_cards),
          learnedCards: Number(p.learned_cards),
        })),
        cefrDistribution: cefrDistribution.rows.map((r) => ({
          level: r.cefr_level,
          count: Number(r.count),
        })),
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error('[learner/profile/stats] failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500, headers: privateHeaders });
  } finally {
    await pool.end();
  }
}
