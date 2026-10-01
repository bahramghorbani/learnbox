// @vitest-environment jsdom

/**
 * LB-B35 CP5 — keyboard operation of the existing review-card flip.
 *
 * Scope is deliberately narrow: the flip control must be focusable, expose a button role and state,
 * and Enter / Space must flip exactly as a click/tap does. Pointer behaviour must not change and the
 * nested pronunciation controls must still not flip the card. The wider screen-reader / contrast
 * audit is separate B14 work.
 */

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { selectTodayStartSession } from '../app/start-slice';

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
  vi.stubGlobal('localStorage', storage);
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
}

async function setInputValue(container: HTMLElement, id: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`#${id} not found`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submitForm(container: HTMLElement) {
  const form = container.querySelector('form');
  if (!form) throw new Error('form not found');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

async function clickButtonStartingWith(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.trim().startsWith(text),
  );
  if (!button) throw new Error(`button "${text}" not found`);
  await act(async () => {
    button.click();
  });
}

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
  await setInputValue(container, 'mobile-number', '09121234567');
  await submitForm(container);
  await setInputValue(container, 'login-code', '12345');
  await submitForm(container);
  await clickButtonStartingWith(container, 'ادامه');
  await clickButtonStartingWith(container, 'شروع مرور');

  const control = () => {
    const el = container.querySelector<HTMLElement>('.flip-container');
    if (!el) throw new Error('.flip-container not found');
    return el;
  };
  const isFlipped = () =>
    Boolean(container.querySelector('.flip-inner')?.classList.contains('flipped'));
  const key = async (target: Element, k: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', {
      key: k,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    await act(async () => {
      target.dispatchEvent(event);
    });
    return event;
  };
  return { container, control, isFlipped, key };
}

describe('CP5 — review card flip is keyboard operable', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
    installLocalStorage();
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

  it('is a focusable button whose Persian name carries the word and the current action', async () => {
    const { container, control, isFlipped, key } = await renderCardScreen();
    const el = control();
    expect(el.getAttribute('role')).toBe('button');
    expect(el.tabIndex).toBe(0);
    const german = container.querySelector('.card-word-de')?.textContent ?? '';
    expect(german).not.toBe('');
    const frontLabel = el.getAttribute('aria-label') ?? '';
    expect(frontLabel).toContain(german);
    expect(frontLabel).toMatch(/[\u0600-\u06FF]/);
    el.focus();
    expect(document.activeElement).toBe(el);

    await key(el, 'Enter');
    expect(isFlipped()).toBe(true);
    const backLabel = control().getAttribute('aria-label') ?? '';
    expect(backLabel).not.toBe(frontLabel);
    expect(backLabel).toContain(container.querySelector('.card-fa-meanings')?.textContent ?? '?');
  });

  it('click / tap still flips, and flips back (unchanged pointer behaviour)', async () => {
    const { control, isFlipped } = await renderCardScreen();
    await act(async () => {
      control().click();
    });
    expect(isFlipped()).toBe(true);
    await act(async () => {
      control().click();
    });
    expect(isFlipped()).toBe(false);
  });

  it('Enter and Space each perform the same flip as a click, in both directions', async () => {
    const { control, isFlipped, key } = await renderCardScreen();
    await key(control(), 'Enter');
    expect(isFlipped()).toBe(true);
    await key(control(), 'Enter');
    expect(isFlipped()).toBe(false);
    await key(control(), ' ');
    expect(isFlipped()).toBe(true);
    await key(control(), ' ');
    expect(isFlipped()).toBe(false);
  });

  it('Enter / Space are consumed (no page scroll or form submit); other keys are ignored', async () => {
    const { control, isFlipped, key } = await renderCardScreen();
    const space = await key(control(), ' ');
    expect(space.defaultPrevented).toBe(true);
    await key(control(), ' ');
    const enter = await key(control(), 'Enter');
    expect(enter.defaultPrevented).toBe(true);
    await key(control(), 'Enter');
    expect(isFlipped()).toBe(false);

    for (const other of ['a', 'Tab', 'ArrowRight', 'Escape']) {
      const event = await key(control(), other);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(isFlipped()).toBe(false);
  });

  it('a held key does not auto-repeat the flip', async () => {
    const { control, isFlipped, key } = await renderCardScreen();
    await key(control(), 'Enter');
    expect(isFlipped()).toBe(true);
    await key(control(), 'Enter', { repeat: true });
    expect(isFlipped()).toBe(true);
    await key(control(), ' ', { repeat: true });
    expect(isFlipped()).toBe(true);
  });

  it('keys pressed on the nested pronunciation control do not flip the card', async () => {
    const { container, isFlipped, key } = await renderCardScreen();
    const audio = container.querySelector<HTMLButtonElement>('.card-ipa-row .audio-button');
    if (!audio) throw new Error('audio button not found');
    await key(audio, 'Enter');
    expect(isFlipped()).toBe(false);
    await key(audio, ' ');
    expect(isFlipped()).toBe(false);
  });

  it('keeps a visible keyboard focus indicator in the stylesheet', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');
    const rule = css.match(/\.flip-container:focus-visible\s*\{([^}]*)\}/);
    expect(rule, '.flip-container:focus-visible rule').toBeTruthy();
    expect(rule?.[1]).toMatch(/outline:\s*3px solid/);
    expect(rule?.[1]).not.toMatch(/outline:\s*(none|0)/);
  });
});
