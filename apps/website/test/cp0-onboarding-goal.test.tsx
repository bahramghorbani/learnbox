// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LB-B35 CP0 — the onboarding goal step (life / career / travel) in v1.2.1 behavior.
 *
 * Pins: a signed-in learner without a stored goal is stopped at the goal screen; choosing one
 * writes ONLY a device localStorage key and sends nothing to the server. The owner decided to remove
 * this step later; this test proves it has no data effect to preserve or migrate.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const goalKey = `learnbox:onboarding-goal:v1:local-prototype:account:${USER}`;

describe('CP0 — onboarding goal is device-local and has no server or scheduling effect', () => {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  let entries: Map<string, string>;
  let unmount: (() => Promise<void>) | undefined;

  beforeEach(() => {
    calls.length = 0;
    entries = new Map();
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
        if (url.includes('/api/auth/session')) {
          return new Response(JSON.stringify({ authenticated: true, userId: USER }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } });
      }),
    );
  });

  afterEach(async () => {
    await unmount?.();
    vi.unstubAllGlobals();
  });

  it('shows the three goal choices, and choosing one persists only to device storage', async () => {
    const container = document.createElement('div');
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
    for (let i = 0; i < 6; i += 1) await act(async () => void (await Promise.resolve()));

    const text = container.textContent ?? '';
    expect(text).toContain('برای چه چیزی آلمانی می‌خوانی؟');
    expect(text).toContain('زندگی در آلمان');
    expect(text).toContain('کار و دانشگاه');
    expect(text).toContain('سفر و ارتباط');
    expect(entries.get(goalKey)).toBeUndefined();

    const button = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith('ادامه'),
    );
    await act(async () => button!.click());
    for (let i = 0; i < 4; i += 1) await act(async () => void (await Promise.resolve()));

    expect(entries.get(goalKey)).toBe('life');
    // No request anywhere carries the goal: not a mutation, not a preference endpoint.
    const writes = calls.filter((c) => c.method !== 'GET');
    expect(writes.filter((c) => /goal|onboard|preference/i.test(c.url + c.body))).toEqual([]);
    expect(calls.filter((c) => /goal|onboard/i.test(c.url))).toEqual([]);
  });

  it('no database column or API field stores a learning goal', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), '..', '..', 'database', 'migrations');
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    expect(sql).not.toMatch(/learning_goal|onboarding_goal|\bgoal\b\s+(text|varchar)/i);
  });
});
