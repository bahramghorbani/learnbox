'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { AdminSidebar } from './AdminSidebar';
import { EmptyState, ErrorState, LoadingState } from './AdminStates';
import { fa, faNum } from './fa-digits';

type VisitsDayPoint = { date: string; pageviews: number; visitors: number };

type VisitsSiteOverview = {
  domain: string;
  label: string;
  pageviewsTotal: number;
  visitorsTotal: number;
  series: VisitsDayPoint[];
  topPages: { path: string; count: number }[];
};

type VisitsOverview = { windowDays: number; sites: VisitsSiteOverview[] };

type VisitsState =
  | { kind: 'loading' }
  | { kind: 'available'; overview: VisitsOverview }
  | { kind: 'unavailable' }
  | { kind: 'expired' }
  | { kind: 'error' };

/** `YYYY-MM-DD` to a short Persian day label, without pulling in a full calendar dependency. */
function shortDayLabel(iso: string): string {
  const parts = iso.split('-');
  return parts.length === 3 ? fa(`${parts[1]}/${parts[2]}`) : fa(iso);
}

/**
 * One metric's series as a small inline-SVG line+area chart. Self-contained rather than shared
 * with `DashboardWorkspace`'s `AreaChart`: this screen is a new destination, not part of the
 * frozen PDR-009 dashboard prototype, so it owns its own (smaller) chart geometry.
 */
function VisitsLineChart({
  points,
  valueKey,
  label,
  color,
}: {
  points: VisitsDayPoint[];
  valueKey: 'pageviews' | 'visitors';
  label: string;
  color: string;
}) {
  const width = 420;
  const height = 120;
  const values = points.map((point) => point[valueKey]);
  const peak = Math.max(...values, 0);
  const max = Math.max(peak * 1.08, 1);
  const x = (index: number) => (index / Math.max(points.length - 1, 1)) * width;
  const y = (value: number) => height - (value / max) * height;
  const line = points
    .map(
      (point, index) =>
        `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(point[valueKey]).toFixed(1)}`,
    )
    .join(' ');
  const area = points.length
    ? `${line} L${x(points.length - 1).toFixed(1)} ${height} L${x(0).toFixed(1)} ${height} Z`
    : '';
  const total = values.reduce((sum, value) => sum + value, 0);
  const gradientId = `visits-gradient-${valueKey}-${color.replace('#', '')}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label}: ${faNum(total)}`}
      className="visits-chart"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.24" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {points.length > 0 ? (
        <>
          <path d={area} fill={`url(#${gradientId})`} stroke="none" />
          <path d={line} fill="none" stroke={color} strokeWidth={2} />
        </>
      ) : null}
    </svg>
  );
}

function SiteCard({ site }: { site: VisitsSiteOverview }) {
  return (
    <article className="card" data-visits-site={site.domain}>
      <div className="card-head">
        <span className="card-title">{site.label}</span>
        <span className="muted-note">{site.domain}</span>
      </div>
      <div className="card-body">
        <div className="operations-grid">
          <div>
            <p className="muted-note">بازدید صفحه</p>
            <p className="kpi-value">{faNum(site.pageviewsTotal)}</p>
            <VisitsLineChart
              points={site.series}
              valueKey="pageviews"
              label="بازدید صفحه"
              color="#6b42df"
            />
          </div>
          <div>
            <p className="muted-note">بازدیدکنندگان یکتا</p>
            <p className="kpi-value">{faNum(site.visitorsTotal)}</p>
            <VisitsLineChart
              points={site.series}
              valueKey="visitors"
              label="بازدیدکنندگان یکتا"
              color="#1a9e6b"
            />
          </div>
        </div>
        {site.series.length > 0 ? (
          <p className="muted-note">
            بازه: {shortDayLabel(site.series[0].date)} تا{' '}
            {shortDayLabel(site.series[site.series.length - 1].date)}
          </p>
        ) : (
          <p className="unavailable">در این بازه بازدیدی ثبت نشده</p>
        )}
        {site.topPages.length > 0 ? (
          <div className="operations-health-list">
            <p className="muted-note">پربازدیدترین صفحات</p>
            {site.topPages.map((page) => (
              <div className="health-row" key={page.path}>
                <span className="health-name">{page.path}</span>
                <span>{faNum(page.count)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/**
 * Admin «گزارش بازدیدها» — numbers and charts for both tracked domains, read entirely from
 * StatsFA via `GET /api/visits/overview`. There is no internal pageview table; inventing traffic
 * figures instead of reading the one real source would be worse than showing nothing.
 */
export function VisitsWorkspace() {
  const [state, setState] = useState<VisitsState>({ kind: 'loading' });
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const response = await fetch('/api/visits/overview', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 401) return setState({ kind: 'expired' });
      if (response.status === 404) return setState({ kind: 'unavailable' });
      if (!response.ok) return setState({ kind: 'error' });
      const body = (await response.json()) as { overview?: VisitsOverview };
      if (!body.overview) return setState({ kind: 'error' });
      return setState({ kind: 'available', overview: body.overview });
    } catch {
      return setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refresh]);

  return (
    <main className="admin-shell cp-workspace visits-workspace" id="visits">
      <AdminSidebar current="visits" />
      <section className="admin-workspace" aria-labelledby="visits-title">
        <div className="page-head">
          <div>
            <h2 id="visits-title">گزارش بازدیدها</h2>
            <p className="muted">بازدید صفحه و بازدیدکنندگان یکتا برای لندینگ و اپ، از StatsFA.</p>
          </div>
          <button className="btn" onClick={() => setRefresh((value) => value + 1)} type="button">
            تازه‌سازی
          </button>
        </div>

        {state.kind === 'loading' ? <LoadingState label="در حال خواندن آمار بازدید…" /> : null}

        {state.kind === 'unavailable' ? (
          <EmptyState
            icon="inbox"
            variant="page"
            title="گزارش بازدید در این محیط فعال نیست"
            description="اتصال StatsFA برای این محیط پیکربندی یا فعال نشده است."
          />
        ) : null}

        {state.kind === 'expired' ? (
          <ErrorState
            tone="amber"
            title="نشست منقضی شده است"
            description="برای مشاهدهٔ گزارش بازدید، دوباره وارد شوید."
          />
        ) : null}

        {state.kind === 'error' ? (
          <ErrorState
            title="گزارش بازدید دریافت نشد"
            description="StatsFA در دسترس نبود یا پاسخ قابل‌فهمی برنگرداند؛ هیچ عدد جایگزینی نمایش داده نشد."
            action={
              <button
                className="btn"
                onClick={() => setRefresh((value) => value + 1)}
                type="button"
              >
                تلاش دوباره
              </button>
            }
          />
        ) : null}

        {state.kind === 'available' ? (
          <>
            <p className="muted-note">{fa(state.overview.windowDays)} روز اخیر</p>
            <div className="operations-grid">
              {state.overview.sites.map((site) => (
                <SiteCard key={site.domain} site={site} />
              ))}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
