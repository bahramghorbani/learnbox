'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { AdminSidebar } from './AdminSidebar';
import { useAdminWorkspaceAccess } from './AdminAuthGate';
import { EmptyState, ErrorState, LoadingState } from './AdminStates';
import { fa, faNum } from './fa-digits';
import { faDay, faDateTime, faRelative } from './fa-dates';

/**
 * Stage 2 — the Admin Dashboard («اتاق کنترل»).
 *
 * Layout, class names and chart geometry come from the APPROVED, DESIGN FROZEN prototype
 * (PDR-009): `prototypes/admin-ui-v1/index.html` on `proto/admin-ui-concept` @ 8b3e050d.
 *
 * The prototype's figures do NOT come with it. Every number here is read from
 * `GET /api/dashboard/overview`, which aggregates in PostgreSQL. That matters for more than
 * tidiness: a dashboard is the one screen an operator trusts without checking, so a plausible
 * invented figure is worse here than a missing one. Hence three rules this file keeps:
 *
 *   1. A metric with no live source renders as «اتصال داده فعال نشده» with an em dash — never 0.
 *      Zero means "measured, and it is zero"; the dash means "we cannot measure it".
 *   2. No total is computed from a list. Counts arrive pre-aggregated, so nothing on screen can
 *      silently mean "…among the five rows this panel happens to show".
 *   3. No learner identity. The panel previews activity, not people; names and phone numbers stay
 *      on the support surface behind its own flag and role.
 */

type Metric =
  | { state: 'available'; value: number }
  | { state: 'unavailable'; reason: 'no_data_source' | 'payments_disabled' };

type DayPoint = { day: string; count: number };
type SalesPoint = { day: string; count: number; revenueTomans: number };

type Overview = {
  generatedAt: string;
  windowDays: number;
  learners: { total: number; joinedInWindow: number; activeInWindow: number; onlineNow: Metric };
  packs: {
    total: number;
    published: number;
    publishedInWindow: number;
    needsReview: number;
    draft: number;
  };
  reviewQueueCards: number;
  schedules: { total: number; byState: { state: string; count: number }[] };
  sales: {
    gatewayEnvironment: 'sandbox' | 'production' | null;
    verifiedTotal: Metric;
    revenueTomansInWindow: Metric;
  };
  learnerGrowth: DayPoint[];
  salesSeries: SalesPoint[] | null;
  recentLearners: { id: string; status: string; joinedAt: string | null }[];
  recentPacks: {
    id: string;
    displayName: string;
    status: string;
    cardCount: number;
    createdAt: string | null;
  }[];
  recentActivity: { action: string; entityType: string; at: string | null }[];
};

type Phase = 'loading' | 'ready' | 'disabled' | 'unauthorized' | 'error';

const unavailableLabels: Record<'no_data_source' | 'payments_disabled', string> = {
  no_data_source: 'اتصال داده فعال نشده',
  payments_disabled: 'پرداخت فعال نشده',
};

/**
 * Canonical `packs.status` in the approved badge treatment, kept identical to `PACK_BADGE` in
 * ContentPacksWorkspace so the same pack cannot read as two different things on two screens.
 * Deliberately a copy and not an import: pulling it from a 48 KB client component would drag that
 * whole workspace into the home bundle. Recorded as LB-B53 — the shared extraction is a refactor
 * of an already-merged stage, not Stage 2 scope.
 */
const packStatusBadges: Record<string, [string, string]> = {
  draft: ['b-grey', 'پیش‌نویس'],
  ai_generated: ['b-grey', 'ساخته‌شده با هوش مصنوعی'],
  needs_review: ['b-amber', 'در انتظار بررسی'],
  approved: ['b-amber', 'تأییدشده'],
  published: ['b-green', 'منتشر شده'],
  archived: ['b-grey', 'بایگانی‌شده'],
};

/** Canonical `users.status` (migration 0028), worded as the support screen words it. */
const learnerStatusBadges: Record<string, [string, string]> = {
  active: ['b-green', 'فعال'],
  disabled: ['b-rose', 'غیرفعال موقت'],
};

/**
 * Canonical `learning_state` (migration 0001). The reference donut legend reads
 * Known/Learning/Unknown, which is not what the scheduler stores — these are the real states, so
 * the slice labels match the data instead of the mock-up.
 */
