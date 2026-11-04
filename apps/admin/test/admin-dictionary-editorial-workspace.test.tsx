// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminWorkspaceRouter } from '../app/components/AdminWorkspaceRouter';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const item = {
  id: 'dcd8e2a0-3d55-4b2e-9d4b-9b3b8e6f4c7a',
  dictionaryKey: 'Haus',
  aiPayload: { gloss: 'خانه' },
  manualPayload: null,
  status: 'queued',
  revision: 1,
  source: 'pilot',
  model: null,
  updatedAt: '2026-11-04T12:00:00.000Z',
};

describe('Admin #dictionary destination', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    window.location.hash = '#dictionary';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/dictionary/editorial' && !init?.method)
          return new Response(JSON.stringify({ items: [item] }), { status: 200 });
        if (url === `/api/dictionary/editorial/${item.id}`)
          return new Response(
            JSON.stringify({ item: { ...item, status: 'approved', revision: 2 } }),
            { status: 200 },
          );
        return new Response('not found', { status: 404 });
      }),
    );
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    window.location.hash = '';
  });
  it('loads the server queue and approves through the existing PATCH boundary', async () => {
    await act(async () => root.render(createElement(AdminWorkspaceRouter)));
    expect(container.querySelector('#dictionary')).not.toBeNull();
    expect(container.textContent).toContain('Haus');
    const approve = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('تأیید'),
    );
    await act(async () => approve?.click());
    expect(fetch).toHaveBeenCalledWith(
      `/api/dictionary/editorial/${item.id}`,
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(container.textContent).toContain('تأییدشده');
  });
  it('keeps the route unavailable when the default-off API gate returns 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Not found', { status: 404 })),
    );
    await act(async () => root.render(createElement(AdminWorkspaceRouter)));
    expect(container.textContent).toContain('فعال نیست');
  });
});
