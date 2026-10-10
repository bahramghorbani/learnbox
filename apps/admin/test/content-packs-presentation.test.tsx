// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContentPacksWorkspace } from '../app/components/ContentPacksWorkspace';

/**
 * Stage 3 of `docs/planning/ADMIN_UI_IMPLEMENTATION_PLAN.md` — the Content Packs & Cards surface
 * matched to the APPROVED, DESIGN FROZEN prototype (PDR-009), `prototypes/admin-ui-v1/content.html`
 * on `proto/admin-ui-concept` @ 8b3e050d.
 *
 * What is pinned here is only what the operator can see and what could silently regress:
 *
 *  - the pack card shows the reference cover, and the cover carries the pack's OWN level and status;
 *  - the content-completion bar is computed from canonical numbers and is absent when there is no
 *    target to be a ratio of — a bar at a made-up 0% or 100% would misreport editorial progress;
 *  - loading / empty / error reuse the Stage 0 shared patterns instead of the old `notice` banners,
 *    so every Admin surface fails and waits the same way;
 *  - no prototype demo data reaches the product: the rendered strings come from the stubbed server
 *    payload only.
 */

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const publishedPack = {
  id: 'learnbox_start_a1_essentials',
  displayName: 'بستهٔ پایه',
  description: 'واژه‌های پایهٔ شروع',
  locale: 'fa',
  targetCefr: 'A1',
  targetItemCount: 35,
  category: 'عمومی',
  isFree: true,
  priceTomans: null,
  status: 'published',
  cardCount: 35,
  publishedCardCount: 35,
  reviewableCardCount: 0,
  createdAt: null,
  publishedAt: null,
};

const draftPack = {
  ...publishedPack,
  id: 'learnbox_b1_travel',
  displayName: 'بستهٔ سفر',
  description: null,
  targetCefr: 'B1',
  category: null,
  isFree: false,
  status: 'draft',
  targetItemCount: 40,
  cardCount: 10,
  publishedCardCount: 0,
};

let container: HTMLElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

function stubPacksResponse(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/content/packs') {
        return status === 200
          ? Response.json(body)
          : new Response(null, { status, statusText: 'stubbed' });
      }
      return Response.json({}, { status: 404 });
    }),
  );
}

async function render() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  await act(async () => {
    root?.render(createElement(ContentPacksWorkspace as FunctionComponent));
    await Promise.resolve();
  });
  if (!container) throw new Error('container not mounted');
  return container;
}

async function renderPacks(packs: unknown[], manageEnabled = true) {
  stubPacksResponse({ packs, manageEnabled, aiEnabled: false, mediaEnabled: false });
  return render();
}

/** The pack card for a given display name, so a second pack cannot satisfy an assertion. */
function cardFor(name: string) {
  const card = [...(container?.querySelectorAll('.pack-card') ?? [])].find((candidate) =>
    candidate.querySelector('.pack-name')?.textContent?.includes(name),
  );
  if (!card) throw new Error(`pack card not found: ${name}`);
  return card;
}

const globalsCss = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8');

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = undefined;
  root = undefined;
  vi.unstubAllGlobals();
});

