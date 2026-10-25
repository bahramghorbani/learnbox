// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { CardMediaPanel, type MediaKindState } from '../app/components/CardMediaPanel';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression test: CardMediaPanel used to render its own `.modal-backdrop`/`.modal`/`.cm-modal`
 * wrapper, and globals.css had no rules for any of those three classes — the panel rendered with
 * no position, no backdrop and no layout, so its content dropped into the normal document flow on
 * top of the Content & Packs table (reported as the table becoming visually "jumbled" whenever
 * ویرایش/رسانه was clicked on a long card list). It now renders through the shared `CpModal`
 * (`.cp-scrim`/`.cp-modal`), which every other Admin dialog already uses and globals.css already
 * styles. This asserts the shared primitive is actually used, and that the Prev/Next sequential-
 * review controls added alongside the fix behave correctly at both ends of the card list.
 */
const emptyState: MediaKindState[] = [
  { kind: 'image', accepted: null, latestCandidate: null },
  { kind: 'word_audio', accepted: null, latestCandidate: null },
  { kind: 'sentence_audio', accepted: null, latestCandidate: null },
];

function baseProps() {
  return {
    cardId: 'card-fixture',
    cardLabel: 'die U-Bahn',
    onClose: () => undefined,
    onLoadState: async () => emptyState,
    onGenerate: async () => ({ ok: false as const, message: 'unused' }),
    onAccept: async () => ({ ok: false as const, message: 'unused' }),
    assetUrl: (candidateId: string) => `/api/content/media/asset?candidateId=${candidateId}`,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CardMediaPanel modal shell', () => {
  it('renders through the shared cp-scrim/cp-modal primitive, not the old unstyled wrapper', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(CardMediaPanel, baseProps()));
      await Promise.resolve();
    });

    expect(container.querySelector('.cp-scrim')).not.toBeNull();
    expect(container.querySelector('.cp-modal')).not.toBeNull();
    // The old classes must be fully gone — their reappearance would mean the unstyled wrapper
    // came back (globals.css still has no rules for them).
    expect(container.querySelector('.modal-backdrop')).toBeNull();
    expect(container.querySelector('.cm-modal')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('disables Prev at the first card and Next at the last, and calls onNavigate otherwise', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const calls: Array<'prev' | 'next'> = [];

    await act(async () => {
      root.render(
        createElement(CardMediaPanel, {
          ...baseProps(),
          onNavigate: (direction: 'prev' | 'next') => calls.push(direction),
          hasPrev: false,
          hasNext: true,
          positionLabel: 'کارت ۱ از ۳',
        }),
      );
      await Promise.resolve();
    });

    const buttons = Array.from(container.querySelectorAll('footer button, .cp-modal-foot button'));
    const prevBtn = buttons.find((b) => b.textContent === 'کارت قبلی') as HTMLButtonElement;
    const nextBtn = buttons.find((b) => b.textContent === 'کارت بعدی') as HTMLButtonElement;

    expect(prevBtn.disabled).toBe(true);
    expect(nextBtn.disabled).toBe(false);
    expect(container.querySelector('.cm-nav-position')?.textContent).toBe('کارت ۱ از ۳');

    await act(async () => {
      nextBtn.click();
      await Promise.resolve();
    });
    expect(calls).toEqual(['next']);

    act(() => root.unmount());
    container.remove();
  });
});
