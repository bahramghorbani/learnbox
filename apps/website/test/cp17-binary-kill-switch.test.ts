import { describe, expect, it, vi } from 'vitest';

import { handleMobileReviewPost } from '../lib/mobile-review-http';
import type { MobileReviewHttpDependencies } from '../lib/mobile-review-http';

/**
 * CP17 F2 — runtime kill switch semantics on the Native sync boundary.
 *
 * The switch exists because the UI gate is compile-time: once a binary-capable build
 * is in a store, a rebuild is the only other way to withdraw the feature. These tests
 * pin the property that makes the switch safe rather than destructive: killing
 * CREATION must never stop the server ACCEPTING binary events already queued on
 * devices, or the switch itself becomes data loss.
 */
const validItem = {
  clientEventId: 'evt-1',
  contentId: 'start-a1-apfel',
  grade: 'remembered',
  occurredAt: '2026-08-24T12:00:00.000Z',
};

const binaryItem = {
  clientEventId: 'evt-b1',
  contentId: 'start-a1-apfel',
  response: 'known',
  occurredAt: '2026-08-24T12:00:00.000Z',
};

function dependencies(): MobileReviewHttpDependencies & {
  submit: ReturnType<typeof vi.fn>;
} {
  const submit = vi.fn(async (input: { items: Array<{ clientEventId: string }> }) =>
    input.items.map((item) => ({
      status: 'acknowledged' as const,
      clientEventId: item.clientEventId,
    })),
  );
  return {
    verifyAccessToken: () => ({ status: 'valid', claims: { sub: 'user-1' } }),
    submit,
  } as unknown as MobileReviewHttpDependencies & { submit: ReturnType<typeof vi.fn> };
}

function request(body: unknown): Request {
  return new Request('https://app.learnboxapp.com/api/reviews/mobile', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('CP17 F2 — runtime kill switch', () => {
  it('advertises creation and acceptance on a normal sync', async () => {
    const response = await handleMobileReviewPost(request({ items: [validItem] }), dependencies(), {
      binaryResponses: true,
    });
    const body = (await response.json()) as { binaryReview: unknown };
    expect(response.status).toBe(200);
    expect(body.binaryReview).toEqual({ creationEnabled: true, acceptanceEnabled: true });
  });

  it('KILL SWITCH: creation off still accepts already-queued binary events', async () => {
    // This is the property that makes the switch safe. An operator kills creation during an
    // incident; devices that already hold binary events must still be able to drain them.
    const previous = process.env.LEARNBOX_BINARY_REVIEW_CREATION;
    process.env.LEARNBOX_BINARY_REVIEW_CREATION = 'false';
    try {
      const deps = dependencies();
      const response = await handleMobileReviewPost(request({ items: [binaryItem] }), deps, {
        binaryResponses: true,
      });
      const body = (await response.json()) as {
        outcomes: Array<{ status: string; clientEventId: string }>;
        binaryReview: { creationEnabled: boolean; acceptanceEnabled: boolean };
      };

      expect(response.status).toBe(200);
      // Creation is withdrawn...
      expect(body.binaryReview.creationEnabled).toBe(false);
      // ...but the queued binary event was still APPLIED, not rejected or stranded.
      expect(body.binaryReview.acceptanceEnabled).toBe(true);
      expect(body.outcomes).toEqual([{ status: 'acknowledged', clientEventId: 'evt-b1' }]);
      expect(deps.submit).toHaveBeenCalledOnce();
    } finally {
      if (previous === undefined) delete process.env.LEARNBOX_BINARY_REVIEW_CREATION;
      else process.env.LEARNBOX_BINARY_REVIEW_CREATION = previous;
    }
  });

  it('never advertises creation above acceptance', async () => {
    // Offering an interaction the server would refuse is the serverUnavailable retry loop
    // CP16 review flagged. Creation must be impossible while acceptance is off.
    const previous = process.env.LEARNBOX_BINARY_REVIEW_CREATION;
    process.env.LEARNBOX_BINARY_REVIEW_CREATION = 'true';
    try {
      const response = await handleMobileReviewPost(
        request({ items: [validItem] }),
        dependencies(),
        { binaryResponses: false },
      );
      const body = (await response.json()) as {
        binaryReview: { creationEnabled: boolean; acceptanceEnabled: boolean };
      };
      expect(body.binaryReview).toEqual({ creationEnabled: false, acceptanceEnabled: false });
    } finally {
      if (previous === undefined) delete process.env.LEARNBOX_BINARY_REVIEW_CREATION;
      else process.env.LEARNBOX_BINARY_REVIEW_CREATION = previous;
    }
  });

  it('still advertises the switch when every item was rejected', async () => {
    // A client whose whole batch was invalid must still learn the current switch state,
    // otherwise it can never find out that creation was withdrawn.
    const deps = dependencies();
    const response = await handleMobileReviewPost(
      request({ items: [{ ...validItem, grade: 'again' }] }),
      deps,
      { binaryResponses: true },
    );
    const body = (await response.json()) as {
      outcomes: Array<{ status: string }>;
      binaryReview: { acceptanceEnabled: boolean };
    };
    expect(response.status).toBe(200);
    expect(body.outcomes).toEqual([{ status: 'validation', clientEventId: 'evt-1' }]);
    expect(body.binaryReview.acceptanceEnabled).toBe(true);
    expect(deps.submit).not.toHaveBeenCalled();
  });
});
