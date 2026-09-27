import { describe, expect, it } from 'vitest';

import {
  MobileReviewBatchRequestError,
  parseMobileReviewBatchRequest,
} from '../src/reviews/mobile-review-batch.request.js';

const validItem = {
  contentId: 'start-a1-haus',
  grade: 'remembered',
  occurredAt: '2026-08-24T12:00:00.000Z',
  clientEventId: 'event-1',
};

describe('parseMobileReviewBatchRequest', () => {
  it('parses a strict request and binds the server-derived user id', () => {
    const request = parseMobileReviewBatchRequest(
      {
        items: [validItem],
        reconciliationCursor: '41',
      },
      '2efaf676-84e4-45b1-8a13-50735a8df2c8',
    );

    expect(request).toEqual({
      userId: '2efaf676-84e4-45b1-8a13-50735a8df2c8',
      items: [
        {
          ...validItem,
          occurredAt: new Date('2026-08-24T12:00:00.000Z'),
        },
      ],
      reconciliationCursor: '41',
    });
  });

  it('rejects client-supplied identity and unknown top-level fields', () => {
    expect(() =>
      parseMobileReviewBatchRequest(
        { items: [validItem], userId: 'attacker' },
        '2efaf676-84e4-45b1-8a13-50735a8df2c8',
      ),
    ).toThrowError(MobileReviewBatchRequestError);

    expect(() =>
      parseMobileReviewBatchRequest(
        { items: [validItem], extra: true },
        '2efaf676-84e4-45b1-8a13-50735a8df2c8',
      ),
    ).toThrowError(MobileReviewBatchRequestError);
  });

  it('rejects duplicate client event ids before domain work', () => {
    expect(() =>
      parseMobileReviewBatchRequest(
        { items: [validItem, { ...validItem, grade: 'hard' }] },
        '2efaf676-84e4-45b1-8a13-50735a8df2c8',
      ),
    ).toThrowError(MobileReviewBatchRequestError);
  });

  it('rejects malformed or non-string cursors before any domain work', () => {
    for (const cursor of ['', '-1', '1.5', 41, null]) {
      expect(() =>
        parseMobileReviewBatchRequest(
          { items: [validItem], reconciliationCursor: cursor },
          '2efaf676-84e4-45b1-8a13-50735a8df2c8',
        ),
      ).toThrowError(MobileReviewBatchRequestError);
    }
  });
});
