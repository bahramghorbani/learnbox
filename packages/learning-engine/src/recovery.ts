import type { LearningState } from './index.js';

export interface RecoveryCandidate {
  cardId: string;
  state: LearningState;
  dueAt: Date;
  stabilityDays: number;
  lapses: number;
  importance: number;
}

export interface RecoveryPlan {
  durationMinutes: 5 | 10 | 15;
  cardIds: string[];
  recommendedNewCards: 0;
  message: string;
}

const maxCardsByDuration: Record<RecoveryPlan['durationMinutes'], number> = {
  5: 12,
  10: 24,
  15: 36,
};

function riskScore(candidate: RecoveryCandidate, now: Date): number {
  const overdueDays = Math.max(0, now.getTime() - candidate.dueAt.getTime()) / 86_400_000;
  const fragileMemory = 1 / Math.max(candidate.stabilityDays, 1 / 24);
  return overdueDays * 2 + candidate.lapses * 3 + candidate.importance * 4 + fragileMemory;
}

/**
 * Builds a bounded, review-only session for a learner returning after a gap.
 * It deliberately excludes suspended/archived cards and recommends no new cards.
 */
export function createRecoveryPlan(
  candidates: RecoveryCandidate[],
  durationMinutes: RecoveryPlan['durationMinutes'],
  now: Date,
): RecoveryPlan {
  const dueCandidates = candidates
    .filter(
      (candidate) =>
        candidate.dueAt <= now && candidate.state !== 'suspended' && candidate.state !== 'archived',
    )
    .sort((a, b) => riskScore(b, now) - riskScore(a, now) || a.cardId.localeCompare(b.cardId));

  return {
    durationMinutes,
    cardIds: dueCandidates
      .slice(0, maxCardsByDuration[durationMinutes])
      .map(({ cardId }) => cardId),
    recommendedNewCards: 0,
    message: 'بازگشتت ارزشمند است؛ با چند کارت مهم شروع کنیم.',
  };
}
