// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LogoutButton } from '../app/components/AccessWorkspace';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('AccessWorkspace LogoutButton', () => {
  let container: HTMLElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    // jsdom enforces the real __Host- cookie prefix rules (Secure + https origin), which the
    // http://localhost test origin can never satisfy, so stub the read directly instead.
    vi.spyOn(document, 'cookie', 'get').mockReturnValue(
      '__Host-learnbox_admin_csrf=test-csrf-token',
    );
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts to /api/auth/logout with the CSRF cookie as a header, then reloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const reloadSpy = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy });

    await act(async () => {
      root?.render(createElement(LogoutButton));
    });
    await flush();

    const button = container?.querySelector('button');
    expect(button?.textContent).toBe('خروج از حساب');

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: expect.objectContaining({ 'x-learnbox-csrf-token': 'test-csrf-token' }),
      }),
    );
    expect(reloadSpy).toHaveBeenCalled();
  });

  it('shows a retry hint when the request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root?.render(createElement(LogoutButton));
    });
    await flush();

    const button = container?.querySelector('button');
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    expect(container?.textContent).toContain('خروج ناموفق بود');
  });
});
