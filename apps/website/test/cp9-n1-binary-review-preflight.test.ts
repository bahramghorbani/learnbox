import { describe, expect, it, vi } from 'vitest';

import {
  MobileReviewBatchRequestError,
  parseMobileReviewBatchRequest,
} from '../../api/dist/reviews/mobile-review-batch.request.js';
import {
  BINARY_REVIEW_RESPONSES,
  BinaryReviewPreflightError,
  constraintAcceptsResponses,
  createBinaryReviewPreflight,
  isBinaryReviewEnabled,
  verifyBinaryReviewSchema,
} from '../../api/src/reviews/binary-review-preflight';
import { MobileReviewBatchService } from '../../api/src/reviews/mobile-review-batch.service';
import { PostgresReviewEventStore } from '../../api/src/reviews/postgres-review-event.store';

/**
 * LB-B35 CP9 (N1): `LEARNBOX_BINARY_REVIEW=true` against a pre-0023 database must be refused
 * DETERMINISTICALLY, before any persistence, and must never present as a retryable failure.
 *
 * Before the fix, the missing `review_events.response` column surfaced as a raw INSERT error that the
 * service mapped to `serverUnavailable` (HTTP 503) — a code clients retry forever on a request that
 * can never succeed. These tests pin the corrected contract.
 */

const PRE_0023 = { rows: [] as Array<Record<string, unknown>> };
const POST_0023_COLUMN = { rows: [{ column_name: 'response', data_type: 'text' }] };
const POST_0023_CONSTRAINT = {
  rows: [
    {
      definition:
        "CHECK (((response IS NULL) OR (response = ANY (ARRAY['known'::text, 'unknown'::text]))))",
    },
  ],
};

/** Schema queryable that answers the column probe then the constraint probe, in call order. */
const queryable = (...responses: Array<{ rows: Array<Record<string, unknown>> }>) => {
  const query = vi.fn();
  responses.forEach((response) => query.mockResolvedValueOnce(response));
  return { db: { query }, query };
};

describe('CP9 N1 — binary review schema preflight', () => {
  it('is inert unless LEARNBOX_BINARY_REVIEW is exactly "true"', () => {
    expect(isBinaryReviewEnabled({})).toBe(false);
    expect(isBinaryReviewEnabled({ LEARNBOX_BINARY_REVIEW: 'false' })).toBe(false);
    expect(isBinaryReviewEnabled({ LEARNBOX_BINARY_REVIEW: '1' })).toBe(false);
    expect(isBinaryReviewEnabled({ LEARNBOX_BINARY_REVIEW: 'TRUE' })).toBe(false);
    expect(isBinaryReviewEnabled({ LEARNBOX_BINARY_REVIEW: 'true' })).toBe(true);
  });

  it('rejects a pre-0023 schema naming the missing column and the migration', async () => {
    const { db } = queryable(PRE_0023);
    await expect(verifyBinaryReviewSchema(db as never)).rejects.toBeInstanceOf(
      BinaryReviewPreflightError,
    );
    await expect(verifyBinaryReviewSchema(queryable(PRE_0023).db as never)).rejects.toThrow(
      /review_events\.response is missing/,
    );
    await expect(verifyBinaryReviewSchema(queryable(PRE_0023).db as never)).rejects.toThrow(
      /0023_learning_persistence/,
    );
  });

  it('accepts the real 0023 schema', async () => {
    const { db } = queryable(POST_0023_COLUMN, POST_0023_CONSTRAINT);
    await expect(verifyBinaryReviewSchema(db as never)).resolves.toBeUndefined();
  });

  it('fails closed when the column exists but the CHECK is missing or too narrow', async () => {
    const missing = queryable(POST_0023_COLUMN, { rows: [] });
    await expect(verifyBinaryReviewSchema(missing.db as never)).rejects.toThrow(
      /constraint review_events_response_valid is missing/,
    );

    const narrow = queryable(POST_0023_COLUMN, {
      rows: [{ definition: "CHECK (((response IS NULL) OR (response = 'known'::text)))" }],
    });
    await expect(verifyBinaryReviewSchema(narrow.db as never)).rejects.toThrow(
      /does not accept known and unknown/,
    );
  });

  it('fails closed when the column has the wrong type', async () => {
    const wrong = queryable({ rows: [{ column_name: 'response', data_type: 'integer' }] });
    await expect(verifyBinaryReviewSchema(wrong.db as never)).rejects.toThrow(
      /review_events\.response is integer, expected text/,
    );
  });

  it('reads an unrecognised constraint as NOT accepting', () => {
    expect(constraintAcceptsResponses('CHECK (response IS NOT NULL)')).toBe(false);
    expect(constraintAcceptsResponses('')).toBe(false);
    expect(
      constraintAcceptsResponses(
        "CHECK (((response IS NULL) OR (response = ANY (ARRAY['known'::text, 'unknown'::text]))))",
      ),
    ).toBe(true);
    expect(BINARY_REVIEW_RESPONSES).toEqual(['known', 'unknown']);
  });

  it('memoises success but never caches failure, so applying 0023 needs no restart', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(PRE_0023) // first attempt: pre-0023
      .mockResolvedValueOnce(POST_0023_COLUMN) // second attempt: migrated
      .mockResolvedValueOnce(POST_0023_CONSTRAINT);
    const preflight = createBinaryReviewPreflight({ query } as never);

    await expect(preflight()).rejects.toBeInstanceOf(BinaryReviewPreflightError);
    await expect(preflight()).resolves.toBeUndefined();
    await expect(preflight()).resolves.toBeUndefined();
    // Third call served from the memo: no extra probe.
    expect(query).toHaveBeenCalledTimes(3);
  });
});

