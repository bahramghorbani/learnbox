// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UsersManagement } from '../app/components/UsersManagement';

/**
 * Stage 5 presentation contract for the support surface.
 *
 * The approved design (prototypes/admin-ui-v1/users.html, PDR-009) is already expressed in
 * `globals.css` as the shared `.card`/`.toolbar`/`.tbl`/`.cell-main`/`.badge` vocabulary; this
 * screen used to carry a second, parallel `users-table`/`user-detail-modal` implementation
 * instead. These tests pin the reference markup so the parallel one cannot come back, and pin the
 * two honesty rules the data forces: the status chips refine only the rows that were loaded, and
 * the footer says so.
 */

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@simplewebauthn/browser', () => ({ startAuthentication: async () => ({ id: 'c' }) }));

const active = {
  id: '11111111-1111-4111-8111-111111111111',
  phone: '+989121234567',
  firstName: 'سارا',
  lastName: 'محمدی',
  status: 'active' as const,
  createdAt: '2026-01-05T09:00:00+00:00',
  cardsStarted: 120,
  reviewCount: 980,
  lastActivityAt: '2026-10-09T18:20:00+00:00',
};

const suspended = {
  ...active,
  id: '22222222-2222-4222-8222-222222222222',
  firstName: 'رضا',
  lastName: 'کریمی',
  status: 'disabled' as const,
  cardsStarted: 4,
  reviewCount: 11,
  lastActivityAt: null,
};

let container: HTMLElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

type Route = (init: RequestInit | undefined) => Response | Promise<Response>;

function stubFetch(routes: Array<[string, Route]>) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const match = routes.find(([prefix]) => url.startsWith(prefix));
    if (!match) return Response.json({}, { status: 404 });
    return match[1](init);
  });
  vi.stubGlobal('fetch', mock);
}

async function render() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  await act(async () => {
    root?.render(createElement(UsersManagement as FunctionComponent));
    await Promise.resolve();
  });
}

function button(label: string) {
  const match = [...(container?.querySelectorAll('button') ?? [])].find((candidate) =>
    candidate.textContent?.trim().includes(label),
  );
  if (!match) throw new Error(`button not found: ${label}`);
  return match as HTMLButtonElement;
}

async function click(label: string) {
  await act(async () => {
    button(label).click();
  });
}

const listOf =
  (users: unknown[], total = users.length): Route =>
  () =>
    Response.json({ users, total });
const packsRead: Route = () => Response.json({ packs: [] });

async function renderList(users: unknown[], total?: number) {
  stubFetch([
    ['/api/support/users/packs', packsRead],
    ['/api/support/users', listOf(users, total)],
  ]);
  await render();
}

