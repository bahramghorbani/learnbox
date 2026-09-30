import { Pool } from 'pg';
import { authenticateLearner } from '../../../../../lib/learner-auth';
import { maskIranianPhone } from '../../../../../lib/phone-mask';
import {
  readCurriculumProgress,
  readLearnedByCefr,
  readLearnerActivity,
  readPackProgress,
  recentDays,
} from '../../../../../lib/learner-read-model';
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
  const session = await authenticateLearner(request);
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

    // Same canonical read model as Today, Progress and Words (LB-B35 CP3); the learner's zone is the
    // same `tz` the other screens send, and a missing or invalid zone is UTC.
    const [curriculum, activity, packs, cefr] = await Promise.all([
      readCurriculumProgress(pool, userId),
      readLearnerActivity(pool, userId, new URL(request.url).searchParams.get('tz')),
      readPackProgress(pool, userId),
      readLearnedByCefr(pool, userId),
    ]);

    // Canonical mask shared with /api/learner/profile; converted to Persian digits for display.
    const maskedPhone = maskIranianPhone(user.phone_e164 as string);

    return Response.json(
      {
        profile: {
          firstName: user.first_name,
          maskedPhone,
          createdAt: user.created_at,
        },
        timeZone: activity.timeZone,
        stats: {
          newCards: curriculum.new,
          learningCards: curriculum.learning,
          learnedCards: curriculum.learned,
          masteredCards: curriculum.mastered,
          totalCards: curriculum.total,
          totalReviews: activity.totalReviews,
          streakDays: activity.streak.current,
          longestStreak: activity.streak.longest,
          bestDayReviews: activity.bestDay?.reviews ?? 0,
          bestDayDate: activity.bestDay?.day ?? null,
          accuracyPercent: activity.accuracyAllTime.percent,
        },
        weeklyActivity: recentDays(activity, 7).map(({ day, reviews }) => ({ day, reviews })),
        packs: packs.map((pack) => ({
          id: pack.id,
          name: pack.name,
          isFree: pack.isFree,
          priceTomans: pack.priceTomans,
          totalCards: pack.totalCards,
          startedCards: pack.startedCards,
          learnedCards: pack.learnedCards,
          masteredCards: pack.masteredCards,
        })),
        cefrDistribution: cefr,
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