describe('Content packs presentation (Stage 3)', () => {
  it('gives each pack card the reference cover carrying its own level and status', async () => {
    await renderPacks([publishedPack, draftPack]);

    const cover = cardFor('بستهٔ پایه').querySelector('.pack-cover');
    expect(cover).not.toBeNull();
    expect(cover?.textContent).toContain('A1');
    // The status badge sits on the cover in the reference, not loose in the footer.
    expect(cover?.querySelector('.badge')?.textContent).toContain('منتشر شده');
    expect(cardFor('بستهٔ سفر').querySelector('.pack-cover')?.textContent).toContain('B1');
  });

  it('computes the completion bar from canonical counts for unfinished packs only', async () => {
    await renderPacks([publishedPack, draftPack]);

    const bar = cardFor('بستهٔ سفر').querySelector('.progress');
    expect(bar).not.toBeNull();
    // 10 of 40 real cards — not a prototype placeholder width.
    expect(bar?.getAttribute('aria-valuenow')).toBe('25');
    expect((bar?.firstElementChild as HTMLElement | null)?.style.width).toBe('25%');
    expect(cardFor('بستهٔ سفر').textContent).toContain('۱۰ از ۴۰ کارت');

    // A published pack's count is not an outstanding to-do, so the reference shows no bar.
    expect(cardFor('بستهٔ پایه').querySelector('.progress')).toBeNull();
  });

  it('shows no completion bar when the pack has no target to be a ratio of', async () => {
    await renderPacks([{ ...draftPack, targetItemCount: 0 }]);

    expect(container?.querySelector('.progress')).toBeNull();
    expect(container?.querySelector('.pack-card')).not.toBeNull();
  });

  it('identifies table rows by name over canonical id, with the level as a chip', async () => {
    const view = await renderPacks([publishedPack]);
    await act(async () => {
      [...view.querySelectorAll('.chip')]
        .find((chip) => chip.textContent?.includes('جدول'))
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const cell = view.querySelector('.tbl .cell-main');
    expect(cell).not.toBeNull();
    expect(cell?.querySelector('.t-name')?.textContent).toBe('بستهٔ پایه');
    expect(cell?.querySelector('.t-sub')?.textContent).toBe('learnbox_start_a1_essentials');
    expect(view.querySelector('.tbl .lvl')?.textContent).toBe('A1');
  });

  it('reuses the Stage 0 empty pattern — not a notice banner — when no pack exists', async () => {
    const view = await renderPacks([]);

    expect(view.querySelector('.empty-xl')).not.toBeNull();
    expect(view.querySelector('.notice')).toBeNull();
    expect(view.querySelector('.empty-xl .e-title')?.textContent).toContain('بسته‌ای ثبت نشده');
    // The only offered next step must be one the server actually permits.
    expect(view.querySelector('.empty-xl .e-cta')?.textContent).toContain('افزودن بستهٔ جدید');
  });

  it('offers no create call to action in the empty state when writes are disabled', async () => {
    const view = await renderPacks([], false);

    expect(view.querySelector('.empty-xl')).not.toBeNull();
    expect(view.querySelector('.empty-xl .e-cta')).toBeNull();
  });

  it('reuses the Stage 0 error pattern with a retry action when the read fails', async () => {
    stubPacksResponse(null, 500);
    const view = await render();

    const block = view.querySelector('.err-block');
    expect(block?.className).toContain('rose');
    expect(block?.getAttribute('role')).toBe('alert');
    expect(block?.querySelector('.e-cta')?.textContent).toContain('تلاش دوباره');
  });

  it('marks a rejected session as a permission problem, not a failure', async () => {
    stubPacksResponse(null, 401);
    const view = await render();

    // amber is the reference's "you are not allowed" tone; rose would misreport a server fault.
    expect(view.querySelector('.err-block')?.className).toContain('amber');
  });

  it('announces the wait with the shared loading pattern', async () => {
    // A fetch that never settles leaves the workspace in its loading phase.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const view = await render();

    const row = view.querySelector('.admin-state-row');
    expect(row?.getAttribute('aria-live')).toBe('polite');
    expect(row?.querySelector('.spinner')).not.toBeNull();
    expect(row?.textContent).toContain('در حال دریافت بسته‌ها');
  });

  it('defines every class the packs surface paints with', () => {
    for (const selector of [
      '.cp-workspace .cell-main',
      '.cp-workspace .t-name',
      '.cp-workspace .t-sub',
      '.cp-workspace .lvl',
      '.cp-workspace .cover',
    ]) {
      expect(globalsCss).toContain(`${selector} {`);
    }
    // The prototype's own undefined tokens invalidate the whole declaration at computed-value
    // time, which paints nothing instead of failing loudly. None may remain in this surface.
    expect(globalsCss).not.toContain('var(--lav-soft)');
    expect(globalsCss).not.toContain('var(--lav-line)');
    expect(globalsCss).not.toContain('var(--rose)');
    // Replaced by the reference's own `head-actions`.
    expect(globalsCss).not.toContain('.cp-head-actions');
    // A six-column pack table must scroll inside its own card on a phone; without this the whole
    // page scrolls sideways and drags the header and navigation off-screen with it.
    expect(globalsCss).toContain('.cp-workspace .card:has(.tbl)');
  });
});
