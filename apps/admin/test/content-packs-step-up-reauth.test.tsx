// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentPacksWorkspace } from '../app/components/ContentPacksWorkspace';

/**
 * Inline step-up re-authentication inside the content workspace (the 428 fix).
 *
 * The defect this guards: a content form that takes longer than the server's five-minute
 * recent-authentication window was refused with 428 and the operator was told to sign in again,
 * which threw away everything typed. What is asserted here is the operator-visible contract —
 * the refused save re-authenticates in place and is retried with the SAME idempotency key, and a
 * cancelled or failed step-up leaves the modal open with the typed values still in it.
 */

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let authenticate: () => Promise<{ id: string }>;

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: async () => authenticate(),
}));

const pack = {
  id: 'learnbox_start_a1_essentials',
  displayName: 'بستهٔ پایه',
  description: null,
  targetCefr: 'A1',
  category: null,
  targetItemCount: 35,
  isFree: true,
  status: 'published',
  cardCount: 35,
};

let container: HTMLElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

type Route = (init: RequestInit | undefined) => Response | Promise<Response>;

function stubFetch(routes: Record<string, Route>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes[url];
    if (!route) return Response.json({}, { status: 404 });
    return route(init);
  });
  vi.stubGlobal('fetch', mock);
  return { calls };
}

const packsRoute: Route = () =>
  Response.json({ packs: [pack], manageEnabled: true, aiEnabled: false, mediaEnabled: false });

