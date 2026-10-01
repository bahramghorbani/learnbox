// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveStartSliceItem } from '../app/start-slice';
import { createMemoryStorage } from '@learnbox/learning-engine';
import { flushWebReviewQueue } from '../lib/learner-review-web-sync';

/**
 * LB-B35 CP5-D — session-expiry UX (client flag NEXT_PUBLIC_LEARNBOX_SESSION_EXPIRY_UX).
 *
 * When the server says the session is gone (HTTP 401), the learner sees a clear Persian "session ended,
 * sign in again" message — with how many unsent answers are safely kept on this device — instead of an
 * unexplained login screen. Nothing is deleted: the queue is exactly as it was. The 30-day / 14-day
 * policy numbers are never shown. OFF = v1.2.1 behaviour (silent drop to the login gate).
 */
const USER = 'learner_fixture';
const queueKey = `learnbox:review-sync:v1:local-prototype:account:${USER}`;
const goalKey = `learnbox:onboarding-goal:v1:local-prototype:account:${USER}`;
const CARD = ['11111111-1111-4111-8111-111111111111', 'start-a1-apfel'] as const;
const SESSION_ENDED = 'نشست شما تمام شد';

const json = (status: number, body: unknown): Response =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

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

const queued = (id: string) => ({
  clientEventId: id,
  payload: {
    cardId: 'start-a1-apfel',
    grade: 'remembered',
    reviewedAt: '2026-08-08T05:00:00.000Z',
  },
  attempts: 0,
  nextAttemptAt: '2026-08-08T05:00:00.000Z',
});

type Mode = {
  seedQueue?: string[];
  stateStatus?: number;
  reviewStatus?: number;
  signedIn?: boolean;
};

