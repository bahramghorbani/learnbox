// @vitest-environment jsdom

import { act } from 'react';
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LogoutPanel } from '../app/components/LogoutPanel';

(globalThis as Record<string, unknown>).React = React;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * LB-B35 CP4 — safe logout: flush BEFORE the session ends; if answers remain unsent the learner decides.
 * Nothing is discarded silently. Without `onFlushUnsent` (flag off) the panel is exactly the v1.2.1 one.
 */
describe('LogoutPanel safe logout', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (props: React.ComponentProps<typeof LogoutPanel>) =>
    act(() => {
      root.render(<LogoutPanel {...props} />);
    });
  const has = (id: string) => container.querySelector(`[data-testid="${id}"]`) !== null;
  const click = async (id: string) => {
    const el = container.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
    if (!el) throw new Error(`missing control: ${id}`);
    await act(async () => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  it('everything flushed: the session ends and the device is cleared, in that order', async () => {
    const order: string[] = [];
    const onFlushUnsent = vi.fn(async () => (order.push('flush'), 0));
    const onLogout = vi.fn(async () => (order.push('revoke'), true));
    const onLoggedOut = vi.fn(() => order.push('clear'));
    render({ onLogout, onLoggedOut, onFlushUnsent });
    await click('logout-open');
    await click('logout-confirm');
    expect(order).toEqual(['flush', 'revoke', 'clear']);
  });

  it('answers still unsent: the session is NOT ended and nothing is cleared; the learner is told how many', async () => {
    const onLogout = vi.fn(async () => true);
    const onLoggedOut = vi.fn();
    render({ onLogout, onLoggedOut, onFlushUnsent: async () => 3 });
    await click('logout-open');
    await click('logout-confirm');
    expect(onLogout).not.toHaveBeenCalled();
    expect(onLoggedOut).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="logout-unsent-count"]')?.textContent).toContain(
      '۳',
    );
    for (const id of ['logout-retry-send', 'logout-discard-and-exit', 'logout-stay']) {
      expect(has(id)).toBe(true);
    }
  });

  it('a flush that throws (offline) is treated as unsent, never as zero', async () => {
    const onLogout = vi.fn(async () => true);
    render({
      onLogout,
      onLoggedOut: vi.fn(),
      onFlushUnsent: async () => {
        throw new Error('offline');
      },
    });
    await click('logout-open');
    await click('logout-confirm');
    expect(onLogout).not.toHaveBeenCalled();
    expect(has('logout-unsent-count')).toBe(true);
  });

  it('"stay" returns to the idle panel without ending the session', async () => {
    const onLogout = vi.fn(async () => true);
    render({ onLogout, onLoggedOut: vi.fn(), onFlushUnsent: async () => 2 });
    await click('logout-open');
    await click('logout-confirm');
    await click('logout-stay');
    expect(has('logout-open')).toBe(true);
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('"retry" flushes again and proceeds to sign out once nothing remains', async () => {
    const remaining = [2, 0];
    const onFlushUnsent = vi.fn(async () => remaining.shift() ?? 0);
    const onLogout = vi.fn(async () => true);
    const onLoggedOut = vi.fn();
    render({ onLogout, onLoggedOut, onFlushUnsent });
    await click('logout-open');
    await click('logout-confirm');
    await click('logout-retry-send');
    expect(onFlushUnsent).toHaveBeenCalledTimes(2);
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onLoggedOut).toHaveBeenCalledTimes(1);
  });

  it('only an explicit "discard and exit" signs out while answers are still unsent', async () => {
    const onLogout = vi.fn(async () => true);
    const onLoggedOut = vi.fn();
    render({ onLogout, onLoggedOut, onFlushUnsent: async () => 4 });
    await click('logout-open');
    await click('logout-confirm');
    expect(onLoggedOut).not.toHaveBeenCalled();
    await click('logout-discard-and-exit');
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onLoggedOut).toHaveBeenCalledTimes(1);
  });

  it('a failed revocation after a clean flush still reports failure and keeps the learner signed in', async () => {
    const onLoggedOut = vi.fn();
    render({ onLogout: async () => false, onLoggedOut, onFlushUnsent: async () => 0 });
    await click('logout-open');
    await click('logout-confirm');
    expect(onLoggedOut).not.toHaveBeenCalled();
    expect(container.textContent).toContain('خروج انجام نشد');
  });

  it('flag off (no onFlushUnsent): identical to v1.2.1, no unsent step', async () => {
    const onLogout = vi.fn(async () => true);
    const onLoggedOut = vi.fn();
    render({ onLogout, onLoggedOut });
    await click('logout-open');
    await click('logout-confirm');
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onLoggedOut).toHaveBeenCalledTimes(1);
    expect(has('logout-unsent-count')).toBe(false);
  });
});