async function render() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  await act(async () => {
    root?.render(createElement(ContentPacksWorkspace as FunctionComponent));
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

/** A controlled React input only registers a change written through the native setter. */
async function type(field: string, value: string) {
  const input = container?.querySelector(`#cp-field-${field}`) as HTMLInputElement;
  if (!input) throw new Error(`field not found: ${field}`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  await act(async () => {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function fieldValue(field: string) {
  return (container?.querySelector(`#cp-field-${field}`) as HTMLInputElement | null)?.value;
}

function mutationKeys(calls: Array<{ url: string; init?: RequestInit }>) {
  return calls
    .filter((call) => call.url === '/api/content/packs' && call.init?.method === 'POST')
    .map((call) => new Headers(call.init?.headers).get('idempotency-key'));
}

async function openCreateFormAndType() {
  await render();
  await click('افزودن بستهٔ جدید');
  await type('packId', 'zz-step-up-probe');
  await type('displayName', 'بستهٔ آزمون گام دوم');
}

describe('ContentPacksWorkspace step-up re-authentication', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '__Host-learnbox_admin_csrf=csrf-token-value',
    });
    authenticate = async () => ({ id: 'credential' });
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    vi.unstubAllGlobals();
    delete (document as unknown as { cookie?: string }).cookie;
  });

  it('re-authenticates in place on 428 and retries the save with the SAME key', async () => {
    let attempts = 0;
    const { calls } = stubFetch({
      '/api/content/packs': (init) => {
        if (init?.method !== 'POST') return packsRoute(init);
        attempts += 1;
        return attempts === 1
          ? Response.json({ code: 'reauthentication_required' }, { status: 428 })
          : Response.json({ status: 'applied' });
      },
      '/api/auth/reauth/options': () => Response.json({ challenge: 'challenge' }),
      '/api/auth/reauth/verify': () => new Response(null, { status: 204 }),
    });

    await openCreateFormAndType();
    await click('ذخیره');

    expect(attempts).toBe(2);
    const keys = mutationKeys(calls);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(1);
    // One prompt, one verify, and the modal closed because the save succeeded.
    expect(calls.filter((call) => call.url === '/api/auth/reauth/verify')).toHaveLength(1);
    expect(container?.querySelector('#cp-field-packId')).toBeNull();
    // Nothing navigated or reloaded: the workspace is still mounted and listing packs.
    expect(container?.textContent).toContain('بستهٔ پایه');
  });

  it('keeps the typed values when the operator cancels the passkey prompt', async () => {
    let attempts = 0;
    const { calls } = stubFetch({
      '/api/content/packs': (init) => {
        if (init?.method !== 'POST') return packsRoute(init);
        attempts += 1;
        return Response.json({ code: 'reauthentication_required' }, { status: 428 });
      },
      '/api/auth/reauth/options': () => Response.json({ challenge: 'challenge' }),
      '/api/auth/reauth/verify': () => new Response(null, { status: 204 }),
    });
    authenticate = async () => {
      const error = new Error('cancelled by the operator');
      error.name = 'NotAllowedError';
      throw error;
    };

    await openCreateFormAndType();
    await click('ذخیره');

    // The step-up really was offered in place, and the operator declined it.
    expect(calls.filter((call) => call.url === '/api/auth/reauth/options')).toHaveLength(1);
    expect(calls.filter((call) => call.url === '/api/auth/reauth/verify')).toHaveLength(0);
    // No second write was attempted, and the operator's work is still on screen and editable.
    expect(attempts).toBe(1);
    expect(fieldValue('packId')).toBe('zz-step-up-probe');
    expect(fieldValue('displayName')).toBe('بستهٔ آزمون گام دوم');
    expect(container?.textContent).toContain('لغو شد');
    expect(container?.textContent).toContain('حفظ شده است');
    expect(button('ذخیره').disabled).toBe(false);
  });

  it('retries successfully after a cancelled attempt, without duplicating the write', async () => {
    let cancel = true;
    authenticate = async () => {
      if (cancel) {
        const error = new Error('cancelled by the operator');
        error.name = 'NotAllowedError';
        throw error;
      }
      return { id: 'credential' };
    };
    let applied = 0;
    const { calls } = stubFetch({
      '/api/content/packs': (init) => {
        if (init?.method !== 'POST') return packsRoute(init);
        // The server keeps refusing until the step-up is confirmed, then applies the write once.
        if (cancel) return Response.json({ code: 'reauthentication_required' }, { status: 428 });
        applied += 1;
        return applied === 1
          ? Response.json({ code: 'reauthentication_required' }, { status: 428 })
          : Response.json({ status: 'applied' });
      },
      '/api/auth/reauth/options': () => Response.json({ challenge: 'challenge' }),
      '/api/auth/reauth/verify': () => new Response(null, { status: 204 }),
    });

    await openCreateFormAndType();
    await click('ذخیره');
    // Cancelled: nothing saved, nothing lost.
    expect(fieldValue('packId')).toBe('zz-step-up-probe');
    expect(calls.filter((call) => call.url === '/api/auth/reauth/verify')).toHaveLength(0);

    cancel = false;
    await click('ذخیره');

    // The modal closed, so the second attempt succeeded.
    expect(container?.querySelector('#cp-field-packId')).toBeNull();
    const keys = mutationKeys(calls);
    expect(keys).toHaveLength(3);
    // The cancelled attempt carried its own key; the confirmed attempt replayed one key twice, so
    // the server saw a single write identity for the save that actually applied.
    expect(keys[1]).toBe(keys[2]);
    expect(keys[0]).not.toBe(keys[1]);
    expect(calls.filter((call) => call.url === '/api/auth/reauth/verify')).toHaveLength(1);
  });

  it('names an expired session instead of blaming the passkey', async () => {
    stubFetch({
      '/api/content/packs': (init) =>
        init?.method === 'POST'
          ? Response.json({ code: 'reauthentication_required' }, { status: 428 })
          : packsRoute(init),
      '/api/auth/reauth/options': () => Response.json({ code: 'unauthorized' }, { status: 401 }),
    });

    await openCreateFormAndType();
    await click('ذخیره');

    expect(container?.textContent).toContain('منقضی');
    expect(fieldValue('packId')).toBe('zz-step-up-probe');
  });
});
