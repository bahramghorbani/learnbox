// @vitest-environment jsdom

import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LearnerNav } from '../app/components/LearnerNav';
import { StoreScreen } from '../app/components/StoreScreen';

/**
 * M2.3 — the Store is a PRIMARY learner destination.
 *
 * The owner decision is specifically about reachability: «فروشگاه» must sit in the bottom
 * navigation bar, not behind Profile, Settings or any secondary menu. These tests assert the
 * rendered nav, so moving the entry into a submenu fails here rather than in review.
 *
 * The Store's own rendering is asserted against stubbed canonical endpoints — the point is that the
 * screen shows what the server says (free / paid / owned, and the empty and failure states), never
 * a catalogue of its own invention.
 */

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const FREE_PACK = {
  id: 'free-pack',
  name: 'بستهٔ رایگان',
  isFree: true,
  priceTomans: null,
  featured: false,
  commercialSummary: 'شروع یادگیری',
  totalCards: 35,
  owned: false,
};
const PAID_PACK = {
  id: 'paid-pack',
  name: 'بستهٔ پولی',
  isFree: false,
  priceTomans: 150000,
  featured: false,
  commercialSummary: null,
  totalCards: 50,
  owned: false,
};

/** Minimal stand-in for the canonical endpoints. */
function stubStore(options: {
  catalogue?: unknown[];
  owned?: unknown[];
  ok?: boolean;
  activate?: { status: number; body?: unknown };
}) {
  const calls: Array<{ url: string; body?: string }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body as string | undefined });
    const ok = options.ok ?? true;
    if (url.includes('/api/store/activate')) {
      const activate = options.activate ?? { status: 200, body: { status: 'activated' } };
      return {
        ok: activate.status >= 200 && activate.status < 300,
        status: activate.status,
        json: async () => activate.body ?? {},
      } as Response;
    }
    const packs = url.includes('my-packs') ? (options.owned ?? []) : (options.catalogue ?? []);
    return { ok, status: ok ? 200 : 500, json: async () => ({ packs }) } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  // tsconfig uses classic JSX (`"jsx": "preserve"`), so components need React in scope at runtime.
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('M2.3 Store reachability from the bottom navigation', () => {
  it('renders «فروشگاه» as a button in the learner bottom nav', async () => {
    await act(async () => {
      root.render(createElement(LearnerNav, { current: 'today', onNavigate: () => {} }));
    });
    const nav = container.querySelector('.learner-nav');
    expect(nav).not.toBeNull();
    const labels = Array.from(nav!.querySelectorAll('button')).map((b) => b.textContent ?? '');
    expect(labels.some((label) => label.includes('فروشگاه'))).toBe(true);
  });

  it('navigates to the store destination when that nav button is pressed', async () => {
    const onNavigate = vi.fn();
    await act(async () => {
      root.render(createElement(LearnerNav, { current: 'today', onNavigate }));
    });
    const storeButton = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('فروشگاه'),
    );
    expect(storeButton).toBeDefined();
    await act(async () => {
      storeButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onNavigate).toHaveBeenCalledWith('store');
  });

  it('marks the store entry as current while the Store screen is open', async () => {
    stubStore({ catalogue: [] });
    await act(async () => {
      root.render(createElement(StoreScreen, { onNavigate: () => {} }));
    });
    await flush();
    const current = container.querySelector('.learner-nav button[aria-current="page"]');
    expect(current?.textContent).toContain('فروشگاه');
  });
});

