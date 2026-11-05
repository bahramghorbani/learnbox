// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DictionaryEditorialWorkspace } from '../app/components/DictionaryEditorialWorkspace';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const entry = {
  id: '11111111-1111-4111-8111-111111111111',
  dictionaryKey: 'Haus',
  aiPayload: {
    lemma: 'Haus',
    article: 'das',
    pos: 'noun',
    freq: 9,
    senses: [{ fa: 'خانه', hint: '' }],
    example: { de: 'Das Haus ist alt.', fa: 'خانه قدیمی است.' },
  },
  manualPayload: null,
  status: 'queued',
  revision: 1,
  source: 'ai',
  model: 'm',
  costMetadata: { reviewVerdict: 'fixed', reviewIssues: 'sense order' },
  updatedAt: '2026-11-05T00:00:00.000Z',
};

const typeInto = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('dictionary editorial form', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('edits through fields, not JSON, and an admin save is final (approved)', async () => {
    vi.useFakeTimers();
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (init?.method === 'PATCH')
          return Response.json({
            item: {
              ...entry,
              revision: 2,
              status: 'approved',
              manualPayload: JSON.parse(String(init.body)).manualPayload,
            },
          });
        if (url === '/api/dictionary/release')
          return Response.json({ current: null, history: [], pending: 0 });
        return Response.json({ items: [entry], total: 1 });
      }),
    );
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(DictionaryEditorialWorkspace));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(calls[0]!.url).toBe('/api/dictionary/editorial?q=&filter=all');
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.textContent).toContain('نیاز به نگاه');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-dictionary-entry]')!.click();
    });
    expect(container.textContent).toContain('sense order');
    const sense = container.querySelector<HTMLInputElement>('[aria-label="معنی 1"]')!;
    expect(sense.value).toBe('خانه');
    expect(container.querySelector<HTMLInputElement>('[aria-label="مثال آلمانی 1"]')!.value).toBe(
      'Das Haus ist alt.',
    );
    await act(async () => typeInto(sense, 'خانه، منزل'));
    expect(container.querySelector('[aria-label="پیش‌نمایش"]')!.textContent).toContain(
      'خانه، منزل',
    );

    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent === 'ذخیره')!.click();
      await vi.advanceTimersByTimeAsync(0);
    });
    const patch = calls.find((c) => c.init?.method === 'PATCH')!;
    expect(patch.url).toBe(`/api/dictionary/editorial/${entry.id}`);
    expect(JSON.parse(String(patch.init!.body))).toEqual({
      revision: 1,
      status: 'approved',
      manualPayload: {
        lemma: 'Haus',
        article: 'das',
        pos: 'noun',
        freq: 9,
        senses: [{ fa: 'خانه، منزل', hint: '' }],
        examples: [{ de: 'Das Haus ist alt.', fa: 'خانه قدیمی است.' }],
      },
    });
    expect(container.textContent).toContain('ذخیره شد.');
    // Edited by an admin, so no longer flagged for a look.
    expect(container.querySelector('.b-amber')).toBeNull();

    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });
});
