// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminAuthGate } from '../app/components/AdminAuthGate';
import { AccessWorkspace } from '../app/components/AccessWorkspace';
import { AdminWorkspaceRouter } from '../app/components/AdminWorkspaceRouter';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('Admin #access destination (Stage 8)', () => {
  let container: HTMLElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;

  beforeEach(() => {
    window.location.hash = '#access';
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    vi.unstubAllGlobals();
    window.location.hash = '';
  });

  it('routes #access to an honest unavailable state in the local-prototype mode', async () => {
    await act(async () => root?.render(createElement(AdminWorkspaceRouter)));

    expect(container?.querySelector('#access')).not.toBeNull();
    expect(container?.textContent).toContain('نشست‌ها و دسترسی');
    expect(container?.textContent).toContain('مدیریت دسترسی در این محیط فعال نیست');
    expect(container?.textContent).not.toContain('نشانی شبکه');
    expect(container?.textContent).not.toContain('ابطال همهٔ نشست‌ها');
  });

  it('renders only current-session facts after server authentication', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/api/auth/session')) {
          return Response.json({ authenticated: true, recent: false });
        }
        return new Response(null, { status: 404 });
      }),
    );

    await act(async () => {
      root?.render(
        createElement(AdminAuthGate, { mode: 'server-passkey' }, createElement(AccessWorkspace)),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container?.textContent).toContain('نشست فعلی');
    expect(container?.textContent).toContain('برای عملیات حساس، Passkey دوباره درخواست می‌شود');
    expect(container?.textContent).toContain('افزودن دستگاه جدید');
    expect(container?.textContent).toContain('فهرست نشست‌ها در دسترس نیست');
    expect(container?.querySelector('table')).toBeNull();
  });

  it('renders «نشست‌ها و دسترسی» as the current sidebar link', async () => {
    await act(async () => root?.render(createElement(AdminWorkspaceRouter)));

    const entry = [...(container?.querySelectorAll('.admin-nav-item') ?? [])].find((item) =>
      item.textContent?.includes('نشست‌ها و دسترسی'),
    );
    expect(entry?.tagName).toBe('A');
    expect(entry?.getAttribute('href')).toBe('#access');
    expect(entry?.getAttribute('aria-current')).toBe('page');
  });
});