describe('M2.3 Store screen states', () => {
  it('shows a loading state before the catalogue arrives', async () => {
    // A request that never settles, so the intermediate state is observable.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    await act(async () => {
      root.render(createElement(StoreScreen, { onNavigate: () => {} }));
    });
    expect(container.textContent).toContain('در حال بارگذاری');
    expect(container.querySelector('.store-spinner')).not.toBeNull();
  });

  it('distinguishes free, paid and owned packs', async () => {
    stubStore({ catalogue: [FREE_PACK, { ...PAID_PACK }, { ...FREE_PACK, id: 'o', owned: true }] });
    await act(async () => {
      root.render(createElement(StoreScreen, { onNavigate: () => {} }));
    });
    await flush();
    expect(container.querySelector('.store-tag-free')?.textContent).toBe('رایگان');
    expect(container.querySelector('.store-tag-paid')?.textContent).toBe('پولی');
    expect(container.querySelector('.store-tag-owned')?.textContent).toBe('دریافت‌شده');
    // The paid price is real data, shown in Persian numerals; buying is M2.4, so the action is off.
    expect(container.textContent).toContain('۱۵۰٬۰۰۰ تومان');
    const paidAction = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('خرید به‌زودی'),
    );
    expect((paidAction as HTMLButtonElement | undefined)?.disabled).toBe(true);
  });

  it('reports an empty shop rather than an error', async () => {
    stubStore({ catalogue: [] });
    await act(async () => {
      root.render(createElement(StoreScreen, { onNavigate: () => {} }));
    });
    await flush();
    expect(container.querySelector('.store-empty')).not.toBeNull();
  });

  it('reports a failed load instead of rendering an empty shop', async () => {
    stubStore({ ok: false });
    await act(async () => {
      root.render(createElement(StoreScreen, { onNavigate: () => {} }));
    });
    await flush();
    expect(container.textContent).toContain('فروشگاه در دسترس نیست');
    expect(container.querySelector('.store-empty')).toBeNull();
  });

  it('posts only the pack id when acquiring, then re-reads ownership from the server', async () => {
    const calls = stubStore({ catalogue: [FREE_PACK] });
    await act(async () => {
      root.render(createElement(StoreScreen, { onNavigate: () => {} }));
    });
    await flush();
    const acquire = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('دریافت رایگان'),
    );
    await act(async () => {
      acquire!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    const activateCall = calls.find((c) => c.url.includes('/api/store/activate'));
    expect(activateCall).toBeDefined();
    // No price, no free/paid flag, no ownership claim — the server decides all of that.
    expect(JSON.parse(activateCall!.body as string)).toEqual({ packId: 'free-pack' });
    expect(container.textContent).toContain('بسته به بسته‌های شما اضافه شد');
    // Catalogue re-read after acquiring, so ownership shown is the server's answer.
    expect(calls.filter((c) => c.url.includes('/api/store/packs')).length).toBeGreaterThan(1);
  });

  it('surfaces an acquisition failure instead of claiming success', async () => {
    stubStore({ catalogue: [FREE_PACK], activate: { status: 409, body: { error: 'not_free' } } });
    await act(async () => {
      root.render(createElement(StoreScreen, { onNavigate: () => {} }));
    });
    await flush();
    const acquire = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('دریافت رایگان'),
    );
    await act(async () => {
      acquire!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();
    expect(container.querySelector('.store-banner-error')).not.toBeNull();
    expect(container.querySelector('.store-banner-success')).toBeNull();
  });

  it('reports an already-owned pack as success, not as an error', async () => {
    stubStore({
      catalogue: [FREE_PACK],
      activate: { status: 200, body: { status: 'already_owned' } },
    });
    await act(async () => {
      root.render(createElement(StoreScreen, { onNavigate: () => {} }));
    });
    await flush();
    const acquire = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('دریافت رایگان'),
    );
    await act(async () => {
      acquire!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();
    expect(container.textContent).toContain('از قبل در بسته‌های شماست');
    expect(container.querySelector('.store-banner-error')).toBeNull();
  });

  it('lists real entitlements under «بسته‌های من»', async () => {
    stubStore({
      catalogue: [FREE_PACK],
      owned: [{ id: 'free-pack', name: 'بستهٔ رایگان', totalCards: 35 }],
    });
    await act(async () => {
      root.render(createElement(StoreScreen, { onNavigate: () => {} }));
    });
    await flush();
    expect(container.querySelector('.store-owned-list')).not.toBeNull();
    expect(container.querySelector('.store-owned-item')?.textContent).toContain('بستهٔ رایگان');
  });
});
