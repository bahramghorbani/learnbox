// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UsersManagement } from '../app/components/UsersManagement';

/**
 * Inline step-up re-authentication on the support surface (the users half of the 428 defect).
 *
 * The defect: suspending an account or granting a pack after the server's five-minute
 * recent-authentication window elapsed answered 428, and this screen could only say "sign in
 * again" — which meant abandoning the typed reason and losing the selected learner. A support
 * operator writing a careful reason is exactly the case that takes longer than five minutes.
 *
 * What is asserted here is the operator-visible contract, not the helper's internals:
 *   - a refused mutation re-authenticates in place and is retried with the SAME idempotency key,
 *     so the account cannot be suspended twice;
 *   - one passkey prompt per refusal, and a server that keeps answering 428 is reported instead of
 *     prompting forever;
 *   - a cancelled or failed ceremony leaves the dialog open with the typed reason still in it;
 *   - the authorization gate still answers 404 and is still shown as "not allowed".
 */

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let authenticate: () => Promise<{ id: string }>;
let ceremonies = 0;

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: async () => {
    ceremonies += 1;
    return authenticate();
  },
}));

const learner = {
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

const entitlement = {
  packId: 'learnbox_start_a1',
  title: 'بستهٔ پایه',
  isFree: false,
  published: true,
  acquisition: null,
  acquiredAt: null,
  purchase: null,
  hasAccess: false,
  accessVia: null,
  grant: 'allowed' as const,
  revoke: 'not_entitled' as const,
};

let container: HTMLElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

type Call = { url: string; init?: RequestInit };
type Route = (init: RequestInit | undefined, url: string) => Response | Promise<Response>;

/** Routed on prefix: the list carries a query string and the entitlement read carries a userId. */
function stubFetch(routes: Array<[string, Route]>) {
  const calls: Call[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const match = routes.find(([prefix]) => url.startsWith(prefix));
    if (!match) return Response.json({}, { status: 404 });
    return match[1](init, url);
  });
  vi.stubGlobal('fetch', mock);
  return { calls };
}

const listRoute: Route = () => Response.json({ users: [learner], total: 1 });
const packsReadRoute: Route = () => Response.json({ packs: [entitlement] });

