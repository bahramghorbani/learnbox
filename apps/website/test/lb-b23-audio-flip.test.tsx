// @vitest-environment jsdom

/**
 * LB-B23 — reproduction.
 *
 * Reported defect: tapping the pronunciation control on a card also flips the card.
 *
 * The obvious explanation is already disproven by reading the shipped source: both
 * audio controls sit inside wrappers that call `stopPropagation` on click
 * (`.card-ipa-row` on the front, `.card-ex-audio` on the back). So this test does not
 * assume a mechanism — it exercises the real component and asserts the user-visible
 * contract: activating the audio control must NOT change the flip state.
 *
 * It deliberately covers the three activation paths a real user has on a touch device,
 * because only `click` is guarded in the source:
 *   1. click on the button itself
 *   2. click on a child of the button (the SVG icon or the label span) — the event
 *      target is then the child, not the button
 *   3. keyboard activation (Enter/Space), which is how assistive tech fires it
 */

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { selectTodayStartSession } from '../app/start-slice';

const pinnedNow = new Date('2026-08-08T12:00:00.000Z');

async function renderCardScreen() {
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
    testStudyItems: selectTodayStartSession(),
    otpUiFlag: 'false',
    privateMediaFlag: 'false',
    inviteFlag: 'false',
  };
  await act(async () => {
    root.render(createElement(LearnerHome as FunctionComponent<typeof props>, props));
  });

  // Reach the card screen the way a learner does: sign in, finish onboarding,
  // then start the review session.
  await setInputValue(container, 'mobile-number', '09121234567');
  await submitForm(container);
  await setInputValue(container, 'login-code', '12345');
  await submitForm(container);
  await clickButtonStartingWith(container, 'ادامه');
  await clickButtonStartingWith(container, 'شروع مرور');

  const isFlipped = () =>
    Boolean(container.querySelector('.flip-inner')?.classList.contains('flipped'));

  const audioButton = () => {
    const button = container.querySelector<HTMLButtonElement>('.card-ipa-row .audio-button');
    if (!button) throw new Error('Front-face pronunciation button not found.');
    return button;
  };

  return { container, root, isFlipped, audioButton };
}

describe('LB-B23 — the pronunciation control must not flip the card', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(pinnedNow);
    installLocalStorage();
    // jsdom implements neither; the component must not crash the click path.
    vi.stubGlobal(
      'Audio',
      class {
        play() {
          return Promise.resolve();
        }
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('stays unflipped when the audio button itself is clicked', async () => {
    const { isFlipped, audioButton } = await renderCardScreen();
    expect(isFlipped()).toBe(false);

    const button = audioButton();
    await act(async () => {
      button.click();
    });

    expect(isFlipped()).toBe(false);
  });

  it('stays unflipped when a CHILD of the audio button is clicked', async () => {
    const { isFlipped, audioButton } = await renderCardScreen();
    expect(isFlipped()).toBe(false);

    // A real tap usually lands on the icon or the label, not the button box.
    const child = audioButton().querySelector('svg, span');
    expect(child, 'audio button should render an icon/label child').toBeTruthy();

    await act(async () => {
      (child as Element).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(isFlipped()).toBe(false);
  });

  it('stays unflipped when the audio button is activated from the keyboard', async () => {
    const { isFlipped, audioButton } = await renderCardScreen();
    expect(isFlipped()).toBe(false);

    const button = audioButton();
    button.focus();
    await act(async () => {
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    });

    expect(isFlipped()).toBe(false);
  });

  it('still flips when the card body itself is tapped (animation contract preserved)', async () => {
    const { container, isFlipped } = await renderCardScreen();
    expect(isFlipped()).toBe(false);

    const flipContainer = container.querySelector<HTMLElement>('.flip-container');
    if (!flipContainer) throw new Error('.flip-container not found.');
    await act(async () => {
      flipContainer.click();
    });

    expect(isFlipped()).toBe(true);
  });
});

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
