// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Start daily session rotates with the calendar date. Pin the clock so the
// three-card session is deterministic and the asserted card ids stay stable.
const pinnedNow = new Date('2026-08-08T12:00:00.000Z');

const reviewSyncKey = 'learnbox:review-sync:v1:local-prototype';
const reviewSessionKey = 'learnbox:review-session:v1:local-prototype';
const dailyReviewKey = 'learnbox:daily-review:v1:local-prototype';
const personalVocabularyKey = 'learnbox:personal-vocabulary:v1:local-prototype';
const personalVocabularySyncKey = 'learnbox:personal-vocabulary-sync:v1:local-prototype';

describe('learner core flows', () => {
  let rendered: RenderedLearner | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(pinnedNow);
    installLocalStorage();
    seedStorage();
  });

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('completes the full onboarding → review → grade → completion flow', async () => {
    rendered = await renderLearner();

    // 1. Sign in with local prototype auth (invite gate is hidden in local mode).
    expect(rendered.text()).toContain('شمارهٔ موبایل');
    await rendered.signInLocally();

    // 2. Complete onboarding goal.
    expect(rendered.text()).toContain('برای چه چیزی آلمانی می‌خوانی؟');
    await rendered.clickButton('ادامه');

    // 3. Today screen with the three-card Start session.
    expect(rendered.text()).toContain('مرورهای امروز');
    expect(rendered.text()).toContain('3 کارت برای شروع');

    // 4. Start review → first card front.
    await rendered.startReview();
    expect(rendered.text()).toContain('1 از 3');
    expect(rendered.text()).toContain('برای دیدن معنی');

    // 5. Flip and grade the first card.
    await rendered.flipAndGrade('یادم آمد');
    expect(rendered.text()).toContain('2 از 3');

    // 6. Grade the remaining cards.
    await rendered.flipAndGrade('یادم آمد');
    expect(rendered.text()).toContain('3 از 3');
    await rendered.flipAndGrade('یادم آمد');

    // 7. Completion screen records the session.
    expect(rendered.text()).toContain('آفرین، ثبت شد.');
    await rendered.clickButton('بازگشت به امروز');
    expect(rendered.text()).toContain('مرورهای امروز');
  });

  it('keeps grade events in the offline review queue', async () => {
    rendered = await renderLearner();
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');
    await rendered.startReview();

    await rendered.flipAndGrade('یادم آمد');
    await rendered.flipAndGrade('سخت بود');
    await rendered.flipAndGrade('فراموش کردم');

    const queue = loadQueue();
    expect(queue).toHaveLength(3);
    expect(queue.map((event) => event.payload.grade)).toEqual(['remembered', 'hard', 'forgot']);
    expect(rendered.text()).toContain('3 پاسخ برای همگام‌سازی امن نگه‌داری شد.');
  });

  it('resumes an interrupted review from the saved session index', async () => {
    // Simulate a partially completed session persisted before render.
    window.localStorage.setItem(reviewSessionKey, JSON.stringify({ nextCardIndex: 2, version: 1 }));

    rendered = await renderLearner();
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');

    // Today screen shows the resume action instead of a fresh start.
    expect(rendered.text()).toContain('ادامهٔ مرور');
    await rendered.startReview();
    expect(rendered.text()).toContain('3 از 3');
  });

  it('shows the calm streak and daily progress after grading', async () => {
    rendered = await renderLearner();
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');

    // Today screen shows a fresh streak before any grading.
    expect(rendered.text()).toContain('شروع تازه');

    await rendered.startReview();
    await rendered.flipAndGrade('یادم آمد');
    await rendered.flipAndGrade('یادم آمد');
    await rendered.flipAndGrade('یادم آمد');

    // Completion screen records the session; daily progress is persisted.
    expect(rendered.text()).toContain('آفرین، ثبت شد.');
    const daily = loadDailyProgress();
    expect(daily).toMatchObject({ dateKey: '2026-08-08', reviewedCount: 3 });
  });

  it('adds a personal word and queues it for secure sync', async () => {
    rendered = await renderLearner();
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');
    await rendered.clickButton('واژه‌ها');

    await rendered.addPersonalWord('der Apfel', 'سیب');

    const vocab = loadVocabulary();
    expect(vocab.some((entry) => entry.german === 'der Apfel')).toBe(true);
    expect(loadVocabularySyncQueue().some((event) => event.payload.german === 'der Apfel')).toBe(
      true,
    );
    expect(rendered.text()).toContain('1 واژه برای همگام‌سازی امن آماده است.');
  });

  it('refuses a duplicate personal word', async () => {
    rendered = await renderLearner();
    await rendered.signInLocally();
    await rendered.clickButton('ادامه');
    await rendered.clickButton('واژه‌ها');

    // The first three Start cards are pre-seeded as personal words.
    await rendered.addPersonalWord('das Haus', 'خانه');
    expect(rendered.text()).toContain('این واژه از قبل در فهرست تو هست.');
  });
});

