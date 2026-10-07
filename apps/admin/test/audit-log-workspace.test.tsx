// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminWorkspaceRouter } from '../app/components/AdminWorkspaceRouter';

/**
 * Phase 3 / Milestone 3.3 — «عملیات» is genuinely reachable, and «کاربران» finally is too.
 *
 * The regression this prevents is the one that made this milestone necessary: M3.1 and M3.2 shipped
 * working support APIs behind a screen the real router could not open, because the only mount of
 * `UsersManagement` lived in the superseded shell. A nav entry that routes nowhere, or a screen with
 * no route, is indistinguishable from an unbuilt feature — so both destinations are asserted through
 * the real router and the real sidebar rather than by rendering the component directly.
 *
 * The viewer's own behaviour is asserted the same way an operator experiences it: filtering and
 * paging must reach the SERVER (a client-side filter over one page would quietly lie about the
 * trail), and every unhappy answer must say something true rather than render an empty table.
 */

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const actorUserId = '22222222-2222-4222-8222-222222222222';
const targetUserId = '44444444-4444-4444-8444-444444444444';

function entry(index: number) {
  return {
    id: `555555${String(index).padStart(2, '0')}-5555-4555-8555-555555555555`,
    createdAt: '2026-10-08T08:00:00+00:00',
    actorUserId,
    actorLabel: 'نگین رضایی',
    action: 'user_pack.granted',
    entityType: 'user_pack_entitlement',
    entityId: targetUserId,
    reason: 'پشتیبانی تلفنی شمارهٔ ۱۲',
    details: [
      { key: 'new_acquisition', value: 'support', redacted: false },
      { key: 'idempotency_key', value: '•••', redacted: true },
    ],
  };
}

function auditPage(overrides: Record<string, unknown> = {}) {
  return {
    entries: [entry(1)],
    total: 1,
    limit: 25,
    offset: 0,
    actions: ['user_pack.granted', 'user_status.disabled'],
    entityTypes: ['user_pack_entitlement'],
    actors: [{ id: actorUserId, label: 'نگین رضایی' }],
    ...overrides,
  };
}

