// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stagedStartSlice } from '../app/start-slice';

/**
 * LB-B35 CP4 — resume by card identity (flag NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN).
 *
 * The CP0 file pins the flag-OFF defects; this file pins what the flag fixes.
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
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN', 'true');
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

describe('CP4 — session resume follows the card, not the position (flag on)', () => {
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
    vi.unstubAllEnvs();
  });

  it('the persisted resume record carries the card identity next to the index', async () => {
    rendered = await renderWith([a, b, c]);
    expect(JSON.parse(storage.get(reviewSessionKey) ?? 'null')).toEqual({
      nextCardIndex: 0,
      nextCardId: a.id,
    });
  });

  it('a rebuilt queue in another order resumes at the SAME card (CP0 defect fixed)', async () => {
    storage.set(reviewSessionKey, JSON.stringify({ nextCardIndex: 2, nextCardId: c.id }));
    rendered = await renderWith([x, a, b, c]);
    expect(rendered.text()).toContain('4 از 4');
    expect(rendered.text()).toContain(c.german);
  });

  it('a saved card that is no longer queued restarts at the first card, skipping nothing', async () => {
    storage.set(reviewSessionKey, JSON.stringify({ nextCardIndex: 2, nextCardId: c.id }));
    rendered = await renderWith([x, a, b]);
    expect(rendered.text()).toContain('1 از 3');
    expect(rendered.text()).toContain(x.german);
  });

  it('a legacy index-only record still resumes by index', async () => {
    storage.set(reviewSessionKey, JSON.stringify({ nextCardIndex: 2, version: 1 }));
    rendered = await renderWith([a, b, c]);
    expect(rendered.text()).toContain('3 از 3');
    expect(rendered.text()).toContain(c.german);
  });
});