describe('UsersManagement presentation', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '__Host-learnbox_admin_csrf=csrf-token-value',
    });
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    vi.unstubAllGlobals();
    delete (document as unknown as { cookie?: string }).cookie;
  });

  it('renders the reference table shell instead of the old parallel one', async () => {
    await renderList([active, suspended]);

    expect(container?.querySelector('.card .toolbar .field.grow input')).not.toBeNull();
    expect(container?.querySelector('table.tbl')).not.toBeNull();
    expect(container?.querySelector('.tbl-foot')).not.toBeNull();
    // The replaced implementation must be gone, not merely unused.
    expect(container?.querySelector('.users-table')).toBeNull();
    expect(container?.querySelector('.users-status')).toBeNull();
    expect(container?.querySelector('.users-detail-btn')).toBeNull();
  });

  it('gives every row the reference identity cell with an avatar and the phone as sub-line', async () => {
    await renderList([active, suspended]);
    const rows = [...(container?.querySelectorAll('tbody tr') ?? [])];
    expect(rows).toHaveLength(2);

    const first = rows[0];
    expect(first.querySelector('.cell-main .avatar')?.textContent).toBe('س');
    expect(first.querySelector('.cell-main .t-name')?.textContent).toBe('سارا محمدی');
    const sub = first.querySelector('.cell-main .t-sub');
    expect(sub?.className).toContain('ltr');
    expect(sub?.textContent).toContain('0912');
  });

  it('shows account status as the approved badge, with suspension in the rose tone', async () => {
    await renderList([active, suspended]);
    const badges = [...(container?.querySelectorAll('tbody tr .badge') ?? [])];
    expect(badges.map((badge) => badge.className)).toEqual(['badge b-green', 'badge b-rose']);
    expect(badges[0].textContent).toBe('فعال');
    expect(badges[1].textContent).toBe('غیرفعال موقت');
  });

  it('prints counts in Persian digits', async () => {
    await renderList([active]);
    const cells = [...(container?.querySelectorAll('tbody tr td') ?? [])].map(
      (cell) => cell.textContent,
    );
    expect(cells).toContain('۱۲۰');
    expect(cells).toContain('۹۸۰');
  });

  it('refines only the loaded rows with the status chips, and says so in the footer', async () => {
    // total (9) deliberately exceeds the two loaded rows: the server caps the list.
    await renderList([active, suspended], 9);

    const chips = [...(container?.querySelectorAll('.chips .chip') ?? [])].map(
      (chip) => chip.textContent,
    );
    expect(chips).toEqual(['همه (۲)', 'فعال (۱)', 'غیرفعال موقت (۱)']);

    const foot = container?.querySelector('.tbl-foot')?.textContent ?? '';
    expect(foot).toContain('نمایش ۲ از ۲ کاربر بارگذاری‌شده');
    expect(foot).toContain('مجموع مطابق جست‌وجو: ۹');

    await click('غیرفعال موقت');
    expect(container?.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(container?.querySelector('tbody .t-name')?.textContent).toBe('رضا کریمی');
    expect(container?.querySelector('.tbl-foot')?.textContent).toContain('نمایش ۱ از ۲');
    expect(button('غیرفعال موقت').getAttribute('aria-pressed')).toBe('true');
  });

  it('opens the learner in the shared dialog with the reference definition list', async () => {
    await renderList([active]);
    await click('جزئیات');

    expect(container?.querySelector('.cp-modal')).not.toBeNull();
    expect(container?.querySelector('.user-identity .avatar.lg')?.textContent).toBe('س');
    const terms = [...(container?.querySelectorAll('.dl dt') ?? [])].map(
      (term) => term.textContent,
    );
    expect(terms).toEqual(['تاریخ ثبت‌نام', 'آخرین مرور', 'کارت‌های شروع‌شده', 'کل مرورها']);
    expect(container?.querySelector('.user-detail-overlay')).toBeNull();
  });

  it('uses the shared state patterns for empty and denied, not a bare paragraph', async () => {
    await renderList([]);
    expect(container?.querySelector('.empty .e-title')?.textContent).toContain(
      'هنوز کاربری ثبت نشده است',
    );
    expect(container?.querySelector('table.tbl')).toBeNull();
  });

  it('reports a failed list read as a rose error state with a retry', async () => {
    stubFetch([['/api/support/users', () => new Response('boom', { status: 500 })]]);
    await render();

    const block = container?.querySelector('.err-block');
    expect(block?.className).toBe('err-block rose');
    expect(block?.getAttribute('role')).toBe('alert');
    expect(block?.textContent).toContain('دریافت فهرست کاربران ناموفق بود');
    expect(button('تلاش دوباره')).toBeTruthy();
  });

  it('no longer carries the replaced stylesheet, and does carry the ported primitives', () => {
    const css = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8');
    for (const dead of [
      '.users-table',
      '.users-status',
      '.users-detail-btn',
      '.user-detail-overlay',
      '.user-detail-modal',
      '.user-detail-header',
      '.user-detail-info',
      '.users-suspend-btn',
      '.users-reactivate-btn',
    ]) {
      expect(css).not.toContain(`${dead} {`);
      expect(css).not.toContain(`${dead},`);
    }
    expect(css).toContain('.cp-workspace .avatar {');
    expect(css).toContain('.cp-workspace .dl {');
    expect(css).toContain('.cp-workspace .field input {');
  });
});