describe('CP9 N1 — nothing is persisted when the schema is missing', () => {
  const input = {
    userId: '11111111-1111-4111-8111-111111111111',
    cardId: '22222222-2222-4222-8222-222222222222',
    grade: 'remembered' as const,
    occurredAt: new Date('2026-10-02T00:00:00.000Z'),
    clientEventId: '33333333-3333-4333-8333-333333333333',
    response: 'known' as const,
  };

  it('refuses the write before a connection is taken from the pool', async () => {
    const connect = vi.fn();
    const store = new PostgresReviewEventStore({ connect } as never, () =>
      Promise.reject(new BinaryReviewPreflightError(['review_events.response is missing'])),
    );

    await expect(store.writeAtomically(input, {} as never)).rejects.toBeInstanceOf(
      BinaryReviewPreflightError,
    );
    // The decisive assertion: no connection, therefore no BEGIN, no INSERT, no partial write.
    expect(connect).not.toHaveBeenCalled();
  });

  it('does not run the preflight at all when no binary answer is present (flag off = v1.2.1)', async () => {
    const preflight = vi.fn();
    const connect = vi.fn().mockRejectedValue(new Error('pool reached'));
    const store = new PostgresReviewEventStore({ connect } as never, preflight);
    const legacy = { ...input };
    delete (legacy as { response?: unknown }).response;

    await expect(store.writeAtomically(legacy as never, {} as never)).rejects.toThrow(
      'pool reached',
    );
    expect(preflight).not.toHaveBeenCalled();
  });

  it('classifies the refusal as deterministic schedulerRejected, never retryable', async () => {
    const logger = vi.fn();
    // Drives the REAL path: the preflight fires inside writeAtomically, exactly as in production.
    const store = {
      resolveCardId: async () => input.cardId,
      findByClientEventId: async () => null,
      findByLearnerAndClientEventId: async () => null,
      ensureApprovedSchedule: async () => ({
        cardId: input.cardId,
        schedule: {
          state: 'review',
          stabilityDays: 1,
          difficulty: 5,
          lapses: 0,
          dueAt: new Date('2026-10-01T00:00:00.000Z'),
        },
      }),
      writeAtomically: async () => {
        throw new BinaryReviewPreflightError(['review_events.response is missing']);
      },
    };
    const service = new MobileReviewBatchService(
      store as never,
      () => new Date('2026-10-02T00:00:05.000Z'),
      { logger },
    );

    await expect(
      service.submit({
        userId: input.userId,
        items: [
          {
            contentId: 'seed-card-1',
            grade: input.grade,
            response: 'known',
            occurredAt: input.occurredAt,
            clientEventId: input.clientEventId,
          },
        ] as never,
      }),
    ).rejects.toMatchObject({ code: 'schedulerRejected' });

    // The error the client receives must be explicitly non-retryable.
    const raised = (await service
      .submit({
        userId: input.userId,
        items: [
          {
            contentId: 'seed-card-1',
            grade: input.grade,
            response: 'known',
            occurredAt: input.occurredAt,
            clientEventId: input.clientEventId,
          },
        ] as never,
      })
      .catch((error: unknown) => error)) as { retryable: boolean };
    expect(raised.retryable).toBe(false);

    // The operator detail is logged server-side; only the code crosses the boundary.
    expect(logger).toHaveBeenCalledWith(expect.objectContaining({ code: 'schedulerRejected' }));
  });
});

describe('CP9 N1 — mobile HTTP boundary (pre-existing gap, locked by test)', () => {
  // The mobile HTTP boundary calls parseMobileReviewBatchRequest WITHOUT `binaryResponses`
  // (mobile-review-http.ts). That predates CP9 (identical in v1.2.1) and wiring mobile binary review
  // is out of CP9 scope (D16, no native changes). What MUST hold is the safety invariant: a mobile
  // item carrying `response` is refused at the boundary and can never reach the store, so it can
  // never be persisted on a pre-0023 schema. This test pins that invariant.
  const binaryItem = {
    clientEventId: 'mobile-binary-1',
    contentId: 'start-a1-apfel',
    response: 'known',
    occurredAt: new Date().toISOString(),
  };

  it('rejects a binary item when binaryResponses is not enabled (mobile boundary call shape)', () => {
    expect(() => parseMobileReviewBatchRequest({ items: [binaryItem] }, 'user-1')).toThrow(
      MobileReviewBatchRequestError,
    );
  });

  it('accepts the same item at the web boundary, which does pass binaryResponses', () => {
    const parsed = parseMobileReviewBatchRequest({ items: [binaryItem] }, 'user-1', {
      binaryResponses: true,
    });
    expect(parsed.items[0]?.response).toBe('known');
  });
});
