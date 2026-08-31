import { createDailySessionPlan, type CardSchedule } from '@learnbox/learning-engine';

export interface LearnerScheduleRow {
  cardId: string;
  contentId: string;
  state: CardSchedule['state'];
  stabilityDays: number;
  difficulty: number;
  lapses: number;
  dueAt: Date;
}

export interface LearnerStatePlan {
  mode: 'normal' | 'recovery';
  reviewCardIds: string[];
  newCardIds: string[];
  message: string;
}

export interface LearnerStateSnapshot {
  schedules: LearnerScheduleRow[];
  plan: LearnerStatePlan;
  /** Server-held review event count; clients reconcile their local pending queue against it. */
  reviewEventsCount: number;
  /**
   * Authoritative per-learner reconciliation cursor (ADR 0014) as a decimal
   * string. BIGINT-backed; never a JS number. '0' when the learner has no
   * cursor row yet.
   */
  reconciliationCursor: string;
}

export interface LearnerStateRepository {
  findSchedules(userId: string): Promise<LearnerScheduleRow[]>;
  countReviewEvents(userId: string): Promise<number>;
  readReconciliationCursor(userId: string): Promise<string>;
}

const SESSION_DURATION_MINUTES = 5 as const;

/**
 * Server-authoritative learner state read (M1-D 12.3). The plan comes from the
 * same learning-engine seam the review write path uses, so the response matches
 * what the server would schedule next.
 *
 * ponytail: new-card intake (catalog/importance) is a separate M1-B contract, so
 * this slice always plans reviews only (`newCards: []`, `suggestedNewCards: 0`).
 * Add catalog candidates once the new-card endpoint contract exists.
 */
export class LearnerStateService {
  constructor(
    private readonly repository: LearnerStateRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async readLearnerState(userId: string): Promise<LearnerStateSnapshot> {
    const schedules = await this.repository.findSchedules(userId);
    const plan = createDailySessionPlan({
      durationMinutes: SESSION_DURATION_MINUTES,
      now: this.now(),
      dueCards: schedules.map(({ cardId, state, stabilityDays, lapses, dueAt }) => ({
        cardId,
        state,
        stabilityDays,
        lapses,
        dueAt,
        // ponytail: catalog importance is not in card_schedules; default until M1-B defines it.
        importance: 1,
      })),
      newCards: [],
      suggestedNewCards: 0,
    });
    return {
      schedules,
      plan,
      reviewEventsCount: await this.repository.countReviewEvents(userId),
      reconciliationCursor: await this.repository.readReconciliationCursor(userId),
    };
  }
}
