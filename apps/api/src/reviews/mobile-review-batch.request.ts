import type { MobileReviewBatchItem } from './mobile-review-batch.service.js';

const MAX_BATCH_SIZE = 20;
const GRADES = new Set(['forgot', 'hard', 'remembered', 'mastered']);
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

function parseItem(value: unknown): MobileReviewBatchItem {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['clientEventId', 'contentId', 'grade', 'occurredAt'])
  ) {
    throw new MobileReviewBatchRequestError('Each review item has an invalid shape.');
  }
  if (typeof value.contentId !== 'string' || value.contentId.length === 0) {
    throw new MobileReviewBatchRequestError('contentId must be a non-empty string.');
  }
  if (typeof value.grade !== 'string' || !GRADES.has(value.grade)) {
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

export function parseMobileReviewBatchRequest(
  payload: unknown,
  userId: string,
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
  const items = payload.items.map(parseItem);
  if (new Set(items.map((item) => item.clientEventId)).size !== items.length) {
    throw new MobileReviewBatchRequestError('Duplicate client event id within one batch.');
  }
  const request: ParsedMobileReviewBatchRequest = { userId, items };
  if (reconciliationCursor !== undefined) request.reconciliationCursor = reconciliationCursor;
  return request;
}
