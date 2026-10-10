// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServerBackedContentReview } from '../app/components/ContentReviewWorkspace.js';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** Swapped per test to play the operator's answer to the passkey prompt. */
let stepUpAssertion: () => Promise<{ id: string }> = async () => ({ id: 'credential' });

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: async () => stepUpAssertion(),
}));

type Rendered = {
  container: HTMLElement;
  text: string;
  approve(): Promise<void>;
  unmount(): Promise<void>;
};

async function renderWorkspace(): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  // The local preview components rely on the classic React global under test (repo pattern).
  vi.stubGlobal('React', { createElement, Fragment });
  const { ContentReviewWorkspace: Workspace } =
    await import('../app/components/ContentReviewWorkspace.js');
  await act(async () => {
    root.render(createElement(Workspace as FunctionComponent));
    await Promise.resolve();
  });
  return {
    container,
    text: container.textContent ?? '',
    approve: async () => {
      const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
        candidate.textContent?.includes('تأیید در پیش‌نمایش'),
      );
      await act(async () => button?.click());
    },
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe('ContentReviewWorkspace (unauthenticated shell, LB-B30)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response),
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
  });

  it('renders a content-free shell without a signed-in server session', async () => {
    const rendered = await renderWorkspace();
    try {
      expect(rendered.text).toContain('بازبینی محتوا');
      expect(rendered.text).toContain('برای مشاهدهٔ محتوای بازبینی باید با ورود امن وارد شوید');
      expect(rendered.container.querySelector('[data-review-unavailable="true"]')).not.toBeNull();
      // No learner card content, queue rows, gate, media or release panel may render.
      expect(rendered.container.querySelectorAll('[data-review-item]')).toHaveLength(0);
      expect(rendered.container.querySelectorAll('.review-gate-list')).toHaveLength(0);
      // The invariant under test is that protected LEARNER content never reaches an
      // unauthenticated viewer. Assert it against the content region only: the surrounding
      // Admin chrome (sidebar navigation, topbar) is static, approved, non-learner UI copy
      // that ships in the bundle regardless of session state. Matching leak terms against
      // the whole container conflated the two, so a legitimate navigation label could fail
      // this test — or, worse, be renamed to satisfy it — without the security boundary
      // having moved at all. `خانه` therefore stays in the protected list below: inside the
      // content region it is still the Persian meaning of `das Haus` and a real leak signal.
      const contentRegion = rendered.container.querySelector('.admin-workspace');
      expect(contentRegion).not.toBeNull();
      const contentText = contentRegion?.textContent ?? '';
      for (const leaked of [
        'das Haus',
        'die Häuser',
        'خانه',
        'start-a1-',
        'Das Haus ist klein.',
        'Goethe A1',
      ]) {
        expect(contentText).not.toContain(leaked);
      }
    } finally {
      await rendered.unmount();
    }
  });

  it('offers no local approve/return controls that could be mistaken for persisted review', async () => {
    const rendered = await renderWorkspace();
    try {
      expect(rendered.text).not.toContain('تأیید در پیش‌نمایش');
      expect(rendered.text).not.toContain('بازگرداندن برای اصلاح');
    } finally {
      await rendered.unmount();
    }
  });

  it('separates approved navigation chrome from the protected content region', async () => {
    // Regression guard for the boundary itself. «خانه / نمای کلی» is approved, frozen navigation
    // copy and MUST render even with no session; the identical substring inside the content region
    // would mean leaked learner vocabulary. Asserting both halves keeps the next person from
    // "fixing" a future failure by renaming the nav item instead of closing a real leak.
    const rendered = await renderWorkspace();
    try {
      const sidebar = rendered.container.querySelector('.admin-sidebar');
      expect(sidebar?.textContent).toContain('خانه / نمای کلی');

      const contentRegion = rendered.container.querySelector('.admin-workspace');
      expect(contentRegion).not.toBeNull();
      expect(contentRegion?.querySelector('.admin-sidebar')).toBeNull();
      expect(contentRegion?.textContent ?? '').not.toContain('خانه');
    } finally {
      await rendered.unmount();
    }
  });
});