function reauthRoutes(
  options: Route = () => Response.json({ challenge: 'c' }),
): Array<[string, Route]> {
  return [
    ['/api/auth/reauth/options', options],
    ['/api/auth/reauth/verify', () => new Response(null, { status: 204 })],
  ];
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

/** A controlled React textarea only registers a change written through the native setter. */
async function typeReason(selector: string, value: string) {
  const field = container?.querySelector(selector) as HTMLTextAreaElement;
  if (!field) throw new Error(`field not found: ${selector}`);
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(field, value);
  await act(async () => {
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function mutations(calls: Call[], path: string) {
  return calls.filter((call) => call.url === path && call.init?.method === 'POST');
}

function keys(calls: Call[], path: string) {
  return mutations(calls, path).map((call) =>
    new Headers(call.init?.headers).get('idempotency-key'),
  );
}

function text() {
  return container?.textContent ?? '';
}

const statusPath = '/api/support/users/status';
const reasonSelector = '#user-status-reason';

/** Opens the learner's dialog and writes a suspension reason, leaving it unsaved. */
async function openLearnerAndTypeReason() {
  await render();
  await click('جزئیات');
  await typeReason(reasonSelector, 'تیکت ۸۸۱ — گزارش تخلف');
}

describe('UsersManagement step-up re-authentication', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '__Host-learnbox_admin_csrf=csrf-token-value',
    });
    authenticate = async () => ({ id: 'credential' });
    ceremonies = 0;
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    vi.unstubAllGlobals();
    delete (document as unknown as { cookie?: string }).cookie;
  });

  it('re-authenticates in place on 428 and retries the suspension with the SAME key', async () => {
    let attempts = 0;
    const { calls } = stubFetch([
      [
        statusPath,
        () => {
          attempts += 1;
          return attempts === 1
            ? Response.json({ code: 'reauthentication_required' }, { status: 428 })
            : Response.json({ status: 'applied', user: { ...learner, status: 'disabled' } });
        },
      ],
      ['/api/support/users/packs', packsReadRoute],
      ['/api/support/users', listRoute],
      ...reauthRoutes(),
    ]);

    await openLearnerAndTypeReason();
    await click('غیرفعال‌سازی موقت حساب');

    const sent = keys(calls, statusPath);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toBe(sent[1]);
    expect(sent[0]).toBeTruthy();
    expect(ceremonies).toBe(1);
    expect(text()).toContain('حساب موقتاً غیرفعال شد');
    // The retry carried the identical body, so the server saw one suspension, not two.
    const bodies = mutations(calls, statusPath).map((call) => call.init?.body);
    expect(bodies[0]).toBe(bodies[1]);
  });

  it('keeps the typed reason when the operator cancels the passkey prompt', async () => {
    const { calls } = stubFetch([
      [statusPath, () => Response.json({ code: 'reauthentication_required' }, { status: 428 })],
      ['/api/support/users/packs', packsReadRoute],
      ['/api/support/users', listRoute],
      ...reauthRoutes(),
    ]);
    authenticate = async () => {
      const error = new Error('dismissed');
      error.name = 'NotAllowedError';
      throw error;
    };

    await openLearnerAndTypeReason();
    await click('غیرفعال‌سازی موقت حساب');

    expect(mutations(calls, statusPath)).toHaveLength(1);
    expect(text()).toContain('تأیید هویت لغو شد');
    expect(text()).toContain('داده‌های واردشده حفظ شده است');
    // The dialog is still open and still holds what was typed.
    expect((container?.querySelector(reasonSelector) as HTMLTextAreaElement).value).toBe(
      'تیکت ۸۸۱ — گزارش تخلف',
    );
    expect(container?.querySelector('.cp-modal')).not.toBeNull();
  });

  it('reports a failed ceremony without retrying the mutation', async () => {
    const { calls } = stubFetch([
      [statusPath, () => Response.json({ code: 'reauthentication_required' }, { status: 428 })],
      ['/api/support/users/packs', packsReadRoute],
      ['/api/support/users', listRoute],
      ['/api/auth/reauth/options', () => new Response('nope', { status: 500 })],
    ]);

    await openLearnerAndTypeReason();
    await click('غیرفعال‌سازی موقت حساب');

    expect(mutations(calls, statusPath)).toHaveLength(1);
    expect(text()).toContain('تأیید هویت دوباره ناموفق بود');
    expect((container?.querySelector(reasonSelector) as HTMLTextAreaElement).value).not.toBe('');
  });

  it('tells the operator to sign in again when the session itself has expired', async () => {
    const { calls } = stubFetch([
      [statusPath, () => Response.json({ code: 'reauthentication_required' }, { status: 428 })],
      ['/api/support/users/packs', packsReadRoute],
      ['/api/support/users', listRoute],
      ['/api/auth/reauth/options', () => new Response('unauthorized', { status: 401 })],
    ]);

    await openLearnerAndTypeReason();
    await click('غیرفعال‌سازی موقت حساب');

    expect(mutations(calls, statusPath)).toHaveLength(1);
    expect(text()).toContain('نشست شما منقضی شده است');
  });

  it('prompts once and reports, never looping, when the server keeps answering 428', async () => {
    const { calls } = stubFetch([
      [statusPath, () => Response.json({ code: 'reauthentication_required' }, { status: 428 })],
      ['/api/support/users/packs', packsReadRoute],
      ['/api/support/users', listRoute],
      ...reauthRoutes(),
    ]);

    await openLearnerAndTypeReason();
    await click('غیرفعال‌سازی موقت حساب');

    // Exactly one retry and exactly one ceremony: a stale clock cannot become an endless prompt.
    expect(mutations(calls, statusPath)).toHaveLength(2);
    expect(ceremonies).toBe(1);
    expect(calls.filter((call) => call.url === '/api/auth/reauth/options')).toHaveLength(1);
    expect(text()).toContain('سرور همچنان احراز هویت تازه می‌خواهد');
  });

  it('re-authenticates the entitlement grant too, with its own single key', async () => {
    let attempts = 0;
    const packsPath = '/api/support/users/packs';
    const { calls } = stubFetch([
      [
        packsPath,
        (init) => {
          if (init?.method !== 'POST') return packsReadRoute(init, packsPath);
          attempts += 1;
          return attempts === 1
            ? Response.json({ code: 'reauthentication_required' }, { status: 428 })
            : Response.json({
                status: 'applied',
                pack: { ...entitlement, hasAccess: true, acquisition: 'support' },
              });
        },
      ],
      ['/api/support/users', listRoute],
      ...reauthRoutes(),
    ]);

    await render();
    await click('جزئیات');
    await click('اعطای دسترسی');
    await typeReason(`#pack-reason-${entitlement.packId}`, 'تیکت ۹۰۲ — جبران پرداخت ناموفق');
    await click('تأیید و اعطای دسترسی');

    const sent = keys(calls, packsPath);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toBe(sent[1]);
    expect(ceremonies).toBe(1);
    expect(text()).toContain('دسترسی اعطا شد');
  });

  it('still shows the role gate as "not allowed" when the list answers 404', async () => {
    stubFetch([['/api/support/users', () => new Response('Not found', { status: 404 })]]);
    await render();

    expect(text()).toContain('دسترسی به بخش کاربران مجاز نیست');
    expect(container?.querySelector('.err-block.amber')).not.toBeNull();
    expect(container?.querySelector('table.tbl')).toBeNull();
  });

  it('still reports the mutation gate when a role may read but not suspend', async () => {
    const { calls } = stubFetch([
      [statusPath, () => new Response('Not found', { status: 404 })],
      ['/api/support/users/packs', packsReadRoute],
      ['/api/support/users', listRoute],
      ...reauthRoutes(),
    ]);

    await openLearnerAndTypeReason();
    await click('غیرفعال‌سازی موقت حساب');

    expect(mutations(calls, statusPath)).toHaveLength(1);
    expect(ceremonies).toBe(0);
    expect(text()).toContain('نقش شما اجازهٔ تغییر وضعیت حساب را ندارد');
  });
});
