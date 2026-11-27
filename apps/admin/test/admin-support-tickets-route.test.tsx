// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('Admin support tickets destination', () => {
  let container: HTMLElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_ADMIN_SUPPORT_TICKETS_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ tickets: [] })),
    );
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    window.location.hash = '';
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('wires the enabled support capability to a sidebar destination with its ticket queue', async () => {
    window.location.hash = '#support';
    const { AdminWorkspaceRouter } = await import('../app/components/AdminWorkspaceRouter.jsx');
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(AdminWorkspaceRouter));
      await Promise.resolve();
    });

    expect(container.querySelector('#support .users-management')).not.toBeNull();
    const entry = [...container.querySelectorAll('.admin-nav-item')].find((item) =>
      item.textContent?.includes('پشتیبانی'),
    );
    expect(entry?.getAttribute('href')).toBe('#support');
    expect(entry?.getAttribute('aria-current')).toBe('page');
    expect(container.textContent).toContain('تیکت‌های باز پشتیبانی');
    expect(fetch).toHaveBeenCalledWith('/api/support/tickets?status=open', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
  });
});
