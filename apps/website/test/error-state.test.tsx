// @vitest-environment jsdom

import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ErrorPage from '../app/error';

const syncClaimPattern = /همگام|سینک|بازیاب|منتقل شد/;

describe('ErrorPage', () => {
  let rendered: Rendered | undefined;

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
  });

  it('exposes an accessible name by pointing aria-labelledby at the failure heading', async () => {
    rendered = await renderErrorPage(() => {});

    const section = rendered.container.querySelector('section');
    const labelledBy = section?.getAttribute('aria-labelledby');

    expect(labelledBy).toBe('error-title');
    const heading = rendered.container.querySelector('#error-title');
    expect(heading?.tagName).toBe('H1');
    expect(heading?.textContent).toBe('این بخش فعلاً آماده نیست');
  });

  it('keeps the decorative recovery illustration hidden from assistive technology', async () => {
    rendered = await renderErrorPage(() => {});

    const illustration = rendered.container.querySelector('.offline-illustration');
    expect(illustration?.getAttribute('aria-hidden')).toBe('true');
  });

  it('announces the failure message as an alert without claiming sync or recovery', async () => {
    rendered = await renderErrorPage(() => {});

    const message = rendered.container.querySelector('.offline-message');
    expect(message?.getAttribute('role')).toBe('alert');
    expect(message?.textContent).toContain('یک‌بار دیگر تلاش کن');
    expect(rendered.text()).not.toMatch(syncClaimPattern);
  });

  it('resets through a native, keyboard-focusable retry button', async () => {
    const reset = vi.fn();
    rendered = await renderErrorPage(reset);

    const retry = rendered.container.querySelector<HTMLButtonElement>('button.offline-retry');
    expect(retry?.tagName).toBe('BUTTON');
    expect(retry?.getAttribute('type')).toBe('button');
    expect(retry?.textContent).toBe('دوباره تلاش می‌کنم');
    expect(retry?.hasAttribute('disabled')).toBe(false);

    retry?.focus();
    expect(document.activeElement).toBe(retry);

    await act(async () => {
      retry?.click();
    });
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('keeps one link home for learners who cannot continue', async () => {
    rendered = await renderErrorPage(() => {});

    const homeLink = rendered.container.querySelector<HTMLAnchorElement>('a.error-home-link');
    expect(homeLink?.getAttribute('href')).toBe('/');
    expect(homeLink?.textContent).toBe('بازگشت به صفحهٔ اصلی');
  });
});

type Rendered = {
  container: HTMLElement;
  text(): string;
  unmount(): Promise<void>;
};

async function renderErrorPage(reset: () => void): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await act(async () => {
    root.render(createElement(ErrorPage, { error: new Error('render failed'), reset }));
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
