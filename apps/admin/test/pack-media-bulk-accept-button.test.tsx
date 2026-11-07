// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PackMediaCompletion } from '../app/components/PackMediaCompletion';
import type { MediaKindState } from '../app/components/CardMediaPanel';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = '';
});

/** One card with exactly one kind (`image`) sitting ready-and-valid, awaiting acceptance. */
function readyState(candidateId: string): MediaKindState[] {
  const candidate: NonNullable<MediaKindState['latestCandidate']> = {
    id: candidateId,
    kind: 'image',
    status: 'ready',
    mediaType: 'image/png',
    byteSize: 1024,
    provider: 'test-provider',
    model: 'test-model',
    spokenTarget: null,
    voice: null,
    voiceRole: null,
    usesDieFallbackForDas: false,
    language: null,
    locale: null,
    imageStandardVersion: 'v1',
    failureCode: null,
    createdAt: '2026-11-07T00:00:00.000Z',
  };
  return [
    {
      kind: 'image',
      accepted: null,
      latestCandidate: candidate,
      latestValidity: 'valid',
    } as MediaKindState,
  ];
}

describe('PackMediaCompletion bulk "accept all awaiting" button', () => {
  it('accepts every awaiting-acceptance item in turn, then rescans, with no server route of its own', async () => {
    const cards = [
      { cardId: 'card-haus', label: 'das Haus' },
      { cardId: 'card-tisch', label: 'der Tisch' },
    ];
    const acceptCalls: { cardId: string; kind: string; candidateId: string }[] = [];
    const acceptItem = vi.fn(async (cardId: string, kind: string, candidateId: string) => {
      acceptCalls.push({ cardId, kind, candidateId });
      return { ok: true as const };
    });
    let scanCount = 0;
    const loadState = vi.fn(async (cardId: string) => {
      scanCount += 1;
      // After the bulk run finishes it rescans; by then both items are accepted (no longer
      // "ready+valid"), so the second scan must come back empty.
      if (scanCount > cards.length) return [] as MediaKindState[];
      return readyState(cardId === 'card-haus' ? 'cand-haus' : 'cand-tisch');
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(PackMediaCompletion, {
          packId: 'pack-fixture',
          cards,
          loadState,
          loadJob: async () => undefined,
          createJob: async () => ({ ok: true as const, status: 'nothing_needed' as const }),
          stopJob: async () => ({ ok: false as const, message: 'unused' }),
          onOpenCard: () => undefined,
          onFinished: () => undefined,
          acceptItem,
        }),
      );
      await Promise.resolve();
    });

    const scanButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('بررسی رسانه‌های لازم'),
    ) as HTMLButtonElement;
    await act(async () => {
      scanButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const section = container.querySelector('[data-pack-media="acceptance"]') as HTMLElement;
    expect(section).not.toBeNull();
    expect(section.textContent).toContain('منتظر پذیرش شما (۲)');

    const bulkButton = Array.from(section.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('تأیید همهٔ ۲ مورد منتظر پذیرش'),
    ) as HTMLButtonElement;
    expect(bulkButton).toBeDefined();

    await act(async () => {
      bulkButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // Let the sequential await chain (2 accepts + a rescan) settle.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Exactly one accept per queued item — the same call a manual click would have made.
    expect(acceptCalls).toHaveLength(2);
    expect(acceptCalls).toContainEqual({
      cardId: 'card-haus',
      kind: 'image',
      candidateId: 'cand-haus',
    });
    expect(acceptCalls).toContainEqual({
      cardId: 'card-tisch',
      kind: 'image',
      candidateId: 'cand-tisch',
    });
    // A rescan ran afterwards, so the UI reflects server truth instead of an optimistic guess.
    expect(container.querySelector('[data-pack-media="acceptance"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('does not render the bulk button when the caller has not wired an accept function', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(PackMediaCompletion, {
          packId: 'pack-fixture',
          cards: [{ cardId: 'card-haus', label: 'das Haus' }],
          loadState: async () => readyState('cand-haus'),
          loadJob: async () => undefined,
          createJob: async () => ({ ok: true as const, status: 'nothing_needed' as const }),
          stopJob: async () => ({ ok: false as const, message: 'unused' }),
          onOpenCard: () => undefined,
          onFinished: () => undefined,
        }),
      );
      await Promise.resolve();
    });

    const scanButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('بررسی رسانه‌های لازم'),
    ) as HTMLButtonElement;
    await act(async () => {
      scanButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const section = container.querySelector('[data-pack-media="acceptance"]') as HTMLElement;
    expect(section).not.toBeNull();
    expect(
      Array.from(section.querySelectorAll('button')).some((b) =>
        b.textContent?.includes('تأیید همهٔ'),
      ),
    ).toBe(false);

    act(() => root.unmount());
    container.remove();
  });
});