type ReviewDimension =
  'german_linguistic' | 'persian_translation' | 'provenance' | 'visual' | 'audio' | 'app_flow';

type ServerQueueItem = {
  cardVersionId: string;
  contentId: string;
  lemma: string;
  status: 'auto_validated' | 'needs_review';
  article: string | null;
  partOfSpeech: string;
  persianMeanings: string[];
  essentialInflection: string | null;
  pronunciationIpa: string | null;
  examples: Array<{ german: string; persian: string }>;
  mediaCount: number;
  sourceProvider: string;
  sourceReference: string | null;
  checks: Array<{
    dimension: ReviewDimension;
    outcome: string;
    notes: string | null;
    reviewedAt: string | null;
  }>;
};

const allDimensions: ReviewDimension[] = [
  'german_linguistic',
  'persian_translation',
  'provenance',
  'visual',
  'audio',
  'app_flow',
];

function makeItem(
  id: string,
  contentId: string,
  lemma: string,
  passed: ReviewDimension[] = [],
  failed: ReviewDimension[] = [],
): ServerQueueItem {
  return {
    cardVersionId: id,
    contentId,
    lemma,
    status: 'needs_review',
    article: 'das',
    partOfSpeech: 'noun',
    persianMeanings: ['خانه'],
    essentialInflection: null,
    pronunciationIpa: null,
    examples: [],
    mediaCount: 0,
    sourceProvider: 'ai_suggestion',
    sourceReference: null,
    checks: allDimensions.map((dimension) => ({
      dimension,
      outcome: passed.includes(dimension)
        ? 'passed'
        : failed.includes(dimension)
          ? 'failed'
          : 'pending',
      notes: null,
      reviewedAt: null,
    })),
  };
}

