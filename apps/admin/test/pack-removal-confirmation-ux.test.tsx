// @vitest-environment jsdom

/**
 * Focused UI test for pack-card removal confirmation UX.
 *
 * Production evidence shows no DELETE /api/content/packs/.../cards/... was ever logged, while
 * route code, role gate, CSRF, and 428 step-up guard all exist and local route tests prove the
 * confirmed request succeeds.  The live obstacle is almost certainly the disabled confirm button:
 * it stays disabled until BOTH a non-blank reason is typed AND the checkbox is checked.
 *
 * This suite pins:
 *  1. The button is disabled (and the prereq hint is visible) when either prerequisite is unmet.
 *  2. Once both are met, clicking confirm fires DELETE with CSRF + idempotency-key headers.
 *  3. On a 428 response the modal stays open, reason and checkbox are preserved, and the hint is
 *     gone (prerequisites were met); the operator can retry without re-entering anything.
 *  4. After a successful 428 step-up retry the DELETE is replayed with the SAME idempotency key.
 */

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentPacksWorkspace } from '../app/components/ContentPacksWorkspace';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// ─── test doubles ────────────────────────────────────────────────────────────

let authenticate: () => Promise<{ id: string }>;

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: async () => authenticate(),
}));

const draftCard = {
  cardId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  contentId: 'der_hund',
  cardVersionId: 'vvvvvvvv-vvvv-4vvv-8vvv-vvvvvvvvvvvv',
  lemma: 'Hund',
  article: 'der',
  partOfSpeech: 'noun',
  persianMeanings: ['سگ'],
  essentialInflection: null,
  pronunciationIpa: null,
  examples: [],
  simpleGermanDefinition: '',
  grammarNote: '',
  topicTags: [],
  difficulty: 1,
  cefr: 'A1',
  visualConcept: '',
  imagePrompt: '',
  sourceReference: '',
  versionStatus: 'draft',
  sortOrder: 1,
  media: { imageCount: 0, wordAudioCount: 0, sentenceAudioCount: 0, unrecorded: true },
};

const pack = {
  id: 'learnbox_test_pack',
  displayName: 'بستهٔ آزمون',
  description: null,
  locale: 'fa',
  targetCefr: 'A1',
  targetItemCount: 5,
  category: null,
  isFree: true,
  priceTomans: null,
  status: 'draft',
  cardCount: 1,
  publishedCardCount: 0,
  reviewableCardCount: 0,
  createdAt: null,
  publishedAt: null,
};

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

// ─── DOM helpers ─────────────────────────────────────────────────────────────

let container: HTMLElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

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

function btn(label: string): HTMLButtonElement {
  const found = [...(container?.querySelectorAll('button') ?? [])].find((b) =>
    b.textContent?.trim().includes(label),
  );
  if (!found) throw new Error(`button not found: ${label}`);
  return found as HTMLButtonElement;
}

async function click(label: string) {
  await act(async () => {
    btn(label).click();
  });
}

