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

export interface LearnerNewCardCandidate {
  cardId: string;
  contentId: string;
  importance: number;
}

export interface LearnerStatePlan {
  mode: 'normal' | 'recovery';
  reviewCardIds: string[];
  newCardIds: string[];
  message: string;
}

export interface LearnerStateSnapshot {
  schedules: LearnerScheduleRow[];
  /** Selected unscheduled Start cards; contentId is the review-submit wire identity. */
  newCards: LearnerNewCardCandidate[];
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
  findNewCardCandidates(userId: string, limit: number): Promise<LearnerNewCardCandidate[]>;
  countReviewEvents(userId: string): Promise<number>;
  readReconciliationCursor(userId: string): Promise<string>;
}

const SESSION_DURATION_MINUTES = 5 as const;
const NEW_CARD_CANDIDATE_LIMIT = 12;
const SUGGESTED_NEW_CARDS = 3;

/**
 * Server-authoritative learner state read (M1-D 12.3). The plan comes from the
 * same learning-engine seam the review write path uses, so the response matches
 * what the server would schedule next.
 *
 * New material is bounded twice: the repository returns at most one 5-minute
 * session capacity, then the learning engine admits at most three after reviews.
 */
export class LearnerStateService {
  constructor(
    private readonly repository: LearnerStateRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async readLearnerState(userId: string): Promise<LearnerStateSnapshot> {
    const schedules = await this.repository.findSchedules(userId);
    const candidates = await this.repository.findNewCardCandidates(
      userId,
      NEW_CARD_CANDIDATE_LIMIT,
    );
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
      newCards: candidates,
      suggestedNewCards: SUGGESTED_NEW_CARDS,
    });
    const candidatesById = new Map(candidates.map((candidate) => [candidate.cardId, candidate]));
    const newCards = plan.newCardIds.flatMap((cardId) => {
      const candidate = candidatesById.get(cardId);
      return candidate ? [candidate] : [];
    });
    return {
      schedules,
      newCards,
      plan,
      reviewEventsCount: await this.repository.countReviewEvents(userId),
      reconciliationCursor: await this.repository.readReconciliationCursor(userId),
    };
  }
}
