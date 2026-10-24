// @vitest-environment jsdom

import { act } from 'react';
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsScreen } from '../app/components/SettingsScreen';

(globalThis as Record<string, unknown>).React = React;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const noopAsync = async () => 'durable' as const;

/**
 * LB-B19 made real — daily review-reminder toggle in Settings.
 *
 * The row must only appear for a real server (OTP) session: a push subscription is useless
 * without a server-side account to deliver to, so `remindersAvailable=false` hides it rather
 * than showing a toggle that can never actually work.
 */
describe('Settings daily reminder toggle', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ enabled: false }), { status: 200 })),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is hidden when the session cannot receive server push (local prototype)', () => {
    act(() => {
      root.render(
        <SettingsScreen goal="life" soundEnabled onBack={() => {}} onToggleSound={noopAsync} />,
      );
    });

    expect(container.querySelector('#reminder-notification-switch')).toBeNull();
  });

  it('shows the toggle for a real server session', () => {
    act(() => {
      root.render(
        <SettingsScreen
          goal="life"
          soundEnabled
          onBack={() => {}}
          onToggleSound={noopAsync}
          remindersAvailable
          vapidPublicKey="test-public-key"
        />,
      );
    });

    expect(container.querySelector('#reminder-notification-switch')).not.toBeNull();
  });
});
