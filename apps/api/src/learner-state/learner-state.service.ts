import {
  DAILY_NEW_CARD_ALLOWANCE,
  createDailySessionPlan,
  localDayKey,
  resolveLearnerTimeZone,
  type CardSchedule,
} from '@learnbox/learning-engine';

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

/**
 * Server-owned daily new-card allowance (LB-B35 CP4, flag `LEARNBOX_SERVER_SESSION_PLAN`).
 *
 * One frozen row per learner and learner-local day. `freezeAllowance` is an
 * `INSERT ... ON CONFLICT DO NOTHING` followed by a read, so concurrent requests, refreshes and a second
 * device all receive the SAME allowance. Absent (flag off) = v1.2.1 behaviour exactly.
 */
export interface DailyPlanStore {
  /** `users.timezone`, or null when the learner has none stored. */
  readStoredTimeZone(userId: string): Promise<string | null>;
  /** Fill-once: only writes when the stored zone is still NULL. */
  persistTimeZone(userId: string, timeZone: string): Promise<void>;
  /** The allowance already frozen for this learner-local day, or null. */
  readAllowance(userId: string, localDay: string): Promise<string[] | null>;
  /** Freeze `cardIds` for the day unless a row exists; return whatever is stored afterwards. */
  freezeAllowance(
    userId: string,
    localDay: string,
    timeZone: string,
    cardIds: string[],
  ): Promise<string[]>;
  /** Candidates restricted to these card ids that are still unscheduled and published. */
  findNewCardsByIds(userId: string, cardIds: string[]): Promise<LearnerNewCardCandidate[]>;
}

export interface ReadLearnerStateOptions {
  /** The device-reported IANA zone (`?tz=`); only a fallback when the account has no stored zone. */
  requestedTimeZone?: string | null;
}

const SESSION_DURATION_MINUTES = 5 as const;
const NEW_CARD_CANDIDATE_LIMIT = 12;
const SUGGESTED_NEW_CARDS = DAILY_NEW_CARD_ALLOWANCE;

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
    private readonly dailyPlans: DailyPlanStore | null = null,
  ) {}

  async readLearnerState(
    userId: string,
    options: ReadLearnerStateOptions = {},
  ): Promise<LearnerStateSnapshot> {
    const schedules = await this.repository.findSchedules(userId);
    const candidates = this.dailyPlans
      ? await this.dailyAllowanceCandidates(userId, schedules, options)
      : await this.repository.findNewCardCandidates(userId, NEW_CARD_CANDIDATE_LIMIT);
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

  /**
   * The new cards this learner may be offered today. The allowance is frozen once per learner-local day:
   * whatever the learner already started is no longer "new" (it has a schedule row), so repeated
   * refreshes, sessions or devices cannot keep granting new cards. Due and recovery work is NOT frozen —
   * it is derived from the live schedule — and recovery mode consumes no allowance.
   */
  private async dailyAllowanceCandidates(
    userId: string,
    schedules: LearnerScheduleRow[],
    options: ReadLearnerStateOptions,
  ): Promise<LearnerNewCardCandidate[]> {
    const store = this.dailyPlans!;
    const stored = await store.readStoredTimeZone(userId);
    const zone = resolveLearnerTimeZone(stored, options.requestedTimeZone);
    if (zone.persist) await store.persistTimeZone(userId, zone.persist);
    const localDay = localDayKey(this.now(), zone.timeZone);

    const frozen = await store.readAllowance(userId, localDay);
    if (frozen) return store.findNewCardsByIds(userId, frozen);

    // First read of the learner's day. Recovery (a backlog beyond one session) admits no new cards, so
    // it must not spend the day's allowance either: decide that from the same live schedule.
    const probe = createDailySessionPlan({
      durationMinutes: SESSION_DURATION_MINUTES,
      now: this.now(),
      dueCards: schedules.map(({ cardId, state, stabilityDays, lapses, dueAt }) => ({
        cardId,
        state,
        stabilityDays,
        lapses,
        dueAt,
        importance: 1,
      })),
      newCards: [],
      suggestedNewCards: 0,
    });
    if (probe.mode === 'recovery') return [];

    const picked = await this.repository.findNewCardCandidates(userId, NEW_CARD_CANDIDATE_LIMIT);
    const allowance = picked.slice(0, DAILY_NEW_CARD_ALLOWANCE).map(({ cardId }) => cardId);
    if (allowance.length === 0) return [];
    const stableIds = await store.freezeAllowance(userId, localDay, zone.timeZone, allowance);
    return store.findNewCardsByIds(userId, stableIds);
  }
}