describe('CP5-D — session-expiry UX', () => {
  let unmount: (() => Promise<void>) | undefined;
  let entries: Map<string, string>;
  let container: HTMLDivElement;
  const text = () => container.textContent ?? '';

  async function mount(mode: Mode) {
    entries = new Map<string, string>([[goalKey, 'life']]);
    if (mode.seedQueue)
      entries.set(queueKey, JSON.stringify(mode.seedQueue.map((id) => queued(id))));
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
    let sessionAlive = mode.signedIn !== false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === '/api/auth/session')
          return sessionAlive
            ? json(200, { authenticated: true, userId: USER })
            : json(401, { authenticated: false });
        if (method === 'GET' && url === '/api/learner/state') {
          if (mode.stateStatus === 401) {
            sessionAlive = false;
            return json(401, {});
          }
          return json(200, snapshot);
        }
        if (method === 'GET' && url === '/api/learner/cards')
          return json(200, { items: [resolveStartSliceItem(CARD[1])] });
        if (method === 'GET' && url === '/api/banners') return json(200, { banners: [] });
        if (method === 'POST' && url === '/api/learner/reviews') {
          if (mode.reviewStatus === 401) {
            sessionAlive = false;
            return json(401, {});
          }
          return json(503, {});
        }
        return json(503, {});
      }),
    );
    container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    unmount = async () => {
      await act(async () => root.unmount());
      container.remove();
    };
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
    for (let i = 0; i < 6; i += 1)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 40));
      });
  }

  afterEach(async () => {
    await unmount?.();
    unmount = undefined;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('flag ON + state read 401: login gate shows the session-ended message and the kept-answers count', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_SESSION_EXPIRY_UX', 'true');
    await mount({ seedQueue: ['a', 'b'], stateStatus: 401, reviewStatus: 401 });
    expect(container.querySelector('[data-testid="learnbox-auth"]')).not.toBeNull();
    expect(text()).toContain(SESSION_ENDED);
    expect(text()).toContain('۲');
    expect(text()).toContain('روی همین دستگاه');
  });

  it('flag ON + ONLY the review POST says 401 (state read fine): the session-ended notice still appears', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_SESSION_EXPIRY_UX', 'true');
    await mount({ seedQueue: ['a', 'b', 'c'], reviewStatus: 401 });
    expect(container.querySelector('[data-testid="learnbox-auth"]')).not.toBeNull();
    expect(text()).toContain(SESSION_ENDED);
    expect(text()).toContain('۳');
    const kept = JSON.parse(entries.get(queueKey) ?? '[]') as Array<{ clientEventId: string }>;
    expect(kept.map((e) => e.clientEventId).sort()).toEqual(['a', 'b', 'c']);
  });

  it('flag ON: nothing is lost — the unsent answers are exactly as they were', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_SESSION_EXPIRY_UX', 'true');
    await mount({ seedQueue: ['a', 'b'], stateStatus: 401, reviewStatus: 401 });
    const kept = JSON.parse(entries.get(queueKey) ?? '[]') as Array<{ clientEventId: string }>;
    expect(kept.map((e) => e.clientEventId).sort()).toEqual(['a', 'b']);
  });

  it('flag ON + nothing unsent: the message appears without a count sentence', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_SESSION_EXPIRY_UX', 'true');
    await mount({ stateStatus: 401 });
    expect(text()).toContain(SESSION_ENDED);
    expect(text()).not.toContain('روی همین دستگاه');
  });

  it('flag ON: the 30-day / 14-day policy numbers are never shown', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_SESSION_EXPIRY_UX', 'true');
    await mount({ seedQueue: ['a'], stateStatus: 401 });
    expect(text()).toContain(SESSION_ENDED);
    expect(text()).not.toMatch(/۳۰|۱۴|30|14|روز/);
  });

  it('flag ON: a visitor who was never signed in sees NO session-ended message', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_SESSION_EXPIRY_UX', 'true');
    await mount({ signedIn: false });
    expect(container.querySelector('[data-testid="learnbox-auth"]')).not.toBeNull();
    expect(text()).not.toContain(SESSION_ENDED);
  });

  it('flag OFF: v1.2.1 behaviour — login gate with no message; unsent answers still retained', async () => {
    await mount({ seedQueue: ['a', 'b'], stateStatus: 401, reviewStatus: 401 });
    expect(container.querySelector('[data-testid="learnbox-auth"]')).not.toBeNull();
    expect(text()).not.toContain(SESSION_ENDED);
    const kept = JSON.parse(entries.get(queueKey) ?? '[]') as Array<{ clientEventId: string }>;
    expect(kept.map((e) => e.clientEventId).sort()).toEqual(['a', 'b']);
  });
});

describe('CP5-D — flush reports an ended session without touching the queue', () => {
  const key = 'q';
  const now = new Date('2026-08-08T06:00:00.000Z');
  const seed = () => {
    const storage = createMemoryStorage();
    storage.setItem(key, JSON.stringify([queued('a'), queued('b')]));
    return storage;
  };
  const ids = (storage: ReturnType<typeof createMemoryStorage>) =>
    (JSON.parse(storage.getItem(key) ?? '[]') as Array<{ clientEventId: string }>)
      .map((e) => e.clientEventId)
      .sort();

  it('unauthorized → sessionEnded:true and every answer is still queued', async () => {
    const storage = seed();
    const result = await flushWebReviewQueue({
      storage,
      key,
      now,
      submit: async () => ({ status: 'unauthorized' }),
    });
    expect(result.sessionEnded).toBe(true);
    expect(result.pendingCount).toBe(2);
    expect(ids(storage)).toEqual(['a', 'b']);
  });

  it('unavailable (offline / 5xx) is NOT a session end', async () => {
    const storage = seed();
    const result = await flushWebReviewQueue({
      storage,
      key,
      now,
      submit: async () => ({ status: 'unavailable' }),
    });
    expect(result.sessionEnded).not.toBe(true);
    expect(ids(storage)).toEqual(['a', 'b']);
  });
});
