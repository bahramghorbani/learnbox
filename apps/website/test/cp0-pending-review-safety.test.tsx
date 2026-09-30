// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LB-B35 CP0 — characterization of pending (unsynced) review safety in v1.2.1 behavior.
 *
 * Renders the REAL LearnerHome in server-otp mode, with a review that is queued on the device but
 * not yet acknowledged by the server, and drives the real Settings -> Sign out path.
 *
 * Tests named "DEFECT" pin behavior the owner wants changed. They PASS today because they assert the
 * CURRENT (defective) behavior; the checkpoint that fixes the defect must flip the assertion.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const queueKey = `learnbox:review-sync:v1:local-prototype:account:${USER}`;
const goalKey = `learnbox:onboarding-goal:v1:local-prototype:account:${USER}`;

type Rendered = {
  container: HTMLElement;
  text(): string;
  click(testIdOrLabel: string): Promise<void>;
  unmount(): Promise<void>;
};

function pendingQueue(ids: string[]): string {
  // nextAttemptAt in the far future: the background flush skips these, so they stay "unsynced".
  return JSON.stringify(
    ids.map((id) => ({
      clientEventId: id,
      attempts: 0,
      nextAttemptAt: new Date(Date.now() + 3600_000).toISOString(),
      payload: {
        cardId: 'start-a1-cp0-a',
        grade: 'remembered',
        reviewedAt: new Date().toISOString(),
      },
    })),
  );
}

function installStorage(seed: Record<string, string>) {
  const entries = new Map<string, string>(Object.entries(seed));
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

const calls: string[] = [];

function installFetch(logoutStatus: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/api/auth/session')) {
        return new Response(JSON.stringify({ authenticated: true, userId: USER }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/api/auth/logout')) return new Response(null, { status: logoutStatus });
      // Everything else (cards/summary/profile/review batch) is "server unreachable".
      return new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } });
    }),
  );
}

async function render(): Promise<Rendered> {
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
    otpUiFlag: 'true', // forces 'server-otp' mode under NODE_ENV=test
    privateMediaFlag: 'false',
    inviteFlag: 'false',
  };
  await act(async () => {
    root.render(createElement(LearnerHome as FunctionComponent<typeof props>, props));
  });
  // Let the session + state effects settle.
  for (let i = 0; i < 6; i += 1) await act(async () => void (await Promise.resolve()));

  const clickBy = async (predicate: (el: HTMLElement) => boolean, what: string) => {
    const el = Array.from(container.querySelectorAll<HTMLElement>('button, [data-testid]')).find(
      predicate,
    );
    if (!el) throw new Error(`control not found: ${what}\n${container.textContent}`);
    await act(async () => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    for (let i = 0; i < 3; i += 1) await act(async () => void (await Promise.resolve()));
  };

  return {
    container,
    text: () => container.textContent ?? '',
    click: (idOrLabel) =>
      clickBy(
        (el) =>
          el.getAttribute('data-testid') === idOrLabel ||
          (el.tagName === 'BUTTON' && (el.textContent ?? '').trim().includes(idOrLabel)),
        idOrLabel,
      ),
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe('CP0 — pending review safety (real LearnerHome, server-otp mode)', () => {
  let rendered: Rendered | undefined;
  let storage: Map<string, string>;

  beforeEach(() => {
    calls.length = 0;
    storage = installStorage({
      [goalKey]: 'life',
      [queueKey]: pendingQueue(['evt-1', 'evt-2']),
      // A pending event for ANOTHER account on the same device must also be visible to the test.
      'learnbox:review-sync:v1:local-prototype:account:22222222-2222-4222-8222-222222222222':
        pendingQueue(['other-1']),
    });
  });

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fixture sanity: the unsynced queue is present and the learner is signed in', async () => {
    installFetch(204);
    rendered = await render();
    expect(rendered.text()).not.toContain('شمارهٔ موبایل'); // not on the auth gate
    expect(JSON.parse(storage.get(queueKey) ?? '[]')).toHaveLength(2);
  });

  it('DEFECT: confirming sign out wipes the unsynced review queue (answers silently disappear)', async () => {
    installFetch(204);
    rendered = await render();
    await rendered.click('پروفایل');
    await rendered.click('تنظیمات');
    await rendered.click('logout-open');
    await rendered.click('logout-confirm');

    expect(calls.some((u) => u.includes('/api/auth/logout'))).toBe(true);
    // Current behavior: no attempt to flush, no warning, and every `learnbox:` key is removed —
    // including the queue that still holds two answers the server never acknowledged.
    expect(storage.get(queueKey)).toBeUndefined();
    expect([...storage.keys()].filter((k) => k.startsWith('learnbox:'))).toEqual([]);
    // No review batch was ever POSTed before the wipe.
    expect(calls.filter((u) => u.includes('/api/learner/reviews'))).toEqual([]);
  });

  it('DEFECT: the sign-out confirmation gives no warning about unsynced answers', async () => {
    installFetch(204);
    rendered = await render();
    await rendered.click('پروفایل');
    await rendered.click('تنظیمات');
    await rendered.click('logout-open');
    const dialogText = rendered.text();
    expect(dialogText.length).toBeGreaterThan(0); // the confirmation dialog is actually rendered
    expect(dialogText).not.toMatch(/همگام|ارسال نشده|ذخیره نشده|pending|unsynced/i);
  });

  it('when the server refuses the sign out, nothing is wiped (the wipe is tied to success)', async () => {
    installFetch(500);
    rendered = await render();
    await rendered.click('پروفایل');
    await rendered.click('تنظیمات');
    await rendered.click('logout-open');
    await rendered.click('logout-confirm');
    expect(storage.get(queueKey)).toBeDefined();
  });

  it("DEFECT: the wipe also removes OTHER accounts' unsynced queues on a shared device", async () => {
    installFetch(204);
    rendered = await render();
    await rendered.click('پروفایل');
    await rendered.click('تنظیمات');
    await rendered.click('logout-open');
    await rendered.click('logout-confirm');
    expect(
      storage.get(
        'learnbox:review-sync:v1:local-prototype:account:22222222-2222-4222-8222-222222222222',
      ),
    ).toBeUndefined();
  });
});
