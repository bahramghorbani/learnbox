// @vitest-environment jsdom

import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('OnboardingTour', () => {
  let root: ReturnType<typeof createRoot> | undefined;
  let container: HTMLDivElement | undefined;
  let observerCallback: IntersectionObserverCallback | undefined;
  const observed: Element[] = [];

  afterEach(async () => {
    await act(async () => root?.unmount());
    container?.remove();
    observed.length = 0;
    observerCallback = undefined;
    vi.unstubAllGlobals();
  });

  function stubReactGlobal() {
    vi.stubGlobal('React', { createElement, Fragment });
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  }

  function stubScrollIntoView() {
    Element.prototype.scrollIntoView = vi.fn();
  }

  function stubIntersectionObserver() {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          observerCallback = callback;
        }
        observe(el: Element) {
          observed.push(el);
        }
        disconnect() {}
      },
    );
  }

  it('persists whichever slide the native scroll-snap reports visible, either direction', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    stubReactGlobal();
    stubScrollIntoView();
    stubIntersectionObserver();
    const { OnboardingTour } = await import('./OnboardingTour.js');
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(OnboardingTour, { initialSlide: 0, onDone: vi.fn() }));
    });
    fetch.mockClear();

    // Swiped forward: third slide (index 2) becomes visible.
    await act(async () => {
      observerCallback!(
        [{ isIntersecting: true, target: observed[2] } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(fetch).toHaveBeenCalledWith(
      '/api/learner/onboarding-tour',
      expect.objectContaining({ body: JSON.stringify({ slide: 2 }), method: 'POST' }),
    );

    // Swiped backward: first slide (index 0) becomes visible again.
    fetch.mockClear();
    await act(async () => {
      observerCallback!(
        [{ isIntersecting: true, target: observed[0] } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(fetch).toHaveBeenCalledWith(
      '/api/learner/onboarding-tour',
      expect.objectContaining({ body: JSON.stringify({ slide: 0 }), method: 'POST' }),
    );
  });

  it('finishes only when tapping the last slide', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    stubReactGlobal();
    stubScrollIntoView();
    stubIntersectionObserver();
    const { OnboardingTour } = await import('./OnboardingTour.js');
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const onDone = vi.fn();
    await act(async () => {
      root!.render(createElement(OnboardingTour, { initialSlide: 4, onDone }));
    });

    const images = container.querySelectorAll('img');
    await act(async () => {
      images[4]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
