// @vitest-environment jsdom

/**
 * Stage 2 presentation contract for the Admin Dashboard.
 *
 * The route boundary is pinned by `admin-dashboard-routes.test.ts` and must not be restated here.
 * This file pins what a future restyle or a well-meaning "let's show something" change could
 * silently break:
 *
 *   1. the approved workspace vocabulary (`.cp-workspace` shell, `kpi-row`, `charts-row`,
 *      `qa-grid`, `panels-row`) rather than a second, dashboard-only set of styles;
 *   2. unavailable told apart from zero — a metric with no live source renders an em dash and a
 *      reason, never 0, and an empty chart renders an empty state rather than a flat fake line;
 *   3. figure honesty — every number comes from the payload, so the UI cannot invent one, and a
 *      count is never a rendered list's length;
 *   4. no learner identity on screen;
 *   5. the shared Loading / Empty / Error states, with a refusal (amber) told apart from a fault;
 *   6. accessibility: one page heading, labelled charts, real links for every quick action, and a
 *      reachable entry point to the review workspace that home no longer hosts.
 */

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DashboardOverview, DashboardWorkspace } from '../app/components/DashboardWorkspace.js';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const generatedAt = '2026-10-12T09:00:00.000Z';

function overviewPayload(overrides: Record<string, unknown> = {}) {
  return {
    overview: {
      generatedAt,
      windowDays: 30,
      timeZone: 'Asia/Tehran',
      learners: {
        total: 1204,
        joinedInWindow: 37,
        activeInWindow: 512,
        onlineNow: { state: 'unavailable', reason: 'no_data_source' },
      },
      packs: {
        total: 31,
        published: 24,
        publishedInWindow: 4,
        needsReview: 5,
        draft: 2,
      },
      reviewQueueCards: 9,
      contentPipeline: {
        total: 200,
        byStatus: [
          { status: 'published', count: 120 },
          { status: 'needs_review', count: 80 },
        ],
      },
      sales: {
        gatewayEnvironment: null,
        verifiedTotal: { state: 'unavailable', reason: 'payments_disabled' },
        revenueTomansInWindow: { state: 'unavailable', reason: 'payments_disabled' },
      },
      learnerGrowth: [
        { day: '2026-10-10', count: 2 },
        { day: '2026-10-11', count: 3 },
      ],
      salesSeries: null,
      recentLearners: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          status: 'active',
          joinedAt: '2026-10-10T08:00:00.000Z',
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          status: 'disabled',
          joinedAt: '2026-10-09T08:00:00.000Z',
        },
      ],
      recentPacks: [
        {
          id: 'pack-1',
          displayName: 'بستهٔ آزمون',
          status: 'needs_review',
          cardCount: 42,
          createdAt: '2026-10-09T08:00:00.000Z',
        },
      ],
      recentActivity: [
        {
          action: 'content_pack.edit',
          entityType: 'content_pack',
          at: '2026-10-12T08:30:00.000Z',
        },
      ],
      ...overrides,
    },
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function renderOverview(response: () => Response | Promise<Response>) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response()),
  );
  await act(async () => {
    root.render(createElement(DashboardOverview as FunctionComponent));
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0));
  });
  return {
    container,
    get text() {
      return container.textContent ?? '';
    },
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function renderShell() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse({}, 404)),
  );
  await act(async () => {
    root.render(createElement(DashboardWorkspace as FunctionComponent));
    await Promise.resolve();
  });
  return {
    container,
    get text() {
      return container.textContent ?? '';
    },
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dashboard shell', () => {
  it('renders inside the approved workspace shell', async () => {
    const view = await renderShell();
    const shell = view.container.querySelector('main');
    expect(shell?.className).toContain('admin-shell');
    // Every ported dashboard rule is scoped under .cp-workspace; without this class the screen
    // renders completely unstyled.
    expect(shell?.className).toContain('cp-workspace');
    expect(shell?.id).toBe('home');
    expect(view.container.querySelectorAll('h1')).toHaveLength(1);
    await view.unmount();
  });

  it('shows no figures at all without a server session', async () => {
    const view = await renderShell();
    expect(view.container.querySelector('[data-dashboard-unavailable]')).not.toBeNull();
    expect(view.container.querySelector('.err-block')?.className).toContain('amber');
    expect(view.container.querySelector('.kpi-row')).toBeNull();
    await view.unmount();
  });
});

