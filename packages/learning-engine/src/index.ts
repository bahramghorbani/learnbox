export type ReviewGrade = 'forgot' | 'hard' | 'remembered' | 'mastered';
export type LearningState =
  'new' | 'learning' | 'review' | 'relearning' | 'mastered' | 'suspended' | 'archived';

export { createRecoveryPlan, type RecoveryCandidate, type RecoveryPlan } from './recovery.js';
export {
  createDailySessionPlan,
  type DailySessionInput,
  type DailySessionPlan,
  type NewCardCandidate,
} from './session.js';
export {
  recordReviewEvent,
  type PersistedReviewEvent,
  type ReviewEventInput,
  type ReviewEventStore,
  type ReviewEventWriteResult,
} from './review-event.js';
export {
  acknowledgeSyncEvents,
  queueForRetry,
  retryAfter,
  type PendingSyncEvent,
} from './offline-sync.js';
export { loadSyncQueue, saveSyncQueue, type SyncQueueStorage } from './offline-sync-storage.js';
export {
  createMemoryStorage,
  createResilientStorage,
  type DeviceStorage,
} from './device-storage.js';
export {
  clearReviewSession,
  loadReviewSession,
  saveReviewSession,
  type ReviewSessionProgress,
} from './review-session-storage.js';
export {
  clearDailyReviewProgress,
  loadDailyReviewProgress,
  saveDailyReviewProgress,
  type DailyReviewProgress,
} from './daily-review-storage.js';
export {
  clearLearningStreak,
  getCurrentStreakDays,
  loadLearningStreak,
  recordLearningStreak,
  type LearningStreak,
} from './learning-streak-storage.js';
export {
  hasPersonalVocabularyDuplicate,
  loadPersonalVocabulary,
  savePersonalVocabulary,
  type PersonalVocabularyEntry,
  type PersonalVocabularyStorage,
} from './personal-vocabulary-storage.js';

export interface CardSchedule {
  state: LearningState;
  stabilityDays: number;
  difficulty: number;
  lapses: number;
  dueAt: Date;
}

const factors: Record<ReviewGrade, number> = {
  forgot: 0.35,
  hard: 0.8,
  remembered: 1.8,
  mastered: 3,
};

const MINUTE_IN_MS = 60_000;
const DAY_IN_MS = 86_400_000;
const minimumStabilityDays = 10 / (24 * 60);

function stateAfterReview(
  state: LearningState,
  grade: ReviewGrade,
  stabilityDays: number,
): LearningState {
  if (grade === 'forgot') return 'relearning';
  if (state === 'new') return 'learning';
  if (grade === 'mastered' && stabilityDays >= 21) return 'mastered';
  return 'review';
}

/** Deterministic, conservative scheduling seam; replaceable without changing clients. */
export function scheduleReview(
  schedule: CardSchedule,
  grade: ReviewGrade,
  now: Date,
): CardSchedule {
  const isLapse = grade === 'forgot';
  const stabilityDays = Math.max(minimumStabilityDays, schedule.stabilityDays * factors[grade]);
  const intervalMs = Math.max(MINUTE_IN_MS, stabilityDays * DAY_IN_MS);
  return {
    ...schedule,
    state: stateAfterReview(schedule.state, grade, stabilityDays),
    stabilityDays,
    difficulty: Math.min(10, Math.max(1, schedule.difficulty + (isLapse ? 0.5 : -0.1))),
    lapses: schedule.lapses + Number(isLapse),
    dueAt: new Date(now.getTime() + intervalMs),
  };
}
