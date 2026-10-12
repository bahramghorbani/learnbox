// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const adminPackageVersion = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'))
  .version as string;

let container: HTMLElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

async function renderSidebar() {
  const { AdminSidebar } = await import('../app/components/AdminSidebar.jsx');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(AdminSidebar));
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

describe('Admin sidebar version label', () => {
  it('shows Admin Web\u2019s own version at the very bottom of the sidebar', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_ADMIN_VERSION', adminPackageVersion);
    const mounted = await renderSidebar();

    const sidebar = mounted.querySelector('aside.admin-sidebar');
    expect(sidebar).not.toBeNull();

    const label = sidebar!.querySelector('.admin-sidebar-version');
    expect(label).not.toBeNull();
    // "Very bottom": nothing is rendered after it inside the sidebar.
    expect(sidebar!.lastElementChild).toBe(label);

    expect(label!.getAttribute('data-admin-app-version')).toBe(adminPackageVersion);
    expect(label!.textContent).toContain(`v${adminPackageVersion}`);
  });

  it('isolates the version as LTR inside the RTL sidebar', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_ADMIN_VERSION', adminPackageVersion);
    const mounted = await renderSidebar();

    const number = mounted.querySelector('.admin-sidebar-version-number');
    expect(number).not.toBeNull();
    expect(number!.getAttribute('dir')).toBe('ltr');
  });

  it('keeps every existing navigation destination and the collapse control', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_ADMIN_VERSION', adminPackageVersion);
    const mounted = await renderSidebar();

    expect(mounted.querySelectorAll('.admin-nav-item')).toHaveLength(9);
    expect(mounted.querySelector('.collapse-control')).not.toBeNull();
    expect(mounted.querySelector('.admin-logo')).not.toBeNull();
  });

  it('renders no label at all when the build injected no version', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_ADMIN_VERSION', '');
    const mounted = await renderSidebar();

    expect(mounted.querySelector('.admin-sidebar-version')).toBeNull();
    // A missing version must never degrade into a placeholder.
    expect(mounted.textContent).not.toContain('v0.0.0');
    expect(mounted.textContent).not.toContain('unknown');
  });

  it('never renders the learner version', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_ADMIN_VERSION', adminPackageVersion);
    vi.stubEnv('NEXT_PUBLIC_LEARNBOX_LEARNER_VERSION', '9.9.9');
    const mounted = await renderSidebar();

    expect(mounted.textContent).not.toContain('9.9.9');
  });
});
