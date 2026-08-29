// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TodayScreenProps } from '../app/components/TodayScreen';

describe('Today sync truth label (D1 §5 sync row)', () => {
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

  it('shows the device-local label on the Today surface when no server route is wired', async () => {
    rendered = await renderToday();
    expect(rendered.text()).toContain('مرورهای امروز');
    expect(rendered.text()).toContain('دستگاه');
    expect(rendered.text()).toContain('سرور');
    expect(rendered.text()).toContain('این فهرست');
  });
});

type Rendered = {
  text(): string;
  unmount(): Promise<void>;
};

async function renderToday(): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const { TodayScreen } = await import('../app/components/TodayScreen.jsx');
  await act(async () => {
    root.render(
      createElement(TodayScreen as FunctionComponent<TodayScreenProps>, {
        syncState: 'local-only',
        reviewCount: 3,
      }),
    );
  });

  return {
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
