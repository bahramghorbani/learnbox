import { normalizeTimeZone } from '@learnbox/learning-engine';
import type { Pool } from 'pg';

import { readLearnerActivity } from './learner-read-model';

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

// Canonical (LB-B35 CP2): one definition of the learner's time zone, shared with every layer.
export { normalizeTimeZone };

export async function readLearnerSummary(
  pool: Pick<Pool, 'query'>,
  userId: string,
  requestedTimeZone: string | null | undefined,
  asOf: Date = new Date(),
): Promise<LearnerSummary> {
  // One implementation of the learning day and the streak (LB-B35 CP3): the read model.
  const activity = await readLearnerActivity(pool, userId, requestedTimeZone, asOf);
  return {
    reviewedToday: activity.reviewedToday,
    streakDays: activity.streak.current,
    longestStreakDays: activity.streak.longest,
    activeDays: activity.streak.activeDays,
    totalReviews: activity.totalReviews,
    timeZone: activity.timeZone,
  };
}
