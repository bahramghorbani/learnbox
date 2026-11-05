// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DictionaryAddSensePanel } from '../app/components/DictionaryAddSensePanel';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(post: () => Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return post();
    }),
  );
  const container = document.createElement('div');
  document.body.append(container);
  await act(async () => {
    createRoot(container).render(createElement(DictionaryAddSensePanel));
  });
  const run = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === 'بررسی ۵۰ واژهٔ بعدی',
  )!;
  await act(async () => {
    run.click();
  });
  return { container, calls };
}

describe('dictionary add-sense panel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for confirmation, posts a bounded batch, and reports the result', async () => {
    const { container, calls } = await mount(() =>
      Response.json({
        added: 3,
        words: [
          { dictionaryKey: 'Bank', status: 'applied' },
          { dictionaryKey: 'Birne', status: 'applied' },
          { dictionaryKey: 'Schloss', status: 'applied' },
        ],
      }),
    );
    expect(window.confirm).toHaveBeenCalledOnce();
    const post = calls.find((c) => c.init?.method === 'POST')!;
    expect(post.url).toBe('/api/dictionary/editorial/add-sense');
    expect(JSON.parse(String(post.init!.body))).toEqual({ maxWords: 50 });
    expect(container.textContent).toContain('۳ واژه معنی دوم گرفت');
  });

  it('reports when the reviewer approved nothing', async () => {
    const { container } = await mount(() => Response.json({ added: 0, words: [] }));
    expect(container.textContent).toContain('هیچ معنی تازه‌ای را تأیید نکرد');
  });

  it('does nothing when the admin cancels the confirmation', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    vi.stubGlobal('fetch', vi.fn());
    const container = document.createElement('div');
    document.body.append(container);
    await act(async () => {
      createRoot(container).render(createElement(DictionaryAddSensePanel));
    });
    const run = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'بررسی ۵۰ واژهٔ بعدی',
    )!;
    await act(async () => {
      run.click();
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
