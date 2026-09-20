import type { MobileReviewBatchItemOutcome } from '../../api/dist/reviews/mobile-review-batch.service.js';

export type WebReviewItem = {
  contentId: string;
  grade: 'forgot' | 'hard' | 'remembered' | 'mastered';
  occurredAt: string;
  clientEventId: string;
};

export type WebReviewSubmitResult =
  | { status: 'ok'; outcomes: MobileReviewBatchItemOutcome[] }
  | { status: 'unauthorized' }
  | { status: 'unavailable' };

type ReconciliationEvent = {
  clientEventId: string;
  eventId: string;
  appliedAt: string;
};

type ReconciliationPayload = {
  cursor: string;
  nextCursor: string;
  hasMore: boolean;
  events: ReconciliationEvent[];
};

export type WebReviewReconciliationResult =
  | { status: 'ok'; reconciliation: ReconciliationPayload }
  | { status: 'unauthorized' }
  | { status: 'unavailable' };

export async function submitWebReviewBatch(
  items: WebReviewItem[],
  fetchFn: typeof fetch = fetch,
): Promise<WebReviewSubmitResult> {
  let response: Response;
  try {
    response = await fetchFn('/api/learner/reviews', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ items }),
    });
  } catch {
    return { status: 'unavailable' };
  }
  if (response.status === 401) return { status: 'unauthorized' };
  if (response.status !== 200) return { status: 'unavailable' };
  try {
    const body = (await response.json()) as unknown;
    return isSubmitBody(body)
      ? { status: 'ok', outcomes: body.outcomes }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function fetchWebReviewReconciliation(
  after: string,
  fetchFn: typeof fetch = fetch,
): Promise<WebReviewReconciliationResult> {
  if (!isCursor(after)) return { status: 'unavailable' };
  let response: Response;
  try {
    response = await fetchFn(
      `/api/learner/reviews/reconciliation?after=${encodeURIComponent(after)}`,
      {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      },
    );
  } catch {
    return { status: 'unavailable' };
  }
  if (response.status === 401) return { status: 'unauthorized' };
  if (response.status !== 200) return { status: 'unavailable' };
  try {
    const body = (await response.json()) as unknown;
    return isReconciliationBody(body)
      ? { status: 'ok', reconciliation: body.reconciliation }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

function isSubmitBody(value: unknown): value is { outcomes: MobileReviewBatchItemOutcome[] } {
  if (!isExactRecord(value, ['outcomes']) || !Array.isArray(value.outcomes)) return false;
  return value.outcomes.every(isOutcome);
}

function isOutcome(value: unknown): value is MobileReviewBatchItemOutcome {
  if (!isRecord(value) || typeof value.clientEventId !== 'string') return false;
  if (value.status === 'acknowledged') {
    return (
      typeof value.eventId === 'string' &&
      typeof value.idempotent === 'boolean' &&
      isCursor(value.reconciliationCursor)
    );
  }
  return (
    value.status === 'validation' ||
    value.status === 'idempotencyConflict' ||
    value.status === 'clockSkew'
  );
}

function isReconciliationBody(value: unknown): value is { reconciliation: ReconciliationPayload } {
  if (!isExactRecord(value, ['reconciliation']) || !isRecord(value.reconciliation)) return false;
  const reconciliation = value.reconciliation;
  return (
    isCursor(reconciliation.cursor) &&
    isCursor(reconciliation.nextCursor) &&
    typeof reconciliation.hasMore === 'boolean' &&
    Array.isArray(reconciliation.events) &&
    reconciliation.events.every(
      (event) =>
        isRecord(event) &&
        typeof event.clientEventId === 'string' &&
        typeof event.eventId === 'string' &&
        typeof event.appliedAt === 'string' &&
        !Number.isNaN(new Date(event.appliedAt).getTime()),
    )
  );
}

function isExactRecord(value: unknown, keys: string[]): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => key in value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCursor(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value);
}
