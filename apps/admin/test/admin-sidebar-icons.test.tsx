// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { AdminSidebar } from '../app/components/AdminSidebar';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('AdminSidebar iconography', () => {
  let container: HTMLElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('uses a consistent SVG icon for every menu item instead of font glyph placeholders', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root?.render(createElement(AdminSidebar)));

    const items = [...container.querySelectorAll('.admin-nav-item')];
    expect(items).toHaveLength(5);

    for (const item of items) {
      const icon = item.querySelector('[data-admin-nav-icon]');
      const svg = icon?.querySelector('svg');
      expect(icon).not.toBeNull();
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(svg?.getAttribute('stroke')).toBe('currentColor');
      expect(icon?.textContent).toBe('');
    }

    expect(container.textContent).not.toMatch(/[▣◉▤▥⚙]/u);
  });

  it('keeps the active item semantic and gives the collapse action a vector chevron', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root?.render(createElement(AdminSidebar)));

    const active = container.querySelector('.admin-nav-item.is-current');
    expect(active?.getAttribute('aria-current')).toBe('page');
    expect(active?.textContent).toContain('صف بررسی');

    const collapse = container.querySelector('.collapse-control');
    expect(collapse?.querySelector('[data-admin-collapse-icon] svg')).not.toBeNull();
    expect(collapse?.textContent).not.toContain('»');
  });
});
