// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServerBackedContentReview } from '../app/components/ContentReviewWorkspace.js';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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

describe('ContentReviewWorkspace (local admin content preview)', () => {
  beforeEach(() => {
    // No splash route exists in a unit environment; the splash panel must degrade to unavailable.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response),
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
  });

  it('shows the complete Start Pack review queue of 35 drafts and keeps publication blocked', async () => {
    const rendered = await renderWorkspace();
    try {
      expect(rendered.text).toContain('بازبینی محتوا');
      expect(rendered.text).toContain('۳۵ کارت در انتظار بررسی');
      expect(rendered.container.querySelectorAll('[data-review-item]')).toHaveLength(35);
      expect(
        rendered.container.querySelectorAll('[data-review-item="start-a1-haus"]'),
      ).toHaveLength(1);
      expect(
        rendered.container.querySelectorAll('[data-review-item="start-a1-supermarkt"]'),
      ).toHaveLength(1);
      expect(rendered.text).toContain('انتشار مسدود است');
      expect(rendered.text).toContain('انتشار بسته هنوز ممکن نیست');
    } finally {
      await rendered.unmount();
    }
  });

  it('derives the review card from the draft record instead of fabricating review state', async () => {
    const rendered = await renderWorkspace();
    try {
      // Real draft content for start-a1-haus (content/packs/learnbox-start).
      expect(rendered.text).toContain('das Haus');
      expect(rendered.text).toContain('die Häuser');
      expect(rendered.text).toContain('haʊs');
      expect(rendered.text).toContain('خانه');
      expect(rendered.text).toContain('اسم');
      expect(rendered.text).toContain('Das Haus ist klein.');
      expect(rendered.text).toContain('خانه کوچک است.');
      expect(rendered.text).toContain(
        'Goethe A1 scope reference; German and Persian linguistic review recorded; remaining release gates pending.',
      );

      // The draft has no attached media, so no media may be shown as ready.
      expect(rendered.text).toContain('رسانه‌ای برای این کارت ثبت نشده است');
      expect(
        rendered.container.querySelectorAll('[data-media-state="missing"]').length,
      ).toBeGreaterThan(0);
      expect(rendered.container.querySelectorAll('[data-media-state="attached"]')).toHaveLength(0);

      // Fabricated review claims must not be rendered for an unreviewed draft.
      expect(rendered.text).not.toContain('Das Haus ist groß.');
      expect(rendered.text).not.toContain('۹۲٪');
      expect(rendered.text).not.toContain('پیشنهاد آزمایشی');
      expect(rendered.text).not.toContain('وضعیت آمادگی رسانه‌ها برای این کارت');
      expect(rendered.text).not.toContain('ساختار کارت');
      expect(rendered.text).not.toContain('پخش تلفظ');
    } finally {
      await rendered.unmount();
    }
  });

  it('keeps the six-dimensional review gate pending and only previews local actions', async () => {
    const rendered = await renderWorkspace();
    try {
      expect(rendered.text).toContain('گیت بررسی محتوا');
      expect(
        rendered.container.querySelectorAll('.review-gate-list [data-outcome="pending"]'),
      ).toHaveLength(6);
      expect(
        rendered.container.querySelectorAll('.review-gate-list [data-outcome="passed"]'),
      ).toHaveLength(0);

      await rendered.approve();

      // The action is scoped to the local preview label only: the underlying queue item and the
      // gate stay untouched, so publication remains blocked.
      const textAfterApprove = rendered.container.textContent ?? '';
      expect(textAfterApprove).toContain('در پیش‌نمایش تأیید شد');
      expect(
        rendered.container.querySelectorAll('.review-gate-list [data-outcome="passed"]'),
      ).toHaveLength(0);
      expect(rendered.container.querySelectorAll('[data-review-item]')).toHaveLength(35);
      expect(rendered.text).toContain('۳۵ کارت در انتظار بررسی');
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

  it('treats a 404 as the server runtime being disabled and keeps an explicitly labeled local-only mode', async () => {
    stubReviewFetch({
      '/api/content/review': () => jsonResponse({}, 404),
    });
    const rendered = await renderServer();
    try {
      expect(rendered.text).toContain('غیرفعال است');
      expect(rendered.text).toContain('پیش‌نمایش محلی');
      expect(rendered.text).toContain('۳۵ کارت در انتظار بررسی');
      expect(rendered.text).toContain('تغییر فقط در پیش‌نمایش محلی ثبت می‌شود');
      // The local-only fallback is explicitly labeled and never claims persistence.
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
