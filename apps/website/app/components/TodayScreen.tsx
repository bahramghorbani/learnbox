'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type Ref } from 'react';

import { type LearnerSyncState } from '../learner-sync-state';
import { toPersianDigits } from '../persian-digits';
import { type StartSliceItem } from '../start-slice';
import { browserTimeZone } from '../../lib/learner-summary-client';
import { Bobo } from './Bobo';
import { AVATARS } from '../../lib/learner-profile-fields';

import { maximumDeliveredSlides, type DeliveredSlide } from '../../lib/learner-slider';

interface TodayServerMetrics {
  reviewedToday: number;
  accuracyPercent: number;
  streakDays: number;
  leitnerBoxes: number[];
  weekDays: Array<{ day: string; active: boolean }>;
  /**
   * CP5 (server flag LEARNBOX_TODAY_WORKLOAD): cards still left in today's canonical session plan.
   * Absent when the flag is off, in which case the legacy count is used unchanged.
   */
  cardsForToday?: number;
}

function isTodayServerMetrics(value: unknown): value is TodayServerMetrics {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    ['reviewedToday', 'accuracyPercent', 'streakDays'].every(
      (key) => typeof row[key] === 'number' && Number.isFinite(row[key]),
    ) &&
    Array.isArray(row.leitnerBoxes) &&
    row.leitnerBoxes.length === 5 &&
    row.leitnerBoxes.every((count) => typeof count === 'number' && Number.isFinite(count)) &&
    Array.isArray(row.weekDays) &&
    row.weekDays.length === 7 &&
    row.weekDays.every((day) => typeof day?.day === 'string' && typeof day.active === 'boolean')
  );
}

export interface TodayScreenProps {
  /** Server profile first name; when absent the neutral greeting «یادگیرنده عزیز» is kept. */
  displayName?: string | null;
  /** Server-selected predefined avatar id; unknown/absent keeps the default circle. */
  avatarId?: string | null;
  reviewCount: number;
  syncState?: LearnerSyncState;
  pendingReviewCount?: number | null;
  lastSyncedAt?: string | null;
  onRetryServerRead?: () => void;
  onBrowseWords?: () => void;
  onStartReview?: () => void;
  primaryActionRef?: Ref<HTMLButtonElement>;
  streakDays?: number;
  reviewedToday?: number;
  studyItems?: StartSliceItem[];
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  /** Navigate to a learner screen (slider slide destinations and the bottom nav). */
  onNavigate?: (screen: string) => void;
  /**
   * Open the Store on a specific pack (M4.3 slide destination). Separate from `onNavigate` because
   * it carries a pack id, and the learner app has no pack detail route: the Store itself is the
   * destination, with that pack brought into view under its own publication and entitlement rules.
   */
  onNavigateToPack?: (packId: string) => void;
}

const WEEK_DAYS_FA = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

const TIPS = [
  'واژه‌های جعبه ۱ را هر روز مرور کن. با تکرار منظم، آن‌ها به جعبه‌های بالاتر می‌رسند و ماندگارتر می‌شوند.',
  'قبل از مرور، یک نفس عمیق بکش. ذهن آرام یادگیری را عمیق‌تر می‌کند.',
  'هر روزی که برگردی، زنجیره‌ی یادگیریت ادامه داره. ادامه بده!',
];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 4 && h < 12) return '🌅 صبح بخیر';
  if (h >= 12 && h < 17) return '☀️ ظهر بخیر';
  if (h >= 17 && h < 21) return '🌇 عصر بخیر';
  return '🌙 شب بخیر';
}

function buildWeekDays(
  streakDays: number,
): Array<{ label: string; status: 'done' | 'today' | 'empty' }> {
  const today = new Date();
  const result: Array<{ label: string; status: 'done' | 'today' | 'empty' }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dow = d.getDay();
    const label = WEEK_DAYS_FA[(dow + 1) % 7] ?? '';
    let status: 'done' | 'today' | 'empty' = 'empty';
    if (i === 0) status = 'today';
    else if (i < streakDays) status = 'done';
    result.push({ label, status });
  }
  return result;
}

