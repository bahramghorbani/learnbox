// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveStartSliceItem } from '../app/start-slice';

/**
 * LB-B35 CP5 — the ONE learner-visible Today number, «N کارت دیگه مونده».
 *
 * It must be the cards still left in the canonical session plan (due/recovery cards + today's frozen
 * new allowance, within the 12-card capacity), never the unseen-catalogue size. The fake server below
 * behaves like /api/learner/state + /summary: answering a card removes it from the plan, bumps
 * reviewedToday, and never adds a replacement new card. The /today payload deliberately carries a
 * catalogue-sized newCount/totalTodayCards to prove the screen does not use it.
 */
const USER = 'learner_fixture';
const IDS = [
  'start-a1-fenster',
  'start-a1-zimmer',
  'start-a1-uhr',
  'start-a1-milch',
  'start-a1-kaffee',
  'start-a1-ei',
  'start-a1-tee',
  'start-a1-stadt',
  'start-a1-supermarkt',
  'start-a1-gehen',
  'start-a1-essen',
  'start-a1-trinken',
  'start-a1-gross',
  'start-a1-kalt',
  'start-a1-neu',
];
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CATALOGUE_SIZE = 999;

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

const json = (status: number, body: unknown): Response =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

// Mirrors LEARNBOX_TODAY_WORKLOAD: when true /today carries cardsForToday (the remaining canonical plan).
let workloadFlag = true;
interface FakeServer {
  due: string[];
  fresh: string[];
  mode: 'normal' | 'recovery';
  answered: number;
}
const serverOf = (
  due: number,
  fresh: number,
  mode: 'normal' | 'recovery' = 'normal',
): FakeServer => ({
  due: IDS.slice(0, due),
  fresh: IDS.slice(due, due + fresh),
  mode,
  answered: 0,
});

function stateOf(s: FakeServer) {
  const idOf = (c: string) => uuid(IDS.indexOf(c) + 1);
  return {
    schedules: s.due.map((c) => ({
      cardId: idOf(c),
      contentId: c,
      state: 'review',
      stabilityDays: 4,
      difficulty: 0.4,
      lapses: 0,
      dueAt: '2026-08-08T06:00:00.000Z',
    })),
    newCards: s.fresh.map((c) => ({ cardId: idOf(c), contentId: c, importance: 1 })),
    plan: {
      mode: s.mode,
      reviewCardIds: s.due.map(idOf),
      newCardIds: s.fresh.map(idOf),
      message: 'daily',
    },
    reviewEventsCount: s.answered,
    reconciliationCursor: String(s.answered),
  };
}