describe('dashboard figures', () => {
  it('lays the approved sections out in order', async () => {
    const view = await renderOverview(() => jsonResponse(overviewPayload()));
    expect(view.container.querySelectorAll('.kpi-row .kpi')).toHaveLength(6);
    expect(view.container.querySelectorAll('.charts-row > .card')).toHaveLength(3);
    expect(view.container.querySelectorAll('.qa-grid .qa')).toHaveLength(5);
    expect(view.container.querySelectorAll('.panels-row > .card')).toHaveLength(3);
    await view.unmount();
  });

  it('renders every KPI from the payload', async () => {
    const view = await renderOverview(() => jsonResponse(overviewPayload()));
    const value = (kpi: string) =>
      view.container.querySelector(`[data-kpi="${kpi}"] .kpi-value`)?.textContent ?? '';
    expect(value('learners-total')).toBe('۱,۲۰۴');
    expect(value('learners-active')).toBe('۵۱۲');
    expect(value('packs-published')).toBe('۲۴');
    await view.unmount();
  });

  it('shows an em dash and a reason for a metric with no live source', async () => {
    const view = await renderOverview(() => jsonResponse(overviewPayload()));
    const online = view.container.querySelector('[data-kpi="learners-online"]');
    expect(online?.getAttribute('data-metric-state')).toBe('unavailable');
    expect(online?.querySelector('.kpi-value')?.textContent).toBe('—');
    expect(online?.querySelector('.kpi-value')?.className).toContain('muted');
    expect(online?.querySelector('.unavailable')?.textContent).toBe('اتصال داده فعال نشده');
    expect(online?.textContent).not.toContain('۰');
    await view.unmount();
  });

  it('never shows a zero for sales while the paid flow is off', async () => {
    const view = await renderOverview(() => jsonResponse(overviewPayload()));
    for (const kpi of ['sales-count', 'sales-revenue']) {
      const card = view.container.querySelector(`[data-kpi="${kpi}"]`);
      expect(card?.getAttribute('data-metric-state')).toBe('unavailable');
      expect(card?.querySelector('.kpi-value')?.textContent).toBe('—');
      expect(card?.querySelector('.unavailable')?.textContent).toBe('پرداخت فعال نشده');
    }
    const salesChart = view.container.querySelector('[data-chart="sales"]');
    expect(salesChart?.querySelector('[data-metric-state="unavailable"]')).not.toBeNull();
    // Only the empty-state glyph is left; no chart is drawn.
    expect(salesChart?.querySelector('svg[role="img"]')).toBeNull();
    await view.unmount();
  });

  it('draws real sales once the paid flow reports a series', async () => {
    const view = await renderOverview(() =>
      jsonResponse(
        overviewPayload({
          sales: {
            gatewayEnvironment: 'production',
            verifiedTotal: { state: 'available', value: 18 },
            revenueTomansInWindow: { state: 'available', value: 5400000 },
          },
          salesSeries: [
            { day: '2026-10-10', count: 1, revenueTomans: 150000 },
            { day: '2026-10-11', count: 2, revenueTomans: 300000 },
          ],
        }),
      ),
    );
    expect(view.container.querySelector('[data-kpi="sales-count"] .kpi-value')?.textContent).toBe(
      '۱۸',
    );
    const salesChart = view.container.querySelector('[data-chart="sales"]');
    expect(salesChart?.querySelectorAll('svg rect')).toHaveLength(4);
    expect(salesChart?.querySelector('.chart-legend')).not.toBeNull();
    await view.unmount();
  });

  it('shows an empty chart instead of a fake zero line', async () => {
    const view = await renderOverview(() =>
      jsonResponse(overviewPayload({ learnerGrowth: [{ day: '2026-10-11', count: 0 }] })),
    );
    const growth = view.container.querySelector('[data-chart="learner-growth"]');
    expect(growth?.querySelector('svg[role="img"]')).toBeNull();
    expect(growth?.querySelector('.empty')).not.toBeNull();
    await view.unmount();
  });

  it('labels donut slices with canonical content statuses and real shares', async () => {
    const view = await renderOverview(() => jsonResponse(overviewPayload()));
    const legend = view.container.querySelector('[data-chart="content-pipeline"] .donut-legend');
    expect(legend?.textContent).toContain('منتشرشده');
    expect(legend?.textContent).toContain('در انتظار بازبینی');
    expect(legend?.textContent).toContain('۶۰٪');
    expect(legend?.textContent).toContain('۴۰٪');
    // The reference legend reads Known/Learning/Unknown — a learner-progress distribution. Admin
    // holds no learning rule (LB-B35 CP2), so the donut shows the content pipeline instead and
    // must never grow a scheduler-state vocabulary.
    expect(legend?.textContent).not.toContain('Known');
    for (const schedulerState of ['مسلط', 'در حال یادگیری', 'یادگیری مجدد']) {
      expect(legend?.textContent).not.toContain(schedulerState);
    }
    await view.unmount();
  });

  it('renders no pipeline donut when no card version exists yet', async () => {
    const view = await renderOverview(() =>
      jsonResponse(overviewPayload({ contentPipeline: { total: 0, byStatus: [] } })),
    );
    const card = view.container.querySelector('[data-chart="content-pipeline"]');
    expect(card?.querySelector('svg[role="img"]')).toBeNull();
    expect(card?.querySelector('.empty')).not.toBeNull();
    await view.unmount();
  });

  it('shows the pre-aggregated count, not the length of the rendered list', async () => {
    const view = await renderOverview(() => jsonResponse(overviewPayload()));
    // Two learners are listed while the KPI says 1,204: a list length can never stand in for a
    // total.
    expect(
      view.container.querySelectorAll('[data-panel="recent-learners"] .list-row'),
    ).toHaveLength(2);
    expect(
      view.container.querySelector('[data-kpi="learners-total"] .kpi-value')?.textContent,
    ).toBe('۱,۲۰۴');
    await view.unmount();
  });

  it('shows the real pack status badge from the payload', async () => {
    const view = await renderOverview(() => jsonResponse(overviewPayload()));
    const badge = view.container.querySelector('[data-panel="recent-packs"] .badge');
    expect(badge?.textContent).toBe('در انتظار بررسی');
    expect(badge?.className).toContain('b-amber');
    await view.unmount();
  });

  it('renders the raw canonical audit action, not a guessed translation', async () => {
    const view = await renderOverview(() =>
      jsonResponse(
        overviewPayload({
          recentActivity: [{ action: 'something.new', entityType: 'mystery', at: generatedAt }],
        }),
      ),
    );
    const row = view.container.querySelector('[data-panel="recent-activity"] .list-row');
    expect(row?.textContent).toContain('something.new');
    expect(row?.textContent).toContain('mystery');
    await view.unmount();
  });
});

