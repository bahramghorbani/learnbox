// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminAuthGate } from '../app/components/AdminAuthGate';
import { LearningWorkspace } from '../app/components/LearningWorkspace';
import { AdminWorkspaceRouter } from '../app/components/AdminWorkspaceRouter';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('Admin #learning destination (Stage 9)', () => {
  let container: HTMLElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;

  beforeEach(() => {
    window.location.hash = '#learning';
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

  it('renders the distinct unavailable state in local-prototype mode', async () => {
    await act(async () => root?.render(createElement(AdminWorkspaceRouter)));

    expect(container?.querySelector('#learning')).not.toBeNull();
    expect(container?.textContent).toContain('دادهٔ یادگیری در این محیط در دسترس نیست');
    expect(container?.textContent).toContain('این وضعیت به‌معنای صفر بودن داده‌ها نیست');
    expect(container?.querySelector('.learning-metric')).toBeNull();
  });

  it('shows only the authorized activity aggregate from the existing dashboard response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/api/auth/session')) {
          return Response.json({ authenticated: true, recent: false });
        }
        if (String(input).endsWith('/api/dashboard/overview')) {
          return Response.json({ overview: { windowDays: 30, learners: { activeInWindow: 12 } } });
        }
        return new Response(null, { status: 404 });
      }),
    );

    await act(async () => {
      root?.render(
        createElement(AdminAuthGate, { mode: 'server-passkey' }, createElement(LearningWorkspace)),
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container?.textContent).toContain('۱۲');
    expect(container?.textContent).toContain('دارای دست‌کم یک رویداد مرور در ۳۰ روز اخیر');
    expect(container?.textContent).toContain('بدون دادهٔ قابل‌نمایش');
    expect(container?.querySelectorAll('.learning-unavailable-card')).toHaveLength(4);
  });

  it('makes learning a real current sidebar link', async () => {
    await act(async () => root?.render(createElement(AdminWorkspaceRouter)));

    const entry = [...(container?.querySelectorAll('.admin-nav-item') ?? [])].find((item) =>
      item.textContent?.includes('یادگیری'),
    );
    expect(entry?.tagName).toBe('A');
    expect(entry?.getAttribute('href')).toBe('#learning');
    expect(entry?.getAttribute('aria-current')).toBe('page');
  });
});
