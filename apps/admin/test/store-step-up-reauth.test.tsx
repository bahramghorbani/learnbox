// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StoreListingsWorkspace } from '../app/components/StoreListingsWorkspace';

/**
 * Inline step-up re-authentication on the Store surface — the second half of the 428 defect
 * (LB-B40), closed in Stage 6 after the users half shipped in Stage 5.
 *
 * The defect: listing a pack after the server's five-minute recent-authentication window elapsed
 * answered 428, and this screen could only say "sign in again" — abandoning the typed commercial
 * summary, the cover key and the display order. Writing a commercial blurb is precisely the kind of
 * task that takes longer than five minutes.
 *
 * What is asserted is the operator-visible contract, not the helper's internals:
 *   - a refused save re-authenticates in place and is retried with the SAME idempotency key and the
 *     SAME body, so a listing cannot be written twice;
 *   - one passkey prompt per refusal, and a server that keeps answering 428 is reported rather than
 *     prompted again;
 *   - a cancelled or failed ceremony leaves the dialog open with every typed value intact;
 *   - the authorization gate (404), the optimistic-concurrency guard (409) and the CSRF
 *     precondition still behave as before — the step-up path did not loosen any of them.
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

const listing = {
  packId: 'learnbox-start-a1-essentials',
  packDisplayName: 'بستهٔ پایهٔ شروع',
  packStatus: 'published',
  category: 'essentials',
  isFree: false,
  priceTomans: 180000,
  listing: {
    storeStatus: 'unlisted' as const,
    featured: false,
    displayOrder: 0,
    coverObjectKey: null,
    commercialSummary: null,
    listedAt: null,
  },
};

const listedListing = {
  ...listing,
  listing: { ...listing.listing, storeStatus: 'listed' as const, listedAt: '2026-10-11T10:00:00Z' },
};

let container: HTMLElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

type Call = { url: string; init?: RequestInit };
type Route = (init: RequestInit | undefined, url: string) => Response | Promise<Response>;

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

const listingsPath = '/api/store/listings';
const readRoute: Route = () => Response.json({ listings: [listing] });
const paymentRoutes: Array<[string, Route]> = [
  ['/api/store/payment-config', () => Response.json({ configuration: undefined })],
  ['/api/store/transactions', () => Response.json({ transactions: [] })],
];

function reauthRoutes(
  options: Route = () => Response.json({ challenge: 'c' }),
): Array<[string, Route]> {
  return [
    ['/api/auth/reauth/options', options],
    ['/api/auth/reauth/verify', () => new Response(null, { status: 204 })],
  ];
}

/** The listings URL serves the read and the mutation; only the method tells them apart. */
function listingsRoute(mutate: Route): [string, Route] {
  return [
    listingsPath,
    (init, url) => (init?.method === 'PUT' ? mutate(init, url) : readRoute(init, url)),
  ];
}

