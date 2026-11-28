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
      vi.fn(async () =>
        Response.json({
          total: 1,
          tickets: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              ticketNumber: 1001,
              userId: '22222222-2222-4222-8222-222222222222',
              userPhone: '+989000000000',
              userFirstName: 'سارا',
              userLastName: 'رضایی',
              subject: 'مشکل ورود',
              message: 'کد ورود دریافت نمی‌شود.',
              supportReply: null,
              status: 'open',
              createdAt: '2026-11-25T10:00:00.000Z',
              respondedAt: null,
              closedAt: null,
            },
          ],
        }),
      ),
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
    expect(container.textContent).toContain('تیکت‌های پشتیبانی');
    expect(container.textContent).toContain('همه');
    expect(container.textContent).toContain('باز');
    expect(container.textContent).toContain('بسته');
    expect(container.textContent).toContain('TK1001');
    expect(container.textContent).toContain('سارا رضایی');
    expect(container.textContent).toContain('+989000000000');
    expect(container.textContent).not.toContain('کد ورود دریافت نمی‌شود.');
    const details = [...container.querySelectorAll('button')].find((button) =>
      button.getAttribute('aria-label')?.includes('TK1001'),
    );
    await act(async () => details?.click());
    expect(details?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('پیام کاربر');
    expect(container.textContent).toContain('کد ورود دریافت نمی‌شود.');
    expect(fetch).toHaveBeenCalledWith('/api/support/tickets', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
  });
});
