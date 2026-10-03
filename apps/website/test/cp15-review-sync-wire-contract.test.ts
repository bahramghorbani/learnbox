import { describe, expect, it, vi } from 'vitest';

import {
  REVIEW_SYNC_ERROR_KEY,
  SCHEDULER_REJECTED_CODE,
  SCHEDULER_REJECTED_STATUS,
  buildReviewSyncWireContractFixture,
  schedulerRejectedBody,
} from '@learnbox/learning-engine';
import { MobileReviewBatchError } from '../../api/dist/reviews/mobile-review-batch.service.js';
import { parseMobileReviewBatchRequest } from '../../api/dist/reviews/mobile-review-batch.request.js';
import { handleMobileReviewPost } from '../lib/mobile-review-http';
import { handleWebReviewBatchPost } from '../lib/learner-review-web-http';

/**
 * LB-B35 CP15 (Workstream A), server side of the contract.
 *
 * The Dart conformance test proves native honours the canonical contract. This proves BOTH
 * TypeScript boundaries actually emit it, derived from the single definition in
 * `@learnbox/learning-engine` rather than from a local literal. Together with
 * `pnpm verify:review-sync-wire-contract` (fixture drift) and the Dart test, a server-side rename
 * or shape change cannot pass CI.
 */

const CONTRACT_HEADERS = {
  authorization: 'Bearer valid-token',
  'content-type': 'application/json',
};

function mobileRequest(body: unknown) {
  return new Request('https://learnbox.example/api/reviews/mobile', {
    method: 'POST',
    headers: CONTRACT_HEADERS,
    body: JSON.stringify(body),
  });
}

function rejectingDependencies() {
  return {
    verifyAccessToken: vi.fn(() => ({ status: 'valid' as const, claims: { sub: 'learner-1' } })),
    submit: vi.fn(async () => {
      throw new MobileReviewBatchError('schedulerRejected', 'Deterministic refusal.');
    }),
  };
}

const validMobileItem = {
  contentId: 'card-house',
  grade: 'remembered',
  occurredAt: '2026-08-24T12:00:00.000Z',
  clientEventId: 'evt-1',
};

describe('canonical review-sync wire contract', () => {
  it('pins the exact status and body every client depends on', () => {
    expect(SCHEDULER_REJECTED_STATUS).toBe(422);
    expect(SCHEDULER_REJECTED_CODE).toBe('schedulerRejected');
    // Native requires a document with EXACTLY one key, so the body must stay single-key.
    expect(Object.keys(schedulerRejectedBody())).toEqual([REVIEW_SYNC_ERROR_KEY]);
    expect(schedulerRejectedBody()).toEqual({ error: 'schedulerRejected' });
  });

  it('generates a fixture that matches the constants it is derived from', () => {
    const fixture = buildReviewSyncWireContractFixture();
    expect(fixture.schedulerRejected.status).toBe(SCHEDULER_REJECTED_STATUS);
    expect(fixture.schedulerRejected.body).toEqual(schedulerRejectedBody());
    expect(fixture.schedulerRejected.retryable).toBe(false);
    expect(fixture.schedulerRejected.terminal).toBe(true);
    // The near-miss corpus is what stops an unrecognised response stranding a queued answer.
    expect(fixture.nearMisses.length).toBeGreaterThanOrEqual(4);
    for (const nonRejection of fixture.nonRejections) {
      expect(nonRejection.status).not.toBe(SCHEDULER_REJECTED_STATUS);
      expect(nonRejection.retryable).toBe(true);
    }
  });
});

describe('mobile review boundary emits the canonical contract', () => {
  it('answers a deterministic refusal with the exact canonical status and body', async () => {
    const dependencies = rejectingDependencies();
    const response = await handleMobileReviewPost(
      mobileRequest({ items: [validMobileItem] }),
      dependencies,
    );

    expect(response.status).toBe(SCHEDULER_REJECTED_STATUS);
    await expect(response.json()).resolves.toEqual(schedulerRejectedBody());
  });

  it('never answers a deterministic refusal with the retryable 503', async () => {
    const dependencies = rejectingDependencies();
    const response = await handleMobileReviewPost(
      mobileRequest({ items: [validMobileItem] }),
      dependencies,
    );
    expect(response.status).not.toBe(503);
  });
});

describe('learner web boundary emits the canonical contract', () => {
  it('answers a deterministic refusal with the exact canonical status and body', async () => {
    const response = await handleWebReviewBatchPost(
      new Request('https://learnbox.example/api/learner/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://learnbox.example' },
        body: JSON.stringify({
          items: [
            {
              clientEventId: 'event-1',
              contentId: 'start-a1-haus',
              grade: 'remembered',
              occurredAt: '2026-09-20T00:00:00.000Z',
            },
          ],
        }),
      }),
      {
        submit: vi.fn(async () => {
          throw new MobileReviewBatchError('schedulerRejected', 'Deterministic refusal.');
        }),
        readReconciliation: vi.fn(async () => ({
          cursor: '0',
          nextCursor: '1',
          hasMore: false,
          events: [],
        })),
      },
      () => '00000000-0000-4000-8000-000000000000',
    );

    expect(response.status).toBe(SCHEDULER_REJECTED_STATUS);
    await expect(response.json()).resolves.toEqual(schedulerRejectedBody());
  });
});

/**
 * LB-B35 CP15 (Workstream B evidence, recorded as an executable fact).
 *
 * The native queue serialises `cardId`; the server parser requires `contentId` with exact-key
 * matching. These assertions pin the CURRENT (incompatible) behaviour so the parity work in a
 * later checkpoint cannot land silently, and so nobody "fixes" the key name on one side alone.
 *
 * This is deliberately a characterisation test: it documents a real incompatibility rather than
 * asserting desired behaviour. The native transport is NOT wired in production
 * (`DisabledReviewSyncTransport`), so this is latent, not a live outage.
 */
describe('native payload shape vs server parser (characterisation)', () => {
  const nativePayloadItem = {
    clientEventId: 'evt-native-1',
    cardId: 'start-a1-haus',
    grade: 'remembered',
    occurredAt: '2026-08-24T12:00:00.000Z',
  };

  it('rejects the native cardId payload, proving native and server are not yet wire-compatible', () => {
    expect(() =>
      parseMobileReviewBatchRequest({ items: [nativePayloadItem] }, 'learner-1', {}),
    ).toThrowError(/invalid shape/i);
  });

  it('accepts the same event once the key is contentId', () => {
    const parsed = parseMobileReviewBatchRequest(
      {
        items: [
          {
            clientEventId: 'evt-native-1',
            contentId: 'start-a1-haus',
            grade: 'remembered',
            occurredAt: '2026-08-24T12:00:00.000Z',
          },
        ],
      },
      'learner-1',
      {},
    );
    expect(parsed.items[0]?.contentId).toBe('start-a1-haus');
  });

  it('rejects a native binary payload even with binary responses enabled', () => {
    expect(() =>
      parseMobileReviewBatchRequest(
        {
          items: [
            {
              clientEventId: 'evt-native-2',
              cardId: 'start-a1-haus',
              response: 'known',
              occurredAt: '2026-08-24T12:00:00.000Z',
            },
          ],
        },
        'learner-1',
        { binaryResponses: true },
      ),
    ).toThrowError(/invalid shape/i);
  });
});
