import type { CardSchedule, ReviewEventWriteResult } from '@learnbox/learning-engine';
import { describe, expect, it, vi } from 'vitest';

import {
  MobileReviewBatchError,
  MobileReviewBatchService,
  MOBILE_REVIEW_BATCH_MAX,
  type MobileReviewBatchItem,
  type MobileReviewBatchRequest,
} from '../src/reviews/mobile-review-batch.service.js';
import { ReviewIdempotencyConflictError } from '../src/reviews/postgres-review-event.store.js';
import type { PostgresReviewEventStore } from '../src/reviews/postgres-review-event.store.js';

const userId = '2efaf676-84e4-45b1-8a13-50735a8df2c8';
const cardId = '170b8a2a-7fa7-4e26-94ba-37e3a7fb65da';
const fixedNow = new Date('2026-07-26T12:30:00Z');

const schedule: CardSchedule = {
  state: 'learning',
  stabilityDays: 1,
  difficulty: 5,
  lapses: 0,
  dueAt: new Date('2026-07-20T12:00:00Z'),
};

const written = (clientEventId: string, grade: 'forgot' | 'hard' | 'remembered' | 'mastered') =>
  ({
    event: {
      id: `persisted-${clientEventId}`,
      userId,
      cardId,
      grade,
      occurredAt: new Date('2026-07-26T12:00:00Z'),
      clientEventId,
    },
    schedule,
    idempotent: false,
    reconciliationCursor: '3',
  }) satisfies ReviewEventWriteResult;

const item = (overrides: Partial<MobileReviewBatchItem> = {}): MobileReviewBatchItem => ({
  contentId: 'content-a',
  grade: 'forgot',
  occurredAt: new Date('2026-07-26T12:00:00Z'),
  clientEventId: 'evt-1',
  ...overrides,
});

const request = (items: MobileReviewBatchItem[]): MobileReviewBatchRequest => ({ userId, items });

interface CallLog {
  bootstrap: number;
  resolve: string[];
  schedule: string[];
  write: string[];
}

function mockStore(
  overrides: {
    write?: (input: MobileReviewBatchItem & { userId: string }) => Promise<ReviewEventWriteResult>;
  } = {},
) {
  const log: CallLog = { bootstrap: 0, resolve: [], schedule: [], write: [] };
  const store = {
    bootstrapSchedules: vi.fn(async () => {
      log.bootstrap += 1;
    }),
    resolveCardId: vi.fn(async (contentId: string) => {
      log.resolve.push(contentId);
      return contentId === 'content-a' ? cardId : null;
    }),
    findSchedule: vi.fn(async (learnerId: string, foundCardId: string) => {
      log.schedule.push(foundCardId);
      return foundCardId === cardId ? schedule : null;
    }),
    writeAtomically: vi.fn(async (input: { userId: string } & MobileReviewBatchItem) => {
      log.write.push(input.clientEventId);
      if (overrides.write) return overrides.write(input);
      return written(input.clientEventId, input.grade);
    }),
  } as unknown as PostgresReviewEventStore;
  return { store, log };
}