describe('dashboard privacy', () => {
  it('shows no learner name, phone or full identifier', async () => {
    const view = await renderOverview(() => jsonResponse(overviewPayload()));
    const panel = view.container.querySelector('[data-panel="recent-learners"]');
    expect(panel?.textContent).toContain('کاربر 33333333');
    expect(panel?.textContent).not.toContain('33333333-3333');
    expect(panel?.textContent).not.toContain('+98');
    // The account status is operational, not personal, and is shown.
    expect(panel?.textContent).toContain('غیرفعال موقت');
    await view.unmount();
  });
});

describe('dashboard states', () => {
  it('uses the shared loading state while the aggregate is in flight', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    vi.stubGlobal('React', { createElement, Fragment });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    await act(async () => {
      root.render(createElement(DashboardOverview as FunctionComponent));
      await Promise.resolve();
    });
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.querySelector('.spinner')).not.toBeNull();
    await act(async () => root.unmount());
    container.remove();
  });

  it('tells a disabled surface apart from a fault and from a refusal', async () => {
    const disabled = await renderOverview(() => jsonResponse({}, 404));
    expect(disabled.container.querySelector('.err-block')?.className).toContain('grey');
    await disabled.unmount();

    const refused = await renderOverview(() => jsonResponse({}, 401));
    expect(refused.container.querySelector('.err-block')?.className).toContain('amber');
    await refused.unmount();

    const broken = await renderOverview(() => jsonResponse({}, 500));
    expect(broken.container.querySelector('.err-block')?.className).toContain('rose');
    expect(broken.container.querySelector('[role="alert"]')).not.toBeNull();
    // A failure offers a way forward and still shows no invented figure.
    expect(broken.container.querySelector('.e-cta button')?.textContent).toBe('تلاش دوباره');
    expect(broken.container.querySelector('.kpi-row')).toBeNull();
    await broken.unmount();
  });

  it('shows an empty state per panel rather than a blank card', async () => {
    const view = await renderOverview(() =>
      jsonResponse(overviewPayload({ recentLearners: [], recentPacks: [], recentActivity: [] })),
    );
    for (const panel of ['recent-learners', 'recent-packs', 'recent-activity']) {
      expect(view.container.querySelector(`[data-panel="${panel}"] .empty`)).not.toBeNull();
    }
    await view.unmount();
  });
});

