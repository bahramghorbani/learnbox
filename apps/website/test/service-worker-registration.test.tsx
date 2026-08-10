// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('ServiceWorkerRegistration', () => {
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

  it('registers the public offline fallback when service workers are supported', async () => {
    const registerMock = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', {
      serviceWorker: { register: registerMock },
    });

    rendered = await renderRegistration();

    expect(registerMock).toHaveBeenCalledWith('/sw.js');
  });

  it('renders nothing even when registration succeeds', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: { register: () => Promise.resolve() },
    });

    rendered = await renderRegistration();
    expect(rendered.text()).toBe('');
  });

  it('does not break the app when registration fails', async () => {
    const registerMock = vi.fn(() => Promise.reject(new Error('blocked')));
    vi.stubGlobal('navigator', {
      serviceWorker: { register: registerMock },
    });

    rendered = await renderRegistration();
    expect(rendered.text()).toBe('');
  });
});

type Rendered = {
  text(): string;
  unmount(): Promise<void>;
};

async function renderRegistration(): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const { ServiceWorkerRegistration } =
    await import('../app/components/ServiceWorkerRegistration.js');
  await act(async () => {
    root.render(createElement(ServiceWorkerRegistration as FunctionComponent));
  });

  return {
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
