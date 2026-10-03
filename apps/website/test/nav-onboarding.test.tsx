// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('OnboardingGoal', () => {
  let rendered: Rendered | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
  });

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows all three learning goals with the selected one marked', async () => {
    rendered = await renderOnboarding({ selectedGoal: 'life' });

    expect(rendered.text()).toContain('زندگی در آلمان');
    expect(rendered.text()).toContain('کار و دانشگاه');
    expect(rendered.text()).toContain('سفر و ارتباط');

    const radios = rendered.container.querySelectorAll('[role="radio"]');
    expect(radios).toHaveLength(3);
    const selected = Array.from(radios).find(
      (radio) => radio.getAttribute('aria-checked') === 'true',
    );
    expect(selected?.textContent).toContain('زندگی در آلمان');
  });

  it('reports a newly selected goal', async () => {
    let selected: 'life' | 'career' | 'travel' | undefined;
    rendered = await renderOnboarding({
      selectedGoal: 'life',
      onSelectGoal: (goal) => {
        selected = goal;
      },
    });

    await rendered.clickButton('کار و دانشگاه');
    expect(selected).toBe('career');
  });

  it('invokes continue from the primary action', async () => {
    let continued = false;
    rendered = await renderOnboarding({
      selectedGoal: 'life',
      onContinue: () => {
        continued = true;
      },
    });

    await rendered.clickButton('ادامه');
    expect(continued).toBe(true);
  });
});

describe('LearnerNav', () => {
  let rendered: Rendered | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
  });

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('marks the current destination as active and navigates on click', async () => {
    let navigated: 'today' | 'words' | 'progress' | undefined;
    rendered = await renderNav({
      current: 'today',
      onNavigate: (destination) => {
        navigated = destination;
      },
    });

    const today = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
      button.textContent?.trim().startsWith('امروز'),
    );
    expect(today?.getAttribute('aria-current')).toBe('page');

    await rendered.clickButton('پیشرفت');
    expect(navigated).toBe('progress');
  });
});

describe('Bobo', () => {
  let rendered: Rendered | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
  });

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders the requested expression asset with Persian alt text', async () => {
    rendered = await renderBobo({ expression: 'celebrate' });

    const image = rendered.container.querySelector('img');
    // next/image encodes the path; assert on the encoded source path and alt text.
    expect(image?.getAttribute('src')).toContain(
      encodeURIComponent('/images/bobo/celebrate-v2.png'),
    );
    expect(image?.getAttribute('alt')).toContain('بوبو');
  });

  // D-FV-1: finishing a first session while offline must not leave a broken-image icon.
  it('falls back to the precached raw path when the optimizer request fails', async () => {
    rendered = await renderBobo({ expression: 'celebrate' });

    const optimized = rendered.container.querySelector('img');
    expect(optimized?.getAttribute('src')).toContain('/_next/image');

    await rendered.failImage();

    const raw = rendered.container.querySelector('img');
    // The raw public path is in OFFLINE_ASSETS, so the service worker can serve it offline.
    // jsdom resolves src against the document origin; assert on the pathname the worker matches.
    const rawSrc = new URL(raw?.getAttribute('src') ?? '', 'http://localhost:3000');
    expect(rawSrc.pathname).toBe('/images/bobo/celebrate-v2.png');
    expect(rawSrc.search).toBe('');
    expect(raw?.getAttribute('alt')).toContain('بوبو');
  });

  it('shows a decorative placeholder instead of a broken image when both sources fail', async () => {
    rendered = await renderBobo({ expression: 'celebrate' });

    await rendered.failImage();
    await rendered.failImage();

    expect(rendered.container.querySelector('img')).toBeNull();
    const fallback = rendered.container.querySelector('.bobo-fallback');
    expect(fallback).not.toBeNull();
    // Decorative only: it carries no alt text to announce and is hidden from AT.
    expect(fallback?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the speech bubble readable even when the image cannot load', async () => {
    rendered = await renderBobo({ expression: 'celebrate', speech: 'آفرین!' });

    await rendered.failImage();
    await rendered.failImage();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(rendered.container.querySelector('.bobo-fallback')).not.toBeNull();
    expect(rendered.text()).toContain('آفرین!');
  });
});

type Rendered = {
  clickButton(label: string): Promise<void>;
  container: HTMLElement;
  failImage(): Promise<void>;
  text(): string;
  unmount(): Promise<void>;
};

async function renderOnboarding(props: {
  onContinue?: () => void;
  onSelectGoal?: (goal: 'life' | 'career' | 'travel') => void;
  selectedGoal: 'life' | 'career' | 'travel';
}): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const { OnboardingGoal } = await import('../app/components/OnboardingGoal.js');
  await act(async () => {
    root.render(
      createElement(OnboardingGoal as FunctionComponent<typeof props>, {
        onContinue: () => {},
        onSelectGoal: () => {},
        ...props,
      }),
    );
  });

  return {
    clickButton: async (label) => clickButtonStartingWith(container, label),
    container,
    failImage: async () => failFirstImage(container),
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function renderNav(props: {
  current: 'today' | 'words' | 'progress';
  onNavigate: (destination: 'today' | 'words' | 'progress') => void;
}): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const { LearnerNav } = await import('../app/components/LearnerNav.js');
  await act(async () => {
    root.render(createElement(LearnerNav as FunctionComponent<typeof props>, props));
  });

  return {
    clickButton: async (label) => clickButtonStartingWith(container, label),
    container,
    failImage: async () => failFirstImage(container),
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function renderBobo(props: {
  className?: string;
  expression: 'welcome' | 'encourage' | 'celebrate' | 'recovery' | 'focus';
  priority?: boolean;
  speech?: string;
}): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const { Bobo } = await import('../app/components/Bobo.js');
  await act(async () => {
    root.render(createElement(Bobo as FunctionComponent<typeof props>, props));
  });

  return {
    clickButton: async () => {
      throw new Error('clickButton is only available for interactive renders.');
    },
    container,
    failImage: async () => failFirstImage(container),
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

// Simulates a failed image request (offline, 404, blocked optimizer) by firing the
// element's own error event, which is what the browser does in those cases.
async function failFirstImage(container: HTMLElement): Promise<void> {
  const image = container.querySelector('img');
  if (!image) throw new Error('failImage called but no <img> is rendered.');
  await act(async () => {
    image.dispatchEvent(new Event('error', { bubbles: false }));
  });
}

async function clickButtonStartingWith(container: HTMLElement, label: string): Promise<void> {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.trim().startsWith(label),
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  await act(async () => button.click());
}