const scheduleStateLabels: Record<string, string> = {
  new: 'تازه',
  learning: 'در حال یادگیری',
  review: 'در مرور',
  relearning: 'یادگیری مجدد',
  mastered: 'مسلط',
  suspended: 'معلق',
  archived: 'بایگانی',
};

const scheduleStateColors: Record<string, string> = {
  mastered: '#22c07d',
  review: '#6b42df',
  learning: '#c9b6ff',
  relearning: '#f0a33c',
  new: '#e7e3ff',
  suspended: '#d8d6e4',
  archived: '#c3c2cf',
};

type IconName =
  | 'users'
  | 'check'
  | 'box'
  | 'wifi'
  | 'cart'
  | 'money'
  | 'plus'
  | 'phone'
  | 'image'
  | 'sparkle'
  | 'upload'
  | 'shield'
  | 'clock';

/** Inline, so the dashboard adds no icon dependency and no extra request. */
function Icon({ name }: { name: IconName }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };
  const paths: Record<IconName, React.ReactNode> = {
    users: (
      <>
        <circle cx="9" cy="8" r="3.4" />
        <path d="M3 20c0-3.3 2.7-5.4 6-5.4s6 2.1 6 5.4" />
        <path d="M16 11a3 3 0 1 0 0-6" />
        <path d="M18 20c0-2.4-.8-4-2-5" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.5 2.6 2.6L16 9.7" />
      </>
    ),
    box: (
      <>
        <path d="M21 8 12 3 3 8v8l9 5 9-5Z" />
        <path d="m3 8 9 5 9-5" />
        <path d="M12 13v8" />
      </>
    ),
    wifi: (
      <>
        <path d="M5 12.5a9.9 9.9 0 0 1 14 0" />
        <path d="M8.2 15.7a5.4 5.4 0 0 1 7.6 0" />
        <path d="M12 19h.01" />
      </>
    ),
    cart: (
      <>
        <circle cx="9.5" cy="19" r="1.4" />
        <circle cx="17" cy="19" r="1.4" />
        <path d="M3 4h2l2.4 10.2h10.3L20 7H6" />
      </>
    ),
    money: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="3" />
        <circle cx="12" cy="12" r="2.6" />
        <path d="M6.5 12h.01M17.5 12h.01" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    phone: (
      <>
        <rect x="7" y="2.5" width="10" height="19" rx="2.6" />
        <path d="M11 18.5h2" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="4.5" width="18" height="15" rx="3" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m4 17 5-4.4 4 3.4 2.6-2.2L20 17" />
      </>
    ),
    sparkle: (
      <>
        <path d="M12 3.5 13.6 9 19 10.6 13.6 12.2 12 17.7 10.4 12.2 5 10.6 10.4 9Z" />
        <path d="M18.5 16.5 19 18l1.5.5L19 19l-.5 1.5L18 19l-1.5-.5L18 18Z" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V5" />
        <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
        <path d="M4 19h16" />
      </>
    ),
    shield: <path d="M12 21s7-3.3 7-9V6l-7-3-7 3v6c0 5.7 7 9 7 9Z" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5V12l3 2" />
      </>
    ),
  };
  return <svg {...common}>{paths[name]}</svg>;
}

/* ------------------------------------------------------------------ charts */

/**
 * Charts are inline SVG, the same geometry as the frozen prototype's `areaChart`/`barChart`/
 * `donut` helpers — no charting library, nothing to keep patched, and the markup is inspectable.
 * The time axis runs oldest-left to newest-right even on an RTL page, exactly as approved.
 */
