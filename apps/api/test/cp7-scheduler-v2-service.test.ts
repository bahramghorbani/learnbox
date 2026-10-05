import {
  scheduleBinaryReview,
  scheduleReview,
  SchedulerInvariantError,
  type CardSchedule,
} from '@learnbox/learning-engine';
import { describe, expect, it, vi } from 'vitest';

import {
  MobileReviewBatchError,
  type MobileReviewBatchErrorCode,
  MobileReviewBatchService,
  type MobileReviewBatchItem,
} from '../src/reviews/mobile-review-batch.service.js';
import {
  constraintAcceptsEngineVersion,
  createSchedulerV2Preflight,
  isSchedulerV2Enabled,
  SchedulerV2PreflightError,
  verifySchedulerV2Schema,
  type SchemaQueryable,
} from '../src/reviews/scheduler-v2-preflight.js';
import type { PostgresReviewEventStore } from '../src/reviews/postgres-review-event.store.js';

const NOW = new Date('2026-10-01T09:00:00Z');
const schedule: CardSchedule = {
  state: 'review',
  stabilityDays: 5,
  difficulty: 5,
  lapses: 0,
  dueAt: new Date('2026-09-30T00:00:00Z'),
};
const item = (o: Partial<MobileReviewBatchItem> = {}): MobileReviewBatchItem => ({
  contentId: 'c',
  grade: 'remembered',
  occurredAt: NOW,
  clientEventId: 'e1',
  ...o,
});

function fakeStore() {
  const writeAtomically = vi.fn(async (input: { grade: string }, next: CardSchedule) => ({
    event: {
      id: 'x',
      userId: 'u',
      cardId: 'card',
      grade: input.grade,
      occurredAt: NOW,
      clientEventId: 'e1',
    },
    schedule: next,
    idempotent: false,
    reconciliationCursor: '1',
  }));
  const store = {
    resolveCardId: vi.fn(async () => 'card'),
    findByLearnerAndClientEventId: vi.fn(async () => null),
    ensureApprovedSchedule: vi.fn(async () => ({ cardId: 'card', schedule })),
    writeAtomically,
  } as unknown as PostgresReviewEventStore;
  return { store, writeAtomically };
}

describe('LEARNBOX_SCHEDULER_V2 flag parsing', () => {
  it('is on only for the exact string "true"', () => {
    expect(isSchedulerV2Enabled({})).toBe(false);
    for (const v of ['', 'false', 'TRUE', '1', 'yes', ' true']) {
      expect(isSchedulerV2Enabled({ LEARNBOX_SCHEDULER_V2: v })).toBe(false);
    }
    expect(isSchedulerV2Enabled({ LEARNBOX_SCHEDULER_V2: 'true' })).toBe(true);
  });
});

describe('constraintAcceptsEngineVersion (reads what Postgres really stores)', () => {
  it('accepts the exact definition migration 0023 produces, in both spellings', () => {
    expect(
      constraintAcceptsEngineVersion(
        'CHECK (((engine_version IS NULL) OR ((engine_version >= 1) AND (engine_version <= 100))))',
        2,
      ),
    ).toBe(true);
    expect(
      constraintAcceptsEngineVersion(
        'CHECK (engine_version IS NULL OR engine_version BETWEEN 1 AND 100)',
        2,
      ),
    ).toBe(true);
  });
  it('rejects ranges that exclude 2 and anything it cannot recognise (fail closed)', () => {
    for (const d of [
      'CHECK (((engine_version >= 1) AND (engine_version <= 1)))',
      'CHECK (engine_version BETWEEN 3 AND 9)',
      'CHECK (((engine_version >= 1) AND (engine_version < 2)))',
      'CHECK (engine_version IN (1, 3))',
      'CHECK (true)',
      '',
    ]) {
      expect(constraintAcceptsEngineVersion(d, 2), d).toBe(false);
    }
  });
});

