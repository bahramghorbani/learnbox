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

  it('hides the concrete review figure and shows a loading skeleton while the server read is pending', async () => {
    rendered = await renderToday({ reviewCount: 3, syncState: 'loading' });
    expect(rendered.figureNumber()).toBeNull();
    expect(rendered.skeleton()).toBe(true);
    expect(rendered.text()).toContain('در حال آماده‌کردن مرور امروز');
    expect(rendered.text()).not.toContain('۳ کارت برای شروع');
  });

  it('announces the pending server read via a status region', async () => {
    rendered = await renderToday({ reviewCount: 3, syncState: 'loading' });
    expect(rendered.statusText()).toContain('در حال خواندن وضعیت از سرور');
  });

  it('keeps the concrete local figure after success, failure, and offline', async () => {
    for (const syncState of ['server-backed', 'error', 'offline', 'local-only'] as const) {
      rendered = await renderToday({ reviewCount: 3, syncState });
      expect(rendered.figureNumber()).toBe('۳');
      expect(rendered.skeleton()).toBe(false);
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
