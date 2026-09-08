// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LearnerNav } from '../app/components/LearnerNav';
import { ProfileScreen } from '../app/components/ProfileScreen';
import { SettingsScreen } from '../app/components/SettingsScreen';
import {
  loadSoundPreference,
  parseSoundPreferenceRecord,
  resetSoundPreferenceMemory,
  saveSoundPreference,
  soundPreferenceStorageKey,
  type SoundPreferenceDurability,
} from '../app/sound-preference';

const reviewSyncKey = 'learnbox:review-sync:v1:local-prototype';
const onboardingGoalKey = 'learnbox:onboarding-goal:v1:local-prototype';

it('keeps one global NetworkStatus instead of duplicating fixed live regions on learner surfaces', () => {
  const networkStatusRenderCount = [
    resolve(process.cwd(), 'app/layout.tsx'),
    resolve(process.cwd(), 'app/components/ProfileScreen.tsx'),
    resolve(process.cwd(), 'app/components/SettingsScreen.tsx'),
  ].reduce(
    (count, file) => count + (readFileSync(file, 'utf8').match(/<NetworkStatus\b/g)?.length ?? 0),
    0,
  );

  expect(networkStatusRenderCount).toBe(1);
});

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

  it('shows the device-local pronunciation switch and only approved informational rows', async () => {
    rendered = await renderSettings({ goal: 'travel' });

    expect(rendered.text()).toContain('پخش تلفظ');
    expect(rendered.text()).toContain('اندازهٔ متن');
    expect(rendered.text()).toContain('زبان برنامه');
    expect(rendered.text()).toContain('فارسی');
    expect(rendered.container.querySelectorAll('[role="switch"]')).toHaveLength(1);
    expect(rendered.text()).not.toContain('یادآور');
    expect(rendered.text()).not.toContain('خروج');
    expect(rendered.text()).not.toContain('حذف حساب');
    expect(rendered.container.querySelectorAll('select')).toHaveLength(0);
  });

  it('renders the pronunciation switch as a real toggle defaulting to enabled', async () => {
    rendered = await renderSettings({ goal: 'travel' });

    const soundSwitch = rendered.container.querySelector<HTMLInputElement>('input[role="switch"]');
    expect(soundSwitch).not.toBeNull();
    expect(soundSwitch?.getAttribute('aria-checked')).toBe('true');
    expect(soundSwitch?.getAttribute('aria-label')).toBe('پخش تلفظ');
    expect(rendered.text()).toContain('روی این دستگاه');
  });

  it('toggles the pronunciation preference and announces the durable save politely', async () => {
    let toggledTo: boolean | null = null;
    rendered = await renderSettings({
      goal: 'travel',
      onToggleSound: async (enabled) => {
        toggledTo = enabled;
        return 'durable';
      },
    });

    await toggleSoundSwitch(rendered.container);

    expect(toggledTo).toBe(false);
    const status = rendered.container.querySelector<HTMLElement>('.settings-save-status');
    expect(status?.getAttribute('role')).toBe('status');
    expect(rendered.text()).toContain('تنظیم روی این دستگاه ذخیره شد.');
  });

  it('labels a session-only save as non-durable when persistent storage is denied', async () => {
    rendered = await renderSettings({
      goal: 'travel',
      onToggleSound: async (enabled) => (enabled ? 'durable' : 'session'),
    });

    await toggleSoundSwitch(rendered.container);

    expect(rendered.text()).toContain('تا پایان این نشست');
    expect(rendered.text()).not.toContain('تنظیم روی این دستگاه ذخیره شد.');
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

describe('versioned sound preference record', () => {
  beforeEach(() => {
    resetSoundPreferenceMemory();
    installLocalStorage();
  });

  it('defaults to enabled when no record exists', () => {
    expect(parseSoundPreferenceRecord(null)).toBe(true);
    expect(window.localStorage.getItem(soundPreferenceStorageKey)).toBeNull();
  });

  it('reads a stored version-1 enabled record', () => {
    window.localStorage.setItem(soundPreferenceStorageKey, '{"version":1,"enabled":true}');
    expect(loadSoundPreference()).toBe(true);
  });

  it('reads a stored version-1 disabled record', () => {
    window.localStorage.setItem(soundPreferenceStorageKey, '{"version":1,"enabled":false}');
    expect(loadSoundPreference()).toBe(false);
  });

  it('recovers to enabled for malformed records without touching unrelated keys', () => {
    window.localStorage.setItem(soundPreferenceStorageKey, '{not-json');
    window.localStorage.setItem(onboardingGoalKey, 'life');
    expect(parseSoundPreferenceRecord('{not-json')).toBe(true);
    expect(loadSoundPreference()).toBe(true);
    // Recovery is read-only: unrelated device-local keys and the corrupt record stay untouched.
    expect(window.localStorage.getItem(onboardingGoalKey)).toBe('life');
    expect(window.localStorage.getItem(soundPreferenceStorageKey)).toBe('{not-json');
  });

  it('recovers to enabled for unknown future versions', () => {
    expect(parseSoundPreferenceRecord('{"version":2,"enabled":false}')).toBe(true);
    expect(parseSoundPreferenceRecord('{"version":1,"enabled":"false"}')).toBe(true);
    expect(parseSoundPreferenceRecord('[]')).toBe(true);
  });

  it('saves an explicit version-1 record durably', () => {
    expect(saveSoundPreference(false)).toBe('durable');
    expect(JSON.parse(window.localStorage.getItem(soundPreferenceStorageKey) ?? 'null')).toEqual({
      version: 1,
      enabled: false,
    });
  });

  it('keeps the preference usable for the open session when durable storage is denied', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    expect(saveSoundPreference(false)).toBe('session');
    expect(loadSoundPreference()).toBe(false);
  });
});

describe('learner Profile and Settings shell flows', () => {
  let rendered: RenderedLearner | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
    installLocalStorage();
    resetSoundPreferenceMemory();
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

  it('persists an off pronunciation preference and disables audio pronunciation in sessions', async () => {
    window.localStorage.setItem(onboardingGoalKey, 'life');
    const playMock = vi.fn(() => Promise.resolve());
    vi.stubGlobal(
      'Audio',
      class {
        onplay: (() => void) | null = null;
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        play = playMock;
      },
    );
    rendered = await renderLearner();
    await rendered.signInLocally();

    // The preference defaults to enabled, so the first session plays word audio.
    await rendered.clickButton('شروع مرور');
    await rendered.clickButton('شنیدن تلفظ');
    expect(playMock).toHaveBeenCalledTimes(1);

    await rendered.clickButton('خروج از جلسه');
    await rendered.clickButton('پروفایل');
    await rendered.clickButton('تنظیمات');
    expect(
      rendered.container.querySelector('input[role="switch"]')?.getAttribute('aria-checked'),
    ).toBe('true');

    await toggleSoundSwitch(rendered.container);

    // The toggle persists an explicit version-1 record.
    expect(JSON.parse(window.localStorage.getItem(soundPreferenceStorageKey) ?? 'null')).toEqual({
      version: 1,
      enabled: false,
    });
    expect(
      rendered.container.querySelector('input[role="switch"]')?.getAttribute('aria-checked'),
    ).toBe('false');
    expect(rendered.text()).toContain('تنظیم روی این دستگاه ذخیره شد.');

    // The disabled preference stops the Audio path in a later session.
    await rendered.clickButton('بازگشت به پروفایل');
    await rendered.clickButton('امروز');
    await rendered.clickButton('ادامهٔ مرور');
    const audioButton = rendered.container.querySelector<HTMLButtonElement>('button.audio-button');
    expect(audioButton?.disabled).toBe(true);
    expect(rendered.text()).toContain('تلفظ خاموش است');
    await act(async () => {
      audioButton?.click();
    });
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it('blocks speech-synthesis pronunciation when the preference is off', async () => {
    window.localStorage.setItem(onboardingGoalKey, 'life');
    // No local-preview media route on a non-local host: the card button falls
    // back to speech synthesis, which must stay blocked when pronunciation is off.
    window.localStorage.setItem(
      soundPreferenceStorageKey,
      JSON.stringify({ version: 1, enabled: false }),
    );
    const speakMock = vi.fn();
    const cancelMock = vi.fn();
    vi.stubGlobal('speechSynthesis', { cancel: cancelMock, speak: speakMock });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        lang = '';
        rate = 0;
        text: string;
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      },
    );

    rendered = await renderLearner({ hostname: 'learnbox.app' });
    await rendered.signInLocally();
    await rendered.clickButton('شروع مرور');

    const speechButton = rendered.container.querySelector<HTMLButtonElement>('button.audio-button');
    expect(speechButton?.disabled).toBe(true);
    expect(rendered.text()).toContain('تلفظ خاموش است');
    await act(async () => {
      speechButton?.click();
    });
    expect(speakMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('recovers an enabled default from a malformed record without touching other keys', async () => {
    window.localStorage.setItem(onboardingGoalKey, 'life');
    window.localStorage.setItem(soundPreferenceStorageKey, '{not-json');
    rendered = await renderLearner();
    await rendered.signInLocally();

    await rendered.clickButton('پروفایل');
    await rendered.clickButton('تنظیمات');
    expect(rendered.text()).toContain('پخش تلفظ');
    expect(
      rendered.container.querySelector('input[role="switch"]')?.getAttribute('aria-checked'),
    ).toBe('true');
    // The goal row still reads its own key and the corrupt record is left intact.
    expect(rendered.text()).toContain('زندگی در آلمان');
    expect(window.localStorage.getItem(soundPreferenceStorageKey)).toBe('{not-json');
  });

  it('keeps the pronunciation toggle usable and labels it non-durable when storage is denied', async () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    rendered = await renderLearner();
    await rendered.signInLocally();
    const onboardingContinue = Array.from(rendered.container.querySelectorAll('button')).some(
      (button) => button.textContent?.trim().startsWith('ادامه'),
    );
    if (onboardingContinue) await rendered.clickButton('ادامه');
    await rendered.clickButton('پروفایل');
    await rendered.clickButton('تنظیمات');
    expect(rendered.text()).toContain('پخش تلفظ');

    await toggleSoundSwitch(rendered.container);

    expect(
      rendered.container.querySelector('input[role="switch"]')?.getAttribute('aria-checked'),
    ).toBe('false');
    // Denied durable storage stays usable through the open-session memory
    // fallback and is labelled non-durable, never presented as saved forever.
    expect(rendered.text()).toContain('تا پایان این نشست');
    expect(rendered.text()).not.toContain('تنظیم روی این دستگاه ذخیره شد.');
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
  onToggleSound?: (enabled: boolean) => Promise<SoundPreferenceDurability>;
  soundEnabled?: boolean;
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
        onToggleSound: async (): Promise<SoundPreferenceDurability> => 'durable',
        soundEnabled: true,
        ...props,
      }),
    );
  });

  return renderHelpers(container, root);
}

async function toggleSoundSwitch(container: HTMLElement): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('input[role="switch"]');
  if (!input) throw new Error('Sound preference switch not found.');
  await act(async () => {
    input.click();
  });
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

async function renderLearner(
  overrides?: Partial<{
    hostname: string;
    inviteFlag: string;
    otpUiFlag: string;
    privateMediaFlag: string;
  }>,
): Promise<RenderedLearner> {
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
    ...overrides,
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
