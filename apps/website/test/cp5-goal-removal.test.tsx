// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LB-B35 CP5-C — the unused learning-goal UX is removed (client flag NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED).
 *
 * ON: no onboarding-goal gate, no goal row in Profile, no goal row in Settings. Nothing is written for a
 * goal, nothing is sent to the server for one, and a goal value already on the device is NOT deleted or
 * migrated (it simply becomes unused legacy local data).
 * OFF: v1.2.1 behaviour, unchanged (the gate is shown to a learner with no stored goal).
 */
const USER = '11111111-1111-4111-8111-111111111111';
const goalKey = `learnbox:onboarding-goal:v1:local-prototype:account:${USER}`;

describe('CP5-C — learning-goal UX removal', () => {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  let entries: Map<string, string>;
  let container: HTMLDivElement;
  let unmount: (() => Promise<void>) | undefined;

  const settle = async (n = 8) => {
    for (let i = 0; i < n; i += 1) await act(async () => void (await Promise.resolve()));
  };
  const text = () => container.textContent ?? '';
  const click = async (re: RegExp) => {
    const target = Array.from(container.querySelectorAll('button')).find((b) =>
      re.test(b.textContent ?? ''),
    );
    if (!target) throw new Error(`no button ${re}\n${text()}`);
    await act(async () => target.click());
    await settle();
  };

  async function mount(seed: Record<string, string> = {}) {
    entries = new Map(Object.entries(seed));
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        get length() {
          return entries.size;
        },
        clear: () => entries.clear(),
        getItem: (k: string) => entries.get(k) ?? null,
        key: (i: number) => Array.from(entries.keys())[i] ?? null,
        removeItem: (k: string) => void entries.delete(k),
        setItem: (k: string, v: string) => void entries.set(k, String(v)),
      } satisfies Storage,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method ?? 'GET', body: String(init?.body ?? '') });
        if (url.includes('/api/auth/session'))
          return new Response(JSON.stringify({ authenticated: true, userId: USER }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        return new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } });
      }),
    );
    container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    unmount = async () => {
      await act(async () => root.unmount());
      container.remove();
    };
    vi.stubGlobal('React', { createElement, Fragment });
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.resetModules();
    const { LearnerHome } = await import('../app/LearnerHome.js');
    const props = {
      hostname: 'localhost',
      otpUiFlag: 'true',
      privateMediaFlag: 'false',
      inviteFlag: 'false',
    };
    await act(async () => {
      root.render(createElement(LearnerHome as FunctionComponent<typeof props>, props));
    });
    await settle();
  }

  beforeEach(() => {
    calls.length = 0;
  });
  afterEach(async () => {
    await unmount?.();
    unmount = undefined;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('flag ON: a learner with NO stored goal goes straight to Today — no goal gate', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED', 'true');
    await mount();
    expect(text()).not.toContain('برای چه چیزی آلمانی می‌خوانی؟');
    expect(text()).not.toContain('زندگی در آلمان');
    expect(container.querySelector('[data-testid="learnbox-today"]')).not.toBeNull();
  });

  it('flag ON: Profile has no goal row, no «هدف یادگیری», no «انتخاب هدف»', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED', 'true');
    await mount();
    await click(/پروفایل/);
    expect(text()).toContain('پروفایل');
    expect(text()).not.toContain('هدف یادگیری');
    expect(text()).not.toContain('انتخاب هدف');
    expect(text()).not.toContain('فقط در این دستگاه');
  });

  it('flag ON: Settings has no goal row', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED', 'true');
    await mount();
    await click(/پروفایل/);
    await click(/تنظیمات/);
    expect(text()).toContain('اندازهٔ متن');
    expect(text()).not.toContain('هدف یادگیری');
    expect(text()).not.toContain('زندگی در آلمان');
  });

  it('flag ON: nothing is written for a goal and nothing goal-related is sent to the server', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED', 'true');
    await mount();
    await click(/پروفایل/);
    await click(/تنظیمات/);
    expect(entries.has(goalKey)).toBe(false);
    expect(calls.filter((c) => /goal|onboard|preference/i.test(c.url + c.body))).toEqual([]);
  });

  it('flag ON: a goal already on the device is left exactly as it was (not deleted, not migrated, not shown)', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED', 'true');
    await mount({ [goalKey]: 'career' });
    await click(/پروفایل/);
    await click(/تنظیمات/);
    expect(entries.get(goalKey)).toBe('career');
    expect(text()).not.toContain('کار و دانشگاه');
    expect(text()).not.toContain('هدف یادگیری');
  });

  it('flag OFF: v1.2.1 unchanged — the gate is shown, and Profile/Settings keep their goal rows', async () => {
    await mount();
    expect(text()).toContain('برای چه چیزی آلمانی می‌خوانی؟');
    await unmount?.();
    await mount({ [goalKey]: 'life' });
    await click(/پروفایل/);
    expect(text()).toContain('هدف یادگیری');
    await click(/تنظیمات/);
    expect(text()).toContain('هدف یادگیری');
  });
});
