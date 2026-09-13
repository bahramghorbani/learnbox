// @vitest-environment jsdom

import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NetworkStatus } from '../app/components/NetworkStatus';
import OfflinePage from '../app/offline/page';

const offlineMessage = 'اشکالی ندارد؛ وقتی دوباره آنلاین شدی، از همین‌جا ادامه می‌دهیم.';
const reconnectMessage = 'دوباره آنلاین شدی؛ برای ادامه دوباره تلاش کن.';
const syncClaimPattern = /همگام|سینک|بازیاب|منتقل شد/;

describe('OfflinePage', () => {
  let rendered: Rendered | undefined;

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('exposes an accessible name by pointing aria-labelledby at the offline heading', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
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

  it('shows the offline state without duplicating the root connection live region', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    rendered = await renderOfflinePage();

    const message = rendered.container.querySelector('.offline-message');
    expect(message?.getAttribute('role')).toBeNull();
    expect(message?.textContent).toBe(offlineMessage);
    expect(rendered.container.querySelector('[role="status"]')?.textContent).toBe('');
    expect(rendered.text()).not.toMatch(syncClaimPattern);
  });

  it('reports an already-online browser truthfully after hydration', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    rendered = await renderOfflinePage();

    expect(rendered.container.querySelector('h1')?.textContent).toBe('دوباره آنلاین شدی');
    expect(rendered.container.querySelector('.offline-message')?.textContent).toBe(
      reconnectMessage,
    );
    expect(rendered.container.querySelector('[role="status"]')?.textContent).toBe(reconnectMessage);
  });

  it('announces a truthful reconnect state once the browser reports online again', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    rendered = await renderOfflinePage();

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    const announce = () => rendered?.container.querySelector('.offline-message')?.textContent ?? '';
    expect(rendered.container.querySelector('h1')?.textContent).toBe('دوباره آنلاین شدی');
    expect(announce()).toBe(reconnectMessage);
    expect(rendered.container.querySelector('[role="status"]')?.textContent).toBe(reconnectMessage);
    expect(announce()).not.toMatch(syncClaimPattern);

    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(rendered.container.querySelector('h1')?.textContent).toBe('فعلاً به اینترنت وصل نیستی');
    expect(announce()).toBe(offlineMessage);
    expect(rendered.container.querySelector('[role="status"]')?.textContent).toBe('');
  });

  it('keeps one non-empty connection announcement in the composed layout', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    rendered = await renderOfflinePage(true);

    const activeStatuses = () =>
      [...rendered!.container.querySelectorAll('[role="status"]')].filter((status) =>
        status.textContent?.trim(),
      );

    expect(activeStatuses()).toHaveLength(1);
    expect(activeStatuses()[0]?.textContent).toContain('اینترنت قطع است');

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(activeStatuses()).toHaveLength(1);
    expect(activeStatuses()[0]?.textContent).toBe(reconnectMessage);
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

async function renderOfflinePage(withNetworkStatus = false): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await act(async () => {
    root.render(
      withNetworkStatus
        ? createElement(Fragment, null, createElement(NetworkStatus), createElement(OfflinePage))
        : createElement(OfflinePage),
    );
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
