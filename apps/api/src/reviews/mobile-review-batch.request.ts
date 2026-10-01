import { isBinaryResponse, isReviewGrade, shadowGradeFor } from '@learnbox/learning-engine';

import type { MobileReviewBatchItem } from './mobile-review-batch.service.js';

const MAX_BATCH_SIZE = 20;
const CURSOR_PATTERN = /^[0-9]+$/;

export interface ParsedMobileReviewBatchRequest {
  userId: string;
  items: MobileReviewBatchItem[];
  reconciliationCursor?: string;
}

export class MobileReviewBatchRequestError extends Error {
  readonly code = 'validation' as const;

  constructor(message: string) {
    super(message);
    this.name = 'MobileReviewBatchRequestError';
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

export function parseMobileReviewBatchRequest(
  payload: unknown,
  userId: string,
  options: ParseOptions = {},
): ParsedMobileReviewBatchRequest {
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
  const items = payload.items.map((item) =>
    options.binaryResponses ? parseBinaryItem(item) : parseItem(item, options),
  );
  if (new Set(items.map((item) => item.clientEventId)).size !== items.length) {
    throw new MobileReviewBatchRequestError('Duplicate client event id within one batch.');
  }
  const request: ParsedMobileReviewBatchRequest = { userId, items };
  if (reconciliationCursor !== undefined) request.reconciliationCursor = reconciliationCursor;
  return request;
}
