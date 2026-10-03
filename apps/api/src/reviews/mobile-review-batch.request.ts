import { isBinaryResponse, isReviewGrade, shadowGradeFor } from '@learnbox/learning-engine';

import type { MobileReviewBatchItem } from './mobile-review-batch.service.js';

const MAX_BATCH_SIZE = 20;
const CURSOR_PATTERN = /^[0-9]+$/;

export interface ParsedMobileReviewBatchRequest {
  userId: string;
  items: MobileReviewBatchItem[];
  reconciliationCursor?: string;
}

/**
 * An item the server can never accept, however many times it is retried.
 *
 * CP17 F1: a terminally-invalid item is reported per-item instead of rejecting the whole
 * batch, so valid events queued behind it are not blocked forever. The id is echoed back so
 * the client can retire exactly that event and keep its neighbours.
 */
export interface RejectedMobileReviewBatchItem {
  clientEventId: string;
  reason: string;
}

/**
 * Batch parsed with per-item salvage: the valid items, plus the terminally-invalid ones.
 */
export interface SalvagedMobileReviewBatchRequest extends ParsedMobileReviewBatchRequest {
  rejected: RejectedMobileReviewBatchItem[];
}

export class MobileReviewBatchRequestError extends Error {
  readonly code = 'validation' as const;

  constructor(message: string) {
    super(message);
    this.name = 'MobileReviewBatchRequestError';
  }
}

/**
 * CP17 F1/F5 — the item is well-formed but the server is **not currently configured** to accept
 * it (a binary `response` item while `LEARNBOX_BINARY_REVIEW` is off).
 *
 * This is deliberately NOT a `MobileReviewBatchRequestError`. A capability gap is a property of
 * the server's configuration, not a defect in the learner's event: the identical item becomes
 * valid the moment the flag is restored. Treating it as terminal would make a flag regression
 * silently destroy real learner reviews, so it must stay retryable and must never be salvaged
 * away per-item.
 */
export class MobileReviewBatchCapabilityError extends Error {
  readonly code = 'capabilityUnavailable' as const;