async function render() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  await act(async () => {
    root?.render(createElement(StoreListingsWorkspace as FunctionComponent));
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

/** A controlled React field only registers a change written through the native setter. */
async function setField(selector: string, value: string, prototype: { prototype: object }) {
  const field = container?.querySelector(selector) as HTMLInputElement;
  if (!field) throw new Error(`field not found: ${selector}`);
  Object.getOwnPropertyDescriptor(prototype.prototype, 'value')?.set?.call(field, value);
  await act(async () => {
    field.dispatchEvent(
      new Event(field.tagName === 'SELECT' ? 'change' : 'input', {
        bubbles: true,
      }),
    );
  });
}

function mutations(calls: Call[]) {
  return calls.filter((call) => call.url === listingsPath && call.init?.method === 'PUT');
}

function keys(calls: Call[]) {
  return mutations(calls).map((call) => new Headers(call.init?.headers).get('idempotency-key'));
}

function text() {
  return container?.textContent ?? '';
}

/** Opens the commercial editor and fills it in, leaving it unsaved. */
async function openEditorAndFill() {
  await render();
  await click('ویرایش تجاری');
  await setField('#store-status', 'listed', HTMLSelectElement);
  await setField('#store-summary', 'بستهٔ شروع برای سطح A1 — آمادهٔ فروشگاه', HTMLTextAreaElement);
  await setField('#store-cover', 'covers/start-a1.webp', HTMLInputElement);
}

const typedSummary = 'بستهٔ شروع برای سطح A1 — آمادهٔ فروشگاه';

describe('StoreListingsWorkspace step-up re-authentication', () => {
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

  it('re-authenticates in place on 428 and retries the listing with the SAME key and body', async () => {
    let attempts = 0;
    const { calls } = stubFetch([
      listingsRoute(() => {
        attempts += 1;
        return attempts === 1
          ? Response.json({ code: 'reauthentication_required' }, { status: 428 })
          : Response.json({ listing: listedListing });
      }),
      ...paymentRoutes,
      ...reauthRoutes(),
    ]);

    await openEditorAndFill();
    await click('ذخیره');

    const sent = keys(calls);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toBe(sent[1]);
    expect(sent[0]).toBeTruthy();
    expect(ceremonies).toBe(1);
    // The retry carried the identical body, so the server saw one write, not two.
    const bodies = mutations(calls).map((call) => call.init?.body);
    expect(bodies[0]).toBe(bodies[1]);
    expect(JSON.parse(String(bodies[0]))).toMatchObject({
      packId: listing.packId,
      storeStatus: 'listed',
      commercialSummary: typedSummary,
      expectedStoreStatus: 'unlisted',
    });
    // The applied state is reflected without a refetch, and the dialog is gone.
    expect(text()).toContain('در فروشگاه فهرست شد');
    expect(container?.querySelector('.cp-modal')).toBeNull();
    expect(container?.querySelector('[data-store-kpi="listed-packs"]')?.textContent).toBe('۱');
  });

  it('never sends a price or a free/paid flag, even on the retried request', async () => {
    let attempts = 0;
    const { calls } = stubFetch([
      listingsRoute(() => {
        attempts += 1;
        return attempts === 1
          ? Response.json({ code: 'reauthentication_required' }, { status: 428 })
          : Response.json({ listing: listedListing });
      }),
      ...paymentRoutes,
      ...reauthRoutes(),
    ]);

    await openEditorAndFill();
    await click('ذخیره');

    // Base-price immutability and the paid→free prohibition are enforced by never offering the
    // field: no request from this screen can carry either value.
    for (const call of mutations(calls)) {
      const body = JSON.parse(String(call.init?.body)) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual([
        'commercialSummary',
        'coverObjectKey',
        'displayOrder',
        'expectedStoreStatus',
        'featured',
        'packId',
        'storeStatus',
      ]);
    }
  });

  it('keeps every typed value when the operator cancels the passkey prompt', async () => {
    const { calls } = stubFetch([
      listingsRoute(() => Response.json({ code: 'reauthentication_required' }, { status: 428 })),
      ...paymentRoutes,
      ...reauthRoutes(),
    ]);
    authenticate = async () => {
      const error = new Error('dismissed');
      error.name = 'NotAllowedError';
      throw error;
    };

    await openEditorAndFill();
    await click('ذخیره');

    expect(mutations(calls)).toHaveLength(1);
    expect(text()).toContain('تأیید هویت لغو شد');
    expect(text()).toContain('داده‌های واردشده حفظ شده است');
    // The dialog is still open and still holds everything that was typed.
    expect(container?.querySelector('.cp-modal')).not.toBeNull();
    expect((container?.querySelector('#store-summary') as HTMLTextAreaElement).value).toBe(
      typedSummary,
    );
    expect((container?.querySelector('#store-cover') as HTMLInputElement).value).toBe(
      'covers/start-a1.webp',
    );
    expect((container?.querySelector('#store-status') as HTMLSelectElement).value).toBe('listed');
  });

  it('reports a failed ceremony without retrying the mutation', async () => {
    const { calls } = stubFetch([
      listingsRoute(() => Response.json({ code: 'reauthentication_required' }, { status: 428 })),
      ...paymentRoutes,
      ...reauthRoutes(() => new Response('nope', { status: 500 })),
    ]);

    await openEditorAndFill();
    await click('ذخیره');

    expect(mutations(calls)).toHaveLength(1);
    expect(text()).toContain('تأیید هویت دوباره ناموفق بود');
    expect((container?.querySelector('#store-summary') as HTMLTextAreaElement).value).toBe(
      typedSummary,
    );
  });

  it('tells the operator to sign in again when the session itself has expired', async () => {
    const { calls } = stubFetch([
      listingsRoute(() => Response.json({ code: 'reauthentication_required' }, { status: 428 })),
      ...paymentRoutes,
      ...reauthRoutes(() => new Response('unauthorized', { status: 401 })),
    ]);

    await openEditorAndFill();
    await click('ذخیره');

    expect(mutations(calls)).toHaveLength(1);
    expect(text()).toContain('نشست شما منقضی شده است');
    expect(container?.querySelector('.cp-modal')).not.toBeNull();
  });

  it('prompts once and reports, never looping, when the server keeps answering 428', async () => {
    const { calls } = stubFetch([
      listingsRoute(() => Response.json({ code: 'reauthentication_required' }, { status: 428 })),
      ...paymentRoutes,
      ...reauthRoutes(),
    ]);

    await openEditorAndFill();
    await click('ذخیره');

    // Exactly one retry and exactly one ceremony: a stale clock cannot become an endless prompt.
    expect(mutations(calls)).toHaveLength(2);
    expect(ceremonies).toBe(1);
    expect(calls.filter((call) => call.url === '/api/auth/reauth/options')).toHaveLength(1);
    expect(text()).toContain('سرور همچنان احراز هویت تازه می‌خواهد');
    expect((container?.querySelector('#store-summary') as HTMLTextAreaElement).value).toBe(
      typedSummary,
    );
  });

  it('does not re-authenticate when the server is satisfied with the current session', async () => {
    const { calls } = stubFetch([
      listingsRoute(() => Response.json({ listing: listedListing })),
      ...paymentRoutes,
      ...reauthRoutes(),
    ]);

    await openEditorAndFill();
    await click('ذخیره');

    // The five-minute policy stays the server's call: the client prompts only on a 428.
    expect(mutations(calls)).toHaveLength(1);
    expect(ceremonies).toBe(0);
    expect(calls.filter((call) => call.url.startsWith('/api/auth/reauth'))).toHaveLength(0);
  });

  it('still reports the role gate when a role may read but not change the store', async () => {
    const { calls } = stubFetch([
      listingsRoute(() => new Response('Not found', { status: 404 })),
      ...paymentRoutes,
      ...reauthRoutes(),
    ]);

    await openEditorAndFill();
    await click('ذخیره');

    expect(mutations(calls)).toHaveLength(1);
    expect(ceremonies).toBe(0);
    expect(text()).toContain('نقش شما اجازهٔ تغییر وضعیت فروشگاه را ندارد');
    expect(container?.querySelector('.cp-modal')).not.toBeNull();
  });

  it('still reports the concurrency guard when another operator moved the same pack', async () => {
    const { calls } = stubFetch([
      listingsRoute(() => Response.json({ code: 'store_status_conflict' }, { status: 409 })),
      ...paymentRoutes,
      ...reauthRoutes(),
    ]);

    await openEditorAndFill();
    await click('ذخیره');

    expect(mutations(calls)).toHaveLength(1);
    expect(ceremonies).toBe(0);
    expect(text()).toContain('توسط کاربر دیگری تغییر کرده است');
  });

  it('refuses to send the mutation at all without a CSRF token', async () => {
    Object.defineProperty(document, 'cookie', { configurable: true, get: () => '' });
    const { calls } = stubFetch([
      listingsRoute(() => Response.json({ listing: listedListing })),
      ...paymentRoutes,
      ...reauthRoutes(),
    ]);

    await openEditorAndFill();
    await click('ذخیره');

    expect(mutations(calls)).toHaveLength(0);
    expect(ceremonies).toBe(0);
    expect(text()).toContain('نشان امنیتی CSRF در دسترس نیست');
  });

  it('sends the CSRF header on the first attempt and on the retry', async () => {
    let attempts = 0;
    const { calls } = stubFetch([
      listingsRoute(() => {
        attempts += 1;
        return attempts === 1
          ? Response.json({ code: 'reauthentication_required' }, { status: 428 })
          : Response.json({ listing: listedListing });
      }),
      ...paymentRoutes,
      ...reauthRoutes(),
    ]);

    await openEditorAndFill();
    await click('ذخیره');

    const sentHeaders = mutations(calls).map((call) => new Headers(call.init?.headers));
    expect(sentHeaders).toHaveLength(2);
    for (const headers of sentHeaders) {
      expect(headers.get('x-learnbox-csrf-token')).toBe('csrf-token-value');
    }
  });

  it('rejects a negative display order before any request leaves the browser', async () => {
    const { calls } = stubFetch([
      listingsRoute(() => Response.json({ listing: listedListing })),
      ...paymentRoutes,
      ...reauthRoutes(),
    ]);

    await render();
    await click('ویرایش تجاری');
    await setField('#store-order', '-3', HTMLInputElement);
    await click('ذخیره');

    expect(mutations(calls)).toHaveLength(0);
    expect(text()).toContain('ترتیب نمایش باید یک عدد صحیح و نامنفی باشد');
  });
});
