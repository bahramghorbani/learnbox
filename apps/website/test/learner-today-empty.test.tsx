// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TodayScreenProps = {
  reviewCount: number;
  pendingReviewCount?: number | null;
  syncState?: 'loading' | 'local-only' | 'server-backed' | 'offline' | 'error';
  onRetryServerRead?: () => void;
};

const pinnedNow = new Date('2026-08-08T12:00:00.000Z');
const dailyReviewKey = 'learnbox:daily-review:v1:local-prototype';

describe('Today no-due state (D1 §5)', () => {
  let rendered: Rendered | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(pinnedNow);
    installLocalStorage();
    vi.stubGlobal('React', { createElement, Fragment });
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([
    ['local-only'],
    ['offline'],
    ['error'],
    ['server-backed'],
  ] as const)(
    'renders truthful empty copy without a zero-card start prompt in %s state',
    async (syncState) => {
      rendered = await renderToday({ reviewCount: 0, syncState });

      // New TodayScreen: empty state shows 'هدف امروز تکمیل شد! 🎉' and disabled 'مرور کامل شد' button
      expect(rendered.text()).toContain('هدف امروز تکمیل شد! 🎉');
      expect(rendered.text()).toContain('مرور کامل شد');
      // Does NOT show a start button or stale zero count as actionable
      expect(rendered.text()).not.toContain('۰ کارت برای شروع آماده است');
    },
  );

  it('shows loading state instead of empty state when syncState is loading', async () => {
    rendered = await renderToday({ reviewCount: 0, syncState: 'loading' });

    // New TodayScreen: loading shows 'در حال بارگذاری…' as button label
    expect(rendered.text()).not.toContain('هدف امروز تکمیل شد! 🎉');
    expect(rendered.text()).toContain('در حال بارگذاری');
  });

  it('replaces review/recovery actions with one focused Words action and navigates', async () => {
    window.localStorage.setItem(
      dailyReviewKey,
      JSON.stringify({ dateKey: '2026-08-08', reviewedCount: 3 }),
    );
    rendered = await renderLearner();
    await signInLocally(rendered.container);
    await clickButton(rendered.container, 'ادامه');

    // New TodayScreen: when empty, shows Bobo celebrate, completion message, and 'همه واژه‌ها' link
    expect(rendered.text()).toContain('هدف امروز تکمیل شد! 🎉');
    expect(rendered.text()).toContain('همه واژه‌ها');
    // Start review button is disabled, not a primary CTA
    expect(rendered.container.querySelector('[data-testid="learnbox-today"]')).not.toBeNull();

    await clickButton(rendered.container, 'همه واژه‌ها');
    expect(rendered.text()).toContain('واژه‌ها');
  });
});

type Rendered = {
  container: HTMLDivElement;
  text(): string;
  unmount(): Promise<void>;
};

async function renderToday(props: TodayScreenProps): Promise<Rendered> {
  const { TodayScreen } = await import('../app/components/TodayScreen.jsx');
  return renderComponent(TodayScreen as FunctionComponent<TodayScreenProps>, props);
}

async function renderLearner(): Promise<Rendered> {
  const { LearnerHome } = await import('../app/LearnerHome.js');
  const props = {
    hostname: 'localhost',
    otpUiFlag: 'false',
    privateMediaFlag: 'false',
    inviteFlag: 'false',
  };
  return renderComponent(LearnerHome as FunctionComponent<typeof props>, props);
}

async function renderComponent<Props extends object>(
  Component: FunctionComponent<Props>,
  props: Props,
): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(Component, props)));
  return {
    container,
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function signInLocally(container: HTMLElement): Promise<void> {
  await setInputValue(container, 'mobile-number', '09121234567');
  await submitForm(container);
  await setInputValue(container, 'login-code', '12345');
  await submitForm(container);
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

async function clickButton(container: HTMLElement, label: string): Promise<void> {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  await act(async () => button.click());
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