describe('verifySchedulerV2Schema (unit)', () => {
  const db = (columns: Array<[string, string]>, definition?: string): SchemaQueryable => ({
    query: async (sql: string) => {
      if (sql.includes('information_schema.columns')) {
        return { rows: columns.map(([column_name, data_type]) => ({ column_name, data_type })) };
      }
      return { rows: definition === undefined ? [] : [{ definition }] };
    },
  });
  const good =
    'CHECK (((engine_version IS NULL) OR ((engine_version >= 1) AND (engine_version <= 100))))';

  it('passes only when column, type and constraint are all right', async () => {
    await expect(
      verifySchedulerV2Schema(
        db(
          [
            ['engine_version', 'smallint'],
            ['response', 'text'],
          ],
          good,
        ),
      ),
    ).resolves.toBeUndefined();
  });
  it('reports every problem in one operator error', async () => {
    const err = await verifySchedulerV2Schema(db([])).catch((e) => e);
    expect(err).toBeInstanceOf(SchedulerV2PreflightError);
    expect(err.problems).toEqual([
      'review_events.engine_version is missing',
      'review_events.response is missing',
    ]);
  });
  it('refuses a wrong column type, a missing constraint and a constraint that excludes 2', async () => {
    const cols: Array<[string, string]> = [
      ['engine_version', 'smallint'],
      ['response', 'text'],
    ];
    const wrongType = await verifySchedulerV2Schema(
      db(
        [
          ['engine_version', 'integer'],
          ['response', 'text'],
        ],
        good,
      ),
    ).catch((e) => e);
    expect(wrongType).toBeInstanceOf(SchedulerV2PreflightError);
    expect(wrongType.problems).toEqual([
      'review_events.engine_version is integer, expected smallint',
    ]);

    const noConstraint = await verifySchedulerV2Schema(db(cols)).catch((e) => e);
    expect(noConstraint).toBeInstanceOf(SchedulerV2PreflightError);
    expect(noConstraint.problems).toEqual([
      'constraint review_events_engine_version_valid is missing',
    ]);

    const strict = await verifySchedulerV2Schema(
      db(cols, 'CHECK (((engine_version >= 1) AND (engine_version <= 1)))'),
    ).catch((e) => e);
    expect(strict).toBeInstanceOf(SchedulerV2PreflightError);
    expect(strict.problems).toEqual([
      'constraint review_events_engine_version_valid does not accept engine_version 2',
    ]);

    const noResponse = await verifySchedulerV2Schema(
      db([['engine_version', 'smallint']], good),
    ).catch((e) => e);
    expect(noResponse.problems).toEqual(['review_events.response is missing']);
  });
  it('a failed preflight is retried on the next call; a successful one is memoised', async () => {
    let calls = 0;
    let ready = false;
    const flaky: SchemaQueryable = {
      query: async (sql: string) => {
        if (sql.includes('information_schema.columns')) {
          calls++;
          return {
            rows: ready
              ? [
                  { column_name: 'engine_version', data_type: 'smallint' },
                  { column_name: 'response', data_type: 'text' },
                ]
              : [],
          };
        }
        return { rows: [{ definition: good }] };
      },
    };
    const check = createSchedulerV2Preflight(flaky);
    await expect(check()).rejects.toBeInstanceOf(SchedulerV2PreflightError);
    await expect(check()).rejects.toBeInstanceOf(SchedulerV2PreflightError);
    expect(calls).toBe(2); // not cached
    ready = true;
    await expect(check()).resolves.toBeUndefined();
    await check();
    await check();
    expect(calls).toBe(3); // memoised after success
  });
});

