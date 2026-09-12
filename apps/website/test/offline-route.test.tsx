// @vitest-environment jsdom

import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import OfflinePage from '../app/offline/page';

const offlineMessage = 'اشکالی ندارد؛ وقتی دوباره آنلاین شدی، از همین‌جا ادامه می‌دهیم.';
const reconnectMessage = 'دوباره آنلاین شدی؛ برای ادامه دوباره تلاش کن.';
const syncClaimPattern = /همگام|سینک|بازیاب|منتقل شد/;

describe('OfflinePage', () => {
  let rendered: Rendered | undefined;

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
  });

  it('exposes an accessible name by pointing aria-labelledby at the offline heading', async () => {
    rendered = await renderOfflinePage();

    const section = rendered.container.querySelector('section');
    const labelledBy = section?.getAttribute('aria-labelledby');

    expect(labelledBy).toBe('offline-title');
    const heading = rendered.container.querySelector('#offline-title');
    expect(heading?.tagName).toBe('H1');
    expect(heading?.textContent).toBe('فعلاً به اینترنت وصل نیستی');
  });

  it('keeps the decorative recovery illustration hidden from assistive technology', async () => {
    rendered = await renderOfflinePage();

    const illustration = rendered.container.querySelector('.offline-illustration');
    expect(illustration?.getAttribute('aria-hidden')).toBe('true');
  });

  it('announces the offline state politely and claims no sync or recovery', async () => {
    rendered = await renderOfflinePage();

    const status = rendered.container.querySelector('.offline-message');
    // role="status" is an implicit polite live region, so no extra aria-live is needed.
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.textContent).toBe(offlineMessage);
    expect(rendered.text()).not.toMatch(syncClaimPattern);
  });

  it('announces a truthful reconnect state once the browser reports online again', async () => {
    rendered = await renderOfflinePage();

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    const announce = () => rendered?.container.querySelector('.offline-message')?.textContent ?? '';
    expect(announce()).toBe(reconnectMessage);
    expect(announce()).not.toMatch(syncClaimPattern);

    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(announce()).toBe(offlineMessage);
  });

  it('keeps the retry action a native, keyboard-focusable button', async () => {
    rendered = await renderOfflinePage();

    const retry = rendered.container.querySelector<HTMLButtonElement>('button.offline-retry');
    expect(retry?.tagName).toBe('BUTTON');
    expect(retry?.getAttribute('type')).toBe('button');
    expect(retry?.textContent).toBe('دوباره تلاش می‌کنم');
    expect(retry?.hasAttribute('disabled')).toBe(false);

    retry?.focus();
    expect(document.activeElement).toBe(retry);
  });
});

type Rendered = {
  container: HTMLElement;
  text(): string;
  unmount(): Promise<void>;
};

async function renderOfflinePage(): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await act(async () => {
    root.render(createElement(OfflinePage));
  });

  return {
    container,
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
