import { createRecoveryPlan, type RecoveryCandidate, type RecoveryPlan } from './recovery.js';

export interface NewCardCandidate {
  cardId: string;
  importance: number;
}

export interface DailySessionInput {
  durationMinutes: RecoveryPlan['durationMinutes'];
  now: Date;
  dueCards: RecoveryCandidate[];
  newCards: NewCardCandidate[];
  suggestedNewCards: number;
}

export interface DailySessionPlan {
  mode: 'normal' | 'recovery';
  reviewCardIds: string[];
  newCardIds: string[];
  message: string;
}

const capacityByDuration: Record<RecoveryPlan['durationMinutes'], number> = {
  5: 12,
  10: 24,
  15: 36,
};

const isDueAndActive = (card: RecoveryCandidate, now: Date) =>
  card.dueAt <= now && card.state !== 'suspended' && card.state !== 'archived';

/**
 * Composes a short daily session. Large backlogs become recovery sessions;
 * otherwise reviews get priority and new material consumes only spare capacity.
 */
export function createDailySessionPlan(input: DailySessionInput): DailySessionPlan {
  const capacity = capacityByDuration[input.durationMinutes];
  const activeDueCards = input.dueCards.filter((card) => isDueAndActive(card, input.now));

  if (activeDueCards.length > capacity) {
    const recovery = createRecoveryPlan(input.dueCards, input.durationMinutes, input.now);
    return {
      mode: 'recovery',
      reviewCardIds: recovery.cardIds,
      newCardIds: [],
      message: recovery.message,
    };
  }

  const reviewCardIds = activeDueCards
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.cardId.localeCompare(b.cardId))
    .map(({ cardId }) => cardId);
  const newCardCapacity = Math.max(0, capacity - reviewCardIds.length);
  const newCardLimit = Math.min(input.suggestedNewCards, newCardCapacity);
  const newCardIds = [...input.newCards]
    .sort((a, b) => b.importance - a.importance || a.cardId.localeCompare(b.cardId))
    .slice(0, newCardLimit)
    .map(({ cardId }) => cardId);

  return {
    mode: 'normal',
    reviewCardIds,
    newCardIds,
    message: 'امروز یک قدم کوچک و پیوسته کافی است.',
  };
}
