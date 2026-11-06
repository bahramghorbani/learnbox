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

  function stubReactGlobal() {
    vi.stubGlobal('React', { createElement, Fragment });
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  }

  async function mount(props: { initialSlide: number; onDone: () => void }) {
    const { OnboardingTour } = await import('./OnboardingTour.js');
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(OnboardingTour, props));
    });
  }

  it('persists the slide when advancing via the next button', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    stubReactGlobal();
    await mount({ initialSlide: 0, onDone: vi.fn() });
    fetch.mockClear();

    const ctas = container!.querySelectorAll('.onboarding-tour-cta');
    await act(async () => {
      ctas[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(fetch).toHaveBeenCalledWith(
      '/api/learner/onboarding-tour',
      expect.objectContaining({ body: JSON.stringify({ slide: 1 }), method: 'POST' }),
    );
  });

  it('resumes at initialSlide and finishes only on the last slide CTA', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    stubReactGlobal();
    const onDone = vi.fn();
    await mount({ initialSlide: 4, onDone });

    const ctas = container!.querySelectorAll('.onboarding-tour-cta');
    expect(ctas).toHaveLength(5);
    await act(async () => {
      ctas[4]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      '/api/learner/onboarding-tour',
      expect.objectContaining({ body: JSON.stringify({ done: true }), method: 'POST' }),
    );
  });

  it('finishes early when tapping the skip button', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    stubReactGlobal();
    const onDone = vi.fn();
    await mount({ initialSlide: 0, onDone });

    const skip = container!.querySelector('.onboarding-tour-skip');
    await act(async () => {
      skip!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      '/api/learner/onboarding-tour',
      expect.objectContaining({ body: JSON.stringify({ done: true }), method: 'POST' }),
    );
  });
});