async function mount(server: FakeServer) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url === '/api/auth/session')
        return json(200, { authenticated: true, userId: USER });
      if (method === 'GET' && url === '/api/learner/state') return json(200, stateOf(server));
      if (method === 'GET' && url === '/api/learner/cards')
        return json(200, { items: IDS.map((id) => resolveStartSliceItem(id)) });
      if (method === 'GET' && url === '/api/banners') return json(200, { banners: [] });
      if (method === 'GET' && url.startsWith('/api/learner/summary'))
        return json(200, {
          reviewedToday: server.answered,
          streakDays: server.answered > 0 ? 1 : 0,
          longestStreakDays: 1,
          activeDays: 1,
          totalReviews: server.answered,
        });
      if (method === 'GET' && url.startsWith('/api/learner/today'))
        return json(200, {
          reviewedToday: server.answered,
          correctToday: 0,
          accuracyPercent: 0,
          studyMinutesToday: null,
          // A catalogue-sized value the screen must never show as work for today.
          totalTodayCards: CATALOGUE_SIZE,
          dueCount: server.due.length,
          newCount: CATALOGUE_SIZE,
          ...(workloadFlag
            ? { cardsForToday: Math.min(12, server.due.length + server.fresh.length) }
            : {}),
          streakDays: 0,
          leitnerBoxes: [0, 0, 0, 0, 0],
          weekDays: Array.from({ length: 7 }, (_, i) => ({ day: `d${i}`, active: false })),
        });
      if (method === 'POST' && url === '/api/learner/reviews') {
        const body = JSON.parse(String(init?.body)) as { items: Array<{ contentId: string }> };
        for (const item of body.items) {
          server.due = server.due.filter((c) => c !== item.contentId);
          server.fresh = server.fresh.filter((c) => c !== item.contentId);
          server.answered += 1; // no replacement card is ever added
        }
        return json(200, {
          outcomes: body.items.map((item, i) => ({
            status: 'acknowledged',
            clientEventId: (item as unknown as { clientEventId: string }).clientEventId,
            eventId: `e${server.answered}-${i}`,
            idempotent: false,
            reconciliationCursor: String(server.answered),
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
  const settle = async (ms = 250) => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, ms));
    });
  };
  const click = async (re: RegExp) => {
    const b = Array.from(container.querySelectorAll('button')).find((x) =>
      re.test(x.textContent ?? ''),
    );
    if (!b) throw new Error(`no button ${re}\n${container.textContent}`);
    await act(async () => b.click());
  };
  const answerOne = async () => {
    if (!container.querySelector('.flip-container')) await click(/شروع مرور|ادامهٔ مرور/);
    const f = container.querySelector<HTMLElement>('.flip-container');
    if (!f) throw new Error('no flip container');
    await act(async () => f.click());
    await click(/^بلد بودم$/);
    await settle(400);
  };
  const backToToday = async () => {
    if (container.querySelector('.flip-container')) await click(/خروج از جلسه/);
    await settle(300);
  };
  return {
    text: () => container.textContent ?? '',
    backToToday,
    settle,
    click,
    answerOne,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n: number) => String(n).replace(/\d/g, (d) => persianDigits[Number(d)]);
const remainingLabel = (n: number) => `${fa(n)} کارت دیگه مونده`;

describe('CP5 — Today «N کارت دیگه مونده» is the canonical remaining session plan', () => {
  let rendered: Awaited<ReturnType<typeof mount>> | undefined;

  beforeEach(() => {
    installLocalStorage({
      [`learnbox:onboarding-goal:v1:local-prototype:account:${USER}`]: 'life',
    });
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI', 'true');
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED', 'true');
  });
  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const cases: Array<[string, number, number, 'normal' | 'recovery', number]> = [
    ['3 new, nothing due', 0, 3, 'normal', 3],
    ['5 due + 3 new', 5, 3, 'normal', 8],
    ['10 due + 2 new (capacity 12 binds)', 10, 2, 'normal', 12],
    ['exactly 12 due, 0 new (never 15)', 12, 0, 'normal', 12],
    ['recovery: >12 overdue, plan capped at 12, no new', 12, 0, 'recovery', 12],
  ];
  for (const [name, due, fresh, mode, expected] of cases) {
    it(`${name} → «${remainingLabel(expected)}», never the catalogue size`, async () => {
      rendered = await mount(serverOf(due, fresh, mode));
      await rendered.settle();
      expect(rendered.text()).toContain(remainingLabel(expected));
      expect(rendered.text()).not.toContain(fa(CATALOGUE_SIZE));
    });
  }

  it('zero work remaining → the empty state, no remaining-count line', async () => {
    rendered = await mount(serverOf(0, 0));
    await rendered.settle();
    expect(rendered.text()).toContain('فعلاً کارتی در صف مرور نیست');
    expect(rendered.text()).not.toContain('کارت دیگه مونده');
    expect(rendered.text()).not.toContain(fa(CATALOGUE_SIZE));
  });

  it('after answering one card the remaining work drops by exactly one — also after a refresh — with no replacement new card', async () => {
    const server = serverOf(5, 3);
    rendered = await mount(server);
    await rendered.settle();
    expect(rendered.text()).toContain(remainingLabel(8));

    await rendered.answerOne();
    await rendered.backToToday();
    await rendered.settle(600);
    expect(server.answered).toBe(1);
    expect(server.due.length + server.fresh.length).toBe(7); // server never refilled the allowance
    expect(rendered.text()).toContain(remainingLabel(7));

    // Refresh (fresh mount against the same server state): same answer, not 7 - 1.
    await rendered.unmount();
    rendered = await mount(server);
    await rendered.settle();
    expect(rendered.text()).toContain(remainingLabel(7));
    expect(rendered.text()).not.toContain(remainingLabel(6));
    expect(rendered.text()).not.toContain(fa(CATALOGUE_SIZE));
  });

  it("after answering ALL of the day's cards the empty state shows and nothing is refilled", async () => {
    const server = serverOf(0, 3);
    rendered = await mount(server);
    await rendered.settle();
    expect(rendered.text()).toContain(remainingLabel(3));
    for (let i = 0; i < 3; i += 1) {
      await rendered.answerOne();
    }
    await rendered.backToToday();
    await rendered.unmount();
    rendered = await mount(server);
    await rendered.settle();
    expect(server.fresh).toHaveLength(0);
    expect(rendered.text()).toContain('فعلاً کارتی در صف مرور نیست');
    expect(rendered.text()).not.toContain('کارت دیگه مونده');
  });

  it('server flag OFF (no cardsForToday): the legacy plan-length count is shown unchanged', async () => {
    workloadFlag = false;
    try {
      rendered = await mount(serverOf(5, 3));
      await rendered.settle();
      expect(rendered.text()).toContain(remainingLabel(8));
      expect(rendered.text()).not.toContain(fa(CATALOGUE_SIZE));
    } finally {
      workloadFlag = true;
    }
  });
});
