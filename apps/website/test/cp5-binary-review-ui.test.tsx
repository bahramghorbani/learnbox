// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveStartSliceItem } from '../app/start-slice';

/**
 * LB-B35 CP5-B — web binary review UI (client flag NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI).
 *
 * ON: the answer area is exactly two buttons, «بلد بودم» (known) and «بلد نیستم» (unknown). The queued
 * answer keeps its lossless shadow grade (known→remembered, unknown→forgot) so a flag rollback or a
 * v1.2.1 server still reads it, and the wire item carries `response` only.
 * OFF: the four v1.2.1 grades, unchanged, sent as `grade`.
 */
const USER = 'learner_fixture';
const queueKey = `learnbox:review-sync:v1:local-prototype:account:${USER}`;
const CARD = ['11111111-1111-4111-8111-111111111111', 'start-a1-apfel'] as const;

function installLocalStorage(seed: Record<string, string>) {
  const entries = new Map<string, string>(Object.entries(seed));
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (k) => entries.get(k) ?? null,
    key: (i) => Array.from(entries.keys())[i] ?? null,
    removeItem: (k) => void entries.delete(k),
    setItem: (k, v) => void entries.set(k, String(v)),
  };
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
  return entries;
}

function json(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

const snapshot = {
  schedules: [
    {
      cardId: CARD[0],
      contentId: CARD[1],
      state: 'review',
      stabilityDays: 4,
      difficulty: 0.4,
      lapses: 0,
      dueAt: '2026-08-08T06:00:00.000Z',
    },
  ],
  newCards: [],
  plan: { mode: 'normal', reviewCardIds: [CARD[0]], newCardIds: [], message: 'daily' },
  reviewEventsCount: 1,
  reconciliationCursor: '0',
};

async function renderServerMode() {
  const posted: Array<{ items: Array<Record<string, unknown>> }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url === '/api/auth/session')
        return json(200, { authenticated: true, userId: USER });
      if (method === 'GET' && url === '/api/learner/state') return json(200, snapshot);
      if (method === 'GET' && url === '/api/learner/cards')
        return json(200, { items: [resolveStartSliceItem(CARD[1])] });
      if (method === 'GET' && url === '/api/banners') return json(200, { banners: [] });
      if (method === 'POST' && url === '/api/learner/reviews') {
        const body = JSON.parse(String(init?.body)) as { items: Array<Record<string, unknown>> };
        posted.push(body);
        return json(200, {
          outcomes: body.items.map((item, i) => ({
            status: 'acknowledged',
            clientEventId: item.clientEventId,
            eventId: `e${i}`,
            idempotent: false,
            reconciliationCursor: String(i + 1),
          })),
        });
      }
      return json(503, {});
    }),
  );
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetModules();
  const { LearnerHome } = await import('../app/LearnerHome.js');
  const props = {
    hostname: 'localhost',
    otpUiFlag: 'true',
    privateMediaFlag: 'false',
    inviteFlag: 'false',
  };
  await act(async () => {
    root.render(createElement(LearnerHome as FunctionComponent<typeof props>, props));
  });
  const settle = async (ms: number) => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, ms));
    });
  };
  const buttons = () => Array.from(container.querySelectorAll('button'));
  const clickByText = async (re: RegExp) => {
    const b = buttons().find((x) => re.test(x.textContent ?? ''));
    if (!b) throw new Error(`no button ${re}\n${container.textContent}`);
    await act(async () => b.click());
  };
  const flip = async () => {
    const f = container.querySelector<HTMLElement>('.flip-container');
    if (!f) throw new Error('no flip container');
    await act(async () => f.click());
  };
  return {
    container,
    posted,
    settle,
    clickByText,
    flip,
    gradeButtons: () =>
      Array.from(container.querySelectorAll('.grade-grid button')).map((x) => x.textContent),
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe('CP5-B — binary review buttons', () => {
  let storage: Map<string, string>;
  let rendered: Awaited<ReturnType<typeof renderServerMode>> | undefined;

  beforeEach(() => {
    storage = installLocalStorage({
      [`learnbox:onboarding-goal:v1:local-prototype:account:${USER}`]: 'life',
    });
  });
  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const reachAnswerArea = async () => {
    rendered = await renderServerMode();
    await rendered.settle(200);
    await rendered.clickByText(/شروع مرور|ادامهٔ مرور/);
    await rendered.flip();
  };

  it('flag ON: exactly two buttons, «بلد بودم» and «بلد نیستم», in that order', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI', 'true');
    await reachAnswerArea();
    expect(rendered!.gradeButtons()).toEqual(['بلد بودم', 'بلد نیستم']);
    const text = rendered!.container.textContent ?? '';
    for (const legacy of ['فراموش کردم', 'سخت بود', 'یادم آمد', 'کاملاً بلد بودم']) {
      expect(text).not.toContain(legacy);
    }
  });

  it('flag ON: «بلد بودم» queues known (shadow grade remembered) and POSTs response only', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI', 'true');
    await reachAnswerArea();
    await rendered!.clickByText(/^بلد بودم$/);
    await rendered!.settle(300);
    expect(rendered!.posted).toHaveLength(1);
    expect(rendered!.posted[0].items[0]).toEqual({
      clientEventId: expect.any(String),
      contentId: 'start-a1-apfel',
      response: 'known',
      occurredAt: expect.any(String),
    });
  });

  it('flag ON: «بلد نیستم» → unknown; the durable queue entry keeps the lossless legacy grade', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI', 'true');
    // Offline-ish: make the POST fail so the entry stays in the durable queue to inspect.
    await reachAnswerArea();
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === '/api/learner/reviews' && init?.method === 'POST')
          return json(503, {});
        return json(503, {});
      },
    );
    await rendered!.clickByText(/^بلد نیستم$/);
    await rendered!.settle(100);
    const queued = JSON.parse(storage.get(queueKey) ?? '[]') as Array<{
      payload: { cardId: string; grade: string; response?: string };
    }>;
    expect(queued).toHaveLength(1);
    expect(queued[0].payload).toMatchObject({
      cardId: 'start-a1-apfel',
      grade: 'forgot',
      response: 'unknown',
    });
  });

  it('flag OFF: the four v1.2.1 grades, unchanged, sent as grade', async () => {
    await reachAnswerArea();
    expect(rendered!.gradeButtons()).toEqual([
      'فراموش کردم',
      'سخت بود',
      'یادم آمد',
      'کاملاً بلد بودم',
    ]);
    await rendered!.clickByText(/^یادم آمد$/);
    await rendered!.settle(300);
    expect(rendered!.posted[0].items[0]).toEqual({
      clientEventId: expect.any(String),
      contentId: 'start-a1-apfel',
      grade: 'remembered',
      occurredAt: expect.any(String),
    });
    expect(rendered!.posted[0].items[0]).not.toHaveProperty('response');
  });
});