const itemHaus = makeItem('b89dabb1-406a-5b88-b535-4e90ba6af24c', 'start-a1-haus', 'Haus');
const itemTisch = makeItem('a477921f-a102-5b84-9f56-d243f432e36e', 'start-a1-tisch', 'Tisch');
const itemApproved = makeItem(
  'c0ffee00-0000-4000-8000-000000000001',
  'start-a1-apfel',
  'Apfel',
  allDimensions,
);

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubReviewFetch(
  routes: Record<
    string,
    (
      init: RequestInit | undefined,
      calls: Array<{ url: string; init?: RequestInit }>,
    ) => Response | Promise<Response>
  >,
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const handler = routes[url];
    if (!handler) return jsonResponse({}, 404);
    return handler(init, calls);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

type ServerRendered = {
  container: HTMLElement;
  text: string;
  unmount(): Promise<void>;
  clickButton(text: string, scope?: HTMLElement): Promise<void>;
};

async function renderServer(): Promise<ServerRendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  await act(async () => {
    root.render(createElement(ServerBackedContentReview as FunctionComponent));
    await Promise.resolve();
  });
  return {
    container,
    get text() {
      return container.textContent ?? '';
    },
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
    clickButton: async (text: string, scope?: HTMLElement) => {
      const area = scope ?? container;
      const button = Array.from(area.querySelectorAll('button')).find((candidate) =>
        candidate.textContent?.includes(text),
      );
      if (!button) throw new Error(`button not found: ${text}`);
      await act(async () => button.click());
    },
  };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('ServerBackedContentReview (authenticated server mode)', () => {
  beforeEach(() => {
    // jsdom rejects __Host- cookies; the read path is stubbed like the splash UI tests do.
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '__Host-learnbox_admin_csrf=csrf-token-value',
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    delete (document as unknown as { cookie?: string }).cookie;
  });

  it('shows a Persian loading state while the queue request is pending', async () => {
    let release!: (response: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => gate),
    );
    const rendered = await renderServer();
    try {
      expect(rendered.text).toContain('در حال دریافت صف بررسی از سرور…');
      release(jsonResponse({ items: [itemHaus] }));
      await flush();
      expect(rendered.container.querySelector('[data-dimension]')).not.toBeNull();
    } finally {
      await rendered.unmount();
    }
  });

  it('treats a 404 as the server runtime being disabled and shows NO content', async () => {
    stubReviewFetch({
      '/api/content/review': () => jsonResponse({}, 404),
    });
    const rendered = await renderServer();
    try {
      expect(rendered.text).toContain('غیرفعال است');
      expect(rendered.container.querySelector('[data-review-unavailable="true"]')).not.toBeNull();
      expect(rendered.container.querySelectorAll('[data-review-item]')).toHaveLength(0);
      for (const leaked of ['das Haus', 'start-a1-', '۳۵ کارت در انتظار بررسی']) {
        expect(rendered.text).not.toContain(leaked);
      }
      expect(rendered.text).not.toContain('ثبت بررسی در سرور انجام شد');
    } finally {
      await rendered.unmount();
    }
  });

  it('distinguishes an invalid session from a server failure and offers retry', async () => {
    stubReviewFetch({
      '/api/content/review': () => jsonResponse({}, 401),
    });
    const unauthorized = await renderServer();
    try {
      expect(unauthorized.text).toContain('نشست امن معتبر نیست');
    } finally {
      await unauthorized.unmount();
    }

    stubReviewFetch({
      '/api/content/review': () => {
        throw new Error('network down');
      },
    });
    const failed = await renderServer();
    try {
      expect(failed.text).toContain('صف بررسی از سرور در دسترس نیست');
      expect(failed.container.querySelector('button')?.textContent).toContain('تلاش دوباره');
      // A later attempt succeeds and the queue becomes server-truthful.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse({ items: [itemHaus] })),
      );
      await failed.clickButton('تلاش دوباره');
      await flush();
      const textAfterRetry = failed.container.textContent ?? '';
      expect(textAfterRetry).toContain('Haus');
      expect(textAfterRetry).toContain('گیت شش‌بُعدی');
    } finally {
      await failed.unmount();
    }
  });

  it('reads the real queue, derives the card and gate from server rows only, and keeps approve blocked while a check is pending', async () => {
    stubReviewFetch({
      '/api/content/review': () => jsonResponse({ items: [itemHaus, itemTisch] }),
    });
    const rendered = await renderServer();
    try {
      expect(rendered.container.querySelectorAll('.server-queue-row')).toHaveLength(2);
      expect(rendered.text).toContain('das Haus');
      expect(rendered.text).toContain('start-a1-haus');
      expect(rendered.container.querySelectorAll('.review-gate-list li')).toHaveLength(6);
      expect(
        rendered.container.querySelectorAll('.review-gate-list [data-outcome="pending"]'),
      ).toHaveLength(6);
      expect(rendered.text).toContain('تأیید نهایی فقط پس از تأیید هر شش بُعد');
      const approveButton = Array.from(rendered.container.querySelectorAll('button')).find(
        (candidate) => candidate.textContent?.includes('تأیید نهایی سردبیری'),
      );
      expect((approveButton as HTMLButtonElement).disabled).toBe(true);
    } finally {
      await rendered.unmount();
    }
  });

  it('submits a check with the session CSRF and an idempotency key, then refreshes from the server', async () => {
    const queueState = { items: [itemHaus, itemTisch] };
    const { calls } = stubReviewFetch({
      '/api/content/review': () => jsonResponse(queueState),
      '/api/content/review/check': (init) => {
        const body = JSON.parse(String(init?.body)) as { dimension: ReviewDimension };
        expect(init?.headers).toBeDefined();
        expect(new Headers(init?.headers).get('x-learnbox-csrf-token')).toBe('csrf-token-value');
        expect(new Headers(init?.headers).get('idempotency-key')).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
        expect(body.dimension).toBe('german_linguistic');
        return jsonResponse({ status: 'applied' });
      },
    });
    const rendered = await renderServer();
    try {
      const dimensionRow = rendered.container.querySelector('[data-dimension="german_linguistic"]');
      await rendered.clickButton('تأیید', dimensionRow as HTMLElement);
      await flush();

      expect(rendered.text).toContain('ثبت بررسی در سرور انجام شد.');
      expect(calls.filter((call) => call.url === '/api/content/review/check').length).toBe(1);
      // A refresh happened after the persisted mutation (server is the source of truth).
      expect(
        calls.filter((call) => call.url === '/api/content/review').length,
      ).toBeGreaterThanOrEqual(2);
      expect(
        calls.filter((call) => call.url === '/api/content/review/check')[0]?.init?.body,
      ).toContain('"outcome":"passed"');
    } finally {
      await rendered.unmount();
    }
  });

  it('never claims persistence for a conflict or a not-reviewable write', async () => {
    stubReviewFetch({
      '/api/content/review': () => jsonResponse({ items: [itemHaus] }),
      '/api/content/review/check': () => jsonResponse({ code: 'conflict' }, 409),
    });
    const rendered = await renderServer();
    try {
      const dimensionRow = rendered.container.querySelector('[data-dimension="provenance"]');
      await rendered.clickButton('ناموفق', dimensionRow as HTMLElement);
      await flush();
      expect(rendered.text).toContain('قبلاً در سرور ثبت شده است');
      expect(rendered.text).not.toContain('ثبت بررسی در سرور انجام شد');
    } finally {
      await rendered.unmount();
    }
  });

  it('surfaces review_incomplete truthfully when approval is still impossible', async () => {
    // The client only enables approve when the last queue snapshot showed six passed checks; a
    // 409 review_incomplete can still arrive when the server state changed concurrently.
    stubReviewFetch({
      '/api/content/review': () => jsonResponse({ items: [itemApproved] }),
      '/api/content/review/decision': () =>
        jsonResponse({ code: 'review_incomplete', pendingDimensions: ['audio'] }, 409),
    });
    const rendered = await renderServer();
    try {
      await rendered.clickButton('تأیید نهایی سردبیری');
      await flush();
      expect(rendered.text).toContain('تأیید نهایی ثبت نشد');
      expect(rendered.text).not.toContain('تأیید نهایی در سرور ثبت شد');
    } finally {
      await rendered.unmount();
    }
  });

  it('submits an approve decision only when all six checks pass and labels the persisted success', async () => {
    let queueState = { items: [itemHaus] };
    const { calls } = stubReviewFetch({
      '/api/content/review': () => jsonResponse(queueState),
      '/api/content/review/check': () => jsonResponse({ status: 'applied' }),
      '/api/content/review/decision': (init) => {
        expect(String(init?.body)).toContain('"action":"approve"');
        return jsonResponse({ status: 'applied', nextStatus: 'approved' });
      },
    });
    const rendered = await renderServer();
    try {
      // Approve stays blocked until every dimension is passed through the server.
      let approveButton = Array.from(rendered.container.querySelectorAll('button')).find(
        (candidate) => candidate.textContent?.includes('تأیید نهایی سردبیری'),
      ) as HTMLButtonElement;
      expect(approveButton.disabled).toBe(true);

      for (const dimension of allDimensions) {
        const row = rendered.container.querySelector(`[data-dimension="${dimension}"]`);
        queueState = {
          items: [
            makeItem(
              itemHaus.cardVersionId,
              itemHaus.contentId,
              itemHaus.lemma,
              allDimensions.slice(0, allDimensions.indexOf(dimension) + 1),
            ),
          ],
        };
        await rendered.clickButton('تأیید', row as HTMLElement);
        await flush();
        // The queue now reflects the passed dimension from the refreshed server payload.
        expect(
          rendered.container
            .querySelector(`[data-dimension="${dimension}"]`)
            ?.getAttribute('data-outcome'),
        ).toBe('passed');
      }

      approveButton = Array.from(rendered.container.querySelectorAll('button')).find((candidate) =>
        candidate.textContent?.includes('تأیید نهایی سردبیری'),
      ) as HTMLButtonElement;
      expect(approveButton.disabled).toBe(false);

      queueState = { items: [] };
      await rendered.clickButton('تأیید نهایی سردبیری');
      await flush();
      expect(rendered.text).toContain('تأیید نهایی در سرور ثبت شد');
      expect(rendered.text).toContain('صف بررسی خالی است');
      const decisionPosts = calls.filter((call) => call.url === '/api/content/review/decision');
      expect(decisionPosts).toHaveLength(1);
      expect(String(decisionPosts[0]?.init?.body)).toContain(itemHaus.cardVersionId);
    } finally {
      await rendered.unmount();
    }
  });

  it('labels an idempotent replay and a return_for_revision decision truthfully', async () => {
    const { calls } = stubReviewFetch({
      '/api/content/review': () => jsonResponse({ items: [itemApproved] }),
      '/api/content/review/decision': (init) =>
        String(init?.body).includes('"action":"approve"')
          ? jsonResponse({ status: 'idempotent' })
          : jsonResponse({ status: 'applied', nextStatus: 'needs_review' }),
    });
    const rendered = await renderServer();
    try {
      await rendered.clickButton('تأیید نهایی سردبیری');
      await flush();
      expect(rendered.text).toContain('این تصمیم قبلاً در سرور ثبت شده بود');

      await rendered.clickButton('بازگرداندن برای اصلاح');
      await flush();
      expect(rendered.text).toContain('بازگرداندن برای اصلاح در سرور ثبت شد');
      const posts = calls.filter((call) => call.url === '/api/content/review/decision');
      expect(posts).toHaveLength(2);
      expect(String(posts[1]?.init?.body)).toContain('"action":"return_for_revision"');
    } finally {
      await rendered.unmount();
    }
  });
});