/** React controlled textarea — same native-setter + input-event pattern the step-up test uses. */
async function typeTextarea(id: string, value: string) {
  const el = container?.querySelector(`#${id}`) as HTMLTextAreaElement | null;
  if (!el) throw new Error(`textarea not found: #${id}`);
  // jsdom shares the value descriptor with HTMLInputElement; fall back through the chain.
  const setter =
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set ??
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, value);
  await act(async () => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** React controlled checkbox — a native click toggles checked and fires the change event. */
async function checkCheckbox(id: string) {
  const el = container?.querySelector(`#${id}`) as HTMLInputElement | null;
  if (!el) throw new Error(`checkbox not found: #${id}`);
  await act(async () => {
    el.click();
  });
}

function hintText() {
  return (
    (container?.querySelector('#cp-remove-prereq-hint') as HTMLElement | null)?.textContent ?? ''
  );
}

function confirmBtn() {
  return container?.querySelector('#cp-remove-confirm-btn') as HTMLButtonElement | null;
}

async function openRemoveModal(routes: Record<string, Route>) {
  const { calls } = stubFetch(routes);
  await render();
  // Open the pack to reveal its cards.
  await click('مشاهدهٔ کارت‌ها');
  // Click the draft card's "خروج از بسته" action.
  await click('خروج از بسته');
  return { calls };
}

function deleteCall(calls: Array<{ url: string; init?: RequestInit }>) {
  return calls.filter(
    (c) =>
      c.url === `/api/content/packs/${pack.id}/cards/${draftCard.cardId}` &&
      c.init?.method === 'DELETE',
  );
}

// ─── fixtures ────────────────────────────────────────────────────────────────

const packsRoute: Route = () =>
  Response.json({ packs: [pack], manageEnabled: true, aiEnabled: false, mediaEnabled: false });

const cardsRoute: Route = () => Response.json({ cards: [draftCard] });

// ─── suite ───────────────────────────────────────────────────────────────────

describe('pack-card removal confirmation UX', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '__Host-learnbox_admin_csrf=csrf-token-value',
    });
    authenticate = async () => ({ id: 'passkey-cred' });
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    vi.unstubAllGlobals();
    delete (document as unknown as { cookie?: string }).cookie;
  });

  it('confirm button is disabled and prereq hint is visible until both reason and checkbox are set', async () => {
    await openRemoveModal({
      '/api/content/packs': packsRoute,
      [`/api/content/packs/${pack.id}`]: cardsRoute,
    });

    // Initially: neither reason nor checkbox — both prereqs missing.
    expect(confirmBtn()?.disabled).toBe(true);
    expect(hintText()).toContain('دلیل خروج');
    expect(hintText()).toContain('تأییدیه');

    // Reason filled, checkbox still unticked.
    await typeTextarea('cp-remove-reason', 'دلیل آزمون');
    expect(confirmBtn()?.disabled).toBe(true);
    expect(hintText()).toContain('تأییدیه');
    expect(hintText()).not.toContain('دلیل خروج را وارد کنید');

    // Both met — button enabled, hint cleared.
    await checkCheckbox('cp-remove-confirm-checkbox');
    expect(confirmBtn()?.disabled).toBe(false);
    expect(hintText().trim()).toBe('');
  });

  it('sends DELETE with CSRF and idempotency-key headers once both prerequisites are met', async () => {
    const { calls } = await openRemoveModal({
      '/api/content/packs': packsRoute,
      [`/api/content/packs/${pack.id}`]: cardsRoute,
      [`/api/content/packs/${pack.id}/cards/${draftCard.cardId}`]: () =>
        new Response(null, { status: 204 }),
    });

    await typeTextarea('cp-remove-reason', 'کارت اشتباه بود');
    await checkCheckbox('cp-remove-confirm-checkbox');
    await click('تأیید خروج از بسته');

    const deletes = deleteCall(calls);
    expect(deletes).toHaveLength(1);

    const headers = new Headers(deletes[0].init?.headers);
    expect(headers.get('x-learnbox-csrf-token')).toBe('csrf-token-value');
    expect(headers.get('idempotency-key')).toBeTruthy();

    const body = JSON.parse(deletes[0].init?.body as string) as unknown;
    expect(body).toMatchObject({ confirm: true, reason: 'کارت اشتباه بود' });
  });

  it('preserves reason and checkbox on 428 so the operator need not re-enter anything', async () => {
    const { calls } = await openRemoveModal({
      '/api/content/packs': packsRoute,
      [`/api/content/packs/${pack.id}`]: cardsRoute,
      [`/api/content/packs/${pack.id}/cards/${draftCard.cardId}`]: () =>
        Response.json({ code: 'reauthentication_required' }, { status: 428 }),
      '/api/auth/reauth/options': () => Response.json({ challenge: 'ch' }),
      '/api/auth/reauth/verify': () => new Response(null, { status: 204 }),
    });

    await typeTextarea('cp-remove-reason', 'کارت تکراری');
    await checkCheckbox('cp-remove-confirm-checkbox');
    await click('تأیید خروج از بسته');

    // Modal must still be open with the same values — no data loss on 428.
    const reasonEl = container?.querySelector('#cp-remove-reason') as HTMLTextAreaElement | null;
    expect(reasonEl?.value).toBe('کارت تکراری');
    const checkboxEl = container?.querySelector(
      '#cp-remove-confirm-checkbox',
    ) as HTMLInputElement | null;
    expect(checkboxEl?.checked).toBe(true);

    // Button stays enabled (prereqs were met before the 428).
    expect(confirmBtn()?.disabled).toBe(false);
    // Hint is empty because both prereqs are still satisfied.
    expect(hintText().trim()).toBe('');

    // fetchWithStepUp auto-retries after the passkey step-up, so two DELETE attempts fire
    // (original 428 → reauth → retry 428 → gives up); the modal stays open after both fail.
    const deletes = deleteCall(calls);
    expect(deletes.length).toBeGreaterThanOrEqual(1);
  });

  it('retries DELETE with the SAME idempotency-key after a successful 428 step-up', async () => {
    let attempts = 0;
    const { calls } = await openRemoveModal({
      '/api/content/packs': packsRoute,
      [`/api/content/packs/${pack.id}`]: cardsRoute,
      [`/api/content/packs/${pack.id}/cards/${draftCard.cardId}`]: () => {
        attempts += 1;
        return attempts === 1
          ? Response.json({ code: 'reauthentication_required' }, { status: 428 })
          : new Response(null, { status: 204 });
      },
      '/api/auth/reauth/options': () => Response.json({ challenge: 'ch' }),
      '/api/auth/reauth/verify': () => new Response(null, { status: 204 }),
    });

    await typeTextarea('cp-remove-reason', 'نسخهٔ اشتباه');
    await checkCheckbox('cp-remove-confirm-checkbox');
    await click('تأیید خروج از بسته');

    // Two DELETE requests fired: the original 428 attempt plus the retry.
    const deletes = deleteCall(calls);
    expect(deletes).toHaveLength(2);

    // Same idempotency key on both — the server deduplicates the write.
    const key1 = new Headers(deletes[0].init?.headers).get('idempotency-key');
    const key2 = new Headers(deletes[1].init?.headers).get('idempotency-key');
    expect(key1).toBeTruthy();
    expect(key1).toBe(key2);

    // Modal closed after success.
    expect(container?.querySelector('#cp-remove-confirm-btn')).toBeNull();
  });
});