function AreaChart({ points, label }: { points: DayPoint[]; label: string }) {
  const width = 460;
  const height = 150;
  const values = points.map((point) => point.count);
  const peak = Math.max(...values);
  // A flat series would make max === min and divide by zero; a floor of 1 keeps a real all-zero
  // day visible as a line on the baseline instead of as NaN.
  const max = Math.max(peak * 1.06, 1);
  const x = (index: number) => (index / Math.max(points.length - 1, 1)) * width;
  const y = (value: number) => height - (value / max) * height;
  const line = points
    .map(
      (point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(point.count).toFixed(1)}`,
    )
    .join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${height} L${x(0).toFixed(1)} ${height} Z`;
  const total = values.reduce((sum, value) => sum + value, 0);

  return (
    <svg
      viewBox={`0 0 ${width} ${height + 26}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label}: ${fa(total)}`}
    >
      <defs>
        <linearGradient id="dashboard-area-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6b42df" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#6b42df" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((gridline) => (
        <line
          key={gridline}
          x1="0"
          y1={(height * gridline).toFixed(0)}
          x2={width}
          y2={(height * gridline).toFixed(0)}
          stroke="#f1f0f5"
          strokeWidth="1"
        />
      ))}
      <path d={area} fill="url(#dashboard-area-gradient)" />
      <path d={line} fill="none" stroke="#6b42df" strokeWidth="2.1" strokeLinejoin="round" />
    </svg>
  );
}

