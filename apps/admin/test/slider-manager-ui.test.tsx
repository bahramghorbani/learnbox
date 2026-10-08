// @vitest-environment jsdom

import { randomUUID } from 'node:crypto';

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SliderManagerPanel } from '../app/components/SliderManagerPanel';

/**
 * Phase 4 / Milestone 4.2 — the Slider Manager panel.
 *
 * What is asserted here is the operator's side of the contract: the panel sends the guarded request
 * the server expects (CSRF header, canonical idempotency key, multipart body), it tells the
 * operator what the server refused and why, and a re-authentication demand replays the SAME
 * idempotency key so a retry cannot apply the change twice.
 *
 * It is NOT asserted that the panel enforces any rule. The maximum of three active slides, the
 * destination allowlist and the image requirement are the server's, and the real-Postgres suite
 * proves them there.
 */

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const slide = (overrides: Record<string, unknown> = {}) => ({
  id: 'banner_1a2b3c4d',
  title: 'اسلاید یک',
  description: 'توضیح یک',
  destination: { kind: 'screen', screen: 'today' },
  isActive: true,
  sortOrder: 0,
  hasImage: true,
  legacyImageUrl: null,
  createdAt: '2026-10-08T14:00:00.000Z',
  ...overrides,
});

const secondSlide = slide({
  id: 'banner_99887766',
  title: 'اسلاید دو',
  description: null,
  isActive: false,
  sortOrder: 1,
});

/**
 * Keys are handed out in sequence, never as one constant, so a test can tell "the same key was
 * replayed" apart from "a fresh key happened to look identical".
 */
let issuedKeys = 0;
// The base is generated rather than written down: a quoted uuid assigned to a `…Key` name is what
// a secret scanner is built to flag, and nothing here depends on the value.
const keyBase = randomUUID().slice(0, 35);
const nextKey = () => `${keyBase}${(issuedKeys += 1).toString(16)}`;
const firstKey = `${keyBase}1`;

let container: HTMLElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

function listResponse(slides: unknown[] = [slide(), secondSlide]) {
  return Response.json({ slides, maximumActiveSlides: 3 });
}

async function render() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(createElement(SliderManagerPanel)));
}

function button(label: string) {
  const match = [...(container?.querySelectorAll('button') ?? [])].find(
    (candidate) =>
      candidate.textContent?.trim() === label ||
      candidate.getAttribute('aria-label')?.includes(label),
  );
  if (!match) throw new Error(`button not found: ${label}`);
  return match as HTMLButtonElement;
}

async function click(label: string) {
  await act(async () => {
    button(label).click();
  });
}

/**
 * A controlled React input only sees a change when the value is written through the native setter,
 * so typing is simulated the way the DOM does it rather than by assigning `.value`.
 */
async function type(selector: string, value: string) {
  const field = container?.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
  const prototype =
    field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value);
  await act(async () => {
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function chooseFile(file: File) {
  const input = container?.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => '__Host-learnbox_admin_csrf=csrf-token',
  });
  issuedKeys = 0;
  vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: nextKey });
  URL.createObjectURL = () => 'blob:preview';
  URL.revokeObjectURL = () => undefined;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
});

