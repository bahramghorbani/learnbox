// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminWorkspaceRouter } from '../app/components/AdminWorkspaceRouter';

/**
 * Phase 2 / Milestone 2.1 — «فروشگاه» is genuinely reachable.
 *
 * The regression this prevents is the one the Store slot already suffered from: a nav entry that
 * exists in the frozen design but routes nowhere. `#store` must resolve to the real Store workspace
 * through the real router, and the sidebar entry must be an actual link to it.
 */

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const listing = {
  packId: 'learnbox-start-a1-essentials',
  packDisplayName: 'بستهٔ شروع',
  packStatus: 'published',
  category: 'essentials',
  isFree: true,
  priceTomans: null,
  listing: {
    storeStatus: 'unlisted' as const,
    featured: false,
    displayOrder: 0,
    coverObjectKey: null,
    commercialSummary: null,
    listedAt: null,
  },
};

describe('Admin #store destination (M2.1)', () => {
  let container: HTMLElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;

  beforeEach(() => {
    window.location.hash = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ listings: [listing] }), { status: 200 })),
    );
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    vi.unstubAllGlobals();
    window.location.hash = '';
  });

  async function render(hash: string) {
    window.location.hash = hash;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(createElement(AdminWorkspaceRouter)));
  }

  it('routes #store to the real Store workspace, reading canonical packs from the API', async () => {
    await render('#store');

    expect(container?.querySelector('#store')).not.toBeNull();
    expect(container?.textContent).toContain('فروشگاه');
    expect(fetch).toHaveBeenCalledWith('/api/store/listings', expect.anything());
    // A real canonical pack, not a hardcoded catalogue.
    expect(
      container?.querySelector('[data-store-pack="learnbox-start-a1-essentials"]'),
    ).not.toBeNull();
  });

  it('shows canonical price and category as read-only context, with no content editor', async () => {
    await render('#store');

    const row = container?.querySelector('[data-store-pack="learnbox-start-a1-essentials"]');
    expect(row?.textContent).toContain('رایگان');
    expect(row?.textContent).toContain('essentials');
    // Commercial controls exist...
    expect(row?.querySelector('select')).not.toBeNull();
    // ...and content fields do not: nothing here can rename a pack or edit a card.
    expect(container?.querySelector('[name="displayName"]')).toBeNull();
    expect(container?.textContent).not.toContain('افزودن کارت');
  });

  it('does not render the Store workspace on the default route', async () => {
    await render('');

    expect(container?.querySelector('[data-store-table="listings"]')).toBeNull();
  });

  it('renders «فروشگاه» as a real sidebar link to #store', async () => {
    await render('#store');

    const entry = [...(container?.querySelectorAll('.admin-nav-item') ?? [])].find((item) =>
      item.textContent?.includes('فروشگاه'),
    );
    expect(entry).toBeDefined();
    expect(entry?.tagName).toBe('A');
    expect(entry?.getAttribute('href')).toBe('#store');
    expect(entry?.getAttribute('aria-current')).toBe('page');
  });
});
