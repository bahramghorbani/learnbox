// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stagedStartSlice } from '../app/start-slice';

/**
 * LB-B35 CP0 — characterization of review-session resume in v1.2.1 behavior.
 *
 * "DEFECT" tests assert the CURRENT (defective) behavior and pass today; the checkpoint that
 * fixes resume-by-index must flip them.
 */

const reviewSessionKey = 'learnbox:review-session:v1:local-prototype';

function installLocalStorage() {
  const entries = new Map<string, string>();
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

async function renderWith(items: typeof stagedStartSlice) {
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
    testStudyItems: items,
    otpUiFlag: 'false',
    privateMediaFlag: 'false',
    inviteFlag: 'false',
  };
  await act(async () => {
    root.render(createElement(LearnerHome as FunctionComponent<typeof props>, props));
  });
  const setInput = async (testId: string, value: string) => {
    const input = container.querySelector<HTMLInputElement>(`#${testId}`)!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const submit = async () => {
    const form = container.querySelector('form')!;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  };
  const clickStarting = async (label: string) => {
    const b = Array.from(container.querySelectorAll('button')).find((x) =>
      x.textContent?.trim().startsWith(label),
    );
    if (!b) throw new Error(`button not found: ${label}`);
    await act(async () => b.click());
  };
  await setInput('mobile-number', '09121234567');
  await submit();
  await setInput('login-code', '12345');
  await submit();
  // Onboarding goal step (owner decision: to be removed later). Already skipped once a goal is stored.
  await clickStarting('ادامه').catch(() => undefined);
  await clickStarting('شروع مرور').catch(() => clickStarting('ادامهٔ مرور'));
  return {
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe('CP0 — session resume is by position, not by card identity', () => {
  let storage: Map<string, string>;
  let rendered: Awaited<ReturnType<typeof renderWith>> | undefined;
  const [a, b, c, x] = stagedStartSlice;

  beforeEach(() => {
    storage = installLocalStorage();
  });
  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
  });

  it('the persisted resume record contains only a numeric index — no card identity', async () => {
    rendered = await renderWith([a, b, c]);
    const saved = JSON.parse(storage.get(reviewSessionKey) ?? 'null');
    expect(saved).toEqual({ nextCardIndex: 0 });
    expect(Object.keys(saved)).toEqual(['nextCardIndex']);
  });

  it('DEFECT: the same saved index lands on a DIFFERENT card when the queue is rebuilt in another order', async () => {
    // Session 1: the learner was 2 cards in on queue [a, b, c] (resume index = 2 → card c).
    storage.set(reviewSessionKey, JSON.stringify({ nextCardIndex: 2, version: 1 }));
    rendered = await renderWith([a, b, c]);
    expect(rendered.text()).toContain('3 از 3');
    expect(rendered.text()).toContain(c.german);
    await rendered.unmount();
    rendered = undefined;

    // Session 2: the server rebuilds the queue (new due cards, different order) — index 2 is
    // resumed unchanged and now points at a card the learner never reached.
    storage.set(reviewSessionKey, JSON.stringify({ nextCardIndex: 2, version: 1 }));
    rendered = await renderWith([x, a, b]);
    expect(rendered.text()).toContain('3 از 3');
    expect(rendered.text()).toContain(b.german);
    expect(rendered.text()).not.toContain(c.german);
    // Cards x and a (positions 0-1 of the new queue) are silently skipped in this "resumed" session.
  });

  it('DEFECT: a saved index beyond a shorter rebuilt queue is discarded, losing the position', async () => {
    storage.set(reviewSessionKey, JSON.stringify({ nextCardIndex: 2, version: 1 }));
    rendered = await renderWith([a, b]);
    // Resume index 2 >= length 2: the record is cleared and the session restarts at card 1.
    expect(rendered.text()).toContain('1 از 2');
  });
});
