// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PackMediaCompletion, type PackMediaJob } from '../app/components/PackMediaCompletion';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression test: a needs_attention/deferred item must jump straight to its card. Before this
 * fix the panel printed only the raw card UUID as plain text, forcing the admin to search the
 * whole pack table by hand to find which card a report like "کارت 92e2ea4d-… — موکول‌شده"
 * referred to.
 */
function jobWith(itemStatus: 'deferred' | 'needs_attention'): PackMediaJob {
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
      needs_attention: itemStatus === 'needs_attention' ? 1 : 0,
      deferred: itemStatus === 'deferred' ? 1 : 0,
      stopped: 0,
    },
    items: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        cardId: '92e2ea4d-74e7-57a0-943e-2a8adf514022',
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

describe('PackMediaCompletion needs-attention card navigation', () => {
  it('shows the readable card label and opens it via onOpenCard instead of a bare UUID', async () => {
    const job = jobWith('deferred');
    const onOpenCard = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(PackMediaCompletion, {
          packId: 'pack-fixture',
          cards: [{ cardId: '92e2ea4d-74e7-57a0-943e-2a8adf514022', label: 'die U-Bahn' }],
          loadState: async () => undefined,
          loadJob: async () => job,
          createJob: async () => ({ ok: true as const, status: 'nothing_needed' as const }),
          stopJob: async () => ({ ok: false as const, message: 'unused' }),
          resolveJob: async () => ({ ok: true as const, job }),
          reconcileJob: async () => ({ ok: true as const, job, count: 1 }),
          onOpenCard,
          onFinished: () => undefined,
        }),
      );
      await Promise.resolve();
    });

    const section = container.querySelector('[data-pack-media="resolution"]') as HTMLElement;
    expect(section).not.toBeNull();
    expect(section.textContent).toContain('die U-Bahn');
    expect(section.textContent).not.toContain('92e2ea4d-74e7-57a0-943e-2a8adf514022');

    const cardButton = Array.from(section.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'die U-Bahn',
    );
    expect(cardButton).toBeDefined();

    await act(async () => {
      cardButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onOpenCard).toHaveBeenCalledWith({
      cardId: '92e2ea4d-74e7-57a0-943e-2a8adf514022',
      label: 'die U-Bahn',
    });

    act(() => root.unmount());
    container.remove();
  });

  it('falls back to the raw card id when the card is not in the loaded list', async () => {
    const job = jobWith('needs_attention');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(PackMediaCompletion, {
          packId: 'pack-fixture',
          cards: [],
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

    const section = container.querySelector('[data-pack-media="resolution"]') as HTMLElement;
    expect(section.textContent).toContain('92e2ea4d-74e7-57a0-943e-2a8adf514022');

    act(() => root.unmount());
    container.remove();
  });
});