describe('ServerBackedContentReview (authenticated review composition)', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '__Host-learnbox_admin_csrf=csrf-token-value',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (document as unknown as { cookie?: string }).cookie;
  });

  it('composes the ready state as labeled queue, content and decision panels', async () => {
    stubReviewFetch({
      '/api/content/review': () => jsonResponse({ items: [itemHaus, itemTisch] }),
    });
    const rendered = await renderServer();
    try {
      expect(rendered.container.querySelector('[data-review-state="ready"]')).not.toBeNull();
      expect(rendered.container.querySelector('[data-review-workspace="ready"]')).not.toBeNull();

      const panels = ['queue', 'content', 'decision'].map((name) =>
        rendered.container.querySelector(`[data-review-panel="${name}"]`),
      );
      for (const panel of panels) {
        expect(panel).not.toBeNull();
        const labelledBy = panel?.getAttribute('aria-labelledby');
        expect(labelledBy).toBeTruthy();
        expect(rendered.container.querySelector(`#${labelledBy}`)).not.toBeNull();
      }
      const [queuePanel, contentPanel, decisionPanel] = panels;

      // The operational queue is the real control list over the server rows, with one selection.
      expect(queuePanel?.querySelectorAll('.server-queue-row')).toHaveLength(2);
      expect(queuePanel?.querySelectorAll('.server-queue-row[aria-pressed="true"]')).toHaveLength(
        1,
      );

      // The selected content panel renders only server fields for the selected row.
      expect(contentPanel?.textContent).toContain('das Haus');
      expect(contentPanel?.textContent).toContain('start-a1-haus');

      // The six-dimension gate and both decisions stay inside the decision panel.
      expect(decisionPanel?.querySelectorAll('.review-gate-list li')).toHaveLength(6);
      expect(decisionPanel?.textContent).toContain('گیت شش‌بُعدی');
      expect(decisionPanel?.textContent).toContain('تأیید نهایی سردبیری');
      expect(decisionPanel?.textContent).toContain('بازگرداندن برای اصلاح');

      // Publication stays visibly disabled and approval is scoped to editorial review.
      const context = rendered.container.querySelector('[data-publication="disabled"]');
      expect(context).not.toBeNull();
      expect(context?.textContent).toContain('انتشار بسته غیرفعال است');
      expect(decisionPanel?.textContent).toContain('تصمیم این پنل فقط سردبیری است');
      expect(decisionPanel?.textContent).toContain('انتشار در این نسخه غیرفعال می‌ماند');
    } finally {
      await rendered.unmount();
    }
  });

  it('derives every workspace figure from the server rows, checks and media', async () => {
    stubReviewFetch({
      '/api/content/review': () =>
        jsonResponse({ items: [{ ...itemHaus, mediaCount: 2 }, itemTisch, itemApproved] }),
    });
    const rendered = await renderServer();
    const metric = (name: string) =>
      rendered.container.querySelector(`[data-review-metric="${name}"]`)?.textContent?.trim();
    try {
      expect(rendered.container.querySelectorAll('[data-review-metric]')).toHaveLength(3);
      expect(metric('queue-total')).toBe('۳');
      expect(metric('checks-passed')).toBe('۰ از ۶');
      expect(metric('media-count')).toBe('۲');

      const queuePanel = rendered.container.querySelector(
        '[data-review-panel="queue"]',
      ) as HTMLElement;
      await rendered.clickButton('Apfel', queuePanel);

      // Selecting another server row re-derives the content panel and the check/media figures.
      expect(
        rendered.container.querySelector('[data-review-panel="content"]')?.textContent,
      ).toContain('das Apfel');
      expect(metric('checks-passed')).toBe('۶ از ۶');
      expect(metric('media-count')).toBe('۰');

      // No fabricated readiness or confidence figure is ever rendered.
      expect(rendered.text).not.toContain('۹۲');
      expect(rendered.text).not.toContain('آمادهٔ انتشار');
      expect(rendered.text).not.toContain('اعتبار مدل');
    } finally {
      await rendered.unmount();
    }
  });

  it('marks loading, unauthorized, error, empty and disabled states without review panels', async () => {
    const gate = new Promise<Response>(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => gate),
    );
    const loading = await renderServer();
    try {
      expect(loading.container.querySelector('[data-review-state="loading"]')).not.toBeNull();
      expect(loading.text).toContain('در حال دریافت صف بررسی از سرور…');
      expect(loading.container.querySelector('[data-review-panel]')).toBeNull();
    } finally {
      await loading.unmount();
    }

    stubReviewFetch({ '/api/content/review': () => jsonResponse({}, 401) });
    const unauthorized = await renderServer();
    try {
      expect(
        unauthorized.container.querySelector('[data-review-state="unauthorized"]'),
      ).not.toBeNull();
      expect(unauthorized.text).toContain('نشست امن معتبر نیست');
      expect(unauthorized.container.querySelector('[data-review-panel]')).toBeNull();
    } finally {
      await unauthorized.unmount();
    }

    stubReviewFetch({
      '/api/content/review': () => {
        throw new Error('network down');
      },
    });
    const failed = await renderServer();
    try {
      expect(failed.container.querySelector('[data-review-state="error"]')).not.toBeNull();
      expect(failed.container.querySelector('button')?.textContent).toContain('تلاش دوباره');
      expect(failed.container.querySelector('[data-review-panel]')).toBeNull();
    } finally {
      await failed.unmount();
    }

    stubReviewFetch({ '/api/content/review': () => jsonResponse({ items: [] }) });
    const empty = await renderServer();
    try {
      expect(empty.container.querySelector('[data-review-state="empty"]')).not.toBeNull();
      expect(empty.text).toContain('صف بررسی خالی است؛ هیچ کارتی در انتظار بررسی نیست.');
      expect(empty.container.querySelector('[data-review-panel]')).toBeNull();
    } finally {
      await empty.unmount();
    }

    stubReviewFetch({ '/api/content/review': () => jsonResponse({}, 404) });
    const disabled = await renderServer();
    try {
      expect(disabled.container.querySelector('[data-review-state="disabled"]')).not.toBeNull();
      expect(disabled.container.querySelector('[data-review-unavailable="true"]')).not.toBeNull();
      expect(disabled.container.querySelector('[data-review-panel]')).toBeNull();
    } finally {
      await disabled.unmount();
    }
  });

  it('re-authenticates a refused check in place and replays the same idempotency key', async () => {
    let checkAttempts = 0;
    stepUpAssertion = async () => ({ id: 'credential' });
    const { calls } = stubReviewFetch({
      '/api/content/review': () => jsonResponse({ items: [itemHaus] }),
      '/api/content/review/check': () => {
        checkAttempts += 1;
        return checkAttempts === 1
          ? jsonResponse({ code: 'reauthentication_required' }, 428)
          : jsonResponse({ status: 'applied' });
      },
      '/api/auth/reauth/options': () => jsonResponse({ challenge: 'challenge' }),
      '/api/auth/reauth/verify': () => new Response(null, { status: 204 }),
    });
    const rendered = await renderServer();
    try {
      const dimensionRow = rendered.container.querySelector('[data-dimension="audio"]');
      // The reviewer's selected card must still be the one being reviewed after the step-up.
      const selectedBefore = rendered.container.querySelector("[aria-pressed='true']")?.textContent;
      await rendered.clickButton('تأیید', dimensionRow as HTMLElement);
      await flush();

      expect(checkAttempts).toBe(2);
      const keys = calls
        .filter((call) => call.url === '/api/content/review/check')
        .map((call) => new Headers(call.init?.headers).get('idempotency-key'));
      expect(keys).toHaveLength(2);
      expect(new Set(keys).size).toBe(1);
      expect(calls.filter((call) => call.url === '/api/auth/reauth/verify')).toHaveLength(1);
      expect(rendered.text).toContain('ثبت بررسی در سرور انجام شد.');
      expect(rendered.container.querySelector("[aria-pressed='true']")?.textContent).toBe(
        selectedBefore,
      );
    } finally {
      await rendered.unmount();
    }
  });

  it('keeps the review context and records nothing when the step-up is cancelled', async () => {
    let checkAttempts = 0;
    stepUpAssertion = async () => {
      const error = new Error('cancelled by the reviewer');
      error.name = 'NotAllowedError';
      throw error;
    };
    const { calls } = stubReviewFetch({
      '/api/content/review': () => jsonResponse({ items: [itemHaus, itemTisch] }),
      '/api/content/review/check': () => {
        checkAttempts += 1;
        return jsonResponse({ code: 'reauthentication_required' }, 428);
      },
      '/api/auth/reauth/options': () => jsonResponse({ challenge: 'challenge' }),
      '/api/auth/reauth/verify': () => new Response(null, { status: 204 }),
    });
    const rendered = await renderServer();
    try {
      const selectedBefore = rendered.container.querySelector("[aria-pressed='true']")?.textContent;
      const dimensionRow = rendered.container.querySelector('[data-dimension="visual"]');
      await rendered.clickButton('تأیید', dimensionRow as HTMLElement);
      await flush();

      expect(checkAttempts).toBe(1);
      expect(calls.filter((call) => call.url === '/api/auth/reauth/options')).toHaveLength(1);
      expect(calls.filter((call) => call.url === '/api/auth/reauth/verify')).toHaveLength(0);
      expect(rendered.text).toContain('لغو شد');
      expect(rendered.text).toContain('حفظ شده است');
      expect(rendered.text).not.toContain('ثبت بررسی در سرور انجام شد');
      // Queue, selection and the six-dimension gate are all still on screen and usable.
      expect(rendered.container.querySelector("[aria-pressed='true']")?.textContent).toBe(
        selectedBefore,
      );
      expect(rendered.container.querySelectorAll('.review-gate-list li')).toHaveLength(6);
      expect(rendered.container.querySelector('[data-review-panel]')).not.toBeNull();
    } finally {
      await rendered.unmount();
      stepUpAssertion = async () => ({ id: 'credential' });
    }
  });

  it('keeps the authenticated shell true-white without weakening legacy control contrast', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');
    const shellTokens = css.match(/\.admin-shell\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(shellTokens).toContain('--canvas: #fff;');
    expect(shellTokens).not.toContain('--purple:');
    expect(css).toContain(".server-queue-row[aria-pressed='true']");
    expect(css).toContain('border-color: var(--primary);');
    expect(css).toContain('outline: 3px solid var(--focus-ring);');
  });
});