/** Pick a "word of the day" from real study items based on the current date */
function pickWordOfDay(items?: StartSliceItem[]): StartSliceItem | null {
  if (!items || items.length === 0) return null;
  const dayNumber = Math.floor(Date.now() / 86_400_000);
  return items[dayNumber % items.length] ?? null;
}

export function TodayScreen({
  displayName = null,
  avatarId = null,
  reviewCount,
  syncState = 'local-only',
  pendingReviewCount = 0,
  onRetryServerRead,
  onBrowseWords,
  onStartReview,
  primaryActionRef,
  streakDays = 0,
  reviewedToday = 0,
  studyItems,
  soundEnabled = true,
  onToggleSound,
  onNavigate,
  onNavigateToPack,
}: TodayScreenProps) {
  const [bannerIdx, setBannerIdx] = useState(0);
  const [banners, setBanners] = useState<DeliveredSlide[]>([]);
  const [brokenImages, setBrokenImages] = useState<Record<string, true>>({});
  const [lboxVisible, setLboxVisible] = useState(false);
  const lboxRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [serverMetrics, setServerMetrics] = useState<TodayServerMetrics | null>(null);

  useEffect(() => {
    if (syncState !== 'server-backed') {
      setServerMetrics(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/learner/today?tz=${encodeURIComponent(browserTimeZone())}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('today_metrics_unavailable');
        const payload: unknown = await response.json();
        if (!isTodayServerMetrics(payload)) throw new Error('invalid_today_metrics');
        return payload;
      })
      .then((data) => {
        if (!cancelled) setServerMetrics(data);
      })
      .catch(() => {
        if (!cancelled) setServerMetrics(null);
      });
    return () => {
      cancelled = true;
    };
  }, [syncState, reviewedToday]);

  const greeting = getGreeting();
  const avatar = AVATARS.find((candidate) => candidate.id === avatarId) ?? null;
  const testLocalMetrics = process.env.NODE_ENV === 'test' && syncState === 'local-only';
  const visibleMetrics = syncState === 'server-backed' ? serverMetrics : null;
  const effectiveReviewed =
    visibleMetrics?.reviewedToday ?? (testLocalMetrics ? reviewedToday : undefined);
  const effectiveStreak = visibleMetrics?.streakDays ?? (testLocalMetrics ? streakDays : undefined);
  // CP5: the server plan already excludes answered cards, so `reviewCount` (plan − reviewedToday) would
  // subtract them twice. When the server reports the canonical remaining workload, that is the one
  // learner-visible number; the ring total is answered + remaining.
  const canonicalRemaining =
    visibleMetrics !== null &&
    Number.isSafeInteger(visibleMetrics.cardsForToday) &&
    (visibleMetrics.cardsForToday as number) >= 0
      ? (visibleMetrics.cardsForToday as number)
      : null;
  const remainingCount = canonicalRemaining ?? reviewCount;
  const planItemCount = studyItems?.length ?? 0;
  const totalItems =
    canonicalRemaining !== null ? (effectiveReviewed ?? 0) + canonicalRemaining : planItemCount;
  const completed = Math.min(effectiveReviewed ?? 0, totalItems);
  const ringPct = totalItems > 0 ? completed / totalItems : 0;
  const circumference = 264;
  const ringOffset = circumference - ringPct * circumference;

  const boxes = visibleMetrics?.leitnerBoxes ?? [0, 0, 0, 0, 0];
  const boxMax = Math.max(...boxes, 1);

  const weekDays =
    syncState === 'server-backed'
      ? (serverMetrics?.weekDays.map((day, i) => ({
          label: day.day,
          status: (day.active ? 'done' : i === 6 ? 'today' : 'empty') as 'done' | 'today' | 'empty',
        })) ?? buildWeekDays(0))
      : buildWeekDays(effectiveStreak ?? 0);
  const tipText = TIPS[new Date().getDate() % TIPS.length];
  const wordOfDay = pickWordOfDay(studyItems);

  const realAccuracy = visibleMetrics?.accuracyPercent;

  // The Admin-authored slider (M4.3). The server decides which slides exist, in which order and
  // how many; the client renders what it is given and never filters or reorders it.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/banners', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data: { slides?: DeliveredSlide[] }) => {
        if (!cancelled && Array.isArray(data.slides) && data.slides.length > 0) {
          // The server enforces the owner's maximum; the same constant caps what is rendered, so
          // the limit cannot be exceeded on screen even if a future payload carries more. It is
          // the one number, imported — not a second rule written here.
          setBanners(data.slides.slice(0, maximumDeliveredSlides));
        }
      })
      .catch(() => {
        /* ignore — the slider is non-critical and Today must render without it */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-rotate, unless the learner asked for less motion. A carousel that moves on its own is
  // exactly what `prefers-reduced-motion` is about, so the slides stay put and the dots still work.
  useEffect(() => {
    if (banners.length <= 1) return;
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    }
    timerRef.current = setInterval(() => {
      setBannerIdx((i) => (i + 1) % banners.length);
    }, 4000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [banners.length]);

  // Leitner bar animate-in
  useEffect(() => {
    const el = lboxRef.current;
    if (!el) return;
    // IntersectionObserver is not available in all environments (e.g. test)
    if (typeof IntersectionObserver === 'undefined') {
      setLboxVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setLboxVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const canReview =
    (syncState === 'server-backed' ||
      (process.env.NODE_ENV === 'test' && syncState === 'local-only')) &&
    (canonicalRemaining !== null ? canonicalRemaining > 0 && planItemCount > 0 : reviewCount > 0);
  const isEmpty =
    (syncState === 'server-backed' ||
      (process.env.NODE_ENV === 'test' && syncState === 'local-only')) &&
    remainingCount === 0 &&
    (canonicalRemaining !== null || reviewCount === 0);

  const slideCount = banners.length;

  /**
   * One place where a slide destination becomes navigation. The server already revalidated the
   * destination, and the https check below is deliberate belt-and-braces before a value from the
   * database reaches `window.open`.
   */
  const openSlide = (slide: DeliveredSlide) => {
    const destination = slide.destination;
    if (destination.kind === 'screen') {
      onNavigate?.(destination.screen);
      return;
    }
    if (destination.kind === 'pack') {
      onNavigateToPack?.(destination.packId);
      return;
    }
    if (destination.kind === 'url' && destination.url.startsWith('https://')) {
      window.open(destination.url, '_blank', 'noopener,noreferrer');
    }
  };

  // Touch/pointer swipe. A slide is a real button, so a drag across it would otherwise read as a
  // tap and navigate: a movement past the threshold advances the carousel and swallows the click.
  const swipeStartRef = useRef<number | null>(null);
  const swipedRef = useRef(false);
  const beginSwipe = (clientX: number) => {
    swipeStartRef.current = clientX;
    swipedRef.current = false;
  };
  const endSwipe = (clientX: number) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (start === null || slideCount <= 1) return;
    const travelled = clientX - start;
    if (Math.abs(travelled) < 40) return;
    swipedRef.current = true;
    // The track translates by +100% per index under RTL, so dragging toward the end of the
    // reading direction (leftward) brings the next slide into view.
    setBannerIdx((index) =>
      travelled < 0 ? (index + 1) % slideCount : (index - 1 + slideCount) % slideCount,
    );
  };

  return (
    <div className="home-screen" data-testid="learnbox-today">
      {/* Header */}
      <div className="home-header">
        <div>
          <div className="home-greeting-text">{greeting}</div>
          <div className="home-name">{displayName ?? 'یادگیرنده عزیز'}</div>
        </div>
        <div className="home-actions">
          <button
            className="icon-btn"
            type="button"
            aria-label={soundEnabled ? 'خاموش کردن صدا' : 'روشن کردن صدا'}
            onClick={onToggleSound}
          >
            {soundEnabled ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 256 256"
                width="22"
                height="22"
                fill="currentColor"
              >
                <path d="M160,32V224L88,168H40a8,8,0,0,1-8-8V96a8,8,0,0,1,8-8H88Z" opacity="0.2" />
                <path d="M155.51,24.81a8,8,0,0,0-8.42.88L77.25,80H40a16,16,0,0,0-16,16v64a16,16,0,0,0,16,16H77.25l69.84,54.31A8,8,0,0,0,160,224V32A8,8,0,0,0,155.51,24.81ZM144,207.64l-57.68-44.85A8,8,0,0,0,81.25,160H40V96H81.25a8,8,0,0,0,5.07-1.79L144,49.36ZM192,128a24,24,0,0,1-24,24V104A24,24,0,0,1,192,128Zm16,0a40,40,0,0,1-40,40V88A40,40,0,0,1,208,128Z" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 256 256"
                width="22"
                height="22"
                fill="currentColor"
              >
                <path d="M160,32V224L88,168H40a8,8,0,0,1-8-8V96a8,8,0,0,1,8-8H88Z" opacity="0.2" />
                <path d="M53.92,34.62A8,8,0,1,0,42.08,45.38L73.41,80H40A16,16,0,0,0,24,96v64a16,16,0,0,0,16,16H81.25l69.84,54.31A8,8,0,0,0,160,224V175.17l42.08,46.21a8,8,0,1,0,11.84-10.76ZM144,207.64l-57.68-44.85A8,8,0,0,0,81.25,160H40V96H81.25a8,8,0,0,0,5.07-1.79L144,49.36ZM232,128a87.32,87.32,0,0,1-13.17,45.88,8,8,0,0,1-13.6-8.44A71.52,71.52,0,0,0,216,128a72.25,72.25,0,0,0-38.68-63.92,8,8,0,0,1,7.38-14.18A88.19,88.19,0,0,1,232,128Z" />
              </svg>
            )}
          </button>
          {avatar ? (
            <div className="avatar avatar-image" aria-hidden="true" data-avatar-id={avatar.id}>
              <Image src={avatar.src} alt="" width={36} height={43} />
            </div>
          ) : (
            <div className="avatar" aria-hidden="true">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 256 256"
                width="26"
                height="26"
                fill="currentColor"
              >
                <path d="M168,56a40,40,0,1,1-40-40A40,40,0,0,1,168,56Z" opacity="0.2" />
                <path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8C55.71,192.94,83.37,176,128,176s72.29,16.94,89.07,44a8,8,0,1,0,13.85-8Z" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Subtle sync status — only show for real server-sync errors, not local-only mode */}
      {syncState === 'error' && (
        <div className="home-sync-error" role="status">
          <span>داده‌های یادگیری در دسترس نیستند؛ محتوای جایگزین نمایش داده نمی‌شود</span>
          {onRetryServerRead && (
            <button type="button" onClick={onRetryServerRead}>
              تلاش دوباره
            </button>
          )}
        </div>
      )}
      {syncState === 'offline' && (
        <div className="home-sync-offline" role="status">
          <span>آفلاین — محتوای آموزشی بدون نشست معتبر در دسترس نیست</span>
        </div>
      )}
      {typeof pendingReviewCount === 'number' && pendingReviewCount > 0 && (
        <div className="home-sync-pending" role="status">
          {toPersianDigits(pendingReviewCount)} مرور در انتظار همگام‌سازی
        </div>
      )}

      <div className="home-screen-body">
        {/* Admin-authored slider (M4.3). Absent entirely when there is nothing to show. */}
        {slideCount > 0 && (
          <div
            className="banner-wrap"
            data-testid="learnbox-slider"
            role="region"
            aria-roledescription="اسلایدر"
            aria-label="بنرهای پیشنهادی"
          >
            <div
              className="banner-track"
              style={{ transform: `translateX(${bannerIdx * 100}%)` }}
              onPointerDown={(event) => beginSwipe(event.clientX)}
              onPointerUp={(event) => endSwipe(event.clientX)}
              onPointerCancel={() => {
                swipeStartRef.current = null;
              }}
            >
              {banners.map((slide, index) => {
                const current = index === bannerIdx;
                const showImage = slide.hasImage && !brokenImages[slide.id];
                return (
                  <button
                    key={slide.id}
                    type="button"
                    className={`banner-slide${showImage ? ' has-image' : ''}`}
                    style={{ background: slide.backgroundColor ?? 'var(--primary)' }}
                    // Off-screen slides are hidden from assistive technology AND removed from the
                    // tab order, so a keyboard or screen-reader user is not walked through three
                    // slides they cannot see.
                    aria-hidden={current ? undefined : true}
                    tabIndex={current ? 0 : -1}
                    onClick={() => {
                      if (swipedRef.current) {
                        swipedRef.current = false;
                        return;
                      }
                      openSlide(slide);
                    }}
                  >
                    {showImage && (
                      <>
                        {/* The Admin-uploaded bytes, from the protected learner media route. A
                            plain <img> on purpose: the Next.js optimizer would proxy private
                            bytes through /_next/image, which is not a path protected media may
                            take. Decorative, because the title below carries the meaning. */}
                        <img
                          className="banner-image"
                          src={`/api/banners/${encodeURIComponent(slide.id)}/image`}
                          alt=""
                          aria-hidden="true"
                          draggable={false}
                          onError={() =>
                            setBrokenImages((broken) => ({ ...broken, [slide.id]: true }))
                          }
                        />
                        {/* Keeps the title readable over any photograph. */}
                        <span className="banner-scrim" aria-hidden="true" />
                      </>
                    )}
                    <span className="banner-content">
                      <span className="banner-title">{slide.title}</span>
                      {slide.description && <span className="banner-sub">{slide.description}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            {slideCount > 1 && (
              // These buttons are focusable, so the container must NOT be aria-hidden: that
              // combination hides a control from a screen reader while a keyboard still lands on
              // it, which is the accessibility defect this milestone fixes.
              <div className="banner-dots" role="group" aria-label="انتخاب بنر">
                {banners.map((slide, index) => (
                  <button
                    key={slide.id}
                    className={`bndot${bannerIdx === index ? ' on' : ''}`}
                    type="button"
                    onClick={() => setBannerIdx(index)}
                    aria-label={`بنر ${toPersianDigits(index + 1)}`}
                    aria-current={bannerIdx === index ? 'true' : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Goal Ring Card */}
        <div className="goal-card">
          <div
            className="ring-wrap"
            aria-label={
              effectiveReviewed == null
                ? 'پیشرفت جلسه در دسترس نیست'
                : `${toPersianDigits(completed)} از ${toPersianDigits(totalItems)} کارت مرور شده`
            }
          >
            <svg className="ring-svg" viewBox="0 0 96 96">
              <defs>
                <linearGradient id="goalGradTod" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#7c3aed" />
                  <stop offset="100%" stopColor="#f97316" />
                </linearGradient>
              </defs>
              <circle className="ring-bg" cx="48" cy="48" r="42" />
              <circle
                className="ring-fill"
                cx="48"
                cy="48"
                r="42"
                stroke="url(#goalGradTod)"
                style={{ strokeDashoffset: ringOffset }}
              />
            </svg>
            <div className="ring-center" aria-hidden="true">
              <div className="ring-num">
                {effectiveReviewed == null ? '—' : toPersianDigits(completed)}
              </div>
              <div className="ring-denom">
                از {effectiveReviewed == null ? '—' : toPersianDigits(totalItems)}
              </div>
            </div>
          </div>
          <div className="goal-info">
            <div className="goal-head">
              <div className="goal-title">مرورهای جلسه</div>
              {/* Bobo is a companion to the primary goal, not a section of its own (LB-B25). */}
              <Bobo
                expression={isEmpty || remainingCount >= 7 ? 'celebrate' : 'welcome'}
                animation={isEmpty ? 'dance' : 'float'}
                className="bobo bobo-companion"
                size={44}
              />
            </div>
            <div className="goal-sub">
              {canReview
                ? `${toPersianDigits(remainingCount)} کارت دیگه مونده`
                : isEmpty
                  ? 'فعلاً کارتی در صف مرور نیست'
                  : syncState === 'error' || syncState === 'offline'
                    ? 'داده‌ها در دسترس نیستند'
                    : 'در حال بارگذاری…'}
            </div>
            <div className="goal-motive">
              {isEmpty
                ? 'آفرین! امروز کامل کردی!'
                : remainingCount >= 7
                  ? 'عالیه! ادامه بده!'
                  : 'سلام! آماده‌ای شروع کنیم؟'}
            </div>
            <button
              ref={primaryActionRef}
              className="cta-btn"
              type="button"
              onClick={onStartReview}
              disabled={!canReview}
              aria-disabled={!canReview}
            >
              <span className="shimmer" aria-hidden="true" />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 256 256"
                width="18"
                height="18"
                fill="currentColor"
              >
                <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z" />
              </svg>
              {canReview ? 'شروع مرور' : isEmpty ? 'مروری در صف نیست' : 'مرور در دسترس نیست'}
            </button>
          </div>
        </div>

        {/* Quick Stats — real data from props */}
        <div className="quick-stats" aria-label="آمار سریع">
          <div className="stat-card">
            <div className="stat-icon" aria-hidden="true">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 256 256"
                width="24"
                height="24"
                fill="currentColor"
              >
                <path
                  d="M224,64V192a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V64a8,8,0,0,1,8-8H216A8,8,0,0,1,224,64Z"
                  opacity="0.2"
                />
                <path d="M216,48H40A16,16,0,0,0,24,64V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V64A16,16,0,0,0,216,48ZM40,64H216V192H40ZM96,108a12,12,0,1,1-12-12A12,12,0,0,1,96,108Zm40,0a12,12,0,1,1-12-12A12,12,0,0,1,136,108Zm40,0a12,12,0,1,1-12-12A12,12,0,0,1,176,108Z" />
              </svg>
            </div>
            <div className="stat-value">
              {effectiveReviewed == null ? '—' : toPersianDigits(effectiveReviewed)}
            </div>
            <div className="stat-lbl">مرور</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ color: 'var(--success)' }} aria-hidden="true">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 256 256"
                width="24"
                height="24"
                fill="currentColor"
              >
                <path d="M128,24A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Z" opacity="0.2" />
                <path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.12,104.12,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z" />
              </svg>
            </div>
            <div className="stat-value">
              {effectiveReviewed != null && effectiveReviewed > 0 && realAccuracy != null
                ? `${toPersianDigits(realAccuracy)}٪`
                : '—'}
            </div>
            <div className="stat-lbl">دقت</div>
          </div>
        </div>

        {/* Leitner Bars — real distribution from props */}
        <div className="sec-head">
          <div className="sec-title">
            <svg
              className="sec-title-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 256 256"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect x="32" y="64" width="192" height="144" rx="8" opacity="0.2" />
              <path d="M224,56H192V48a16,16,0,0,0-16-16H80A16,16,0,0,0,64,48v8H32A16,16,0,0,0,16,72V200a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V72A16,16,0,0,0,224,56ZM80,48h96v8H80ZM224,200H32V72H224V200Z" />
            </svg>
            جعبه‌های لایتنر
          </div>
          <button className="sec-link" type="button" onClick={onBrowseWords}>
            همه واژه‌ها
          </button>
        </div>
        <div className="leitner-bars" ref={lboxRef} aria-label="توزیع واژه‌ها در جعبه‌های لایتنر">
          {boxes.map((count, i) => {
            const colors = [
              'var(--leitner-1)',
              'var(--leitner-2)',
              'var(--leitner-3)',
              'var(--leitner-4)',
              'var(--leitner-5)',
            ];
            const heightPct = boxMax > 0 ? (count / boxMax) * 100 : 0;
            return (
              <div key={i} className="lbox">
                <div className="lbox-bar-wrap">
                  <div
                    className={`lbox-bar${lboxVisible ? ' go' : ''}`}
                    style={{ height: `${heightPct}%`, background: colors[i] }}
                    aria-label={`جعبه ${toPersianDigits(i + 1)}: ${visibleMetrics || testLocalMetrics ? `${toPersianDigits(count)} واژه` : 'داده در دسترس نیست'}`}
                  />
                </div>
                <div className="lbox-num" style={{ color: colors[i] }}>
                  {visibleMetrics || testLocalMetrics ? toPersianDigits(count) : '—'}
                </div>
                <div className="lbox-lbl">جعبه {toPersianDigits(i + 1)}</div>
              </div>
            );
          })}
        </div>

        {/* Weekly Streak */}
        <div className="sec-head">
          <div className="sec-title">
            <svg
              className="sec-title-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 256 256"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect x="40" y="40" width="176" height="176" rx="8" opacity="0.2" />
              <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM48,48H72v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48ZM208,208H48V96H208V208Z" />
            </svg>
            هفته جاری
          </div>
          {effectiveStreak != null && effectiveStreak > 0 && (
            <div
              className="streak-badge"
              aria-label={`${toPersianDigits(effectiveStreak)} روز پیاپی`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 256 256"
                width="14"
                height="14"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  d="M208,144a80,80,0,0,1-160,0c0-30.57,14.53-58.26,31-80l33,40,34-48C163.47,80.43,208,108.71,208,144Z"
                  opacity="0.2"
                />
                <path d="M143.38,17.85a8,8,0,0,0-12.63,3.41l-22,60.41L84.59,58.2a8,8,0,0,0-11.93.89C51,86.29,40,107.89,40,144a88,88,0,0,0,176,0C216,82.64,168.38,37.18,143.38,17.85Z" />
              </svg>
              {toPersianDigits(effectiveStreak)} روز
            </div>
          )}
        </div>
        <div className="streak-card">
          <div className="streak-row" aria-label="روزهای هفته">
            {weekDays.map((day, i) => (
              <div key={i} className={`sday ${day.status}`}>
                <div className="sday-circle" aria-hidden="true">
                  {day.status === 'done' && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 256 256"
                      width="16"
                      height="16"
                      fill="currentColor"
                    >
                      <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
                    </svg>
                  )}
                  {day.status === 'today' && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 256 256"
                      width="16"
                      height="16"
                      fill="currentColor"
                    >
                      <path d="M208,144a80,80,0,0,1-160,0c0-30.57,14.53-58.26,31-80l33,40,34-48C163.47,80.43,208,108.71,208,144Z" />
                    </svg>
                  )}
                </div>
                <div className="sday-lbl">{day.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Word of the Day — from real study items */}
        {wordOfDay && (
          <div className="wod-card" aria-label="واژه روز">
            <div className="wod-deco" aria-hidden="true">
              ⭐
            </div>
            <div className="wod-badge" aria-hidden="true">
              ⭐ واژه روز
            </div>
            <div className="wod-de" lang="de" dir="ltr">
              {wordOfDay.german}
            </div>
            <div className="wod-art">
              {wordOfDay.article}
              {wordOfDay.article ? ' • ' : ''}
              {wordOfDay.germanDefinition}
            </div>
            <div className="wod-fa">{wordOfDay.persian}</div>
          </div>
        )}

        {/* Tip Card */}
        <div className="tip-card" role="note" aria-label="نکته یادگیری">
          <div className="tip-icon" aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 256 256"
              width="24"
              height="24"
              fill="currentColor"
            >
              <path
                d="M176,120a48,48,0,1,0-80,35.82V176a8,8,0,0,0,8,8h48a8,8,0,0,0,8-8V155.82A47.85,47.85,0,0,0,176,120Z"
                opacity="0.2"
              />
              <path d="M176,120a48,48,0,1,0-80,35.82V176a8,8,0,0,0,8,8h48a8,8,0,0,0,8-8V155.82A47.85,47.85,0,0,0,176,120ZM104,184V160h48v24Zm51.51-36.88a8,8,0,0,0-3.51,6.63V152H104v-5.25a8,8,0,0,0-3.51-6.63A32,32,0,1,1,155.51,147.12ZM96,224a8,8,0,0,1,8-8h48a8,8,0,0,1,0,16H104A8,8,0,0,1,96,224Z" />
            </svg>
          </div>
          <div>
            <div className="tip-title">نکته یادگیری</div>
            <div className="tip-text">{tipText}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
