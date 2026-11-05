// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DictionaryReleasePanel } from '../app/components/DictionaryReleasePanel';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const live = {
  file: 'dict-r4.sqlite',
  builtAt: '2026-11-04T00:00:00.000Z',
  at: '2026-11-04T00:00:00.000Z',
  entries: 21950,
  added: 0,
  changed: 0,
  deleted: 0,
  kind: 'initial',
};

async function mount(post: () => Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === 'POST') return post();
      return Response.json({ current: live, history: [live], pending: 56 });
    }),
  );
  const container = document.createElement('div');
  document.body.append(container);
  await act(async () => {
    createRoot(container).render(createElement(DictionaryReleasePanel));
  });
  const publish = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === 'انتشار',
  )!;
  await act(async () => {
    publish.click();
  });
  return { container, calls };
}

describe('dictionary release panel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows unpublished changes and publishes with one click', async () => {
    const { container, calls } = await mount(() =>
      Response.json({
        status: 'published',
        report: { added: 56, changed: 0, deleted: 0, skipped: [], checks: [] },
      }),
    );
    expect(container.textContent).toContain('تغییر از پنل هنوز روی سایت نیست');
    const post = calls.find((c) => c.init?.method === 'POST')!;
    expect(JSON.parse(String(post.init!.body))).toEqual({ action: 'publish' });
    expect(container.textContent).toContain('منتشر شد');
    // Nothing to roll back to while only the initial release exists.
    expect(container.textContent).not.toContain('برگرداندن نسخهٔ قبلی');
  });

  it('names the failed checks and says the site kept the live release', async () => {
    const { container } = await mount(() =>
      Response.json(
        {
          status: 'failed',
          report: {
            checks: [
              { name: 'entries', ok: false, detail: '100' },
              { name: 'integrity', ok: true },
            ],
          },
        },
        { status: 422 },
      ),
    );
    expect(container.textContent).toContain('سایت روی نسخهٔ فعلی ماند');
    expect(container.textContent).toContain('تعداد واژه‌ها');
    expect(container.textContent).not.toContain('سلامت فایل');
  });
});
