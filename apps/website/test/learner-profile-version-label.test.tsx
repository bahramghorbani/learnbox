// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The app's components are compiled with the classic JSX transform in this suite's context, which
// expects a React binding in scope. This suite renders a component directly, so it provides the
// global itself — the same arrangement as `profile-sync-truthfulness.test.tsx`.
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const learnerPackageVersion = JSON.parse(
  readFileSync(resolve(__dirname, '../package.json'), 'utf8'),
).version as string;

let container: HTMLElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

async function renderProfile() {
  const { ProfileScreen } = await import('../app/components/ProfileScreen.jsx');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      createElement(ProfileScreen, {
        pendingReviewCount: 0,
        onNavigate: () => {},
        onOpenSettings: () => {},
      }),
    );
  });
  return container;
}

afterEach(async () => {
  if (root) {
    const current = root;
    await act(async () => current.unmount());
  }
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Learner Profile version label', () => {
  it('shows the Learner PWA\u2019s own version at the very bottom of Profile', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_LEARNER_VERSION', learnerPackageVersion);
    const mounted = await renderProfile();

    const label = mounted.querySelector('.profile-app-version');
    expect(label).not.toBeNull();
    expect(label!.getAttribute('data-learner-app-version')).toBe(learnerPackageVersion);
    expect(label!.textContent).toContain(`v${learnerPackageVersion}`);

    // "Very bottom": the last content on the screen, with only the fixed learner nav after it.
    const main = mounted.querySelector('main');
    expect(main).not.toBeNull();
    const nav = main!.querySelector('.learner-nav');
    expect(nav).not.toBeNull();
    expect(label!.nextElementSibling).toBe(nav);
  });

  it('isolates the version as LTR inside the RTL screen', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_LEARNER_VERSION', learnerPackageVersion);
    const mounted = await renderProfile();

    const number = mounted.querySelector('.profile-app-version-number');
    expect(number).not.toBeNull();
    expect(number!.getAttribute('dir')).toBe('ltr');
  });

  it('leaves the existing Profile sections intact', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_LEARNER_VERSION', learnerPackageVersion);
    const mounted = await renderProfile();

    expect(mounted.querySelectorAll('.profile-section').length).toBeGreaterThan(0);
    expect(mounted.querySelector('.learner-nav')).not.toBeNull();
    expect(mounted.textContent).toContain('حریم خصوصی');
    expect(mounted.textContent).toContain('پشتیبانی در تلگرام');
  });

  it('renders no label at all when the build injected no version', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_LEARNER_VERSION', '');
    const mounted = await renderProfile();

    expect(mounted.querySelector('.profile-app-version')).toBeNull();
    expect(mounted.textContent).not.toContain('v0.0.0');
    expect(mounted.textContent).not.toContain('unknown');
  });

  it('never renders the admin version', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_LEARNER_VERSION', learnerPackageVersion);
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_ADMIN_VERSION', '9.9.9');
    const mounted = await renderProfile();

    expect(mounted.textContent).not.toContain('9.9.9');
  });
});
