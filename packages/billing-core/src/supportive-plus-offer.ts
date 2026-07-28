export type SupportivePlusOfferSignal =
  | 'learning_cycle_words'
  | 'completed_sessions'
  | 'first_collection_completed'
  | 'meaningful_progress_report_received';

export interface SupportivePlusOfferRules {
  firstSeriousOfferNotBeforeActiveDays: number;
  minimumLearningCycleWords: number;
  minimumCompletedSessions: number;
}

export interface SupportivePlusOfferProgress {
  activeDays: number;
  learningCycleWords: number;
  completedSessions: number;
  firstCollectionCompleted: boolean;
  meaningfulProgressReportReceived: boolean;
}

export interface SupportivePlusOfferEligibility {
  eligible: boolean;
  signal: SupportivePlusOfferSignal | null;
}

/**
 * A serious offer can follow demonstrated value, never first-day activity. Any configured value
 * signal may make the learner eligible after the active-day protection has been met.
 */
export function resolveSupportivePlusOfferEligibility(
  rules: SupportivePlusOfferRules,
  progress: SupportivePlusOfferProgress,
): SupportivePlusOfferEligibility {
  if (progress.activeDays < rules.firstSeriousOfferNotBeforeActiveDays) {
    return { eligible: false, signal: null };
  }
  if (progress.learningCycleWords >= rules.minimumLearningCycleWords) {
    return { eligible: true, signal: 'learning_cycle_words' };
  }
  if (progress.completedSessions >= rules.minimumCompletedSessions) {
    return { eligible: true, signal: 'completed_sessions' };
  }
  if (progress.firstCollectionCompleted) {
    return { eligible: true, signal: 'first_collection_completed' };
  }
  if (progress.meaningfulProgressReportReceived) {
    return { eligible: true, signal: 'meaningful_progress_report_received' };
  }
  return { eligible: false, signal: null };
}
