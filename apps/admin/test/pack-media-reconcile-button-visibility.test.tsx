// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { PackMediaCompletion, type PackMediaJob } from '../app/components/PackMediaCompletion';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression test: the "تطابق‌سازی موارد پذیرفته‌شده" reconcile button must render whenever any
 * item is deferred OR needs_attention — reconcileAccepted() on the server already matches both
 * statuses (manual-import candidate accepted at the current card version). Gating the button on
 * `deferred > 0` alone hid it for the common case where an unresolved provider-timeout item moves
 * to `needs_attention`, leaving an accepted manual-import candidate with no way to reconcile the
 * job item from the panel.
 */
function jobWith(
  counts: Partial<PackMediaJob['counts']>,
  itemStatus: 'deferred' | 'needs_attention',
): PackMediaJob {
  return {
    id: 'job-fixture',
    packId: 'pack-fixture',
    status: 'needs_attention',
    stopRequested: false,
    estimatedMaxSeconds: 0,
    lastProgressAt: '2026-10-22T14:00:00.000Z',
    counts: {
      pending: 0,
      leased: 0,
      dispatching: 0,
      generated: 357,
      not_needed: 0,
      in_progress: 0,
      needs_attention: 0,
      deferred: 0,
      stopped: 0,
      ...counts,
    },
    items: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        cardId: 'card-fixture',
        kind: 'word_audio',
        status: itemStatus,
        candidateId: null,
        detail: 'provider_timeout',
      },
    ],
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('PackMediaCompletion reconcile button visibility', () => {
  it('renders the reconcile button when an item is needs_attention (no deferred items)', async () => {
    const job = jobWith({ needs_attention: 1 }, 'needs_attention');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(PackMediaCompletion, {
          packId: 'pack-fixture',
          cards: [{ cardId: 'card-fixture', label: 'die U-Bahn' }],
          loadState: async () => undefined,
          loadJob: async () => job,
          createJob: async () => ({ ok: true as const, status: 'nothing_needed' as const }),
          stopJob: async () => ({ ok: false as const, message: 'unused' }),
          resolveJob: async () => ({ ok: true as const, job }),
          reconcileJob: async () => ({ ok: true as const, job, count: 1 }),
          onOpenCard: () => undefined,
          onFinished: () => undefined,
        }),
      );
      await Promise.resolve();
    });

    expect(container.querySelector('[data-pack-media="reconcile"]')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