  constructor(message: string) {
    super(message);
    this.name = 'MobileReviewBatchCapabilityError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

export interface ParseOptions {
  /**
   * `LEARNBOX_BINARY_REVIEW` (CP5, default off). When on, an item may carry `response` ('known' |
   * 'unknown') INSTEAD of `grade`; the grade stored is the compatibility shadow grade. When off the wire
   * format is exactly v1.2.1: four grades, exact keys, `response` rejected.
   */
  binaryResponses?: boolean;
}

function parseItem(value: unknown, options: ParseOptions): MobileReviewBatchItem {
  if (options.binaryResponses && isRecord(value) && 'response' in value) {
    if (
      !exactKeys(value, ['clientEventId', 'contentId', 'response', 'occurredAt']) ||
      !isBinaryResponse(value.response)
    ) {
      throw new MobileReviewBatchRequestError('Each review item has an invalid shape.');
    }
    const { response } = value;
    return parseItem(
      {
        clientEventId: value.clientEventId,
        contentId: value.contentId,
        grade: shadowGradeFor(response),
        occurredAt: value.occurredAt,
      },
      {},
    );
  }
  if (
    !isRecord(value) ||
    !exactKeys(value, ['clientEventId', 'contentId', 'grade', 'occurredAt'])
  ) {
    // CP17 F5: a well-formed binary item arriving at a server whose binary acceptance is off is
    // a capability gap, not learner-event corruption. Classify it separately so it stays
    // retryable instead of being terminally rejected and discarded.
    if (!options.binaryResponses && isRecord(value) && 'response' in value) {
      throw new MobileReviewBatchCapabilityError(
        'Binary review responses are not enabled on this server.',
      );
    }
    throw new MobileReviewBatchRequestError('Each review item has an invalid shape.');
  }
  if (typeof value.contentId !== 'string' || value.contentId.length === 0) {
    throw new MobileReviewBatchRequestError('contentId must be a non-empty string.');
  }
  if (typeof value.grade !== 'string' || !isReviewGrade(value.grade)) {
    throw new MobileReviewBatchRequestError('grade is invalid.');
  }
  if (
    typeof value.clientEventId !== 'string' ||
    value.clientEventId.length < 1 ||
    value.clientEventId.length > 128
  ) {
    throw new MobileReviewBatchRequestError(
      'clientEventId must be text between 1 and 128 characters.',
    );
  }
  if (typeof value.occurredAt !== 'string') {
    throw new MobileReviewBatchRequestError('occurredAt must be an ISO date string.');
  }
  const occurredAt = new Date(value.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new MobileReviewBatchRequestError('occurredAt must be a valid date.');
  }
  return {
    contentId: value.contentId,
    grade: value.grade as MobileReviewBatchItem['grade'],
    occurredAt,
    clientEventId: value.clientEventId,
  };
}

function parseBinaryItem(value: unknown): MobileReviewBatchItem {
  const item = parseItem(value, { binaryResponses: true });
  if (isRecord(value) && isBinaryResponse(value.response)) {
    return { ...item, response: value.response };
  }
  return item;
}

/**
 * Envelope-level validation shared by both parsers.
 *
 * These failures are never per-item recoverable: a malformed envelope carries no trustworthy
 * evidence about any individual event, so it must reject the whole payload.
 */
function parseEnvelope(
  payload: unknown,
  userId: string,
): { items: unknown[]; reconciliationCursor?: string } {
  if (!isRecord(payload) || !exactKeys(payload, ['items'], ['reconciliationCursor'])) {
    throw new MobileReviewBatchRequestError('Review batch payload has an invalid shape.');
  }
  if (!Array.isArray(payload.items) || payload.items.length > MAX_BATCH_SIZE) {
    throw new MobileReviewBatchRequestError('Review batch exceeds the maximum of 20 items.');
  }
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new MobileReviewBatchRequestError('Authenticated user identity is required.');
  }
  const reconciliationCursor = payload.reconciliationCursor;
  if (
    reconciliationCursor !== undefined &&
    (typeof reconciliationCursor !== 'string' || !CURSOR_PATTERN.test(reconciliationCursor))
  ) {
    throw new MobileReviewBatchRequestError(
      'reconciliationCursor must be a non-negative decimal string.',
    );
  }
  return reconciliationCursor === undefined
    ? { items: payload.items }
    : { items: payload.items, reconciliationCursor };
}

export function parseMobileReviewBatchRequest(
  payload: unknown,
  userId: string,
  options: ParseOptions = {},
): ParsedMobileReviewBatchRequest {
  const envelope = parseEnvelope(payload, userId);
  const reconciliationCursor = envelope.reconciliationCursor;
  const items = envelope.items.map((item) =>
    options.binaryResponses ? parseBinaryItem(item) : parseItem(item, options),
  );
  if (new Set(items.map((item) => item.clientEventId)).size !== items.length) {
    throw new MobileReviewBatchRequestError('Duplicate client event id within one batch.');
  }
  const request: ParsedMobileReviewBatchRequest = { userId, items };
  if (reconciliationCursor !== undefined) request.reconciliationCursor = reconciliationCursor;
  return request;
}

/**
 * CP17 F1 — parse a batch with **per-item salvage**.
 *
 * Head-of-line poisoning fix. `parseMobileReviewBatchRequest` rejects the entire batch as soon as
 * one item throws, so a single terminally-invalid event blocks every valid event queued behind it
 * forever (the client retries the same head slice indefinitely).
 *
 * This variant keeps the **envelope** contract strict and only relaxes the **item** contract:
 *
 * * envelope shape, batch size, identity and cursor errors still throw — they are not per-item
 *   recoverable and a malformed envelope is not evidence about any individual event;
 * * a duplicate `clientEventId` within one batch still throws, because silently de-duplicating
 *   would weaken the exactly-once guarantee;
 * * an item that cannot be parsed is returned in `rejected` with its `clientEventId`, never
 *   dropped silently and never submitted to the scheduler.
 *
 * An item whose `clientEventId` is itself unusable cannot be reported back coherently, so it
 * still fails the whole batch rather than being discarded without a trace.
 */
export function parseMobileReviewBatchRequestSalvaging(
  payload: unknown,
  userId: string,
  options: ParseOptions = {},
): SalvagedMobileReviewBatchRequest {
  const envelope = parseEnvelope(payload, userId);
  const items: MobileReviewBatchItem[] = [];
  const rejected: RejectedMobileReviewBatchItem[] = [];

  for (const raw of envelope.items) {
    try {
      items.push(options.binaryResponses ? parseBinaryItem(raw) : parseItem(raw, options));
    } catch (cause) {
      if (!(cause instanceof MobileReviewBatchRequestError)) throw cause;
      const clientEventId = isRecord(raw) ? raw.clientEventId : undefined;
      if (typeof clientEventId !== 'string' || clientEventId.length === 0) {
        // No usable identity to report back: fail the batch rather than lose the event silently.
        throw cause;
      }
      rejected.push({ clientEventId, reason: cause.message });
    }
  }

  const allIds = [
    ...items.map((item) => item.clientEventId),
    ...rejected.map((r) => r.clientEventId),
  ];
  if (new Set(allIds).size !== allIds.length) {
    throw new MobileReviewBatchRequestError('Duplicate client event id within one batch.');
  }

  const request: SalvagedMobileReviewBatchRequest = { userId, items, rejected };
  if (envelope.reconciliationCursor !== undefined) {
    request.reconciliationCursor = envelope.reconciliationCursor;
  }
  return request;
}