describe('Slider Manager panel (M4.2)', () => {
  it('lists the slides with their state, destination and how many slots are used', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => listResponse()),
    );
    await render();

    expect(container?.textContent).toContain('اسلاید یک');
    expect(container?.textContent).toContain('اسلاید دو');
    expect(container?.textContent).toContain('صفحهٔ امروز');
    expect(container?.querySelector('.slide-active-count')?.textContent).toBe('1/3');
    expect(container?.querySelectorAll('.slide-badge-on')).toHaveLength(1);
    expect(container?.querySelectorAll('.slide-badge-off')).toHaveLength(1);
    // The preview reads the one authenticated byte path, by slide id.
    expect(container?.querySelector('.slide-thumb img')?.getAttribute('src')).toContain(
      '/api/presentation/slides/image?slideId=banner_1a2b3c4d',
    );
  });

  it('says so plainly when presentation management is not enabled in this environment', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await render();

    expect(container?.textContent).toContain('در این محیط فعال نیست');
    expect(container?.querySelector('input[type="file"]')).toBeNull();
    expect(container?.querySelector('.splash-primary-action')).toBeNull();
  });

  it('creates a slide as one guarded multipart request carrying the image and the key', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        if (init?.method === 'POST') return Response.json({ status: 'applied', slide: slide() });
        return listResponse();
      }),
    );
    await render();

    await type('#slide-title-input', 'اسلاید تازه');
    await type('#slide-description-input', 'توضیح تازه');
    await chooseFile(new File([new Uint8Array(16)], 'slide.png', { type: 'image/png' }));
    expect(container?.querySelector('.splash-local-preview img')).not.toBeNull();
    await click('ساخت اسلاید');

    const post = calls.find((call) => call.init?.method === 'POST');
    expect(post?.url).toBe('/api/presentation/slides');
    const headers = post?.init?.headers as Record<string, string>;
    expect(headers['idempotency-key']).toBe(firstKey);
    expect(headers['x-learnbox-csrf-token']).toBe('csrf-token');
    expect(post?.init?.credentials).toBe('same-origin');

    const body = post?.init?.body as FormData;
    expect(body.get('image')).toBeInstanceOf(File);
    expect(JSON.parse(String(body.get('payload')))).toEqual({
      title: 'اسلاید تازه',
      description: 'توضیح تازه',
      destination: { kind: 'screen', screen: 'today' },
      isActive: false,
    });
    expect(container?.textContent).toContain('تغییر ذخیره شد');
    // The list is re-read from the server rather than patched locally.
    expect(calls.filter((call) => call.init?.method !== 'POST')).toHaveLength(2);
  });

  it('refuses an unacceptable file locally without sending anything', async () => {
    const fetchMock = vi.fn(async () => listResponse());
    vi.stubGlobal('fetch', fetchMock);
    await render();

    await chooseFile(new File([new Uint8Array(16)], 'slide.gif', { type: 'image/gif' }));
    expect(container?.textContent).toContain('فرمت فایل قابل قبول نیست');
    await chooseFile(
      new File([new Uint8Array(6 * 1024 * 1024 + 1)], 'slide.png', { type: 'image/png' }),
    );
    expect(container?.textContent).toContain('۶ مگابایت');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the create button unavailable until the slide has a title and a destination', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => listResponse([])),
    );
    await render();

    expect(button('ساخت اسلاید').disabled).toBe(true);
    await type('#slide-title-input', 'عنوان');
    expect(button('ساخت اسلاید').disabled).toBe(false);

    const kind = container?.querySelector('#slide-destination-kind') as HTMLSelectElement;
    await act(async () => {
      kind.value = 'url';
      kind.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(button('ساخت اسلاید').disabled).toBe(true);
    await type('#slide-url', 'https://learnboxapp.com/blog');
    expect(button('ساخت اسلاید').disabled).toBe(false);
  });

  it('tells the operator exactly what the server refused', async () => {
    const refusals = [
      {
        status: 409,
        body: { code: 'active_limit_reached', activeCount: 3, maximumActiveSlides: 3 },
        expected: 'بیشتر از 3 اسلاید',
      },
      { status: 400, body: { code: 'image_required' }, expected: 'تصویر لازم است' },
      { status: 400, body: { code: 'unknown_pack' }, expected: 'بستهٔ انتخاب‌شده وجود ندارد' },
      {
        status: 400,
        body: { code: 'image_rejected', reason: 'aspect_ratio_invalid' },
        expected: 'نسبت ابعاد تصویر',
      },
    ];

    for (const refusal of refusals) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init?: RequestInit) =>
          init?.method === 'POST'
            ? Response.json(refusal.body, { status: refusal.status })
            : listResponse(),
        ),
      );
      await render();
      await click('فعال‌کردن');
      expect(container?.querySelector('.splash-error')?.textContent, refusal.expected).toContain(
        refusal.expected,
      );
      if (root) await act(async () => root?.unmount());
      container?.remove();
      root = undefined;
    }
  });

  it('replays the SAME idempotency key after a demanded re-authentication', async () => {
    const keys: (string | undefined)[] = [];
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const target = String(url);
        if (target === '/api/presentation/slides' && init?.method === 'POST') {
          attempts += 1;
          keys.push((init.headers as Record<string, string>)['idempotency-key']);
          return attempts === 1
            ? Response.json({ code: 'reauthentication_required' }, { status: 428 })
            : Response.json({ status: 'applied', slide: slide() });
        }
        if (target === '/api/auth/reauth/options') return Response.json({ challenge: 'x' });
        if (target === '/api/auth/reauth/verify') return new Response(null, { status: 204 });
        return listResponse();
      }),
    );
    vi.mock('@simplewebauthn/browser', () => ({
      startAuthentication: async () => ({ id: 'credential' }),
    }));

    await render();
    await click('غیرفعال‌کردن');
    expect(container?.textContent).toContain('تأیید هویت دوباره لازم است');

    await click('تأیید هویت');
    expect(attempts).toBe(2);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe(firstKey);
    expect(container?.textContent).toContain('تغییر ذخیره شد');
  });

  it('reorders by sending the complete new order, and cannot move an end slide past the end', async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith('/reorder')) {
          bodies.push(String(init?.body));
          return Response.json({ status: 'applied', slides: [secondSlide, slide()] });
        }
        return listResponse();
      }),
    );
    await render();

    const up = [...(container?.querySelectorAll('button') ?? [])].filter((candidate) =>
      candidate.getAttribute('aria-label')?.startsWith('انتقال اسلاید'),
    );
    expect((up[0] as HTMLButtonElement).disabled).toBe(true);
    expect((up.at(-1) as HTMLButtonElement).disabled).toBe(true);

    await click('انتقال اسلاید اسلاید یک به پایین');
    expect(JSON.parse(bodies[0])).toEqual({ order: ['banner_99887766', 'banner_1a2b3c4d'] });
  });

  it('loads an existing slide into the form for editing without demanding a new image', async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          calls.push(init);
          return Response.json({ status: 'applied', slide: slide() });
        }
        return listResponse();
      }),
    );
    await render();

    await click('ویرایش');
    expect((container?.querySelector('#slide-title-input') as HTMLInputElement).value).toBe(
      'اسلاید یک',
    );
    expect((container?.querySelector('#slide-active') as HTMLInputElement).checked).toBe(true);
    await click('ذخیرهٔ اسلاید');

    const body = calls[0]?.body as FormData;
    expect(body.get('image')).toBeNull();
    expect(JSON.parse(String(body.get('payload')))).toMatchObject({
      slideId: 'banner_1a2b3c4d',
      title: 'اسلاید یک',
      isActive: true,
    });
  });
});
