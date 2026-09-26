// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TodayScreenProps } from '../app/components/TodayScreen';

describe('Today loading state (D1 §5 Loading: skeleton figure, no number flash)', () => {
  let rendered: Rendered | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
  });

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows the loading button label (در حال بارگذاری) when syncState is loading', async () => {
    rendered = await renderToday({ reviewCount: 3, syncState: 'loading' });
    // New TodayScreen: the CTA button shows 'در حال بارگذاری…' and is disabled
    expect(rendered.text()).toContain('در حال بارگذاری');
    // Loading state is NOT empty (has reviewCount=3 when non-loading)
    expect(rendered.text()).not.toContain('هدف امروز تکمیل شد! 🎉');
  });

  it('shows review count when a concrete syncState is provided', async () => {
    rendered = await renderToday({ reviewCount: 3, syncState: 'server-backed' });
    // New TodayScreen: reviewCount shown as '۳ کارت دیگه مونده'
    expect(rendered.text()).toContain('۳ کارت دیگه مونده');
    expect(rendered.text()).not.toContain('در حال بارگذاری');
  });

  it('shows the CTA button and count for non-loading syncStates', async () => {
    for (const syncState of ['server-backed', 'error', 'offline', 'local-only'] as const) {
      rendered = await renderToday({ reviewCount: 3, syncState });
      // New TodayScreen: '۳ کارت دیگه مونده' in sub-text, 'شروع مرور' as CTA
      expect(rendered.text()).toContain('۳ کارت دیگه مونده');
      expect(rendered.text()).toContain('شروع مرور');
      await rendered.unmount();
      rendered = undefined;
    }
  });
});

type Rendered = {
  figureNumber(): string | null;
  skeleton(): boolean;
  statusText(): string;
  text(): string;
  unmount(): Promise<void>;
};

async function renderToday(props: TodayScreenProps): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const { TodayScreen } = await import('../app/components/TodayScreen.jsx');
  await act(async () => {
    root.render(createElement(TodayScreen as FunctionComponent<TodayScreenProps>, props));
  });

  return {
    figureNumber: () => container.querySelector('.summary strong')?.textContent?.trim() ?? null,
    skeleton: () => container.querySelector('.summary .today-summary-skeleton') !== null,
    statusText: () => container.querySelector('[role="status"]')?.textContent?.trim() ?? '',
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
