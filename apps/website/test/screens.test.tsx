// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgressScreen } from '../app/components/ProgressScreen';
import { LaunchScreen } from '../app/components/LaunchScreen';
import { activeLaunchExperience } from '../app/launch-experience';

describe('ProgressScreen', () => {
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

  it('shows today-reviewed progress when the learner has graded cards', async () => {
    rendered = await renderProgress({ reviewedToday: 3, streakDays: 1 });

    expect(rendered.text()).toContain('امروز 3 کارت را ثبت کردی.');
    expect(rendered.text()).toContain('3 کارت ثبت شد');
    expect(rendered.text()).toContain('1 روز همراه LearnBox');
  });

  it('shows a fresh-start message when nothing is reviewed yet', async () => {
    rendered = await renderProgress({ reviewedToday: 0, streakDays: 0 });

    expect(rendered.text()).toContain('با یک مرور کوتاه، گزارش واقعی‌ات از همین‌جا شکل می‌گیرد.');
    expect(rendered.text()).toContain('شروع تازه با LearnBox');
  });

  it('invokes the review action from the progress CTA', async () => {
    let started = false;
    rendered = await renderProgress({
      reviewedToday: 1,
      streakDays: 1,
      onStartReview: () => {
        started = true;
      },
    });

    await rendered.clickButton('ادامهٔ مرور');
    expect(started).toBe(true);
  });
});

describe('LaunchScreen', () => {
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

  it('renders the approved launch image and hides after the configured duration', async () => {
    rendered = await renderLaunch();

    // The screen is visible with the approved image path.
    expect(rendered.container.querySelector('.launch-screen')).not.toBeNull();
    const image = rendered.container.querySelector('img');
    expect(image?.getAttribute('src')).toContain(activeLaunchExperience.imagePath);

    // Once the image loads, the exit timers advance the state.
    await rendered.loadImage();
    await act(async () => {
      vi.advanceTimersByTime(activeLaunchExperience.durationMs);
    });
    expect(rendered.container.querySelector('.launch-screen-exiting')).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(240);
    });
    expect(rendered.container.querySelector('.launch-screen')).toBeNull();
  });

  it('falls back to the brand mark when the image fails', async () => {
    rendered = await renderLaunch();
    await rendered.failImage();

    expect(rendered.text()).toContain('LearnBox');
    expect(rendered.container.querySelector('.launch-screen-fallback')).not.toBeNull();
  });
});

type Rendered = {
  clickButton(label: string): Promise<void>;
  container: HTMLElement;
  failImage(): Promise<void>;
  loadImage(): Promise<void>;
  text(): string;
  unmount(): Promise<void>;
};

async function renderProgress(props: {
  onStartReview?: () => void;
  onNavigate?: (destination: 'today' | 'words' | 'progress') => void;
  reviewedToday: number;
  streakDays: number;
}): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await act(async () => {
    root.render(
      createElement(ProgressScreen as FunctionComponent<typeof props>, {
        onNavigate: () => {},
        onStartReview: () => {},
        ...props,
      }),
    );
  });

  return {
    clickButton: async (label) => {
      const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
        candidate.textContent?.trim().startsWith(label),
      );
      if (!button) throw new Error(`Button not found: ${label}`);
      await act(async () => button.click());
    },
    container,
    failImage: async () => {
      throw new Error('failImage is only available for LaunchScreen renders.');
    },
    loadImage: async () => {
      throw new Error('loadImage is only available for LaunchScreen renders.');
    },
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function renderLaunch(): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await act(async () => {
    root.render(createElement(LaunchScreen as FunctionComponent));
  });

  const dispatchImageEvent = async (eventName: 'load' | 'error') => {
    const image = container.querySelector('img');
    if (!image) throw new Error('Launch image not found.');
    await act(async () => image.dispatchEvent(new Event(eventName)));
  };

  return {
    clickButton: async () => {
      throw new Error('clickButton is only available for ProgressScreen renders.');
    },
    container,
    failImage: async () => dispatchImageEvent('error'),
    loadImage: async () => dispatchImageEvent('load'),
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
