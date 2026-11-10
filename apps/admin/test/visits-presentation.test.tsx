// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VisitsWorkspace } from '../app/components/VisitsWorkspace';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const overview = {
  windowDays: 14,
  sites: [
    {
      domain: 'learnboxapp.com',
      label: 'لندینگ',
      pageviewsTotal: 123,
      visitorsTotal: 45,
      series: [
        { date: '2026-11-09', pageviews: 60, visitors: 20 },
        { date: '2026-11-10', pageviews: 63, visitors: 25 },
      ],
      topPages: [{ path: '/', count: 50 }],
    },
    {
      domain: 'app.learnboxapp.com',
      label: 'اپ',
      pageviewsTotal: 300,
      visitorsTotal: 90,
      series: [{ date: '2026-11-10', pageviews: 300, visitors: 90 }],
      topPages: [],
    },
  ],
};

describe('Admin Visits workspace', () => {
  let container: HTMLElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    vi.unstubAllGlobals();
  });

  it('renders real totals for both sites, never a fabricated number', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ overview })),
    );
    await act(async () => {
      root?.render(createElement(VisitsWorkspace));
      await flush();
    });
    expect(container?.querySelector('#visits')).not.toBeNull();
    expect(container?.textContent).toContain('۱۲۳');
    expect(container?.textContent).toContain('۳۰۰');
    expect(container?.textContent).toContain('learnboxapp.com');
    expect(container?.textContent).toContain('app.learnboxapp.com');
  });

  it('shows an unavailable state when the flag is off, not an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await act(async () => {
      root?.render(createElement(VisitsWorkspace));
      await flush();
    });
    expect(container?.textContent).toContain('گزارش بازدید در این محیط فعال نیست');
  });

  it('prompts re-authentication on an expired session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 401 })),
    );
    await act(async () => {
      root?.render(createElement(VisitsWorkspace));
      await flush();
    });
    expect(container?.textContent).toContain('نشست منقضی شده است');
  });

  it('shows an error with a retry action when StatsFA is unreachable, never a silent zero', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    await act(async () => {
      root?.render(createElement(VisitsWorkspace));
      await flush();
    });
    expect(container?.textContent).toContain('گزارش بازدید دریافت نشد');
    expect(container?.textContent).not.toContain('۰');
  });
});