describe('MobileReviewBatchService', () => {
  it('rejects a batch over the max of 20 before any store call', async () => {
    const { store, log } = mockStore();
    const service = new MobileReviewBatchService(store, () => fixedNow);
    const items = Array.from({ length: MOBILE_REVIEW_BATCH_MAX + 1 }, (_, i) =>
      item({ clientEventId: `evt-${i}` }),
    );

    await expect(service.submit(request(items))).rejects.toBeInstanceOf(MobileReviewBatchError);
    await expect(service.submit(request(items))).rejects.toMatchObject({ code: 'validation' });
    expect(log.bootstrap).toBe(0);
    expect(log.write).toEqual([]);
  });

  it('rejects duplicate client event ids in one batch before any store call', async () => {
    const { store, log } = mockStore();
    const service = new MobileReviewBatchService(store, () => fixedNow);

    await expect(service.submit(request([item(), item({ grade: 'hard' })]))).rejects.toMatchObject({
      code: 'validation',
    });
    expect(log.bootstrap).toBe(0);
  });

  it('rejects malformed items before any write', async () => {
    const { store, log } = mockStore();
    const service = new MobileReviewBatchService(store, () => fixedNow);
    const invalid = item({ grade: 'unknown' as 'forgot' });

    await expect(service.submit(request([invalid]))).rejects.toMatchObject({ code: 'validation' });
    await expect(
      service.submit(request([item({ occurredAt: new Date('nope') })])),
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(service.submit(request([item({ clientEventId: '' })]))).rejects.toMatchObject({
      code: 'validation',
    });
    expect(log.write).toEqual([]);
  });

  it('bootstraps schedules once and processes items in persisted order', async () => {
    const { store, log } = mockStore();
    const service = new MobileReviewBatchService(store, () => fixedNow);
    const items = [
      item({ clientEventId: 'evt-1' }),
      item({ clientEventId: 'evt-2', grade: 'remembered' }),
      item({ clientEventId: 'evt-3', grade: 'mastered' }),
    ];

    const outcomes = await service.submit(request(items));

    expect(log.bootstrap).toBe(1);
    expect(log.resolve).toEqual(['content-a', 'content-a', 'content-a']);
    expect(log.schedule).toEqual([cardId, cardId, cardId]);
    expect(log.write).toEqual(['evt-1', 'evt-2', 'evt-3']);
    expect(outcomes).toHaveLength(3);
    for (const outcome of outcomes) {
      expect(outcome.status).toBe('acknowledged');
      if (outcome.status === 'acknowledged') {
        expect(outcome.idempotent).toBe(false);
        expect(outcome.eventId).toMatch(/^persisted-/);
        expect(outcome.reconciliationCursor).toBe('3');
      }
    }
  });

  it('acknowledges an exact idempotent replay with the authoritative cursor and no bump', async () => {
    const { store, log } = mockStore({
      write: async () => ({
        ...written('evt-1', 'forgot'),
        idempotent: true,
        reconciliationCursor: '7',
      }),
    });
    const service = new MobileReviewBatchService(store, () => fixedNow);

    const [outcome] = await service.submit(request([item()]));

    expect(outcome).toMatchObject({ status: 'acknowledged', idempotent: true });
    if (outcome.status === 'acknowledged') {
      expect(outcome.reconciliationCursor).toBe('7');
    }
    expect(log.write).toEqual(['evt-1']);
  });

  it('never reports a cursor for validation or clockSkew outcomes', async () => {
    const { store, log } = mockStore();
    const service = new MobileReviewBatchService(store, () => fixedNow);
    const unknown = item({ contentId: 'content-unknown', clientEventId: 'evt-u' });
    const skew = item({ occurredAt: new Date('2026-07-26T12:40:00Z'), clientEventId: 'evt-f' });
    // make the schedule lookup miss only for the second card
    store.findSchedule = vi.fn(async (learnerId: string, foundCardId: string) =>
      foundCardId === cardId ? schedule : null,
    ) as typeof store.findSchedule;
    const noSchedule = item({ contentId: 'content-b', clientEventId: 'evt-s' });

    const outcomes = await service.submit(request([unknown, noSchedule, skew]));

    expect(outcomes[0]).toMatchObject({ status: 'validation', clientEventId: 'evt-u' });
    expect(outcomes[1]).toMatchObject({ status: 'validation', clientEventId: 'evt-s' });
    expect(outcomes[2]).toMatchObject({ status: 'clockSkew', clientEventId: 'evt-f' });
    for (const outcome of outcomes) {
      expect(outcome).not.toHaveProperty('reconciliationCursor');
    }
    expect(log.write).toEqual([]);
  });

  it('surfaces an idempotency conflict per item and keeps processing the rest', async () => {
    const { store, log } = mockStore({
      write: async (input) => {
        if (input.clientEventId === 'evt-1') {
          throw new ReviewIdempotencyConflictError(userId, 'evt-1');
        }
        return written(input.clientEventId, input.grade);
      },
    });
    const service = new MobileReviewBatchService(store, () => fixedNow);

    const outcomes = await service.submit(request([item(), item({ clientEventId: 'evt-2' })]));

    expect(outcomes[0]).toMatchObject({ status: 'idempotencyConflict', clientEventId: 'evt-1' });
    expect(outcomes[1]).toMatchObject({ status: 'acknowledged', clientEventId: 'evt-2' });
    expect(log.write).toEqual(['evt-1', 'evt-2']);
  });

  it('never acknowledges unknown content or missing schedules', async () => {
    const { store, log } = mockStore();
    const service = new MobileReviewBatchService(store, () => fixedNow);
    const unknown = item({ contentId: 'content-unknown', clientEventId: 'evt-u' });
    const noSchedule = item({ clientEventId: 'evt-s' });
    // make the schedule lookup miss only for the second card via a custom store
    store.findSchedule = vi.fn(async () => null) as typeof store.findSchedule;

    const outcomes = await service.submit(request([unknown, noSchedule]));

    expect(outcomes[0]).toMatchObject({ status: 'validation', clientEventId: 'evt-u' });
    expect(outcomes[1]).toMatchObject({ status: 'validation', clientEventId: 'evt-s' });
    expect(log.write).toEqual([]);
  });

  it('rejects a future device clock as clockSkew without writing', async () => {
    const { store, log } = mockStore();
    const service = new MobileReviewBatchService(store, () => fixedNow);

    const [outcome] = await service.submit(
      request([item({ occurredAt: new Date('2026-07-26T12:40:00Z'), clientEventId: 'evt-f' })]),
    );

    expect(outcome).toMatchObject({ status: 'clockSkew', clientEventId: 'evt-f' });
    expect(log.write).toEqual([]);
  });

  it('rejects an out-of-bound past timestamp without writing', async () => {
    const { store, log } = mockStore();
    const service = new MobileReviewBatchService(store, () => fixedNow);

    const [outcome] = await service.submit(
      request([item({ occurredAt: new Date('2025-01-01T00:00:00Z'), clientEventId: 'evt-old' })]),
    );

    expect(outcome).toMatchObject({ status: 'validation', clientEventId: 'evt-old' });
    expect(log.write).toEqual([]);
  });

  it('aborts with a typed server failure and no partial acknowledgement after a commit', async () => {
    const { store, log } = mockStore({
      write: async (input) => {
        if (input.clientEventId === 'evt-2') throw new Error('connection reset');
        return written(input.clientEventId, input.grade);
      },
    });
    const service = new MobileReviewBatchService(store, () => fixedNow);

    await expect(
      service.submit(
        request([item(), item({ clientEventId: 'evt-2' }), item({ clientEventId: 'evt-3' })]),
      ),
    ).rejects.toMatchObject({ code: 'serverUnavailable' });
    expect(log.write).toEqual(['evt-1', 'evt-2']);
  });

  it('returns empty outcomes for an empty batch without touching the store', async () => {
    const { store, log } = mockStore();
    const service = new MobileReviewBatchService(store, () => fixedNow);

    const outcomes = await service.submit(request([]));

    expect(outcomes).toEqual([]);
    expect(log.bootstrap).toBe(0);
  });
});
