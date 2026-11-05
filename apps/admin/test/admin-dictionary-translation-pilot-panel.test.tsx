// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DictionaryTranslationPilotPanel } from '../app/components/DictionaryTranslationPilotPanel';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(post: () => Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('confirm', vi.fn(() => true));
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
    createRoot(container).render(createElement(DictionaryTranslationPilotPanel));
  });
  const run = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === 'ترجمهٔ ۵۰ جملهٔ بعدی',
  )!;
  await act(async () => {
    run.click();
  });
  return { container, calls };
}

describe('dictionary translation pilot panel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for confirmation, posts a bounded batch, and reports the result', async () => {
    const { container, calls } = await mount(() =>
      Response.json({
        translated: 12,
        words: [
          { dictionaryKey: 'Brot', status: 'applied' },
          { dictionaryKey: 'Wasser', status: 'applied' },
        ],
      }),
    );
    expect(window.confirm).toHaveBeenCalledOnce();
    const post = calls.find((c) => c.init?.method === 'POST')!;
    expect(post.url).toBe('/api/dictionary/editorial/translate-examples');
    expect(JSON.parse(String(post.init!.body))).toEqual({ maxSentences: 50 });
    expect(container.textContent).toContain('۱۲ جمله ترجمه شد');
    expect(container.textContent).toContain('۲ واژه');
  });

  it('reports when the AI is not configured without changing anything', async () => {
    const { container } = await mount(() => new Response(null, { status: 503 }));
    expect(container.textContent).toContain('فعال نیست');
  });

  it('does nothing when the admin cancels the confirmation', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    vi.stubGlobal('fetch', vi.fn());
    const container = document.createElement('div');
    document.body.append(container);
    await act(async () => {
      createRoot(container).render(createElement(DictionaryTranslationPilotPanel));
    });
    const run = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'ترجمهٔ ۵۰ جملهٔ بعدی',
    )!;
    await act(async () => {
      run.click();
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