describe('Admin #audit destination (M3.3)', () => {
  let container: HTMLElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;
  let calls: string[] = [];

  function stubAudit(responder: (url: string) => Response | Promise<Response>) {
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        return responder(url);
      }),
    );
  }

  function ok(body: unknown) {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async function mount(hash: string) {
    window.location.hash = hash;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(AdminWorkspaceRouter));
    });
    return container;
  }

  beforeEach(() => {
    window.location.hash = '';
    stubAudit((url) =>
      url.includes('/api/support/users') ? ok({ users: [], total: 0 }) : ok(auditPage()),
    );
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = undefined;
    root = undefined;
    vi.unstubAllGlobals();
  });

  it('resolves #audit to the real audit viewer and reads the canonical endpoint', async () => {
    const view = await mount('#audit');
    expect(view.querySelector('#audit')).not.toBeNull();
    expect(view.textContent).toContain('گزارش اقدامات مدیریتی');
    expect(calls.some((url) => url.includes('/api/support/audit?'))).toBe(true);
  });

  it('offers the frozen «عملیات» nav entry as a real link, not a disabled item', async () => {
    const view = await mount('#audit');
    const link = view.querySelector('a.admin-nav-item[href="#audit"]');
    expect(link?.textContent).toContain('عملیات');
    expect(link?.getAttribute('aria-current')).toBe('page');
  });

  it('resolves #users to the M3.1/M3.2 support screen inside the approved shell', async () => {
    // The wiring fix: before M3.3 this hash fell through to the home workspace.
    const view = await mount('#users');
    expect(view.querySelector('#users .users-management')).not.toBeNull();
    expect(view.querySelector('a.admin-nav-item[href="#users"]')).not.toBeNull();
  });

  it('shows the timestamp, actor, action, target, reason and safe details of a real action', async () => {
    const view = await mount('#audit');
    const row = view.querySelector('[data-audit-entry]');
    expect(row?.textContent).toContain('نگین رضایی');
    expect(row?.textContent).toContain('user_pack.granted');
    expect(row?.textContent).toContain('user_pack_entitlement');
    expect(row?.textContent).toContain(targetUserId);
    expect(row?.textContent).toContain('پشتیبانی تلفنی شمارهٔ ۱۲');
    expect(row?.querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-08T08:00:00+00:00');
  });

  it('labels a redacted detail instead of printing its value', async () => {
    const view = await mount('#audit');
    const row = view.querySelector('[data-audit-entry]');
    expect(row?.textContent).toContain('پنهان‌شده');
    expect(row?.textContent).not.toContain('•••');
  });

  it('states that the trail is read-only and names the retention policy', async () => {
    const view = await mount('#audit');
    const head = view.querySelector('.page-head')?.textContent ?? '';
    expect(head).toContain('قابل ویرایش یا حذف نیستند');
    expect(head).toContain('حداقل یک سال');
  });

  it('offers no control that could modify a record', async () => {
    const view = await mount('#audit');
    const labels = [...view.querySelectorAll('.admin-workspace button')].map((button) =>
      button.textContent?.trim(),
    );
    for (const forbidden of ['حذف', 'ویرایش', 'اصلاح']) {
      expect(labels.some((label) => label?.includes(forbidden))).toBe(false);
    }
  });

  it('sends filters to the server rather than filtering the page in the browser', async () => {
    const view = await mount('#audit');
    const select = view.querySelector<HTMLSelectElement>('#audit-action')!;
    await act(async () => {
      select.value = 'user_status.disabled';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      view
        .querySelector<HTMLFormElement>('.audit-filters')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(calls.at(-1)).toContain('action=user_status.disabled');
  });

  it('turns a picked end date into a bound that includes that whole day', async () => {
    const view = await mount('#audit');
    const to = view.querySelector<HTMLInputElement>('#audit-to')!;
    await act(async () => {
      // React caches the last value it saw, so a direct assignment looks like "no change" to it.
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setValue.call(to, '2026-10-08');
      to.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      view
        .querySelector<HTMLFormElement>('.audit-filters')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    // An operator asking for "up to the 8th" means through the end of the 8th, so the exclusive
    // upper bound is the next midnight. Sending the 8th at 00:00 would hide that day's actions.
    const sent = new URL(calls.at(-1)!, 'https://admin.learnbox.app').searchParams.get('to')!;
    expect(new Date(sent).getTime()).toBeGreaterThan(new Date('2026-10-08T00:00:00').getTime());
  });

  it('pages on the server and reports the window it is showing', async () => {
    stubAudit((url) => {
      const offset = Number(new URL(url, 'https://admin.learnbox.app').searchParams.get('offset'));
      return ok(auditPage({ entries: [entry(offset)], total: 60, offset }));
    });
    const view = await mount('#audit');
    expect(view.querySelector('.audit-pager')?.textContent).toContain('از 60');
    const older = [...view.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('قدیمی‌تر'),
    )!;
    await act(async () => older.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(calls.at(-1)).toContain('offset=25');
  });

  it('disables paging past the ends of the trail', async () => {
    stubAudit(() => ok(auditPage({ entries: [entry(1)], total: 1, offset: 0 })));
    const view = await mount('#audit');
    const buttons = [...view.querySelectorAll<HTMLButtonElement>('.audit-pager-actions button')];
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });

  it('says the trail is empty rather than rendering an empty table', async () => {
    stubAudit(() => ok(auditPage({ entries: [], total: 0 })));
    const view = await mount('#audit');
    expect(view.querySelector('[data-audit-state="empty"]')).not.toBeNull();
    expect(view.querySelector('.audit-table')).toBeNull();
  });

  it('distinguishes a failed read from an empty trail', async () => {
    stubAudit(() => new Response('Support data unavailable', { status: 503 }));
    const view = await mount('#audit');
    expect(view.querySelector('[data-audit-state="error"]')).not.toBeNull();
    expect(view.querySelector('[data-audit-state="empty"]')).toBeNull();
  });

  it('asks the operator to sign in when the session has expired', async () => {
    stubAudit(() => new Response('Unauthorized', { status: 401 }));
    const view = await mount('#audit');
    expect(view.querySelector('[data-audit-state="unauthorized"]')?.textContent).toContain(
      'وارد شوید',
    );
  });

  it('explains a 404 without claiming the operator has access', async () => {
    stubAudit(() => new Response('Not found', { status: 404 }));
    const view = await mount('#audit');
    expect(view.querySelector('[data-audit-state="unavailable"]')).not.toBeNull();
  });

  it('reports a refused filter instead of showing a partially filtered page', async () => {
    stubAudit(() => new Response('Invalid request', { status: 400 }));
    const view = await mount('#audit');
    expect(view.querySelector('[data-audit-state="invalid"]')).not.toBeNull();
    expect(view.querySelector('.audit-table')).toBeNull();
  });

  it('renders recorded markup as text, never as structure', async () => {
    stubAudit(() =>
      ok(
        auditPage({
          entries: [
            {
              ...entry(1),
              reason: '<img src=x onerror="alert(1)">',
              details: [{ key: 'note', value: '<script>alert(1)</script>', redacted: false }],
            },
          ],
        }),
      ),
    );
    const view = await mount('#audit');
    expect(view.querySelector('[data-audit-entry] script')).toBeNull();
    expect(view.querySelector('[data-audit-entry] img')).toBeNull();
    expect(view.textContent).toContain('<script>alert(1)</script>');
  });
});
