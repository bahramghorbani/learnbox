// @vitest-environment jsdom

import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

// The app's components are compiled with the classic JSX transform in this suite's context, which
// expects a React binding in scope. The sibling learner suites get it via the app tree; this one
// renders a component directly, so it provides the global itself.
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

// Opt in to React's act() support so state updates are flushed without a warning.
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { ProfileScreen } from '../app/components/ProfileScreen';

/**
 * LB-B09: the interface must describe what the system actually does.
 *
 * The profile status card claimed "همگام‌سازی خودکار هنوز فعال نیست" (automatic sync is not enabled
 * yet). That was untrue: server sync runs on mount, on reconnect, and after each answer, and
 * production already held review events synced from real learners on the day this was checked.
 * Telling learners their answers are not being sent, while sending them, is both a trust problem
 * and a privacy misstatement.
 */

const base = {
  goal: 'life' as const,
  pendingReviewCount: 0,
  onChooseGoal: () => {},
  onNavigate: () => {},
  onOpenSettings: () => {},
};

let container: HTMLDivElement | null = null;

function render(props: Partial<Parameters<typeof ProfileScreen>[0]> = {}): string {
  container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(ProfileScreen, { ...base, ...props }));
  });
  return container.textContent ?? '';
}

afterEach(() => {
  container?.remove();
  container = null;
});

describe('profile sync status truthfulness', () => {
  it('does not claim automatic sync is disabled when the session syncs to the server', () => {
    const text = render({ syncsToServer: true });

    expect(text).not.toContain('همگام‌سازی خودکار هنوز فعال نیست');
    expect(text).toContain('به‌صورت خودکار برای سرور فرستاده می‌شوند');
  });

  it('explains offline answers are retried rather than lost', () => {
    expect(render({ syncsToServer: true })).toContain('پس از وصل‌شدن دوباره فرستاده می‌شوند');
  });

  it('states plainly that a device-only session does not reach the server', () => {
    const text = render({ syncsToServer: false });

    expect(text).toContain('فقط روی همین دستگاه');
    expect(text).not.toContain('به‌صورت خودکار برای سرور فرستاده می‌شوند');
  });

  it('reports a real pending count without contradicting the sync statement', () => {
    const text = render({ syncsToServer: true, pendingReviewCount: 3 });

    // Persian digits, and the count is described as awaiting server confirmation.
    expect(text).toContain('۳');
    expect(text).toContain('هنوز از سرور');
  });
});