/**
 * LB-B35 CP12 — learner-facing terminal-state UX. A deterministic 422 refusal must be reported as
 * "stored but not submitted", never as the reassuring "will be synced" line, and must stay
 * distinguishable from a transient failure and from session expiry.
 */
describe('CP12 — blocked-sync notice on a deterministic refusal', () => {
  let storage: Map<string, string>;
  let rendered: Awaited<ReturnType<typeof renderServerMode>> | undefined;

  const BLOCKED = 'در حال حاضر ثبت نمی‌شود';
  const SAFE = 'برای همگام‌سازی امن نگه‌داری شد';

  beforeEach(() => {
    storage = installLocalStorage({
      [`learnbox:onboarding-goal:v1:local-prototype:account:${USER}`]: 'life',
    });
  });
  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const answerWith = async (status: number) => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI', 'true');
    rendered = await renderServerMode();
    await rendered.settle(200);
    await rendered.clickByText(/شروع مرور|ادامهٔ مرور/);
    await rendered.flip();
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === '/api/learner/reviews' && init?.method === 'POST')
          return json(status, {});
        return json(status, {});
      },
    );
    await rendered.clickByText(/^بلد بودم$/);
    await rendered.settle(300);
    return rendered.container.textContent ?? '';
  };

  it('422: shows the blocked notice and NOT the safe-sync reassurance', async () => {
    const text = await answerWith(422);
    expect(text).toContain(BLOCKED);
    expect(text).not.toContain(SAFE);
    // The answer itself is still preserved on the device — the learner loses nothing.
    const queued = JSON.parse(storage.get(queueKey) ?? '[]') as Array<{
      payload: { response?: string; grade?: string };
      attempts: number;
    }>;
    expect(queued).toHaveLength(1);
    expect(queued[0].payload).toMatchObject({ response: 'known', grade: 'remembered' });
    expect(queued[0].attempts).toBe(0);
    // No internal detail leaks to the learner.
    for (const leak of [
      'scheduler',
      'Scheduler',
      '422',
      'migration',
      '0023',
      'LEARNBOX_',
      'engine_version',
      'schedulerRejected',
      'postgres',
    ]) {
      expect(text).not.toContain(leak);
    }
  });

  it('503 CONTRAST: transient failure keeps the existing safe-sync line, no blocked notice', async () => {
    const text = await answerWith(503);
    expect(text).toContain(SAFE);
    expect(text).not.toContain(BLOCKED);
  });

  it('401 CONTRAST: auth expiry does not render the blocked notice', async () => {
    const text = await answerWith(401);
    expect(text).not.toContain(BLOCKED);
    // Positive assertion so this cannot pass vacuously (e.g. if the notice area vanished
    // entirely): the answer is still held on the device and still reported as safely kept.
    expect(text).toContain(SAFE);
  });

  it('the notice is not sticky: once a later flush is not refused, it clears', async () => {
    // First answer is refused deterministically -> blocked notice.
    const blockedText = await answerWith(422);
    expect(blockedText).toContain(BLOCKED);

    // The server recovers into a merely-transient failure and the device reconnects, which
    // re-flushes the still-queued answer. The learner must no longer be told it cannot be
    // submitted, otherwise the blocked state is sticky and misleading.
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () =>
      json(503, {}),
    );
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await rendered!.settle(300);

    const text = rendered!.container.textContent ?? '';
    expect(text).not.toContain(BLOCKED);
    expect(text).toContain(SAFE);
  });
});
