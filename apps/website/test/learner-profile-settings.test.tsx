// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LearnerNav } from '../app/components/LearnerNav';
import { ProfileScreen } from '../app/components/ProfileScreen';
import { SettingsScreen } from '../app/components/SettingsScreen';

const reviewSyncKey = 'learnbox:review-sync:v1:local-prototype';
const onboardingGoalKey = 'learnbox:onboarding-goal:v1:local-prototype';

describe('ProfileScreen', () => {
  let rendered: Rendered | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
    installLocalStorage();
  });

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows the neutral account label and the real device-local learning goal', async () => {
    rendered = await renderProfile({ goal: 'travel', pendingReviewCount: 0 });

    expect(rendered.container.querySelector('[data-testid="learnbox-profile"]')).not.toBeNull();
    expect(rendered.text()).toContain('پروفایل');
    // Neutral static account copy: no fake personal identity.
    expect(rendered.text()).toContain('حساب LearnBox');
    expect(rendered.text()).not.toContain('0912');
    expect(rendered.text()).not.toMatch(/نام:\s*[^ا-ی ]/);
    expect(rendered.text()).not.toContain('سارا');
    expect(rendered.text()).not.toContain('علی');
    // Goal comes from device-local storage only.
    expect(rendered.text()).toContain('سفر و ارتباط');
    expect(rendered.text()).toContain('فقط در این دستگاه');
  });

  it('shows the pending review count only when the local queue is non-empty', async () => {
    rendered = await renderProfile({ goal: 'life', pendingReviewCount: 3 });

    expect(rendered.text()).toContain('۳ پاسخ');
    expect(rendered.text()).toContain('هنوز از سرور تأیید نشده است');
  });

  it('hides the pending chip and any sync claim at zero', async () => {
    rendered = await renderProfile({ goal: 'career', pendingReviewCount: 0 });

    expect(rendered.text()).not.toContain('تأیید نشده است');
    expect(rendered.text()).toContain('رویدادی در صف همگام‌سازی پاسخ‌های مرور نیست.');
    // The device-local truth note never claims a server-synced state.
    expect(rendered.text()).toContain('همگام‌سازی خودکار هنوز فعال نیست');
  });

  it('shows the shared offline banner while Profile remains locally usable', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    rendered = await renderProfile({ goal: 'life', pendingReviewCount: 0 });

    expect(rendered.text()).toContain('اینترنت قطع است');
    expect(rendered.text()).toContain('پاسخ‌ها روی همین دستگاه امن می‌مانند');
  });

  it('offers a goal picker when no device-local goal exists', async () => {
    let choseGoal = false;
    rendered = await renderProfile({
      goal: null,
      pendingReviewCount: 0,
      onChooseGoal: () => {
        choseGoal = true;
      },
    });

    await rendered.clickButton('انتخاب هدف');
    expect(choseGoal).toBe(true);
  });

  it('opens Settings from the account row and exposes real Support/Privacy links', async () => {
    let openedSettings = false;
    rendered = await renderProfile({
      goal: 'career',
      pendingReviewCount: 1,
      onOpenSettings: () => {
        openedSettings = true;
      },
    });

    await rendered.clickButton('تنظیمات');
    expect(openedSettings).toBe(true);

    const links = Array.from(rendered.container.querySelectorAll('a'));
    const privacy = links.find((link) => link.textContent?.includes('حریم خصوصی'));
    const support = links.find((link) => link.textContent?.includes('پشتیبانی'));
    expect(privacy?.getAttribute('href')).toBe('https://learnboxapp.com/privacy');
    expect(privacy?.getAttribute('target')).toBe('_blank');
    expect(privacy?.getAttribute('rel')).toContain('noreferrer');
    expect(support?.getAttribute('href')).toBe('mailto:hi@learnboxapp.com');
  });

  it('exposes no sign-out, deletion, purchase, reminder or fake-account controls', async () => {
    rendered = await renderProfile({ goal: 'life', pendingReviewCount: 0 });

    const text = rendered.text();
    expect(text).not.toContain('خروج');
    expect(text).not.toContain('حذف حساب');
    expect(text).not.toContain('خرید');
    expect(text).not.toContain('بسته‌ها');
    expect(text).not.toContain('اشتراک');
    expect(text).not.toContain('یادآور');
    expect(text).not.toContain('پخش تلفظ');
    expect(rendered.container.querySelectorAll('select')).toHaveLength(0);
  });
});

