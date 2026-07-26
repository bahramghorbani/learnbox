import { scheduleReview, type CardSchedule, type ReviewGrade } from './index.js';

export interface ReviewEventInput {
  userId: string;
  cardId: string;
  grade: ReviewGrade;
  occurredAt: Date;
  clientEventId: string;
}

export interface PersistedReviewEvent extends ReviewEventInput {
  id: string;
}

export interface ReviewEventWriteResult {
  event: PersistedReviewEvent;
  schedule: CardSchedule;
  idempotent: boolean;
}

export interface ReviewEventStore {
  findByClientEventId(clientEventId: string): Promise<ReviewEventWriteResult | null>;
  writeAtomically(
    input: ReviewEventInput,
    nextSchedule: CardSchedule,
  ): Promise<ReviewEventWriteResult>;
}

/**
 * Shared application boundary for an idempotent review write. Database adapters
 * must implement `writeAtomically` as one transaction that claims clientEventId
 * before updating the schedule projection.
 */
export async function recordReviewEvent(
  store: ReviewEventStore,
  schedule: CardSchedule,
  input: ReviewEventInput,
): Promise<ReviewEventWriteResult> {
  const existing = await store.findByClientEventId(input.clientEventId);
  if (existing) return { ...existing, idempotent: true };

  const nextSchedule = scheduleReview(schedule, input.grade, input.occurredAt);
  return store.writeAtomically(input, nextSchedule);
}
