// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveStartSliceItem } from '../app/start-slice';

/**
 * LB-B35 CP4 — regression for a defect found in staging.
 *
 * In server-OTP mode the review queue arrives AFTER first render. The resume effect used to run once
 * against the still-empty queue, conclude "the saved card is gone", and DELETE the resume record. A
 * valid saved card id was therefore lost on every reload (card identity never got to win).
 *
 * Flag NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN=true: the record must survive until the queue is
 * loaded, then resolve by card identity. Flag off: v1.2.1 behaviour is unchanged (pinned below).
 */

const USER = 'learner_fixture';
const sessionKey = `learnbox:review-session:v1:local-prototype:account:${USER}`;
const goalKey = `learnbox:onboarding-goal:v1:local-prototype:account:${USER}`;
const CARDS = [
  ['11111111-1111-4111-8111-111111111111', 'start-a1-apfel'],
  ['22222222-2222-4222-8222-222222222222', 'start-a1-bahnhof'],
  ['33333333-3333-4333-8333-333333333333', 'start-a1-bett'],
  ['44444444-4444-4444-8444-444444444444', 'start-a1-brot'],
] as const;

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

function snapshotFor(order: readonly (typeof CARDS)[number][]) {
  return {
    schedules: order.map(([cardId, contentId]) => ({
      cardId,
      contentId,
      state: 'review',
      stabilityDays: 4,
      difficulty: 0.4,
      lapses: 0,
      dueAt: '2026-08-08T06:00:00.000Z',
    })),
    newCards: [],
    plan: {
      mode: 'normal',
      reviewCardIds: order.map(([cardId]) => cardId),
      newCardIds: [],
      message: 'daily',
    },
    reviewEventsCount: order.length,
    reconciliationCursor: '0',
  };
}

async function renderServerMode(order: readonly (typeof CARDS)[number][], stateDelayMs: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url === '/api/auth/session') {
        return json(200, { authenticated: true, userId: USER });
      }
      if (method === 'GET' && url === '/api/learner/state') {
        await new Promise((r) => setTimeout(r, stateDelayMs));
        return json(200, snapshotFor(order));
      }
      if (method === 'GET' && url === '/api/learner/cards') {
        return json(200, { items: order.map(([, contentId]) => resolveStartSliceItem(contentId)) });
      }
      if (method === 'GET' && url === '/api/banners') return json(200, { banners: [] });
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
  const start = async () => {
    const b = Array.from(container.querySelectorAll('button')).find((x) =>
      /شروع مرور|ادامهٔ مرور/.test(x.textContent ?? ''),
    );
    if (!b) throw new Error(`no start button\n${container.textContent}`);
    await act(async () => b.click());
  };
  return {
    text: () => container.textContent ?? '',
    settle,
    start,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe('CP4 — resume record survives the queue arriving late (server-OTP)', () => {
  let storage: Map<string, string>;
  let rendered: Awaited<ReturnType<typeof renderServerMode>> | undefined;

  beforeEach(() => {
    storage = installLocalStorage({ [goalKey]: 'life' });
  });
  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const [a, b, c, d] = CARDS;

  it('flag ON: stale index + matching id -> resumes at the card, record never deleted', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN', 'true');
    storage.set(sessionKey, JSON.stringify({ nextCardIndex: 3, nextCardId: 'start-a1-bett' }));
    rendered = await renderServerMode([a, b, c, d], 60);
    // before the queue has arrived the record must still be there
    expect(storage.get(sessionKey)).toBeDefined();
    await rendered.settle(300);
    expect(storage.get(sessionKey)).toBeDefined();
    await rendered.start();
    expect(rendered.text()).toContain('3 از 4');
    expect(rendered.text()).toContain('Bett');
  });

  it('flag ON: after a queue reorder the saved card is found at its new position', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN', 'true');
    storage.set(sessionKey, JSON.stringify({ nextCardIndex: 1, nextCardId: 'start-a1-bett' }));
    rendered = await renderServerMode([d, a, c, b], 60);
    await rendered.settle(300);
    await rendered.start();
    expect(rendered.text()).toContain('3 از 4');
    expect(rendered.text()).toContain('Bett');
  });

  it('flag ON: earlier cards disappeared from the queue -> still the same card', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN', 'true');
    storage.set(sessionKey, JSON.stringify({ nextCardIndex: 2, nextCardId: 'start-a1-bett' }));
    rendered = await renderServerMode([d, c], 60);
    await rendered.settle(300);
    await rendered.start();
    expect(rendered.text()).toContain('2 از 2');
    expect(rendered.text()).toContain('Bett');
  });

  it('flag ON: saved card no longer queued (queue LOADED) -> record cleared, restarts at first card', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN', 'true');
    storage.set(sessionKey, JSON.stringify({ nextCardIndex: 2, nextCardId: 'start-a1-bett' }));
    rendered = await renderServerMode([a, b, d], 60);
    await rendered.settle(300);
    expect(storage.get(sessionKey)).toBeUndefined();
    await rendered.start();
    expect(rendered.text()).toContain('1 از 3');
    expect(rendered.text()).toContain('Apfel');
  });

  it('flag ON: legacy index-only record resumes by index once the queue is loaded', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN', 'true');
    storage.set(sessionKey, JSON.stringify({ nextCardIndex: 2 }));
    rendered = await renderServerMode([a, b, c, d], 60);
    await rendered.settle(300);
    await rendered.start();
    expect(rendered.text()).toContain('3 از 4');
    expect(rendered.text()).toContain('Bett');
  });

  it('flag ON: malformed record is cleared safely, session starts at the first card', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN', 'true');
    storage.set(sessionKey, '{not json');
    rendered = await renderServerMode([a, b, c, d], 60);
    await rendered.settle(300);
    expect(storage.get(sessionKey)).toBeUndefined();
    await rendered.start();
    expect(rendered.text()).toContain('1 از 4');
  });

  it('flag OFF: v1.2.1 behaviour unchanged (index-only resume, no new identity written)', async () => {
    storage.set(sessionKey, JSON.stringify({ nextCardIndex: 2, nextCardId: 'start-a1-bett' }));
    rendered = await renderServerMode([a, b, c, d], 60);
    await rendered.settle(300);
    // the flag-off path never reads nextCardId; it must not write one either
    await rendered.start();
    const saved = JSON.parse(storage.get(sessionKey) ?? 'null') as Record<string, unknown> | null;
    expect(saved === null || !('nextCardId' in saved)).toBe(true);
  });
});
