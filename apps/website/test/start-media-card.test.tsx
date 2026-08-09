// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StartMediaVisual } from '../app/components/StartMediaVisual';

// The Start daily session rotates with the calendar date. Pin the clock so the
// three-card session is deterministic and the asserted card ids stay stable.
const pinnedNow = new Date('2026-08-08T12:00:00.000Z');

describe('Start card media visual', () => {
  let rendered: RenderedMedia | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(pinnedNow);
  });

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders only the same-origin private image in private-session mode', async () => {
    rendered = await renderMedia('private-session');

    expect(rendered.image()?.getAttribute('src')).toBe('/api/private-media/start-a1-001/image');
    expect(rendered.text()).toContain('رسانهٔ محافظت‌شدهٔ آلفا');
  });

  it('keeps localhost media explicitly labelled as a local QA preview', async () => {
    rendered = await renderMedia('local-preview');

    expect(rendered.image()?.getAttribute('src')).toBe(
      '/api/local-preview-media/start-a1-001/image',
    );
    expect(rendered.text()).toContain('فقط برای بررسی محلی');
  });

  it('renders no media route in placeholder mode', async () => {
    rendered = await renderMedia('placeholder');

    expect(rendered.image()).toBeNull();
    expect(rendered.text()).toContain('در حال آماده‌سازی است');
  });

  it('returns to the neutral placeholder after an image route fails', async () => {
    rendered = await renderMedia('private-session');

    await rendered.failImage();

    expect(rendered.image()).toBeNull();
    expect(rendered.text()).toContain('رسانهٔ این کارت اکنون در دسترس نیست');
  });
});

describe('learner page media attachment boundary', () => {
  let renderedPage: RenderedLearnerPage | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(pinnedNow);
  });

  afterEach(async () => {
    await renderedPage?.unmount();
    renderedPage = undefined;
    const storage = Object.getOwnPropertyDescriptor(window, 'localStorage')?.value as
      Storage | undefined;
    storage?.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('exposes the real learner page for runtime-boundary rendering', async () => {
    vi.stubGlobal('React', { createElement, Fragment });
    const page = await import('../app/LearnerHome.js');

    expect(page.LearnerHome).toBeTypeOf('function');
  });

  it('derives media from the auth mode and exact public flag instead of staged URLs', () => {
    const pageSource = `${readWebsiteFile('../app/page.tsx')}\n${readWebsiteFile(
      '../app/LearnerHome.tsx',
    )}`;
    const sliceSource = readWebsiteFile('../app/start-slice.ts');

    expect(pageSource).toContain('resolveStartMediaMode({');
    expect(pageSource).toContain('NEXT_PUBLIC_LEARNBOX_PRIVATE_MEDIA_ENABLED');
    expect(pageSource).toContain('authMode');
    expect(pageSource).toContain('buildStartMediaSources(currentItem.id, startMediaMode)');
    expect(pageSource).toContain(
      '<StartMediaVisual contentId={currentItem.id} mode={startMediaMode} />',
    );
    expect(sliceSource).not.toContain('/api/private-media/');
    expect(sliceSource).not.toContain('/api/local-preview-media/');
  });

  it('attaches private media only after server OTP and keeps grading usable after failure', async () => {
    mockFetch(response(201, challenge()), response(204));
    renderedPage = await renderLearnerPage({
      hostname: 'app.learnboxapp.com',
      otpUiFlag: 'true',
      privateMediaFlag: 'true',
    });

    await renderedPage.signInWithServerOtp();
    await renderedPage.startReview();

    expect(renderedPage.cardImage()?.getAttribute('src')).toBe(
      '/api/private-media/start-a1-entschuldigung/image',
    );

    await renderedPage.failCardImage();
    expect(renderedPage.cardImage()).toBeNull();
    expect(renderedPage.text()).toContain('اکنون در دسترس نیست');

    await renderedPage.flipAndGrade('یادم آمد');
    expect(renderedPage.text()).toContain('2 از 3');
  });

  it('keeps exact private enablement unavailable to prototype auth on production', async () => {
    renderedPage = await renderLearnerPage({
      hostname: 'app.learnboxapp.com',
      otpUiFlag: 'false',
      privateMediaFlag: 'true',
    });

    await renderedPage.signInLocally();
    await renderedPage.startReview();

    expect(renderedPage.cardImage()).toBeNull();
    expect(renderedPage.text()).toContain('در حال آماده‌سازی است');
  });

  it('retains the explicitly labelled local preview without enabling private media', async () => {
    renderedPage = await renderLearnerPage({
      hostname: 'localhost',
      otpUiFlag: 'false',
      privateMediaFlag: 'false',
    });

    await renderedPage.signInLocally();
    await renderedPage.startReview();

    expect(renderedPage.cardImage()?.getAttribute('src')).toBe(
      '/api/local-preview-media/start-a1-entschuldigung/image',
    );
    expect(renderedPage.text()).toContain('فقط برای بررسی محلی');
  });
});

