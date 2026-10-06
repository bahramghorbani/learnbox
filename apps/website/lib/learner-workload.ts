import { LearnerStateService } from '../../api/dist/learner-state/learner-state.service.js';
import { PostgresLearnerStateRepository } from '../../api/dist/learner-state/postgres-learner-state.repository.js';

import type { Pool } from 'pg';

import { packAccessSql } from './pack-access';

/**
 * LB-B35 CP5-A — the ONE definition of "work for today" shown to the learner.
 *
 * `cardsForToday` is the number of cards in the learner's actual session plan: the same plan
 * `/api/learner/state` builds the review queue from (same service, same repository, same frozen daily
 * allowance when LEARNBOX_SERVER_SESSION_PLAN is on). It therefore keeps the 12-card session capacity
 * and the 3-new-cards-per-day allowance by construction; nothing here re-derives either rule.
 *
 * The unseen catalogue count is a different fact ("how much is left to discover") and is reported
 * separately as `unseenCatalogCount`; it is never part of the workload.
 *
 * Read-only apart from what the session-plan flag already does (freeze the day's allowance, CP4).
 */
export interface TodayWorkload {
  cardsForToday: number;
  reviewCardsToday: number;
  newCardsToday: number;
  planMode: 'normal' | 'recovery';
  unseenCatalogCount: number;
}

export const todayWorkloadEnabled = (environment: Record<string, string | undefined>): boolean =>
  environment.LEARNBOX_TODAY_WORKLOAD === 'true';

/**
 * Published cards the learner has not met yet (the v1.2.1 `newCount`, now named for what it is).
 *
 * Counts only cards in packs this learner may access: previously this query joined `pack_cards`
 * without ever filtering the pack, so a draft pack's cards were offered as upcoming work.
 */
export async function countUnseenCatalogCards(pool: Pool, userId: string): Promise<number> {
  const result = await pool.query<{ new_count: string }>(
    `SELECT COUNT(DISTINCT cv.card_id) as new_count
       FROM card_versions cv
      WHERE cv.status = 'published'
        AND EXISTS (
          SELECT 1 FROM pack_cards pc
          JOIN packs p ON p.id = pc.pack_id
          WHERE pc.card_id = cv.card_id AND ${packAccessSql('p', '$1')}
        )
        AND NOT EXISTS (
          SELECT 1 FROM card_schedules cs
           WHERE cs.card_id = cv.card_id AND cs.user_id = $1
        )`,
    [userId],
  );
  return parseInt(result.rows[0]?.new_count ?? '0', 10);
}

export async function readTodayWorkload(
  pool: Pool,
  userId: string,
  options: {
    now?: Date;
    requestedTimeZone?: string | null;
    environment?: Record<string, string | undefined>;
  } = {},
): Promise<TodayWorkload> {
  const environment = options.environment ?? process.env;
  const repository = new PostgresLearnerStateRepository(pool);
  const now = options.now ?? new Date();
  const service = new LearnerStateService(
    repository,
    () => now,
    environment.LEARNBOX_SERVER_SESSION_PLAN === 'true' ? repository : null,
  );
  const state = await service.readLearnerState(userId, {
    requestedTimeZone: options.requestedTimeZone ?? null,
  });
  const reviewCardsToday = state.plan.reviewCardIds.length;
  const newCardsToday = state.plan.newCardIds.length;
  return {
    cardsForToday: reviewCardsToday + newCardsToday,
    reviewCardsToday,
    newCardsToday,
    planMode: state.plan.mode,
    unseenCatalogCount: await countUnseenCatalogCards(pool, userId),
  };
}
