// @vitest-environment jsdom

import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startAuthentication } from '@simplewebauthn/browser';

import { SplashReplacementPanel } from '../app/components/SplashReplacementPanel';

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(async () => ({ id: 'credential' })),
}));

type Rendered = {
  container: HTMLElement;
  text(): string;
  button(label: string): HTMLButtonElement | undefined;
  input(): HTMLInputElement;
  unmount(): Promise<void>;
};

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function render(node: ReactNode): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
    await Promise.resolve();
  });
  return {
    container,
    text: () => container.textContent ?? '',
    button: (label) =>
      Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === label,
      ),
    input: () => container.querySelector('input[type="file"]') as HTMLInputElement,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function selectFile(rendered: Rendered, file: File) {
  const input = rendered.input();
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:local-preview'),
    revokeObjectURL: vi.fn(),
  });
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => '__Host-learnbox_admin_csrf=csrf-token',
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('owner splash replacement UI', () => {
  it('shows exact upload guidance and no excluded management controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Not found', { status: 404 })),
    );
    const rendered = await render(createElement(SplashReplacementPanel));

    expect(rendered.text()).toContain('PNG، JPEG یا WebP');
    expect(rendered.text()).toContain('حداکثر ۸ مگابایت');
    expect(rendered.text()).toContain('حداقل ۸۶۴ × ۱۶۰۰ پیکسل');
    for (const excluded of ['زمان‌بندی', 'آیکون برنامه', 'تاریخچه', 'حذف اسپلش']) {
      expect(rendered.text()).not.toContain(excluded);
    }
    await rendered.unmount();
  });

  it('rejects an unsupported local file before enabling confirmation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Not found', { status: 404 })),
    );
    const rendered = await render(createElement(SplashReplacementPanel));
    await selectFile(rendered, new File(['not-an-image'], 'splash.gif', { type: 'image/gif' }));

    expect(rendered.text()).toContain('فرمت فایل قابل قبول نیست');
    expect(rendered.button('تأیید و جایگزینی')).toBeUndefined();
    await rendered.unmount();
  });

  it('requires explicit confirmation and sends a fresh idempotent protected request', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => '550e8400-e29b-41d4-a716-446655440000') });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.endsWith('/api/splash/current')) {
          return Response.json({
            current: {
              revision: 'version-1',
              width: 864,
              height: 1821,
              byteSize: 120_000,
              updatedAt: '2026-08-10T14:30:00.000Z',
              previewPath: '/api/splash/preview',
            },
          });
        }
        return Response.json({ status: 'replaced', revision: 'version-2' });
      }),
    );
    const rendered = await render(createElement(SplashReplacementPanel));
    await selectFile(rendered, new File(['image'], 'splash.png', { type: 'image/png' }));

    expect(rendered.button('تأیید و جایگزینی')).toBeUndefined();
    await act(async () => rendered.button('آماده‌سازی جایگزینی')!.click());
    expect(rendered.button('تأیید و جایگزینی')).toBeDefined();
    expect(document.activeElement).toBe(rendered.button('تأیید و جایگزینی'));
    await act(async () => rendered.button('تأیید و جایگزینی')!.click());
    await act(async () => Promise.resolve());

    const mutation = requests.find(({ url }) => url.endsWith('/api/splash/replace'))!;
    const headers = new Headers(mutation.init?.headers);
    expect(headers.get('idempotency-key')).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(headers.get('x-learnbox-csrf-token')).toBe('csrf-token');
    expect(rendered.text()).toContain('اسپلش با موفقیت جایگزین شد');
    await rendered.unmount();
  });

  it('asks for a recent passkey ceremony and retries the same confirmed attempt', async () => {
    let replacementAttempts = 0;
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => '550e8400-e29b-41d4-a716-446655440000') });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/splash/current')) return Response.json({ current: null });
        if (url.endsWith('/api/splash/replace')) {
          replacementAttempts += 1;
          return replacementAttempts === 1
            ? Response.json({ code: 'reauthentication_required' }, { status: 428 })
            : Response.json({ status: 'replaced', revision: 'version-2' });
        }
        if (url.endsWith('/api/auth/reauth/options')) {
          return Response.json({ challenge: 'challenge' });
        }
        if (url.endsWith('/api/auth/reauth/verify')) return new Response(null, { status: 204 });
        return new Response(null, { status: 404 });
      }),
    );
    const rendered = await render(createElement(SplashReplacementPanel));
    await selectFile(rendered, new File(['image'], 'splash.webp', { type: 'image/webp' }));
    await act(async () => rendered.button('آماده‌سازی جایگزینی')!.click());
    await act(async () => rendered.button('تأیید و جایگزینی')!.click());
    await act(async () => Promise.resolve());

    expect(rendered.text()).toContain('هویت مدیر باید دوباره تأیید شود');
    await act(async () => rendered.button('تأیید دوباره با Passkey')!.click());
    await act(async () => Promise.resolve());

    expect(startAuthentication).toHaveBeenCalledOnce();
    expect(replacementAttempts).toBe(2);
    expect(rendered.text()).toContain('اسپلش با موفقیت جایگزین شد');
    await rendered.unmount();
  });

  it('keeps a confirmed success when only the metadata refresh becomes unavailable', async () => {
    let currentReads = 0;
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '550e8400-e29b-41d4-a716-446655440000'),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/splash/current')) {
          currentReads += 1;
          return currentReads === 1
            ? Response.json({ current: null })
            : new Response('Unavailable', { status: 503 });
        }
        if (url.endsWith('/api/splash/replace')) {
          return Response.json({ status: 'replaced', revision: 'version-2' });
        }
        return new Response(null, { status: 404 });
      }),
    );
    const rendered = await render(createElement(SplashReplacementPanel));
    await selectFile(rendered, new File(['image'], 'splash.png', { type: 'image/png' }));
    await act(async () => rendered.button('آماده‌سازی جایگزینی')!.click());
    await act(async () => rendered.button('تأیید و جایگزینی')!.click());
    await act(async () => Promise.resolve());

    expect(rendered.text()).toContain('اسپلش با موفقیت جایگزین شد');
    expect(rendered.text()).not.toContain('جایگزینی انجام نشد');
    await rendered.unmount();
  });
});
