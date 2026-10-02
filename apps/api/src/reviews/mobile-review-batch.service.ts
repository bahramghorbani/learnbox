import {
  isReviewGrade,
  scheduleBinaryReview,
  scheduleReview,
  SCHEDULER_REJECTED_CODE,
  SCHEDULER_V2_ENGINE_VERSION,
  type BinaryResponse,
  type ReviewGrade,
} from '@learnbox/learning-engine';

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

/**
 * `serverUnavailable` is TRANSIENT and may be retried. `schedulerRejected` is DETERMINISTIC
 * (LB-B35 CP7): the scheduler V2 schema preflight refused, or a Box-transition invariant was
 * violated. Retrying a `schedulerRejected` request can never succeed, so clients must not.
 */
export type MobileReviewBatchErrorCode =
  'validation' | 'serverUnavailable' | typeof SCHEDULER_REJECTED_CODE;

/** Deterministic codes: a byte-identical retry cannot change the outcome. */
const NON_RETRYABLE_CODES: readonly MobileReviewBatchErrorCode[] = [
  'validation',
  SCHEDULER_REJECTED_CODE,
];

export class MobileReviewBatchError extends Error {
  constructor(
    readonly code: MobileReviewBatchErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'MobileReviewBatchError';
  }

  /** False for deterministic failures, so a caller never schedules a retry that cannot succeed. */
  get retryable(): boolean {
    return !NON_RETRYABLE_CODES.includes(this.code);
  }
}

export interface MobileReviewBatchItem {
  contentId: string;
  grade: ReviewGrade;
  /** Set only for a binary answer; `grade` then holds the compatibility shadow grade. */
  response?: BinaryResponse;
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
  /** Authoritative per-learner projection version after this item (ADR 0014). BIGINT string; never a JS number. */
  reconciliationCursor: string;
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
    if (!isReviewGrade(item.grade)) {
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

/**
 * LB-B35 CP7 (flag `LEARNBOX_SCHEDULER_V2`, default off). With `schedulerV2` unset or false the service runs
 * exactly the v1.2.1 path: `scheduleReview` and no engine stamp. With it true the preflight runs before every
 * item is processed and any failure refuses the batch (never a silent fallback to v1).
 */
export interface MobileReviewBatchOptions {
  schedulerV2?: boolean;
  /** Required when `schedulerV2` is true; rejects when the schema is not ready. */
  schedulerV2Preflight?: () => Promise<void>;
  /**
   * Server-side sink for the full operator diagnostic. The client never receives it: the HTTP
   * boundary returns only the error code. Defaults to `console.error`.
   */
  logger?: (event: { code: MobileReviewBatchErrorCode; detail: string }) => void;
}

export class MobileReviewBatchService {
  constructor(
    private readonly store: PostgresReviewEventStore,
    private readonly now: () => Date = () => new Date(),
    private readonly options: MobileReviewBatchOptions = {},
  ) {
    if (options.schedulerV2 && !options.schedulerV2Preflight) {
      throw new Error(
        'Scheduler V2 requires a schema preflight; refusing to construct the service.',
      );
    }
  }

  async submit(request: MobileReviewBatchRequest): Promise<MobileReviewBatchItemOutcome[]> {
    validateBatch(request.items);
    if (request.items.length === 0) return [];

    const outcomes: MobileReviewBatchItemOutcome[] = [];
    try {
      if (this.options.schedulerV2) await this.options.schedulerV2Preflight!();
      for (const item of request.items) {
        outcomes.push(await this.processItem(request.userId, item));
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'ReviewIdempotencyConflictError') {
        throw error;
      }
      if (error instanceof MobileReviewBatchError) throw error;
      // LB-B35 CP7: a scheduler-V2 preflight refusal or a Box-transition invariant violation is
      // DETERMINISTIC. Both are raised before any write, so nothing is persisted either way, but
      // they must not masquerade as a transient outage that the client will retry forever.
      // LB-B35 CP9 (N1): the binary-review schema preflight joins them for the same reason — a
      // pre-0023 database cannot be fixed by retrying the request.
      const deterministic =
        error instanceof Error &&
        (error.name === 'SchedulerV2PreflightError' ||
          error.name === 'SchedulerInvariantError' ||
          error.name === 'BinaryReviewPreflightError');
      const code: MobileReviewBatchErrorCode = deterministic
        ? SCHEDULER_REJECTED_CODE
        : 'serverUnavailable';
      this.log(code, error);
      throw new MobileReviewBatchError(
        code,
        deterministic
          ? 'Review batch refused: the server scheduler configuration is not usable.'
          : 'Review batch interrupted.',
        { cause: error },
      );
    }
    return outcomes;
  }

  /** Full detail stays server-side; the client only ever sees the code. */
  private log(code: MobileReviewBatchErrorCode, error: unknown): void {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const sink =
      this.options.logger ??
      ((event) => console.error('[reviews] %s %s', event.code, event.detail));
    sink({ code, detail });
  }

  private async processItem(
    userId: string,
    item: MobileReviewBatchItem,
  ): Promise<MobileReviewBatchItemOutcome> {
    const cardId = await this.store.resolveCardId(item.contentId);
    if (!cardId) return { status: 'validation', clientEventId: item.clientEventId };

    if (item.occurredAt.getTime() < this.now().getTime() - OCCURRED_AT_PAST_WINDOW_MS) {
      return { status: 'validation', clientEventId: item.clientEventId };
    }

    const skew = clockSkewStatus(item, this.now());
    if (skew) return { ...skew, clientEventId: item.clientEventId };

    const replay = await this.store.findByLearnerAndClientEventId(userId, item.clientEventId);
    if (replay) {
      const matches =
        replay.event.cardId === cardId &&
        replay.event.grade === item.grade &&
        replay.event.occurredAt.getTime() === item.occurredAt.getTime();
      return matches
        ? {
            status: 'acknowledged',
            clientEventId: item.clientEventId,
            eventId: replay.event.id,
            idempotent: true,
            reconciliationCursor: replay.reconciliationCursor,
          }
        : { status: 'idempotencyConflict', clientEventId: item.clientEventId };
    }

    const approvedSchedule = await this.store.ensureApprovedSchedule(userId, item.contentId);
    if (!approvedSchedule) return { status: 'validation', clientEventId: item.clientEventId };
    const { schedule } = approvedSchedule;

    // v2 is binary: a legacy grade is projected inside scheduleBinaryReview. An invariant violation throws
    // here, BEFORE writeAtomically, so an invalid transition is never persisted (the batch is refused).
    const useV2 = this.options.schedulerV2 === true;
    const nextSchedule = useV2
      ? scheduleBinaryReview(
          schedule,
          { grade: item.grade, ...(item.response ? { response: item.response } : {}) },
          item.occurredAt,
        )
      : scheduleReview(schedule, item.grade, item.occurredAt);
    try {
      const result = await this.store.writeAtomically(
        {
          userId,
          cardId,
          grade: item.grade,
          ...(item.response ? { response: item.response } : {}),
          ...(useV2 ? { engineVersion: SCHEDULER_V2_ENGINE_VERSION } : {}),
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
