// @vitest-environment jsdom

import { act } from 'react';
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsScreen } from '../app/components/SettingsScreen';

// This suite's tsconfig uses the classic JSX runtime, so React must be in scope.
(globalThis as Record<string, unknown>).React = React;
// Tells React this environment supports act(), matching the other component suites.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * LB-B27 — sign out from Settings.
 *
 * Two properties matter beyond "a button exists":
 *
 *  1. A failed sign-out must not look like a successful one. The session is
 *     revoked server-side, so if that call fails the learner is still signed in
 *     and the UI must say so rather than dropping them into a signed-out shell.
 *  2. Sign-out must clear this device's learner state, or the next person using a
 *     shared device sees the previous learner's goal and streak.
 */

const noopAsync = async () => 'durable' as const;

describe('Settings sign out', () => {
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
    vi.restoreAllMocks();
  });

  function renderSettings(props: { onLogout: () => Promise<boolean>; onLoggedOut: () => void }) {
    act(() => {
      root.render(
        <SettingsScreen
          goal="life"
          soundEnabled
          onBack={() => {}}
          onChooseGoal={() => {}}
          onToggleSound={noopAsync}
          onLogout={props.onLogout}
          onLoggedOut={props.onLoggedOut}
        />,
      );
    });
  }

  const click = (testId: string) => {
    const element = container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
    if (!element) throw new Error(`missing control: ${testId}`);
    act(() => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  it('offers sign out and asks for confirmation before ending the session', () => {
    const onLogout = vi.fn(async () => true);
    renderSettings({ onLogout, onLoggedOut: () => {} });

    expect(container.querySelector('[data-testid="logout-open"]')).not.toBeNull();
    click('logout-open');

    // Opening the confirmation must not have signed anyone out yet.
    expect(onLogout).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="logout-confirm"]')).not.toBeNull();
  });

  it('can be cancelled without ending the session', () => {
    const onLogout = vi.fn(async () => true);
    const onLoggedOut = vi.fn();
    renderSettings({ onLogout, onLoggedOut });

    click('logout-open');
    click('logout-cancel');

    expect(onLogout).not.toHaveBeenCalled();
    expect(onLoggedOut).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="logout-open"]')).not.toBeNull();
  });

  it('completes sign out when the server confirms', async () => {
    const onLogout = vi.fn(async () => true);
    const onLoggedOut = vi.fn();
    renderSettings({ onLogout, onLoggedOut });

    click('logout-open');
    await act(async () => {
      click('logout-confirm');
    });

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onLoggedOut).toHaveBeenCalledTimes(1);
  });

  it('keeps the learner signed in and reports failure when revocation fails', async () => {
    const onLogout = vi.fn(async () => false);
    const onLoggedOut = vi.fn();
    renderSettings({ onLogout, onLoggedOut });

    click('logout-open');
    await act(async () => {
      click('logout-confirm');
    });

    // The critical assertion: no false success.
    expect(onLoggedOut).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('خروج انجام نشد');
  });

  it('keeps the learner signed in when the request throws', async () => {
    const onLogout = vi.fn(async () => {
      throw new Error('network down');
    });
    const onLoggedOut = vi.fn();
    renderSettings({ onLogout, onLoggedOut });

    click('logout-open');
    await act(async () => {
      click('logout-confirm');
    });

    expect(onLoggedOut).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('is hidden when no server session exists (local prototype)', () => {
    act(() => {
      root.render(
        <SettingsScreen
          goal="life"
          soundEnabled
          onBack={() => {}}
          onChooseGoal={() => {}}
          onToggleSound={noopAsync}
        />,
      );
    });

    expect(container.querySelector('[data-testid="logout-open"]')).toBeNull();
  });
});
