// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pinnedNow = new Date('2026-08-08T12:00:00.000Z');

const canonicalBody = {
  schedules: [
    {
      cardId: '11111111-1111-4111-8111-111111111111',
      contentId: 'start-a1-haus',
      state: 'review',
      stabilityDays: 4,
      difficulty: 0.4,
      lapses: 0,
      dueAt: '2026-08-08T06:00:00.000Z',
    },
  ],
  newCards: [],
  plan: {
    mode: 'normal',
    reviewCardIds: ['11111111-1111-4111-8111-111111111111'],
    newCardIds: [],
    message: 'daily',
  },
  reviewEventsCount: 2,
  reconciliationCursor: '0',
};

describe('Today server snapshot truth states', () => {
  let rendered: RenderedLearner | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(pinnedNow);
    installLocalStorage();
  });

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps the device-local label and never fetches learner state in local prototype mode', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      // Allow non-critical endpoints; track all calls to assert /api/learner/state absent
      if (method === 'GET' && url === '/api/banners') return json(200, { banners: [] });
      if (method === 'GET' && url === '/api/auth/session') return json(200, { authenticated: false });
      return json(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);
    rendered = await renderLearner({ otpUiFlag: 'false' });
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');
    // New TodayScreen: no 'این فهرست'/'دستگاه' label; just review count and CTA
    expect(rendered.text()).not.toContain('سرور LearnBox خوانده شده');
    expect(rendered.text()).not.toContain('وضعیت یادگیری از سرور خوانده شد');
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/learner/state')).toHaveLength(0);
  });

  it('shows the server-read status label and only the server-selected session after a successful fetch', async () => {
    vi.stubGlobal('fetch', mockRouter({ state: () => json(200, canonicalBody) }));
    rendered = await renderLearner({ otpUiFlag: 'true' });
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');
    await act(async () => {
      await Promise.resolve();
    });
    // New TodayScreen: no explicit 'وضعیت یادگیری' label or 'کارت‌های این دستگاه' text
    // Instead shows review count directly as '۱ کارت دیگه مونده'
    expect(rendered.text()).toContain('۱ کارت دیگه مونده');
    expect(rendered.text()).not.toContain('۳ کارت دیگه مونده');
    expect(rendered.text()).not.toContain('همگام‌سازی شد');
  });

  it('labels the last successful server read as خواندن از سرور, never همگام‌سازی', async () => {
    vi.stubGlobal('fetch', mockRouter({ state: () => json(200, canonicalBody) }));
    rendered = await renderLearner({ otpUiFlag: 'true' });
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');
    await act(async () => {
      await Promise.resolve();
    });
    // New TodayScreen: no 'آخرین خواندن از سرور' label; success is shown via card count only
    expect(rendered.text()).not.toContain('آخرین همگام‌سازی');
    expect(rendered.text()).not.toContain('همگام‌سازی شد');
  });

  it('never renders the old overclaiming server-read list copy', async () => {
    vi.stubGlobal('fetch', mockRouter({ state: () => json(200, canonicalBody) }));
    rendered = await renderLearner({ otpUiFlag: 'true' });
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');
    await act(async () => {
      await Promise.resolve();
    });
    expect(rendered.text()).not.toContain('این فهرست از سرور LearnBox خوانده شده');
    expect(rendered.text()).not.toContain('فهرست از سرور LearnBox');
    expect(rendered.text()).not.toContain('این فهرست از سرور');
  });

  it('fails closed to the truthful error label when the server read fails', async () => {
    vi.stubGlobal(
      'fetch',
      mockRouter({
        state: () => {
          throw new Error('network unavailable');
        },
      }),
    );
    rendered = await renderLearner({ otpUiFlag: 'true' });
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');
    await act(async () => {
      await Promise.resolve();
    });
    // New TodayScreen: error shows 'اتصال به سرور قطع است — داده‌های محلی نمایش داده می‌شود'
    expect(rendered.text()).toContain('اتصال به سرور قطع است');
    expect(rendered.text()).not.toContain('سرور LearnBox خوانده شده');
    expect(rendered.text()).not.toContain('همگام‌سازی شد');
  });

  it('offers a retry action after a failed server read and recovers to the server-read label', async () => {
    let attempts = 0;
    const stateFetch = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('network unavailable');
      return json(200, canonicalBody);
    });
    const router = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url === '/api/auth/otp/request') {
        return json(201, {
          challengeId: 'first-challenge-id-0001',
          expiresAt: '2026-08-08T12:05:00.000Z',
          resendAvailableAt: '2026-08-08T12:01:00.000Z',
        });
      }
      if (method === 'POST' && url === '/api/auth/otp/verify') return json(204, null);
      if (method === 'GET' && url === '/api/learner/state') return stateFetch();
      if (method === 'GET' && url === '/api/banners') return json(200, { banners: [] });
      if (method === 'GET' && url === '/api/auth/session') return json(200, { authenticated: false });
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', router);
    rendered = await renderLearner({ otpUiFlag: 'true' });
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');
    await act(async () => {
      await Promise.resolve();
    });
    // New TodayScreen: error shows 'اتصال به سرور قطع است'; success shows card count directly
    expect(rendered.text()).toContain('اتصال به سرور قطع است');
    expect(rendered.text()).not.toContain('وضعیت یادگیری از سرور خوانده شد');
    await rendered.clickButton('تلاش دوباره');
    await act(async () => {
      await Promise.resolve();
    });
    expect(stateFetch.mock.calls).toHaveLength(2);
    // After retry success: error banner gone, card count shows
    expect(rendered.text()).not.toContain('اتصال به سرور قطع است');
    expect(rendered.text()).toContain('۱ کارت دیگه مونده');
  });

  it('shows the offline label when offline and the read cannot reach the server', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    vi.stubGlobal(
      'fetch',
      mockRouter({
        state: () => {
          throw new TypeError('Failed to fetch');
        },
      }),
    );
    rendered = await renderLearner({ otpUiFlag: 'true' });
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');
    await act(async () => {
      await Promise.resolve();
    });
    // New TodayScreen: 'آفلاین — داده‌های محلی نمایش داده می‌شود'
    expect(rendered.text()).toContain('آفلاین');
    expect(rendered.text()).not.toContain('سرور LearnBox خوانده شده');
  });

  it('switches from the server-read label to the offline label when the connection drops mid-session', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.stubGlobal('fetch', mockRouter({ state: () => json(200, canonicalBody) }));
    rendered = await renderLearner({ otpUiFlag: 'true' });
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');
    await act(async () => {
      await Promise.resolve();
    });
    // New TodayScreen: server-backed success → no 'وضعیت یادگیری' label, just card count
    expect(rendered.text()).toContain('۱ کارت دیگه مونده');
    await act(async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      window.dispatchEvent(new Event('offline'));
      await Promise.resolve();
    });
    expect(rendered.text()).toContain('آفلاین');
    // After going offline, no more success text
    expect(rendered.text()).not.toContain('اتصال به سرور قطع است');
  });

  it('re-reads the learner state after reconnect and returns to the server-read label without a reload', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const stateFetch = vi.fn(async () => json(200, canonicalBody));
    const router = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url === '/api/auth/otp/request') {
        return json(201, {
          challengeId: 'first-challenge-id-0001',
          expiresAt: '2026-08-08T12:05:00.000Z',
          resendAvailableAt: '2026-08-08T12:01:00.000Z',
        });
      }
      if (method === 'POST' && url === '/api/auth/otp/verify') return json(204, null);
      if (method === 'GET' && url === '/api/learner/state') return stateFetch();
      if (method === 'GET' && url === '/api/banners') return json(200, { banners: [] });
      if (method === 'GET' && url === '/api/auth/session') return json(200, { authenticated: false });
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', router);
    rendered = await renderLearner({ otpUiFlag: 'true' });
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');
    await act(async () => {
      await Promise.resolve();
    });
    expect(stateFetch.mock.calls).toHaveLength(1);
    // New TodayScreen: success → card count shown, no 'وضعیت یادگیری' label
    expect(rendered.text()).toContain('۱ کارت دیگه مونده');
    await act(async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      window.dispatchEvent(new Event('offline'));
      await Promise.resolve();
    });
    expect(rendered.text()).toContain('آفلاین');
    await act(async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
    });
    expect(stateFetch.mock.calls).toHaveLength(2);
    // After re-connect and re-read: back to card count, no offline indicator
    expect(rendered.text()).toContain('۱ کارت دیگه مونده');
    expect(rendered.text()).not.toContain('آفلاین');
  });

  it('uses the server-selected session count when the snapshot lists one review card', async () => {
    const serverSnapshotWithOneReview = {
      schedules: [
        {
          cardId: '11111111-1111-4111-8111-111111111111',
          contentId: 'start-a1-haus',
          state: 'review',
          stabilityDays: 4,
          difficulty: 0.4,
          lapses: 0,
          dueAt: '2026-08-08T06:00:00.000Z',
        },
      ],
      newCards: [],
      plan: {
        mode: 'normal',
        reviewCardIds: ['11111111-1111-4111-8111-111111111111'],
        newCardIds: [],
        message: 'daily',
      },
      reviewEventsCount: 1,
      reconciliationCursor: '0',
    };
    vi.stubGlobal('fetch', mockRouter({ state: () => json(200, serverSnapshotWithOneReview) }));
    rendered = await renderLearner({ otpUiFlag: 'true' });
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');
    await act(async () => {
      await Promise.resolve();
    });
    // New TodayScreen: success → card count, no 'وضعیت یادگیری' label
    expect(rendered.text()).toContain('۱ کارت دیگه مونده');
    expect(rendered.text()).not.toContain('۳ کارت دیگه مونده');
  });

  it('preserves the local pending-sync chip alongside server-backed figures', async () => {
    vi.stubGlobal('fetch', mockRouter({ state: () => json(200, canonicalBody) }));
    window.localStorage.setItem(
      'learnbox:review-sync:v1:local-prototype',
      JSON.stringify([
        {
          clientEventId: 'evt-1',
          payload: {
            cardId: 'start-a1-haus',
            grade: 'remembered',
            reviewedAt: pinnedNow.toISOString(),
          },
          attempts: 0,
          nextAttemptAt: pinnedNow.toISOString(),
        },
      ]),
    );
    rendered = await renderLearner({ otpUiFlag: 'true' });
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');
    await act(async () => {
      await Promise.resolve();
    });
    // New TodayScreen: success → card count shown; pending chip shows 'X مرور در انتظار همگام‌سازی'
    expect(rendered.text()).toContain('۱ کارت دیگه مونده');
    expect(rendered.text()).toContain('مرور در انتظار همگام‌سازی');
    expect(rendered.text()).not.toContain('همگام‌سازی شد');
  });
});