describe('dashboard navigation and accessibility', () => {
  it('points every quick action at a workspace that implements it', async () => {
    const view = await renderOverview(() => jsonResponse(overviewPayload()));
    const targets = [...view.container.querySelectorAll('.qa-grid .qa')].map((node) =>
      node.getAttribute('href'),
    );
    expect(targets).toEqual(['#content', '#presentation', '#presentation', '#content', '#content']);
    await view.unmount();
  });

  it('keeps the review workspace reachable after the dashboard took over home', async () => {
    const view = await renderOverview(() => jsonResponse(overviewPayload()));
    const link = view.container.querySelector('a[href="#review"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain('صف بازبینی محتوا');
    // The queue depth is the server's count, not the four packs the panel lists.
    expect(link?.textContent).toContain('۹');
    await view.unmount();
  });

  it('gives every panel a "see all" link to its full screen', async () => {
    const view = await renderOverview(() => jsonResponse(overviewPayload()));
    const links = [...view.container.querySelectorAll('.panels-row .link-more')].map((node) =>
      node.getAttribute('href'),
    );
    expect(links).toEqual(['#users', '#content', '#audit']);
    await view.unmount();
  });

  it('labels every chart for a screen reader', async () => {
    const view = await renderOverview(() =>
      jsonResponse(
        overviewPayload({
          salesSeries: [{ day: '2026-10-11', count: 2, revenueTomans: 300000 }],
          sales: {
            gatewayEnvironment: 'sandbox',
            verifiedTotal: { state: 'available', value: 18 },
            revenueTomansInWindow: { state: 'available', value: 5400000 },
          },
        }),
      ),
    );
    const charts = [...view.container.querySelectorAll('svg[role="img"]')];
    expect(charts).toHaveLength(3);
    for (const chart of charts) {
      expect(chart.getAttribute('aria-label')?.length).toBeGreaterThan(0);
    }
    await view.unmount();
  });

  it('reaches every interactive element by keyboard', async () => {
    const view = await renderOverview(() => jsonResponse(overviewPayload()));
    const focusable = [...view.container.querySelectorAll('a[href], button')];
    expect(focusable.length).toBeGreaterThan(0);
    for (const node of focusable) {
      expect(node.getAttribute('tabindex')).not.toBe('-1');
      expect(node.getAttribute('aria-hidden')).not.toBe('true');
    }
    await view.unmount();
  });

  it('renders no decorative control that does nothing', async () => {
    const view = await renderOverview(() => jsonResponse(overviewPayload()));
    // The reference puts a kebab menu on every learner row and a fake period <select> on every
    // chart. Neither is wired to anything, so neither is ported.
    expect(view.container.querySelector('.kebab')).toBeNull();
    expect(view.container.querySelector('select')).toBeNull();
    for (const button of view.container.querySelectorAll('button')) {
      expect(button.getAttribute('type')).toBe('button');
    }
    await view.unmount();
  });
});