type RenderedMedia = {
  failImage(): Promise<void>;
  image(): HTMLImageElement | null;
  text(): string;
  unmount(): Promise<void>;
};

type RenderedLearnerPage = {
  cardImage(): HTMLImageElement | null;
  failCardImage(): Promise<void>;
  flipAndGrade(grade: string): Promise<void>;
  signInLocally(): Promise<void>;
  signInWithServerOtp(): Promise<void>;
  startReview(): Promise<void>;
  text(): string;
  unmount(): Promise<void>;
};

async function renderMedia(mode: 'placeholder' | 'local-preview' | 'private-session') {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await act(async () => {
    root.render(createElement(StartMediaVisual, { contentId: 'start-a1-001', mode }));
  });

  return {
    failImage: async () => {
      const image = container.querySelector('img');
      if (!image) throw new Error('Expected rendered image.');
      await act(async () => image.dispatchEvent(new Event('error')));
    },
    image: () => container.querySelector('img'),
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  } satisfies RenderedMedia;
}

function readWebsiteFile(relativePath: string) {
  return readFileSync(resolve(process.cwd(), 'test', relativePath), 'utf8');
}

async function renderLearnerPage(props: {
  hostname: string;
  otpUiFlag: string;
  privateMediaFlag: string;
}): Promise<RenderedLearnerPage> {
  installLocalStorage();
  window.localStorage.setItem('learnbox:onboarding-goal:v1:local-prototype', 'life');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const { LearnerHome } = await import('../app/LearnerHome.js');

  await act(async () => {
    root.render(createElement(LearnerHome as FunctionComponent<typeof props>, props));
  });

  const signInLocally = async () => {
    await setInputValue(container, 'mobile-number', '09121234567');
    await submitForm(container);
    await setInputValue(container, 'login-code', '12345');
    await submitForm(container);
  };

  const signInWithServerOtp = async () => {
    await setInputValue(container, 'mobile-number', '09121234567');
    await submitForm(container);
    await setInputValue(container, 'login-code', '12345');
    await submitForm(container);
  };

  return {
    cardImage: () => container.querySelector('.word-visual img'),
    failCardImage: async () => {
      const image = container.querySelector<HTMLImageElement>('.word-visual img');
      if (!image) throw new Error('Expected a Start card image.');
      await act(async () => image.dispatchEvent(new Event('error')));
    },
    flipAndGrade: async (grade) => {
      await clickButtonStartingWith(container, 'برای دیدن معنی');
      await clickButtonStartingWith(container, grade);
    },
    signInLocally,
    signInWithServerOtp,
    startReview: async () => clickButtonStartingWith(container, 'شروع مرور'),
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
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

function mockFetch(...results: Array<Response | Error>) {
  const fetchMock = vi.fn(async () => {
    const next = results.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error('Unexpected fetch call.');
    return next;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function response(status: number, body: unknown = null): Response {
  return { status, json: async () => body } as Response;
}

function challenge() {
  return {
    challengeId: 'start-media-challenge-id-0001',
    expiresAt: '2026-08-08T10:05:00.000Z',
    resendAvailableAt: '1970-01-01T00:00:00.000Z',
  };
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