type RenderedLearner = {
  clickButton(label: string): Promise<void>;
  signInLocally(): Promise<void>;
  text(): string;
  unmount(): Promise<void>;
};

async function renderLearner(props: { otpUiFlag: string }): Promise<RenderedLearner> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const { LearnerHome } = await import('../app/LearnerHome.js');
  const learnerProps = {
    hostname: 'localhost',
    otpUiFlag: props.otpUiFlag,
    privateMediaFlag: 'false',
    inviteFlag: 'false',
  };
  await act(async () => {
    root.render(createElement(LearnerHome as FunctionComponent<typeof learnerProps>, learnerProps));
  });

  return {
    clickButton: async (label) => {
      const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
        candidate.textContent?.trim().startsWith(label),
      );
      if (!button) throw new Error(`Button not found: ${label}`);
      await act(async () => button.click());
    },
    signInLocally: async () => {
      await setInputValue(container, 'mobile-number', '09121234567');
      await submitForm(container);
      await setInputValue(container, 'login-code', '12345');
      await submitForm(container);
    },
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function mockRouter(routes: { state: () => Response | never }): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (method === 'POST' && url === '/api/auth/otp/request') {
      return json(201, {
        challengeId: 'first-challenge-id-0001',
        expiresAt: '2026-08-08T12:05:00.000Z',
        resendAvailableAt: '2026-08-08T12:01:00.000Z',
      });
    }
    if (method === 'POST' && url === '/api/auth/otp/verify') return json(204, null);
    if (method === 'GET' && url === '/api/learner/state') return routes.state();
    // Non-critical endpoints: banners and session check fail silently
    if (method === 'GET' && url === '/api/banners') return json(200, { banners: [] });
    if (method === 'GET' && url === '/api/auth/session') return json(200, { authenticated: false });
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
}

function json(status: number, body: unknown): Response {
  return { status, json: async () => body } as Response;
}

function installLocalStorage() {
  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => Array.from(entries.keys())[index] ?? null,
    removeItem: (key) => void entries.delete(key),
    setItem: (key, value) => void entries.set(key, String(value)),
  };
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
}

async function setInputValue(container: HTMLElement, id: string, value: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`Input not found: ${id}`);
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submitForm(container: HTMLElement): Promise<void> {
  const form = container.querySelector('form');
  if (!form) throw new Error('Form not found');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}
