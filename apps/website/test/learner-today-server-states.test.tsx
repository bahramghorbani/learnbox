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
  plan: {
    mode: 'normal',
    reviewCardIds: ['11111111-1111-4111-8111-111111111111'],
    newCardIds: [],
    message: 'daily',
  },
  reviewEventsCount: 2,
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
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    rendered = await renderLearner({ otpUiFlag: 'false' });
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');
    expect(rendered.text()).toContain('این فهرست');
    expect(rendered.text()).toContain('دستگاه');
    expect(rendered.text()).not.toContain('سرور LearnBox خوانده شده');
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/learner/state')).toHaveLength(0);
  });

  it('shows server-backed figures only after a successful fetch and parse, without claiming acknowledgement', async () => {
    vi.stubGlobal('fetch', mockRouter({ state: () => json(200, canonicalBody) }));
    rendered = await renderLearner({ otpUiFlag: 'true' });
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');
    await act(async () => {
      await Promise.resolve();
    });
    expect(rendered.text()).toContain('سرور LearnBox خوانده شده');
    expect(rendered.text()).toContain('۱ کارت برای شروع');
    expect(rendered.text()).not.toContain('همگام‌سازی شد');
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
    expect(rendered.text()).toContain('خواندن از سرور ممکن نشد');
    expect(rendered.text()).toContain('دستگاه');
    expect(rendered.text()).not.toContain('سرور LearnBox خوانده شده');
    expect(rendered.text()).not.toContain('همگام‌سازی شد');
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
    expect(rendered.text()).toContain('آفلاین');
    expect(rendered.text()).not.toContain('سرور LearnBox خوانده شده');
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
    expect(rendered.text()).toContain('سرور LearnBox خوانده شده');
    expect(rendered.text()).toContain('۱ رویداد در انتظار همگام‌سازی');
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