describe('SettingsScreen (Profile child)', () => {
  let rendered: Rendered | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
    installLocalStorage();
  });

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows the labelled back action and returns to Profile', async () => {
    let wentBack = false;
    rendered = await renderSettings({
      goal: 'life',
      onBack: () => {
        wentBack = true;
      },
    });

    expect(rendered.container.querySelector('[data-testid="learnbox-settings"]')).not.toBeNull();
    await rendered.clickButton('بازگشت به پروفایل');
    expect(wentBack).toBe(true);
  });

  it('keeps the device-local goal visible and offers the goal editor', async () => {
    let choseGoal = false;
    rendered = await renderSettings({
      goal: 'career',
      onChooseGoal: () => {
        choseGoal = true;
      },
    });

    expect(rendered.text()).toContain('هدف یادگیری');
    expect(rendered.text()).toContain('کار و دانشگاه');
    expect(rendered.text()).toContain('فقط در این دستگاه');
    await rendered.clickButton('هدف یادگیری');
    expect(choseGoal).toBe(true);
  });

  it('shows the shared offline banner while Settings remains locally usable', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    rendered = await renderSettings({ goal: 'life' });

    expect(rendered.text()).toContain('اینترنت قطع است');
    expect(rendered.text()).toContain('هدف یادگیری');
  });

  it('shows only informational accessibility/language rows and no fake controls', async () => {
    rendered = await renderSettings({ goal: 'travel' });

    expect(rendered.text()).toContain('اندازهٔ متن');
    expect(rendered.text()).toContain('زبان برنامه');
    expect(rendered.text()).toContain('فارسی');
    expect(rendered.text()).not.toContain('پخش تلفظ');
    expect(rendered.text()).not.toContain('یادآور');
    expect(rendered.text()).not.toContain('خروج');
    expect(rendered.text()).not.toContain('حذف حساب');
    expect(rendered.container.querySelectorAll('[role="switch"]')).toHaveLength(0);
    expect(rendered.container.querySelectorAll('select')).toHaveLength(0);
  });
});

describe('LearnerNav', () => {
  it('renders Profile as the fourth persistent destination with aria-current', async () => {
    vi.stubGlobal('React', { createElement, Fragment });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          LearnerNav as FunctionComponent<{ current: string; onNavigate: () => void }>,
          {
            current: 'profile',
            onNavigate: () => {},
          },
        ),
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'امروز',
      'واژه‌ها',
      'پیشرفت',
      'پروفایل',
    ]);
    const active = buttons.find((button) => button.textContent?.trim() === 'پروفایل');
    expect(active?.getAttribute('aria-current')).toBe('page');

    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
});

describe('learner Profile and Settings shell flows', () => {
  let rendered: RenderedLearner | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
    installLocalStorage();
  });

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reaches Profile from the fourth nav destination with the real goal', async () => {
    window.localStorage.setItem(onboardingGoalKey, 'life');
    rendered = await renderLearner();
    await rendered.signInLocally();

    expect(rendered.navLabels()).toContain('پروفایل');
    await rendered.clickButton('پروفایل');
    expect(rendered.container.querySelector('[data-testid="learnbox-profile"]')).not.toBeNull();
    expect(rendered.text()).toContain('حساب LearnBox');
    expect(rendered.text()).toContain('زندگی در آلمان');
    expect(rendered.text()).toContain('فقط در این دستگاه');
    expect(rendered.text()).toContain('رویدادی در صف همگام‌سازی پاسخ‌های مرور نیست.');
  });

  it('shows the real queued review count on Profile', async () => {
    window.localStorage.setItem(onboardingGoalKey, 'life');
    window.localStorage.setItem(
      reviewSyncKey,
      JSON.stringify([
        {
          clientEventId: 'profile-test-1',
          payload: {
            cardId: 'start-a1-haus',
            grade: 'remembered',
            reviewedAt: '2026-08-08T09:00:00.000Z',
          },
          attempts: 0,
          nextAttemptAt: '2026-08-08T09:00:00.000Z',
        },
        {
          clientEventId: 'profile-test-2',
          payload: {
            cardId: 'start-a1-tisch',
            grade: 'hard',
            reviewedAt: '2026-08-08T09:05:00.000Z',
          },
          attempts: 0,
          nextAttemptAt: '2026-08-08T09:05:00.000Z',
        },
      ]),
    );
    rendered = await renderLearner();
    await rendered.signInLocally();

    await rendered.clickButton('پروفایل');
    expect(rendered.text()).toContain('۲ پاسخ');
    expect(rendered.text()).toContain('هنوز از سرور تأیید نشده است');
  });

  it('opens Settings from Profile and restores focus to the Settings row on back', async () => {
    window.localStorage.setItem(onboardingGoalKey, 'life');
    rendered = await renderLearner();
    await rendered.signInLocally();

    await rendered.clickButton('پروفایل');
    await rendered.clickButton('تنظیمات');
    expect(rendered.container.querySelector('[data-testid="learnbox-settings"]')).not.toBeNull();
    expect(rendered.text()).toContain('هدف یادگیری');
    expect(rendered.activeElementIsSettingsHeading()).toBe(true);

    await rendered.clickButton('بازگشت به پروفایل');
    expect(rendered.container.querySelector('[data-testid="learnbox-profile"]')).not.toBeNull();
    // Back semantics restore keyboard focus to the row that opened Settings.
    expect(document.activeElement?.textContent?.trim().startsWith('تنظیمات')).toBe(true);
  });

  it('restores focus to the learning-goal row after editing from Settings', async () => {
    window.localStorage.setItem(onboardingGoalKey, 'life');
    rendered = await renderLearner();
    await rendered.signInLocally();

    await rendered.clickButton('پروفایل');
    await rendered.clickButton('تنظیمات');
    await rendered.clickButton('هدف یادگیری');
    expect(rendered.text()).toContain('برای چه چیزی آلمانی می‌خوانی؟');

    await rendered.clickButton('ادامه');
    expect(rendered.container.querySelector('[data-testid="learnbox-settings"]')).not.toBeNull();
    expect(document.activeElement?.textContent?.trim().startsWith('هدف یادگیری')).toBe(true);
  });

  it('keeps Profile truthful when device storage is denied', async () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    rendered = await renderLearner();
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');

    await rendered.clickButton('پروفایل');
    expect(rendered.container.querySelector('[data-testid="learnbox-profile"]')).not.toBeNull();
    expect(rendered.text()).toContain('حساب LearnBox');
    expect(rendered.text()).toContain('فقط در این دستگاه');
    // The onboarding goal still reads back from the in-memory session fallback.
    expect(rendered.text()).toContain('زندگی در آلمان');
  });
});