describe('MobileReviewBatchService flag handling', () => {
  it('flag off (no options) is exactly scheduleReview and carries no engine stamp', async () => {
    const { store, writeAtomically } = fakeStore();
    await new MobileReviewBatchService(store, () => NOW).submit({ userId: 'u', items: [item()] });
    const [input, next] = writeAtomically.mock.calls[0] as unknown as [
      Record<string, unknown>,
      CardSchedule,
    ];
    expect(next).toEqual(scheduleReview(schedule, 'remembered', NOW));
    expect('engineVersion' in input).toBe(false);
  });
  it('flag explicitly false behaves the same as no options', async () => {
    const { store, writeAtomically } = fakeStore();
    await new MobileReviewBatchService(store, () => NOW, { schedulerV2: false }).submit({
      userId: 'u',
      items: [item()],
    });
    const [input, next] = writeAtomically.mock.calls[0] as unknown as [
      Record<string, unknown>,
      CardSchedule,
    ];
    expect(next).toEqual(scheduleReview(schedule, 'remembered', NOW));
    expect('engineVersion' in input).toBe(false);
  });
  it('flag on uses scheduleBinaryReview and stamps engineVersion 2, after the preflight', async () => {
    const { store, writeAtomically } = fakeStore();
    const order: string[] = [];
    const preflight = vi.fn(async () => void order.push('preflight'));
    writeAtomically.mockImplementationOnce(async (input, next) => {
      order.push('write');
      return {
        event: {
          id: 'x',
          userId: 'u',
          cardId: 'card',
          grade: input.grade,
          occurredAt: NOW,
          clientEventId: 'e1',
        },
        schedule: next,
        idempotent: false,
        reconciliationCursor: '1',
      } as never;
    });
    await new MobileReviewBatchService(store, () => NOW, {
      schedulerV2: true,
      schedulerV2Preflight: preflight,
    }).submit({ userId: 'u', items: [item({ response: 'known' })] });
    const [input, next] = writeAtomically.mock.calls[0] as unknown as [
      Record<string, unknown>,
      CardSchedule,
    ];
    expect(next).toEqual(
      scheduleBinaryReview(schedule, { grade: 'remembered', response: 'known' }, NOW),
    );
    expect(input.engineVersion).toBe(2);
    expect(order).toEqual(['preflight', 'write']);
  });
  it('a failing preflight refuses the whole batch before any read or write', async () => {
    const { store, writeAtomically } = fakeStore();
    const svc = new MobileReviewBatchService(store, () => NOW, {
      schedulerV2: true,
      schedulerV2Preflight: async () => {
        throw new SchedulerV2PreflightError(['review_events.engine_version is missing']);
      },
    });
    // LB-B35 CP7 fix: a deterministic preflight refusal is now `schedulerRejected`, not a
    // retryable `serverUnavailable`, and the original cause is preserved for the operator.
    await expect(svc.submit({ userId: 'u', items: [item()] })).rejects.toMatchObject({
      code: 'schedulerRejected',
    });
    expect(writeAtomically).not.toHaveBeenCalled();
    expect(
      (store as never as { ensureApprovedSchedule: ReturnType<typeof vi.fn> })
        .ensureApprovedSchedule,
    ).not.toHaveBeenCalled();
  });
  it('an invariant violation (corrupt stored stability) refuses the write', async () => {
    const { store, writeAtomically } = fakeStore();
    (
      store as never as { ensureApprovedSchedule: ReturnType<typeof vi.fn> }
    ).ensureApprovedSchedule.mockResolvedValue({
      cardId: 'card',
      schedule: { ...schedule, stabilityDays: Number.NaN },
    });
    const svc = new MobileReviewBatchService(store, () => NOW, {
      schedulerV2: true,
      schedulerV2Preflight: async () => undefined,
    });
    // LB-B35 CP7 fix: an invariant violation is deterministic -> `schedulerRejected`, non-retryable.
    await expect(svc.submit({ userId: 'u', items: [item()] })).rejects.toMatchObject({
      code: 'schedulerRejected',
      retryable: false,
    });
    expect(writeAtomically).not.toHaveBeenCalled();
  });
  it('V2 without a preflight cannot be constructed', () => {
    expect(
      () => new MobileReviewBatchService(fakeStore().store, undefined, { schedulerV2: true }),
    ).toThrow(/requires a schema preflight/);
  });
});

describe('flag-off service equivalence to v1.2.1 over 10,000 inputs', () => {
  it('every write is scheduleReview(stored, grade, occurredAt) with no engine stamp, for both flag-off spellings', async () => {
    let seed = 20261001;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const states = ['new', 'learning', 'review', 'relearning', 'mastered'] as const;
    const grades = ['forgot', 'hard', 'remembered', 'mastered'] as const;
    let checked = 0;
    for (let i = 0; i < 10_000; i++) {
      const stored: CardSchedule = {
        state: states[Math.floor(rnd() * states.length)]!,
        stabilityDays: 10 ** (rnd() * 4.2 - 2.9),
        difficulty: 1 + rnd() * 9,
        lapses: Math.floor(rnd() * 20),
        dueAt: new Date(Date.UTC(2026, 8, 1) + Math.floor(rnd() * 4e8)),
      };
      const grade = grades[Math.floor(rnd() * 4)]!;
      const { store, writeAtomically } = fakeStore();
      (
        store as never as { ensureApprovedSchedule: ReturnType<typeof vi.fn> }
      ).ensureApprovedSchedule.mockResolvedValue({
        cardId: 'card',
        schedule: stored,
      });
      const options = i % 2 === 0 ? undefined : { schedulerV2: false };
      await new MobileReviewBatchService(store, () => NOW, options).submit({
        userId: 'u',
        items: [
          item({
            grade,
            ...(rnd() < 0.5 ? { response: grade === 'forgot' ? 'unknown' : 'known' } : {}),
          }),
        ],
      });
      const [input, next] = writeAtomically.mock.calls[0] as unknown as [
        Record<string, unknown>,
        CardSchedule,
      ];
      expect(next).toEqual(scheduleReview(stored, grade, NOW));
      expect('engineVersion' in input).toBe(false);
      checked++;
    }
    expect(checked).toBe(10_000);
    // This case is deterministic and exhaustive: it replays all 10,000 generated inputs through the
    // real service and compares every write against scheduleReview(). It runs in well under a second
    // locally but has been measured at 5.2-7.1s on hosted GitHub runners, which exceeds vitest's 5s
    // default and fails the `quality` gate for timing reasons alone. The timeout below is raised for
    // THIS case only; the input count and assertions are deliberately unchanged, because reducing
    // either would shrink the equivalence coverage this test exists to provide.
  }, 30_000);
});

