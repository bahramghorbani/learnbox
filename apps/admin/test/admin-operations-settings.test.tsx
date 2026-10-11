// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OperationsWorkspace } from '../app/components/OperationsWorkspace';
import { SettingsWorkspace } from '../app/components/SettingsWorkspace';
import { AdminWorkspaceRouter } from '../app/components/AdminWorkspaceRouter';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('Admin Stage 10 Operations and Settings', () => {
  let container: HTMLElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;

  beforeEach(() => {
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

  it('keeps unmodelled health, queues, storage and maintenance actions explicitly unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );

    await act(async () => {
      root?.render(createElement(OperationsWorkspace));
      await flush();
    });

    expect(container?.querySelector('#ops')).not.toBeNull();
    expect(container?.textContent).toContain('مدل سلامت مجاز موجود نیست');
    expect(container?.textContent).toContain('نامشخص — منبع مجاز ندارد');
    expect(container?.textContent).toContain('هیچ فرمان عملیاتی مجاز نیست');
    expect(container?.querySelector('input, select, textarea')).toBeNull();
    expect(container?.querySelector('[data-operation-payment-state="unavailable"]')).not.toBeNull();
  });

  it('renders only the existing read-only payment configuration evidence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe('/api/store/payment-config');
        return Response.json({
          configuration: {
            state: 'unproven',
            provider: 'zarinpal',
            environment: 'sandbox',
            verifiedCount: 0,
            pendingCount: 2,
            failedCount: 1,
            lastVerifiedAt: null,
          },
        });
      }),
    );

    await act(async () => {
      root?.render(createElement(OperationsWorkspace));
      await flush();
    });

    expect(container?.textContent).toContain('پیکربندی‌شده، اما تأییدنشده');
    expect(container?.textContent).toContain('آزمایشی');
    expect(container?.textContent).toContain('۲ / ۱');
    expect(container?.textContent).toContain('شناسهٔ پذیرنده و هیچ secret دیگری');
  });

  it('keeps settings read-only and distinguishes current session from unavailable configuration', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/session') {
        return Response.json({ authenticated: true, recent: false });
      }
      if (String(input) === '/api/store/payment-config') return new Response(null, { status: 404 });
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root?.render(createElement(SettingsWorkspace));
      await flush();
    });

    expect(container?.querySelector('#settings')).not.toBeNull();
    expect(container?.textContent).toContain('برای عملیات حساس دوباره درخواست می‌شود');
    expect(container?.textContent).toContain('وضعیت پرداخت در دسترس نیست');
    expect(container?.textContent).toContain('کلیدهای محیطی، secretها، credentialها');
    expect(container?.querySelectorAll('input, select, textarea')).toHaveLength(0);
    const calls = fetchMock.mock.calls as unknown as Array<
      [RequestInfo | URL, RequestInit | undefined]
    >;
    expect(calls.every(([, init]) => !init || !('method' in init))).toBe(true);
  });

  it('makes operations and settings real sidebar routes while preserving the audit destination', async () => {
    window.location.hash = '#settings';
    await act(async () => root?.render(createElement(AdminWorkspaceRouter)));

    expect(container?.querySelector('#settings')).not.toBeNull();
    const settings = [...(container?.querySelectorAll('.admin-nav-item') ?? [])].find((item) =>
      item.textContent?.includes('تنظیمات'),
    );
    expect(settings?.tagName).toBe('A');
    expect(settings?.getAttribute('href')).toBe('#settings');

    window.location.hash = '#ops';
    await act(async () => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await flush();
    });
    expect(container?.querySelector('#ops')).not.toBeNull();
    expect(container?.querySelector('a[href="#audit"]')).not.toBeNull();
  });
});
