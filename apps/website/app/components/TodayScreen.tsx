'use client';

import { useEffect, useRef, useState, type Ref } from 'react';

import { type LearnerSyncState } from '../learner-sync-state';
import { toPersianDigits } from '../persian-digits';
import { type StartSliceItem } from '../start-slice';
import { Bobo } from './Bobo';

interface Banner {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  background_color: string | null;
  link_url: string | null;
  link_type: string | null;
  link_target: string | null;
}

export interface TodayScreenProps {
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
  /** Leitner box distribution [box1, box2, box3, box4, box5] — from parent */
  leitnerDist?: number[];
  /** Accuracy percentage 0-100 — from parent */
  accuracy?: number;
  /** Approximate study minutes today — from parent */
  studyMinutes?: number;
  /** Navigate to a screen (for banner links) */
  onNavigate?: (screen: string) => void;
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

function buildWeekDays(streakDays: number): Array<{ label: string; status: 'done' | 'today' | 'empty' }> {
  const today = new Date();
  const result: Array<{ label: string; status: 'done' | 'today' | 'empty' }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dow = d.getDay();
    const label = WEEK_DAYS_FA[dow === 6 ? 0 : dow] ?? '';
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
  leitnerDist,
  accuracy,
  studyMinutes,
  onNavigate,
}: TodayScreenProps) {
  const [bannerIdx, setBannerIdx] = useState(0);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [lboxVisible, setLboxVisible] = useState(false);
  const lboxRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const greeting = getGreeting();
  const totalItems = studyItems?.length ?? 0;
  const completed = Math.min(reviewedToday, totalItems);
  const ringPct = totalItems > 0 ? completed / totalItems : 0;
  const circumference = 264;
  const ringOffset = circumference - ringPct * circumference;

  // Real leitner distribution from props, fallback to all items in box 1
  const boxes = leitnerDist ?? [totalItems, 0, 0, 0, 0];
  const boxMax = Math.max(...boxes, 1);

  const weekDays = buildWeekDays(streakDays);
  const tipText = TIPS[new Date().getDate() % TIPS.length];
  const wordOfDay = pickWordOfDay(studyItems);

  // Real accuracy & study time from props
  const realAccuracy = accuracy ?? 0;
  const realMinutes = studyMinutes ?? 0;

  // Fetch banners from API
  useEffect(() => {
    let cancelled = false;
    fetch('/api/banners', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: { banners?: Banner[] }) => {
        if (!cancelled && data.banners && data.banners.length > 0) {
          setBanners(data.banners);
        }
      })
      .catch(() => { /* ignore — banners are non-critical */ });
    return () => { cancelled = true; };
  }, []);

  // Auto-rotate banners
  useEffect(() => {
    if (banners.length <= 1) return;
    timerRef.current = setInterval(() => {
      setBannerIdx((i) => (i + 1) % banners.length);
    }, 4000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [banners.length]);

  // Leitner bar animate-in
  useEffect(() => {
    const el = lboxRef.current;
    if (!el) return;
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

  const canReview = syncState !== 'loading' && reviewCount > 0;
  const isEmpty = syncState !== 'loading' && reviewCount === 0;

  return (
    <div className="home-screen" data-testid="learnbox-today">
      {/* Header */}
      <div className="home-header">
        <div>
          <div className="home-greeting-text">{greeting}</div>
          <div className="home-name">یادگیرنده عزیز</div>
        </div>
        <div className="home-actions">
          <button
            className="icon-btn"
            type="button"
            aria-label={soundEnabled ? 'خاموش کردن صدا' : 'روشن کردن صدا'}
            onClick={onToggleSound}
          >
            {soundEnabled ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="22" height="22" fill="currentColor">
                <path d="M160,32V224L88,168H40a8,8,0,0,1-8-8V96a8,8,0,0,1,8-8H88Z" opacity="0.2"/>
                <path d="M155.51,24.81a8,8,0,0,0-8.42.88L77.25,80H40a16,16,0,0,0-16,16v64a16,16,0,0,0,16,16H77.25l69.84,54.31A8,8,0,0,0,160,224V32A8,8,0,0,0,155.51,24.81ZM144,207.64l-57.68-44.85A8,8,0,0,0,81.25,160H40V96H81.25a8,8,0,0,0,5.07-1.79L144,49.36ZM192,128a24,24,0,0,1-24,24V104A24,24,0,0,1,192,128Zm16,0a40,40,0,0,1-40,40V88A40,40,0,0,1,208,128Z"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="22" height="22" fill="currentColor">
                <path d="M160,32V224L88,168H40a8,8,0,0,1-8-8V96a8,8,0,0,1,8-8H88Z" opacity="0.2"/>
                <path d="M53.92,34.62A8,8,0,1,0,42.08,45.38L73.41,80H40A16,16,0,0,0,24,96v64a16,16,0,0,0,16,16H81.25l69.84,54.31A8,8,0,0,0,160,224V175.17l42.08,46.21a8,8,0,1,0,11.84-10.76ZM144,207.64l-57.68-44.85A8,8,0,0,0,81.25,160H40V96H81.25a8,8,0,0,0,5.07-1.79L144,49.36ZM232,128a87.32,87.32,0,0,1-13.17,45.88,8,8,0,0,1-13.6-8.44A71.52,71.52,0,0,0,216,128a72.25,72.25,0,0,0-38.68-63.92,8,8,0,0,1,7.38-14.18A88.19,88.19,0,0,1,232,128Z"/>
              </svg>
            )}
          </button>
          <div className="avatar" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="26" height="26" fill="currentColor">
              <path d="M168,56a40,40,0,1,1-40-40A40,40,0,0,1,168,56Z" opacity="0.2"/>
              <path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8C55.71,192.94,83.37,176,128,176s72.29,16.94,89.07,44a8,8,0,1,0,13.85-8Z"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Subtle sync status — only show for real server-sync errors, not local-only mode */}
      {syncState === 'error' && (
        <div className="home-sync-error" role="status">
          <span>اتصال به سرور قطع است — داده‌های محلی نمایش داده می‌شود</span>
          {onRetryServerRead && (
            <button type="button" onClick={onRetryServerRead}>تلاش دوباره</button>
          )}
        </div>
      )}
      {typeof pendingReviewCount === 'number' && pendingReviewCount > 0 && (
        <div className="home-sync-pending" role="status">
          {toPersianDigits(pendingReviewCount)} مرور در انتظار همگام‌سازی
        </div>
      )}

      <div className="home-screen-body">
        {/* Banner Slider — from API */}
        {banners.length > 0 && (
          <div className="banner-wrap" aria-label="بنرهای پیشنهادی">
            <div
              className="banner-track"
              style={{ transform: `translateX(${bannerIdx * 100}%)` }}
            >
              {banners.map((b) => (
                <div
                  key={b.id}
                  className="banner-slide"
                  style={{ background: b.background_color ?? 'var(--primary)' }}
                  onClick={() => {
                    if (b.link_type === 'screen' && b.link_url && onNavigate) {
                      onNavigate(b.link_url);
                    }
                  }}
                  role={b.link_url ? 'button' : undefined}
                  tabIndex={b.link_url ? 0 : undefined}
                >
                  <div className="banner-content">
                    <div className="banner-title">{b.title}</div>
                    {b.description && <div className="banner-sub">{b.description}</div>}
                  </div>
                </div>
              ))}
            </div>
            {banners.length > 1 && (
              <div className="banner-dots" aria-hidden="true">
                {banners.map((_, i) => (
                  <button
                    key={i}
                    className={`bndot${bannerIdx === i ? ' on' : ''}`}
                    type="button"
                    onClick={() => setBannerIdx(i)}
                    aria-label={`بنر ${toPersianDigits(i + 1)}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Goal Ring Card */}
        <div className="goal-card">
          <div className="ring-wrap" aria-label={`${toPersianDigits(completed)} از ${toPersianDigits(totalItems)} کارت مرور شده`}>
            <svg className="ring-svg" viewBox="0 0 96 96">
              <defs>
                <linearGradient id="goalGradTod" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#7c3aed"/>
                  <stop offset="100%" stopColor="#f97316"/>
                </linearGradient>
              </defs>
              <circle className="ring-bg" cx="48" cy="48" r="42"/>
              <circle
                className="ring-fill"
                cx="48" cy="48" r="42"
                stroke="url(#goalGradTod)"
                style={{ strokeDashoffset: ringOffset }}
              />
            </svg>
            <div className="ring-center" aria-hidden="true">
              <div className="ring-num">{toPersianDigits(completed)}</div>
              <div className="ring-denom">از {toPersianDigits(totalItems)}</div>
            </div>
          </div>
          <div className="goal-info">
            <div className="goal-title">هدف امروز</div>
            <div className="goal-sub">
              {canReview
                ? `${toPersianDigits(reviewCount)} کارت دیگه مونده`
                : isEmpty
                  ? 'هدف امروز تکمیل شد! 🎉'
                  : 'در حال بارگذاری…'}
            </div>
            <button
              ref={primaryActionRef}
              className="cta-btn"
              type="button"
              onClick={onStartReview}
              disabled={!canReview}
              aria-disabled={!canReview}
            >
              <span className="shimmer" aria-hidden="true"/>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="18" height="18" fill="currentColor">
                <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z"/>
              </svg>
              {canReview ? 'شروع مرور' : isEmpty ? 'مرور کامل شد' : 'در حال بارگذاری…'}
            </button>
          </div>
        </div>

        {/* Quick Stats — real data from props */}
        <div className="quick-stats" aria-label="آمار سریع">
          <div className="stat-card">
            <div className="stat-icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="24" height="24" fill="currentColor">
                <path d="M224,64V192a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V64a8,8,0,0,1,8-8H216A8,8,0,0,1,224,64Z" opacity="0.2"/>
                <path d="M216,48H40A16,16,0,0,0,24,64V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V64A16,16,0,0,0,216,48ZM40,64H216V192H40ZM96,108a12,12,0,1,1-12-12A12,12,0,0,1,96,108Zm40,0a12,12,0,1,1-12-12A12,12,0,0,1,136,108Zm40,0a12,12,0,1,1-12-12A12,12,0,0,1,176,108Z"/>
              </svg>
            </div>
            <div className="stat-value">{toPersianDigits(reviewedToday)}</div>
            <div className="stat-lbl">مرور</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ color: 'var(--accent)' }} aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="24" height="24" fill="currentColor">
                <circle cx="128" cy="128" r="96" opacity="0.2"/>
                <path d="M128,24A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z"/>
              </svg>
            </div>
            <div className="stat-value">{toPersianDigits(realMinutes)}</div>
            <div className="stat-lbl">دقیقه</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ color: 'var(--success)' }} aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="24" height="24" fill="currentColor">
                <path d="M128,24A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Z" opacity="0.2"/>
                <path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.12,104.12,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"/>
              </svg>
            </div>
            <div className="stat-value">
              {reviewedToday > 0 ? `${toPersianDigits(realAccuracy)}٪` : '۰٪'}
            </div>
            <div className="stat-lbl">دقت</div>
          </div>
        </div>

        {/* Leitner Bars — real distribution from props */}
        <div className="sec-head">
          <div className="sec-title">
            <svg className="sec-title-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
              <rect x="32" y="64" width="192" height="144" rx="8" opacity="0.2"/>
              <path d="M224,56H192V48a16,16,0,0,0-16-16H80A16,16,0,0,0,64,48v8H32A16,16,0,0,0,16,72V200a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V72A16,16,0,0,0,224,56ZM80,48h96v8H80ZM224,200H32V72H224V200Z"/>
            </svg>
            جعبه‌های لایتنر
          </div>
          <button className="sec-link" type="button" onClick={onBrowseWords}>همه واژه‌ها</button>
        </div>
        <div className="leitner-bars" ref={lboxRef} aria-label="توزیع واژه‌ها در جعبه‌های لایتنر">
          {boxes.map((count, i) => {
            const colors = ['var(--leitner-1)', 'var(--leitner-2)', 'var(--leitner-3)', 'var(--leitner-4)', 'var(--leitner-5)'];
            const heightPct = boxMax > 0 ? (count / boxMax) * 100 : 0;
            return (
              <div key={i} className="lbox">
                <div className="lbox-bar-wrap">
                  <div
                    className={`lbox-bar${lboxVisible ? ' go' : ''}`}
                    style={{ height: `${heightPct}%`, background: colors[i] }}
                    aria-label={`جعبه ${toPersianDigits(i + 1)}: ${toPersianDigits(count)} واژه`}
                  />
                </div>
                <div className="lbox-num" style={{ color: colors[i] }}>{toPersianDigits(count)}</div>
                <div className="lbox-lbl">جعبه {toPersianDigits(i + 1)}</div>
              </div>
            );
          })}
        </div>

        {/* Weekly Streak */}
        <div className="sec-head">
          <div className="sec-title">
            <svg className="sec-title-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
              <rect x="40" y="40" width="176" height="176" rx="8" opacity="0.2"/>
              <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM48,48H72v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48ZM208,208H48V96H208V208Z"/>
            </svg>
            هفته جاری
          </div>
          {streakDays > 0 && (
            <div className="streak-badge" aria-label={`${toPersianDigits(streakDays)} روز پیاپی`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="14" height="14" fill="currentColor" aria-hidden="true">
                <path d="M208,144a80,80,0,0,1-160,0c0-30.57,14.53-58.26,31-80l33,40,34-48C163.47,80.43,208,108.71,208,144Z" opacity="0.2"/>
                <path d="M143.38,17.85a8,8,0,0,0-12.63,3.41l-22,60.41L84.59,58.2a8,8,0,0,0-11.93.89C51,86.29,40,107.89,40,144a88,88,0,0,0,176,0C216,82.64,168.38,37.18,143.38,17.85Z"/>
              </svg>
              {toPersianDigits(streakDays)} روز
            </div>
          )}
        </div>
        <div className="streak-card">
          <div className="streak-row" aria-label="روزهای هفته">
            {weekDays.map((day, i) => (
              <div key={i} className={`sday ${day.status}`}>
                <div className="sday-circle" aria-hidden="true">
                  {day.status === 'done' && (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="16" height="16" fill="currentColor">
                      <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/>
                    </svg>
                  )}
                  {day.status === 'today' && (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="16" height="16" fill="currentColor">
                      <path d="M208,144a80,80,0,0,1-160,0c0-30.57,14.53-58.26,31-80l33,40,34-48C163.47,80.43,208,108.71,208,144Z"/>
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
            <div className="wod-deco" aria-hidden="true">⭐</div>
            <div className="wod-badge" aria-hidden="true">⭐ واژه روز</div>
            <div className="wod-de" lang="de" dir="ltr">{wordOfDay.german}</div>
            <div className="wod-art">{wordOfDay.article}{wordOfDay.article ? ' • ' : ''}{wordOfDay.germanDefinition}</div>
            <div className="wod-fa">{wordOfDay.persian}</div>
          </div>
        )}

        {/* Bobo companion */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 0', flexDirection: 'column', alignItems: 'center' }}>
          <Bobo
            expression={isEmpty ? 'celebrate' : reviewCount >= 7 ? 'celebrate' : 'welcome'}
            animation={isEmpty ? 'dance' : 'float'}
            speech={isEmpty ? 'آفرین! امروز کامل کردی!' : reviewCount >= 7 ? 'عالیه! ادامه بده!' : 'سلام! آماده‌ای شروع کنیم؟'}
            className="bobo bobo-header"
            priority
          />
        </div>

        {/* Tip Card */}
        <div className="tip-card" role="note" aria-label="نکته یادگیری">
          <div className="tip-icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="24" height="24" fill="currentColor">
              <path d="M176,120a48,48,0,1,0-80,35.82V176a8,8,0,0,0,8,8h48a8,8,0,0,0,8-8V155.82A47.85,47.85,0,0,0,176,120Z" opacity="0.2"/>
              <path d="M176,120a48,48,0,1,0-80,35.82V176a8,8,0,0,0,8,8h48a8,8,0,0,0,8-8V155.82A47.85,47.85,0,0,0,176,120ZM104,184V160h48v24Zm51.51-36.88a8,8,0,0,0-3.51,6.63V152H104v-5.25a8,8,0,0,0-3.51-6.63A32,32,0,1,1,155.51,147.12ZM96,224a8,8,0,0,1,8-8h48a8,8,0,0,1,0,16H104A8,8,0,0,1,96,224Z"/>
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
