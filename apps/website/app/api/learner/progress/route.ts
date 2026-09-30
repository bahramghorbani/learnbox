import { Pool } from 'pg';
import { authenticateLearner } from '../../../../lib/learner-auth';
import {
  dailyAverageOverActiveDays,
  dayOfWeekOfKey,
  readCurriculumProgress,
  readLearnedByCefr,
  readLearnerActivity,
  readPackProgress,
  readReviewHours,
  recentDays,
} from '../../../../lib/learner-read-model';
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
    // Every number below comes from the shared learner read model (LB-B35 CP3): the same canonical
    // Box / Learned / Mastered / Accuracy / local-day / streak definitions as Today, Words and
    // Profile. The learner's zone is the same `tz` Today sends; a missing or invalid zone is UTC.
    const timeZone = new URL(request.url).searchParams.get('tz');
    const [curriculum, activity, packs, cefr] = await Promise.all([
      readCurriculumProgress(pool, userId),
      readLearnerActivity(pool, userId, timeZone),
      readPackProgress(pool, userId),
      readLearnedByCefr(pool, userId),
    ]);
    const hours = await readReviewHours(pool, userId, activity.timeZone);

    // Study pattern. Weekday of each active local day, counted in the learner's zone.
    const reviewsByWeekday = new Array<number>(7).fill(0);
    for (const day of activity.days) {
      if (day.day <= activity.today) reviewsByWeekday[dayOfWeekOfKey(day.day)] += day.reviews;
    }
    const dowNames = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
    const bestWeekday = reviewsByWeekday.some((n) => n > 0)
      ? reviewsByWeekday.indexOf(Math.max(...reviewsByWeekday))
      : -1;
    const bestHour = hours.length
      ? hours.reduce((best, row) => (row.reviews > best.reviews ? row : best)).hour
      : null;

    const [boxOne, boxTwo, boxThree, boxFour, boxFive] = curriculum.boxes;
    return Response.json(
      {
        timeZone: activity.timeZone,
        leitnerBoxes: { box1: boxOne, box2: boxTwo, box3: boxThree, box4: boxFour, box5: boxFive },
        // One vocabulary for every screen: learned = Box 4+, mastered = Box 5 (a subset of learned),
        // learning = started but not yet learned (Box 1–3), new = in the curriculum, not started.
        // `total` is the curriculum size, not the number of scheduled cards.
        cardStates: {
          new: curriculum.new,
          learning: curriculum.learning,
          learned: curriculum.learned,
          mastered: curriculum.mastered,
          total: curriculum.total,
        },
        weeklyActivity: recentDays(activity, 7).map(({ day, reviews }) => ({ day, reviews })),
        monthlyActivity: recentDays(activity, 30)
          .filter(({ reviews }) => reviews > 0)
          .map(({ day, reviews }) => ({ day, reviews })),
        studyPattern: {
          bestHour,
          bestDay: bestWeekday >= 0 ? dowNames[bestWeekday] : null,
          hourDistribution: hours,
        },
        streak: {
          current: activity.streak.current,
          longest: activity.streak.longest,
          bestDayReviews: activity.bestDay?.reviews ?? 0,
          bestDayDate: activity.bestDay?.day ?? null,
        },
        accuracy: {
          today: activity.accuracyToday.percent,
          allTime: activity.accuracyAllTime.percent,
          knownAnswers: activity.accuracyAllTime.known,
          totalAnswers: activity.accuracyAllTime.total,
        },
        totals: {
          reviews: activity.totalReviews,
          todayReviews: activity.reviewedToday,
          dailyAverage: dailyAverageOverActiveDays(activity),
          firstReviewDate: activity.firstReviewAt,
        },
        packs: packs.map((pack) => ({
          id: pack.id,
          name: pack.name,
          totalCards: pack.totalCards,
          startedCards: pack.startedCards,
          learnedCards: pack.learnedCards,
          masteredCards: pack.masteredCards,
        })),
        cefr,
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