type Rendered = {
  clickButton(label: string): Promise<void>;
  container: HTMLElement;
  text(): string;
  unmount(): Promise<void>;
};

type ProfileScreenProps = {
  goal?: 'life' | 'career' | 'travel' | null;
  onChooseGoal?: () => void;
  onNavigate?: () => void;
  onOpenSettings?: () => void;
  pendingReviewCount?: number;
};

type SettingsScreenProps = {
  goal?: 'life' | 'career' | 'travel';
  onBack?: () => void;
  onChooseGoal?: () => void;
};

async function renderProfile(props: ProfileScreenProps): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await act(async () => {
    root.render(
      createElement(ProfileScreen as FunctionComponent<ProfileScreenProps>, {
        goal: 'life',
        onChooseGoal: () => {},
        onNavigate: () => {},
        onOpenSettings: () => {},
        pendingReviewCount: 0,
        ...props,
      }),
    );
  });

  return renderHelpers(container, root);
}

async function renderSettings(props: SettingsScreenProps): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await act(async () => {
    root.render(
      createElement(SettingsScreen as FunctionComponent<SettingsScreenProps>, {
        goal: 'life',
        onBack: () => {},
        onChooseGoal: () => {},
        ...props,
      }),
    );
  });

  return renderHelpers(container, root);
}

function renderHelpers(container: HTMLElement, root: ReturnType<typeof createRoot>): Rendered {
  return {
    clickButton: async (label) => clickButtonStartingWith(container, label),
    container,
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

type RenderedLearner = Rendered & {
  activeElementIsSettingsHeading(): boolean;
  navLabels(): string[];
  signInLocally(): Promise<void>;
};

async function renderLearner(): Promise<RenderedLearner> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const { LearnerHome } = await import('../app/LearnerHome.js');
  const props = {
    hostname: 'localhost',
    otpUiFlag: 'false',
    privateMediaFlag: 'false',
    inviteFlag: 'false',
  };
  await act(async () => {
    root.render(createElement(LearnerHome as FunctionComponent<typeof props>, props));
  });

  const base = renderHelpers(container, root);
  return {
    ...base,
    activeElementIsSettingsHeading: () => {
      const heading = container.querySelector<HTMLHeadingElement>('#settings-title');
      return heading !== null && document.activeElement === heading;
    },
    navLabels: () =>
      Array.from(container.querySelectorAll('.learner-nav button')).map(
        (button) => button.textContent?.trim() ?? '',
      ),
    signInLocally: async () => {
      await setInputValue(container, 'mobile-number', '09121234567');
      await submitForm(container);
      await setInputValue(container, 'login-code', '12345');
      await submitForm(container);
    },
  };
}

async function setInputValue(container: HTMLElement, id: string, value: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`Input not found: ${id}`);
  await act(async () => {
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submitForm(container: HTMLElement): Promise<void> {
  const form = container.querySelector('form');
  if (!form) throw new Error('Form not found.');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

async function clickButtonStartingWith(container: HTMLElement, label: string): Promise<void> {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) =>
      candidate.textContent?.trim().startsWith(label) ||
      candidate.textContent?.trim().endsWith(label),
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  await act(async () => {
    button.focus();
    button.click();
  });
}

function installLocalStorage() {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
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
