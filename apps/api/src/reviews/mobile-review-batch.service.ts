import { scheduleReview } from '@learnbox/learning-engine';

import type {
  PostgresReviewEventStore,
  ReviewIdempotencyConflictError,
} from './postgres-review-event.store.js';

export const MOBILE_REVIEW_BATCH_MAX = 20;

/**
 * Past window the server accepts for a device timestamp. Older timestamps are
 * invalid payloads (`validation`), not clock skew.
 */
const OCCURRED_AT_PAST_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/** Future tolerance before a device timestamp is treated as clock skew. */
const OCCURRED_AT_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export type MobileReviewBatchErrorCode = 'validation' | 'serverUnavailable';

export class MobileReviewBatchError extends Error {
  constructor(
    readonly code: MobileReviewBatchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MobileReviewBatchError';
  }
}

export interface MobileReviewBatchItem {
  contentId: string;
  grade: 'forgot' | 'hard' | 'remembered' | 'mastered';
  occurredAt: Date;
  clientEventId: string;
}

export interface MobileReviewBatchRequest {
  userId: string;
  items: MobileReviewBatchItem[];
}

interface AcknowledgedOutcome {
  status: 'acknowledged';
  clientEventId: string;
  eventId: string;
  idempotent: boolean;
  /** Authoritative per-learner projection version after this item (ADR 0014). */
  reconciliationCursor: number;
}

interface IdempotencyConflictOutcome {
  status: 'idempotencyConflict';
  clientEventId: string;
}

interface ValidationOutcome {
  status: 'validation';
  clientEventId: string;
}

interface ClockSkewOutcome {
  status: 'clockSkew';
  clientEventId: string;
}

/**
 * Generic typed per-item outcome. The batch itself fails closed with a typed
 * `MobileReviewBatchError` when a server fault interrupts ordered processing.
 */
export type MobileReviewBatchItemOutcome =
  AcknowledgedOutcome | IdempotencyConflictOutcome | ValidationOutcome | ClockSkewOutcome;

const GRADES = new Set(['forgot', 'hard', 'remembered', 'mastered']);

function clockSkewStatus(
  item: Pick<MobileReviewBatchItem, 'occurredAt'>,
  now: Date,
): { status: 'clockSkew' } | null {
  if (item.occurredAt.getTime() > now.getTime() + OCCURRED_AT_SKEW_TOLERANCE_MS) {
    return { status: 'clockSkew' };
  }
  return null;
}

const isValidClientEventId = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= 128;

function validateBatch(items: MobileReviewBatchItem[]): void {
  if (items.length > MOBILE_REVIEW_BATCH_MAX) {
    throw new MobileReviewBatchError(
      'validation',
      `Review batch exceeds the maximum of ${MOBILE_REVIEW_BATCH_MAX} items.`,
    );
  }
  const seen = new Set<string>();
  for (const item of items) {
    if (!isValidClientEventId(item.clientEventId)) {
      throw new MobileReviewBatchError(
        'validation',
        'client_event_id must be text between 1 and 128 characters.',
      );
    }
    if (!GRADES.has(item.grade)) {
      throw new MobileReviewBatchError('validation', `Unknown review grade.`);
    }
    if (!(item.occurredAt instanceof Date) || Number.isNaN(item.occurredAt.getTime())) {
      throw new MobileReviewBatchError('validation', 'occurredAt must be a valid date.');
    }
    if (seen.has(item.clientEventId)) {
      throw new MobileReviewBatchError('validation', 'Duplicate client event id within one batch.');
    }
    seen.add(item.clientEventId);
  }
}

export class MobileReviewBatchService {
  constructor(
    private readonly store: PostgresReviewEventStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async submit(request: MobileReviewBatchRequest): Promise<MobileReviewBatchItemOutcome[]> {
    validateBatch(request.items);
    if (request.items.length === 0) return [];

    await this.store.bootstrapSchedules(request.userId);

    const outcomes: MobileReviewBatchItemOutcome[] = [];
    try {
      for (const item of request.items) {
        outcomes.push(await this.processItem(request.userId, item));
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'ReviewIdempotencyConflictError') {
        throw error;
      }
      throw new MobileReviewBatchError('serverUnavailable', 'Review batch interrupted.');
    }
    return outcomes;
  }

  private async processItem(
    userId: string,
    item: MobileReviewBatchItem,
  ): Promise<MobileReviewBatchItemOutcome> {
    const cardId = await this.store.resolveCardId(item.contentId);
    if (!cardId) return { status: 'validation', clientEventId: item.clientEventId };

    const schedule = await this.store.findSchedule(userId, cardId);
    if (!schedule) return { status: 'validation', clientEventId: item.clientEventId };

    if (item.occurredAt.getTime() < this.now().getTime() - OCCURRED_AT_PAST_WINDOW_MS) {
      return { status: 'validation', clientEventId: item.clientEventId };
    }

    const skew = clockSkewStatus(item, this.now());
    if (skew) return { ...skew, clientEventId: item.clientEventId };

    const nextSchedule = scheduleReview(schedule, item.grade, item.occurredAt);
    try {
      const result = await this.store.writeAtomically(
        {
          userId,
          cardId,
          grade: item.grade,
          occurredAt: item.occurredAt,
          clientEventId: item.clientEventId,
        },
        nextSchedule,
      );
      return {
        status: 'acknowledged',
        clientEventId: item.clientEventId,
        eventId: result.event.id,
        idempotent: result.idempotent,
        reconciliationCursor: result.reconciliationCursor,
      };
    } catch (error) {
      const conflict = error as ReviewIdempotencyConflictError;
      if (conflict instanceof Error && conflict.name === 'ReviewIdempotencyConflictError') {
        return { status: 'idempotencyConflict', clientEventId: item.clientEventId };
      }
      throw error;
    }
  }
}
