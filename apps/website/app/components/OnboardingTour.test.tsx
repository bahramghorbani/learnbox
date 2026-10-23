// @vitest-environment jsdom

import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('OnboardingTour', () => {
  let root: ReturnType<typeof createRoot> | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(async () => {
    await act(async () => root?.unmount());
    container?.remove();
    vi.unstubAllGlobals();
  });

  it('advances on the specified left-to-right swipe and persists that slide', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('React', { createElement, Fragment });
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const { OnboardingTour } = await import('./OnboardingTour.js');
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(OnboardingTour, { initialSlide: 0, onDone: vi.fn() }));
    });

    const tour = container.querySelector('[data-testid="onboarding-tour"]')!;
    const start = new Event('touchstart', { bubbles: true });
    Object.defineProperty(start, 'changedTouches', { value: [{ clientX: 20 }] });
    const end = new Event('touchend', { bubbles: true });
    Object.defineProperty(end, 'changedTouches', { value: [{ clientX: 100 }] });
    await act(async () => {
      tour.dispatchEvent(start);
      tour.dispatchEvent(end);
    });

    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/images/onboarding/slide-2.jpg',
    );
    expect(fetch).toHaveBeenCalledWith(
      '/api/learner/onboarding-tour',
      expect.objectContaining({ body: JSON.stringify({ slide: 1 }), method: 'POST' }),
    );
  });
});
