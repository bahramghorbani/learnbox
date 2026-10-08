// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminWorkspaceRouter } from '../app/components/AdminWorkspaceRouter';

/**
 * Phase 4 / Milestones 4.1 and 4.2 — «نمایش اپ» is genuinely reachable, with both panels on it.
 *
 * This is the regression that M3.3 already had to repair once for «کاربران»: a real, guarded,
 * reviewed panel that no route could open. The splash panel was mounted on the home workspace while
 * the sidebar entry naming it had no destination at all, so the capability existed and no operator
 * could find it. Both halves are asserted here — the route resolves to the presentation workspace
 * AND the sidebar entry is a real link to it — because either one alone can rot without failing.
 *
 * The panel must also be in exactly ONE place: a splash control still left on the home workspace
 * would mean two live mutation surfaces for the same singleton.
 */

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('Admin #presentation destination (M4.1, M4.2)', () => {
  let container: HTMLElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;

  beforeEach(() => {
    window.location.hash = '';
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '__Host-learnbox_admin_csrf=csrf-token',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/api/splash/current')) {
          return Response.json({ current: null });
        }
        if (String(input).startsWith('/api/presentation/slides')) {
          return Response.json({
            slides: [
              {
                id: 'banner_1a2b3c4d',
                title: 'اسلاید نمونه',
                description: null,
                destination: { kind: 'screen', screen: 'today' },
                isActive: true,
                sortOrder: 0,
                hasImage: true,
                legacyImageUrl: null,
                createdAt: '2026-10-08T14:00:00.000Z',
              },
            ],
            maximumActiveSlides: 3,
          });
        }
        return new Response(null, { status: 404 });
      }),
    );
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    vi.unstubAllGlobals();
    window.location.hash = '';
  });

  async function render(hash: string) {
    window.location.hash = hash;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(createElement(AdminWorkspaceRouter)));
  }

  it('routes #presentation to the real presentation workspace with the splash panel', async () => {
    await render('#presentation');

    expect(container?.querySelector('#presentation')).not.toBeNull();
    expect(container?.textContent).toContain('نمایش اپ');
    // The existing, reviewed splash panel — identified by its own guidance text, not a copy of it.
    expect(container?.textContent).toContain('PNG، JPEG یا WebP');
    expect(fetch).toHaveBeenCalledWith('/api/splash/current', expect.anything());
  });

  it('renders «نمایش اپ» as a real sidebar link to #presentation', async () => {
    await render('#presentation');

    const entry = [...(container?.querySelectorAll('.admin-nav-item') ?? [])].find((item) =>
      item.textContent?.includes('نمایش اپ'),
    );
    expect(entry).toBeDefined();
    expect(entry?.tagName).toBe('A');
    expect(entry?.getAttribute('href')).toBe('#presentation');
    expect(entry?.getAttribute('aria-current')).toBe('page');
  });

  it('keeps splash management out of the home workspace, so it lives in exactly one place', async () => {
    await render('');

    expect(container?.querySelector('#presentation')).toBeNull();
    expect(container?.querySelector('input[type="file"]')).toBeNull();
    expect(container?.textContent).not.toContain('PNG، JPEG یا WebP');
  });

  it('mounts the M4.2 slider manager here, exactly once, beside the splash panel', async () => {
    await render('#presentation');

    expect(container?.querySelectorAll('#slider-management')).toHaveLength(1);
    expect(container?.textContent).toContain('مدیریت اسلایدها');
    expect(container?.textContent).toContain('اسلاید نمونه');
    expect(fetch).toHaveBeenCalledWith('/api/presentation/slides', expect.anything());
  });

  it('keeps slider management off the home workspace too', async () => {
    await render('');

    expect(container?.querySelector('#slider-management')).toBeNull();
    expect(container?.textContent).not.toContain('مدیریت اسلایدها');
  });
});
