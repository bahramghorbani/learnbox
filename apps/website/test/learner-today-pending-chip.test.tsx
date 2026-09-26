// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TodayScreenProps } from '../app/components/TodayScreen';

describe('Today pending-sync chip (D1 §5 sync row, M-L3 parity)', () => {
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

  it('shows the pending sync chip with a positive count', async () => {
    rendered = await renderToday({ reviewCount: 3, pendingReviewCount: 2 });
    // New TodayScreen: shows 'X مرور در انتظار همگام‌سازی' in a status div
    expect(rendered.text()).toContain('مرور در انتظار همگام‌سازی');
    expect(rendered.text()).toContain('۲ مرور در انتظار همگام‌سازی');
    expect(rendered.pendingChip()).toBe(true);
  });

  it('shows no pending chip when the local queue is empty', async () => {
    rendered = await renderToday({ reviewCount: 0, pendingReviewCount: 0 });
    expect(rendered.text()).not.toContain('مرور در انتظار همگام‌سازی');
  });

  it('fails closed without a pending chip when the queue read fails (null)', async () => {
    rendered = await renderToday({ reviewCount: 3, pendingReviewCount: null });
    expect(rendered.text()).not.toContain('مرور در انتظار همگام‌سازی');
    expect(rendered.pendingChip()).toBe(false);
  });

  it('never claims server acknowledgement or server-backed state', async () => {
    rendered = await renderToday({ reviewCount: 3, pendingReviewCount: 2 });
    expect(rendered.text()).not.toContain('همگام‌سازی شد');
    expect(rendered.text()).not.toContain('سرور LearnBox خوانده شده');
    expect(rendered.text()).toContain('در انتظار همگام‌سازی');
  });
});

type Rendered = {
  pendingChip(): boolean;
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
    pendingChip: () => container.querySelector('.home-sync-pending') !== null,
    statusText: () => container.querySelector('[role="status"]')?.textContent?.trim() ?? '',
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
