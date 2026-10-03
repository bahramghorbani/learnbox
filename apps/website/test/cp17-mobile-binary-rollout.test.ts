import { describe, expect, it, vi } from 'vitest';

import { handleMobileReviewPost } from '../lib/mobile-review-http';
import type { MobileReviewHttpDependencies } from '../lib/mobile-review-http';

/**
 * CP17 — Native Binary Rollout Readiness.
 *
 * These tests pin the two defects that make a binary-capable Native client unsafe to release.
 * They are written to FAIL against CP16 main (5a12fcf5) and pass only once the boundary is fixed.
 */

const binaryItem = {
  contentId: 'card-house',
  response: 'known',
  occurredAt: '2026-08-24T12:00:00.000Z',
  clientEventId: 'evt-binary-1',
};

const legacyItem = {
  contentId: 'card-tree',
  grade: 'remembered',
  occurredAt: '2026-08-24T12:00:01.000Z',
  clientEventId: 'evt-legacy-1',
};

function request(body: unknown) {
  return new Request('https://learnbox.example/api/reviews/mobile', {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function dependencies(): MobileReviewHttpDependencies & {
  submit: ReturnType<typeof vi.fn>;
} {
  const submit = vi.fn(async ({ items }: { items: Array<{ clientEventId: string }> }) =>
    items.map((item, index) => ({
      status: 'acknowledged' as const,
      clientEventId: item.clientEventId,
      eventId: `event-${index}`,
      idempotent: false,
      reconciliationCursor: String(index + 1),
    })),
  );
  return {
    verifyAccessToken: vi.fn(() => ({ status: 'valid' as const, claims: { sub: 'learner-1' } })),
    submit,
  } as MobileReviewHttpDependencies & { submit: ReturnType<typeof vi.fn> };
}

describe('CP17 F5 — mobile boundary must honour LEARNBOX_BINARY_REVIEW', () => {
  it('accepts a binary `response` item when the server flag is ON', async () => {
    const deps = dependencies();
    const response = await handleMobileReviewPost(request({ items: [binaryItem] }), deps, {
      binaryResponses: true,
    });

    // CP16 main returns 400 here even with LEARNBOX_BINARY_REVIEW=true in Production,
    // because mobile-review-http.ts never forwards the options argument.
    expect(response.status).toBe(200);
    const submitted = deps.submit.mock.calls[0]?.[0] as { items: Array<{ grade: string }> };
    // The binary item must be stored with its compatibility shadow grade.
    expect(submitted.items[0]?.grade).toBe('remembered');
  });

  it('treats a binary item as RETRYABLE, not terminal, when the server flag is OFF', async () => {
    const deps = dependencies();
    const response = await handleMobileReviewPost(request({ items: [binaryItem] }), deps, {
      binaryResponses: false,
    });

    // CP17: a capability gap is a server configuration property, not learner-event corruption.
    // 400 would be terminal and would destroy a real review on a flag regression; 503 is
    // retryable, so the event survives until the flag is restored.
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'serverUnavailable' });
    expect(deps.submit).not.toHaveBeenCalled();
  });
});

describe('CP17 F1 — one invalid item must not poison the whole batch', () => {
  const malformed = {
    contentId: 'card-bad',
    grade: 'not-a-real-grade',
    occurredAt: '2026-08-24T12:00:02.000Z',
    clientEventId: 'evt-bad-1',
  };

  it('accepts the valid events and reports the invalid one as terminally rejected', async () => {
    const deps = dependencies();
    const response = await handleMobileReviewPost(
      request({ items: [legacyItem, malformed, binaryItem] }),
      deps,
      { binaryResponses: true },
    );

    // CP16 main: the whole batch is rejected 400 and the client retries forever,
    // so evt-legacy-1 and evt-binary-1 can never sync.
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      outcomes: Array<{ clientEventId: string; status: string }>;
    };

    const byId = new Map(body.outcomes.map((o) => [o.clientEventId, o.status]));
    expect(byId.get('evt-legacy-1')).toBe('acknowledged');
    expect(byId.get('evt-binary-1')).toBe('acknowledged');
    // The bad event must be reported terminally — never silently dropped,
    // and never left to be retried forever.
    expect(byId.get('evt-bad-1')).toBe('validation');

    // Only the two valid events may reach the scheduler.
    const submitted = deps.submit.mock.calls[0]?.[0] as { items: Array<{ clientEventId: string }> };
    expect(submitted.items.map((i) => i.clientEventId)).toEqual(['evt-legacy-1', 'evt-binary-1']);
  });

  it('rejects the batch only when EVERY item is invalid', async () => {
    const deps = dependencies();
    const response = await handleMobileReviewPost(request({ items: [malformed] }), deps, {
      binaryResponses: true,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      outcomes: Array<{ clientEventId: string; status: string }>;
    };
    expect(body.outcomes).toEqual([
      expect.objectContaining({ status: 'validation', clientEventId: 'evt-bad-1' }),
    ]);
    // Nothing valid to submit: the scheduler must not be called at all.
    expect(deps.submit).not.toHaveBeenCalled();
  });

  it('preserves whole-payload rejection for a structurally invalid envelope', async () => {
    const deps = dependencies();
    const response = await handleMobileReviewPost(request({ items: 'not-an-array' }), deps, {
      binaryResponses: true,
    });

    // Envelope-level corruption is NOT per-item recoverable and must stay 400.
    expect(response.status).toBe(400);
    expect(deps.submit).not.toHaveBeenCalled();
  });

  it('keeps duplicate clientEventId within one batch a whole-batch rejection', async () => {
    const deps = dependencies();
    const response = await handleMobileReviewPost(
      request({ items: [legacyItem, { ...legacyItem }] }),
      deps,
      { binaryResponses: true },
    );

    // Idempotency/exactly-once: an ambiguous duplicate must not be silently de-duplicated.
    expect(response.status).toBe(400);
    expect(deps.submit).not.toHaveBeenCalled();
  });
});