type RenderedLearner = {
  addPersonalWord(german: string, persian: string): Promise<void>;
  clickButton(label: string): Promise<void>;
  flipAndGrade(grade: string): Promise<void>;
  signInLocally(): Promise<void>;
  startReview(): Promise<void>;
  text(): string;
  unmount(): Promise<void>;
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

  const signInLocally = async () => {
    await setInputValue(container, 'mobile-number', '09121234567');
    await submitForm(container);
    await setInputValue(container, 'login-code', '12345');
    await submitForm(container);
  };

  return {
    addPersonalWord: async (german: string, persian: string) => {
      await clickButtonStartingWith(container, 'افزودن واژه');
      const inputs = Array.from(
        container.querySelectorAll<HTMLInputElement>('.add-word-form input'),
      );
      const [germanInput, persianInput] = inputs;
      if (!germanInput || !persianInput) throw new Error('Add-word inputs not found.');
      await setValue(germanInput, german);
      await setValue(persianInput, persian);
      await submitForm(container);
    },
    clickButton: async (label) => clickButtonStartingWith(container, label),
    flipAndGrade: async (grade) => {
      await clickButtonStartingWith(container, 'برای دیدن معنی');
      await clickButtonStartingWith(container, grade);
    },
    signInLocally,
    startReview: async () => {
      const button = Array.from(container.querySelectorAll('button')).find(
        (candidate) =>
          candidate.textContent?.trim().startsWith('شروع مرور') ||
          candidate.textContent?.trim().startsWith('ادامهٔ مرور'),
      );
      if (!button) throw new Error('Start/resume review button not found.');
      await act(async () => button.click());
    },
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

type QueuedReview = { payload: { grade: string } };
type QueuedPersonalVocabulary = { payload: { german: string } };
type PersonalVocabularyEntry = { german: string };

function loadQueue(): QueuedReview[] {
  const raw = window.localStorage.getItem(reviewSyncKey);
  return raw ? JSON.parse(raw) : [];
}

function loadVocabulary(): PersonalVocabularyEntry[] {
  const raw = window.localStorage.getItem(personalVocabularyKey);
  return raw ? JSON.parse(raw) : [];
}

function loadDailyProgress(): { dateKey: string; reviewedCount: number } | null {
  const raw = window.localStorage.getItem(dailyReviewKey);
  return raw ? JSON.parse(raw) : null;
}

function loadVocabularySyncQueue(): QueuedPersonalVocabulary[] {
  const raw = window.localStorage.getItem(personalVocabularySyncKey);
  return raw ? JSON.parse(raw) : [];
}

function seedStorage() {
  // The first three Start cards (das Haus / der Tisch / die Tür) are already seeded
  // in-memory by LearnerHome. Do not seed the onboarding goal so the OnboardingGoal
  // screen is exercised by the flow tests that call `ادامه`.
}

async function setInputValue(container: HTMLElement, id: string, value: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`Input not found: ${id}`);
  await setValue(input, value);
}

async function setValue(input: HTMLInputElement, value: string): Promise<void> {
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
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.trim().startsWith(label),
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