function BarChart({ points, label }: { points: SalesPoint[]; label: string }) {
  const width = 400;
  const height = 150;
  const peakRevenue = Math.max(...points.map((point) => point.revenueTomans), 0);
  const peakCount = Math.max(...points.map((point) => point.count), 0);
  const slot = width / Math.max(points.length, 1);
  const barWidth = Math.min(9, slot * 0.3);
  // Revenue and sale counts share an axis in the reference. They are different units, so each
  // series is scaled against its own peak and the legend names both — a single shared scale would
  // flatten one of them into an invisible sliver and read as "no sales".
  const revenueScale = (value: number) =>
    peakRevenue > 0 ? (value / (peakRevenue * 1.1)) * height : 0;
  const countScale = (value: number) => (peakCount > 0 ? (value / (peakCount * 1.1)) * height : 0);

  return (
    <svg
      viewBox={`0 0 ${width} ${height + 26}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {[0.33, 0.66].map((gridline) => (
        <line
          key={gridline}
          x1="0"
          y1={(height * gridline).toFixed(0)}
          x2={width}
          y2={(height * gridline).toFixed(0)}
          stroke="#f1f0f5"
          strokeWidth="1"
        />
      ))}
      {points.map((point, index) => {
        const center = (index + 0.5) * slot;
        const revenueHeight = revenueScale(point.revenueTomans);
        const countHeight = countScale(point.count);
        return (
          <React.Fragment key={point.day}>
            <rect
              x={(center + 1.5).toFixed(1)}
              y={(height - countHeight).toFixed(1)}
              width={barWidth}
              height={countHeight.toFixed(1)}
              rx="2.5"
              fill="#c9b6ff"
            />
            <rect
              x={(center - barWidth - 1.5).toFixed(1)}
              y={(height - revenueHeight).toFixed(1)}
              width={barWidth}
              height={revenueHeight.toFixed(1)}
              rx="2.5"
              fill="#6b42df"
            />
          </React.Fragment>
        );
      })}
    </svg>
  );
}

function Donut({
  slices,
  centerTop,
  centerSub,
  label,
}: {
  slices: { key: string; share: number; color: string }[];
  centerTop: string;
  centerSub: string;
  label: string;
}) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg viewBox="0 0 140 140" role="img" aria-label={label}>
      {slices.map((slice) => {
        const length = (slice.share / 100) * circumference;
        const segment = (
          <circle
            key={slice.key}
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke={slice.color}
            strokeWidth="17"
            strokeLinecap="round"
            strokeDasharray={`${Math.max(length - 4, 0).toFixed(1)} ${(circumference - length + 4).toFixed(1)}`}
            strokeDashoffset={(-offset).toFixed(1)}
            transform="rotate(-90 70 70)"
          />
        );
        offset += length;
        return segment;
      })}
      <text x="70" y="66" textAnchor="middle" fontSize="16" fontWeight="700" fill="#16182b">
        {centerTop}
      </text>
      <text x="70" y="84" textAnchor="middle" fontSize="10" fill="#6e7182">
        {centerSub}
      </text>
    </svg>
  );
}

/** Five evenly spaced real dates from the series itself — no invented month labels. */
function ChartAxis({ days }: { days: string[] }) {
  if (days.length === 0) return null;
  const picks = [0, 0.25, 0.5, 0.75, 1].map(
    (ratio) => days[Math.min(Math.round(ratio * (days.length - 1)), days.length - 1)],
  );
  return (
    <div className="chart-axis" dir="ltr">
      {picks.map((day, index) => (
        <span key={`${day}-${index}`}>{faDay(day)}</span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- cards */

function KpiCard({
  label,
  icon,
  tint,
  metric,
  delta,
  foot,
  small,
  testId,
}: {
  label: string;
  icon: IconName;
  tint: string;
  metric: Metric;
  delta?: string;
  foot: string;
  small?: boolean;
  testId: string;
}) {
  const unavailable = metric.state === 'unavailable';
  return (
    <div className="kpi" data-kpi={testId} data-metric-state={metric.state}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className={`kpi-ic ${tint}`}>
          <Icon name={icon} />
        </span>
      </div>
      {unavailable ? (
        <div className="kpi-value muted" aria-label={`${label}: در دسترس نیست`}>
          —
        </div>
      ) : (
        <div className={small ? 'kpi-value sm' : 'kpi-value'}>{faNum(metric.value)}</div>
      )}
      <div className="kpi-foot">
        {unavailable ? (
          <span className="unavailable">{unavailableLabels[metric.reason]}</span>
        ) : (
          <>
            {delta ? <span className="delta up">{delta}</span> : null}
            <span>{foot}</span>
          </>
        )}
      </div>
    </div>
  );
}

function Badge({ map, value }: { map: Record<string, [string, string]>; value: string }) {
  const entry = map[value];
  return <span className={`badge ${entry?.[0] ?? 'b-grey'}`}>{entry?.[1] ?? value}</span>;
}

type QuickAction = {
  title: string;
  subtitle: string;
  icon: IconName;
  tone: string;
  href: string;
};

/**
 * Every quick action opens a workspace that really implements it: pack creation, AI generation and
 * file import all live in «محتوا»; splash and slider both live in «نمایش اپ». The reference's
 * decorative row-level kebab menus are deliberately NOT ported — a control that does nothing is a
 * bug with a nice border.
 */
const quickActions: QuickAction[] = [
  {
    title: 'افزودن بستهٔ جدید',
    subtitle: 'دستی یا با هوش مصنوعی',
    icon: 'plus',
    tone: 'primary',
    href: '#content',
  },
  {
    title: 'تغییر اسپلش',
    subtitle: 'مناسبت‌های ویژه',
    icon: 'phone',
    tone: 'amber',
    href: '#presentation',
  },
  {
    title: 'مدیریت اسلایدر',
    subtitle: 'بنرهای داخل اپلیکیشن',
    icon: 'image',
    tone: 'lav',
    href: '#presentation',
  },
  {
    title: 'ساخت بسته با هوش مصنوعی',
    subtitle: 'از یک درخواست، یک بستهٔ کامل',
    icon: 'sparkle',
    tone: 'green',
    href: '#content',
  },
  {
    title: 'درون‌ریزی از فایل',
    subtitle: 'CSV, XLSX',
    icon: 'upload',
    tone: 'blue',
    href: '#content',
  },
];

function activityTint(entityType: string): { icon: IconName; tint: string } {
  if (entityType.startsWith('content_pack') || entityType.startsWith('card'))
    return { icon: 'box', tint: 't-purple' };
  if (entityType.startsWith('user')) return { icon: 'users', tint: 't-blue' };
  if (entityType.startsWith('store') || entityType.startsWith('purchase'))
    return { icon: 'cart', tint: 't-amber' };
  if (entityType.startsWith('admin') || entityType.startsWith('session'))
    return { icon: 'shield', tint: 't-rose' };
  return { icon: 'clock', tint: 't-grey' };
}

/* --------------------------------------------------------------- workspace */

export function DashboardOverview() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [overview, setOverview] = useState<Overview>();

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard/overview', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 404) {
        setPhase('disabled');
        return;
      }
      if (response.status === 401) {
        setPhase('unauthorized');
        return;
      }
      if (!response.ok) throw new Error('overview unavailable');
      const payload = (await response.json()) as { overview?: Overview };
      if (!payload.overview) throw new Error('overview missing');
      setOverview(payload.overview);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase === 'loading') return <LoadingState label="در حال خواندن آمار واقعی از سرور…" />;
  if (phase === 'disabled')
    return (
      <ErrorState
        tone="grey"
        title="داشبورد در این محیط فعال نشده است."
        description="مسیر آماری فقط با فعال‌بودن LEARNBOX_ADMIN_DASHBOARD_ENABLED پاسخ می‌دهد. تا آن زمان هیچ عددی نمایش داده نمی‌شود — نه صفر، نه تخمین."
      />
    );
  if (phase === 'unauthorized')
    return (
      <ErrorState
        tone="amber"
        title="نشست مدیریتی معتبر نیست."
        description="برای دیدن آمار، دوباره با گذرکلید وارد شوید."
      />
    );
  if (phase === 'error' || !overview)
    return (
      <ErrorState
        title="خواندن آمار از سرور ناموفق بود."
        description="هیچ عددی از حافظهٔ مرورگر یا نمونهٔ طراحی جایگزین نمی‌شود. دوباره تلاش کنید."
        action={
          <button className="btn sm" type="button" onClick={() => void load()}>
            تلاش دوباره
          </button>
        }
      />
    );

  const windowLabel = `${fa(overview.windowDays)} روز اخیر`;
  const activeShare =
    overview.learners.total > 0
      ? Math.round((overview.learners.activeInWindow / overview.learners.total) * 100)
      : undefined;
  const growthTotal = overview.learnerGrowth.reduce((sum, point) => sum + point.count, 0);
  const salesTotal = (overview.salesSeries ?? []).reduce((sum, point) => sum + point.count, 0);
  const scheduleTotal = overview.schedules.total;
  const donutSlices = overview.schedules.byState
    .filter((entry) => entry.count > 0)
    .map((entry) => ({
      key: entry.state,
      share: scheduleTotal > 0 ? (entry.count / scheduleTotal) * 100 : 0,
      color: scheduleStateColors[entry.state] ?? '#d8d6e4',
      label: scheduleStateLabels[entry.state] ?? entry.state,
      count: entry.count,
    }));

  return (
    <>
      <section className="kpi-row">
        <KpiCard
          testId="learners-total"
          label="کل کاربران"
          icon="users"
          tint="t-purple"
          metric={{ state: 'available', value: overview.learners.total }}
          delta={
            overview.learners.joinedInWindow > 0
              ? `+${faNum(overview.learners.joinedInWindow)}`
              : undefined
          }
          foot={`کاربر تازه در ${windowLabel}`}
        />
        <KpiCard
          testId="learners-active"
          label={`کاربران فعال (${windowLabel})`}
          icon="check"
          tint="t-green"
          metric={{ state: 'available', value: overview.learners.activeInWindow }}
          delta={activeShare !== undefined ? `${fa(activeShare)}٪` : undefined}
          foot="از کل کاربران ثبت‌شده"
        />
        <KpiCard
          testId="packs-published"
          label="بسته‌های منتشرشده"
          icon="box"
          tint="t-purple"
          metric={{ state: 'available', value: overview.packs.published }}
          delta={
            overview.packs.publishedInWindow > 0
              ? `+${faNum(overview.packs.publishedInWindow)}`
              : undefined
          }
          foot={`انتشار در ${windowLabel}`}
        />
        <KpiCard
          testId="learners-online"
          label="کاربران آنلاین"
          icon="wifi"
          tint="t-blue"
          metric={overview.learners.onlineNow}
          foot="اتصال داده فعال نشده"
        />
        <KpiCard
          testId="sales-count"
          label="بسته‌های فروخته‌شده"
          icon="cart"
          tint="t-amber"
          metric={overview.sales.verifiedTotal}
          foot="خرید تأییدشده"
        />
        <KpiCard
          testId="sales-revenue"
          label={`درآمد ${windowLabel}`}
          icon="money"
          tint="t-rose"
          metric={overview.sales.revenueTomansInWindow}
          foot="تومان"
          small
        />
      </section>

      <section className="charts-row">
        <div className="card" data-chart="learner-growth">
          <div className="card-head">
            <span className="card-title">کاربران تازه</span>
            <span className="select-mini">{windowLabel}</span>
          </div>
          {growthTotal === 0 ? (
            <EmptyState
              title="در این بازه کاربری ثبت‌نام نکرده است."
              description="نمودار خالی می‌ماند؛ خط صفر ساختگی رسم نمی‌شود."
            />
          ) : (
            <div className="chart-wrap">
              <AreaChart points={overview.learnerGrowth} label="ثبت‌نام روزانهٔ کاربران" />
              <ChartAxis days={overview.learnerGrowth.map((point) => point.day)} />
            </div>
          )}
        </div>

        <div className="card" data-chart="sales">
          <div className="card-head">
            <span className="card-title">فروش بسته‌ها</span>
            <span className="select-mini">{windowLabel}</span>
          </div>
          {overview.salesSeries === null ? (
            <div data-metric-state="unavailable">
              <EmptyState
                title="اتصال داده فعال نشده"
                description="درگاه پرداخت در این محیط فعال نیست، پس هیچ عدد فروشی وجود ندارد که نشان داده شود."
              />
            </div>
          ) : salesTotal === 0 ? (
            <EmptyState
              title="در این بازه فروشی ثبت نشده است."
              description="درگاه فعال است و هیچ خرید تأییدشده‌ای در بازه وجود ندارد."
            />
          ) : (
            <>
              <div className="chart-legend-wrap">
                <div className="chart-legend">
                  <span>
                    <i className="legend-dot" style={{ background: '#6b42df' }} />
                    درآمد (تومان)
                  </span>
                  <span>
                    <i className="legend-dot" style={{ background: '#c9b6ff' }} />
                    تعداد فروش
                  </span>
                </div>
              </div>
              <div className="chart-wrap">
                <BarChart points={overview.salesSeries} label="فروش روزانهٔ بسته‌ها" />
                <ChartAxis days={overview.salesSeries.map((point) => point.day)} />
              </div>
            </>
          )}
        </div>

        <div className="card" data-chart="schedule-states">
          <div className="card-head">
            <span className="card-title">وضعیت زمان‌بندی کارت‌ها</span>
            <span className="select-mini">همهٔ بسته‌ها</span>
          </div>
          {scheduleTotal === 0 ? (
            <EmptyState
              title="هنوز هیچ کارتی زمان‌بندی نشده است."
              description="این نمودار از زمان‌بندی واقعی کارت‌های کاربران خوانده می‌شود."
            />
          ) : (
            <div className="donut-row">
              <Donut
                slices={donutSlices}
                centerTop={faNum(scheduleTotal)}
                centerSub="کارت"
                label="توزیع وضعیت زمان‌بندی کارت‌ها"
              />
              <div className="donut-legend">
                {donutSlices.map((slice) => (
                  <div key={slice.key}>
                    <i className="legend-dot" style={{ background: slice.color }} />
                    <span className="pc">{fa(Math.round(slice.share))}٪</span>
                    <span className="nm">{slice.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="card qa-card">
        <div className="card-head">
          <span className="card-title">اقدامات سریع</span>
        </div>
        <div className="qa-grid">
          {quickActions.map((action) => (
            <a className={`qa ${action.tone}`} href={action.href} key={action.title}>
              <div>
                <div className="qa-t">{action.title}</div>
                <div className="qa-s">{action.subtitle}</div>
              </div>
              <span className="qa-ic">
                <Icon name={action.icon} />
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className="panels-row">
        <div className="card" data-panel="recent-learners">
          <div className="card-head">
            <span className="card-title">کاربران اخیر</span>
            <a className="link-more" href="#users">
              مشاهده همه
            </a>
          </div>
          <div className="card-body">
            {overview.recentLearners.length === 0 ? (
              <EmptyState title="هنوز کاربری ثبت‌نام نکرده است." />
            ) : (
              <div className="list">
                {overview.recentLearners.map((learner) => (
                  <div className="list-row" key={learner.id}>
                    <div className="avatar" aria-hidden="true">
                      <Icon name="users" />
                    </div>
                    <div className="list-grow">
                      {/* Identity stays on the support surface: an overview needs the account, not
                          the person. */}
                      <div className="list-title">{`کاربر ${learner.id.slice(0, 8)}`}</div>
                      <div className="list-sub">عضویت: {faDay(learner.joinedAt)}</div>
                    </div>
                    <Badge map={learnerStatusBadges} value={learner.status} />
                    <span className="list-time" title={faDateTime(learner.joinedAt)}>
                      {faRelative(learner.joinedAt, new Date(overview.generatedAt))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card" data-panel="recent-packs">
          <div className="card-head">
            <span className="card-title">بسته‌های جدید و در حال بررسی</span>
            <a className="link-more" href="#content">
              مشاهده همه
            </a>
          </div>
          <div className="card-body">
            {overview.recentPacks.length === 0 ? (
              <EmptyState title="هنوز بسته‌ای ساخته نشده است." />
            ) : (
              <div className="list">
                {overview.recentPacks.map((pack) => (
                  <div className="list-row" key={pack.id}>
                    <div className="cover" aria-hidden="true" />
                    <div className="list-grow">
                      <div className="list-title">{pack.displayName}</div>
                      <div className="list-sub">{faNum(pack.cardCount)} کارت</div>
                    </div>
                    <Badge map={packStatusBadges} value={pack.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* The frozen nav has nine items and no review entry, so «بازبینی محتوا» is reachable
              from the screen that previews its queue. Without this link the review workspace would
              have no entry point at all once the dashboard took over «خانه». */}
          <a className="panel-foot-link" href="#review">
            <span>صف بازبینی محتوا</span>
            <span>{faNum(overview.reviewQueueCards)} کارت</span>
          </a>
        </div>

        <div className="card" data-panel="recent-activity">
          <div className="card-head">
            <span className="card-title">فعالیت‌های اخیر</span>
            <a className="link-more" href="#audit">
              مشاهده همه
            </a>
          </div>
          <div className="card-body">
            {overview.recentActivity.length === 0 ? (
              <EmptyState title="هنوز فعالیتی ثبت نشده است." />
            ) : (
              <div className="list">
                {overview.recentActivity.map((entry, index) => {
                  const look = activityTint(entry.entityType);
                  return (
                    <div className="list-row" key={`${entry.action}-${entry.at}-${index}`}>
                      <span className={`act-ic ${look.tint}`}>
                        <Icon name={look.icon} />
                      </span>
                      <div className="list-grow">
                        {/* The raw canonical action, as the audit workspace shows it. A friendly
                            translation of an unknown action is a guess about what happened. */}
                        <div className="list-title" dir="ltr">
                          {entry.action}
                        </div>
                        <div className="list-sub" dir="ltr">
                          {entry.entityType}
                        </div>
                      </div>
                      <span className="list-time" title={faDateTime(entry.at)}>
                        {faRelative(entry.at, new Date(overview.generatedAt))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * The Admin home screen. Without a server session it renders a shell with no figures at all: the
 * aggregates are fetched, never bundled, so an anonymous visitor or a cached asset cannot carry a
 * single learner or revenue number out of the Admin.
 */
export function DashboardWorkspace() {
  const access = useAdminWorkspaceAccess();
  const serverAuthenticated = access === 'server-authenticated';

  return (
    <main className="admin-shell cp-workspace" id="home">
      <AdminSidebar current="home" />
      <section className="admin-workspace">
        <div className="page-head">
          <div>
            <h1>اتاق کنترل</h1>
            <p className="muted">
              نمای کلی LearnBox از دادهٔ واقعی backend مرکزی. هر عدد مستقیم از دیتابیس خوانده
              می‌شود؛ شاخصی که منبع فعال ندارد خالی می‌ماند و صفر نشان داده نمی‌شود.
            </p>
          </div>
          <div className="head-actions">
            <span
              className={serverAuthenticated ? 'chip on' : 'chip'}
              aria-label="وضعیت پنل"
              data-dashboard-session={serverAuthenticated ? 'server-authenticated' : 'signed-out'}
            >
              {serverAuthenticated ? 'ورود امن فعال' : 'بدون ورود'}
            </span>
          </div>
        </div>

        {serverAuthenticated ? (
          <DashboardOverview />
        ) : (
          <div data-dashboard-unavailable="true">
            <ErrorState
              tone="amber"
              title="برای مشاهدهٔ آمار باید با ورود امن وارد شوید."
              description="بدون نشست گذرکلید هیچ آماری خوانده نمی‌شود و هیچ عددی در بستهٔ مرورگر نیست."
            />
          </div>
        )}
      </section>
    </main>
  );
}