describe('CP7 failure semantics at the SERVICE boundary (not just the preflight function)', () => {
  const req = { userId: 'u1', items: [item()] };

  function logging() {
    const seen: Array<{ code: string; detail: string }> = [];
    return {
      seen,
      logger: (e: { code: MobileReviewBatchErrorCode; detail: string }) => seen.push(e),
    };
  }

  it('a preflight refusal surfaces as non-retryable schedulerRejected, keeps the cause, logs the detail, and writes nothing', async () => {
    const { store, writeAtomically } = fakeStore();
    const { seen, logger } = logging();
    const preflightError = new SchedulerV2PreflightError([
      'review_events.engine_version is missing',
    ]);
    const service = new MobileReviewBatchService(store, () => NOW, {
      schedulerV2: true,
      schedulerV2Preflight: () => Promise.reject(preflightError),
      logger,
    });

    const thrown = await service.submit(req).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(MobileReviewBatchError);
    const err = thrown as MobileReviewBatchError;
    expect(err.code).toBe('schedulerRejected');
    expect(err.retryable).toBe(false);
    // The operator detail is preserved for the server, not flattened away.
    expect(err.cause).toBe(preflightError);
    expect((err.cause as Error).message).toContain('0023_learning_persistence');
    // ...but the client-facing message carries no schema internals.
    expect(err.message).not.toContain('engine_version');
    expect(err.message).not.toContain('0023');
    expect(seen).toEqual([
      { code: 'schedulerRejected', detail: expect.stringContaining('SchedulerV2PreflightError') },
    ]);
    // Safety preserved: nothing persisted, no partial write, no V1 fallback.
    expect(writeAtomically).not.toHaveBeenCalled();
    expect(store.ensureApprovedSchedule).not.toHaveBeenCalled();
  });

  it('an invariant violation surfaces as non-retryable schedulerRejected and never persists', async () => {
    const { store, writeAtomically } = fakeStore();
    const invariant = new SchedulerInvariantError('Unknown must drop exactly one Box');
    (store as unknown as { ensureApprovedSchedule: unknown }).ensureApprovedSchedule = vi.fn(() => {
      throw invariant;
    });
    const { seen, logger } = logging();
    const service = new MobileReviewBatchService(store, () => NOW, {
      schedulerV2: true,
      schedulerV2Preflight: () => Promise.resolve(),
      logger,
    });

    const err = (await service.submit(req).catch((e: unknown) => e)) as MobileReviewBatchError;
    expect(err.code).toBe('schedulerRejected');
    expect(err.retryable).toBe(false);
    expect(err.cause).toBe(invariant);
    expect(seen[0]!.detail).toContain('SchedulerInvariantError');
    expect(writeAtomically).not.toHaveBeenCalled();
  });

  it('a transient store fault stays retryable serverUnavailable and is still distinguishable', async () => {
    const { store } = fakeStore();
    const outage = new Error('connection terminated unexpectedly');
    (store as unknown as { ensureApprovedSchedule: unknown }).ensureApprovedSchedule = vi.fn(() => {
      throw outage;
    });
    const { seen, logger } = logging();
    const service = new MobileReviewBatchService(store, () => NOW, { logger });

    const err = (await service.submit(req).catch((e: unknown) => e)) as MobileReviewBatchError;
    expect(err.code).toBe('serverUnavailable');
    expect(err.retryable).toBe(true);
    expect(err.cause).toBe(outage);
    expect(seen[0]!.code).toBe('serverUnavailable');
  });

  it('NEGATIVE PROOF: flattening both failures to serverUnavailable makes these assertions fail', async () => {
    // Mirrors the pre-fix behaviour exactly: one catch-all, cause discarded.
    const flatten = async (thrower: () => Promise<never>) => {
      try {
        await thrower();
        throw new Error('unreachable');
      } catch {
        return new MobileReviewBatchError('serverUnavailable', 'Review batch interrupted.');
      }
    };
    const flat = await flatten(() => Promise.reject(new SchedulerV2PreflightError(['x'])));
    // Each of these is exactly what the fix added; all three fail under the old flattening.
    expect(flat.code).not.toBe('schedulerRejected');
    expect(flat.retryable).toBe(true);
    expect(flat.cause).toBeUndefined();
  });

  it('the deterministic code is excluded from retry by the error itself, for every code', () => {
    expect(new MobileReviewBatchError('schedulerRejected', 'm').retryable).toBe(false);
    expect(new MobileReviewBatchError('validation', 'm').retryable).toBe(false);
    expect(new MobileReviewBatchError('serverUnavailable', 'm').retryable).toBe(true);
  });
});
