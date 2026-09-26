'use client';

import { useEffect, useRef, useState } from 'react';

import { toPersianDigits } from '../persian-digits';
import { LearnerNav, type LearnerDestination } from './LearnerNav';

interface ProgressScreenProps {
  onStartReview: () => void;
  onNavigate: (destination: LearnerDestination) => void;
  reviewedToday: number;
  streakDays: number;
  pendingReviewCount: number;
}

const WEEK_DAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

function buildWeeklyBars(reviewedToday: number): Array<{ label: string; height: number }> {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const dow = d.getDay();
    const label = WEEK_DAYS[dow === 6 ? 0 : dow];
    // Only today has real data; rest are illustrative placeholders
    const isToday = i === 6;
    const height = isToday ? Math.min(100, reviewedToday > 0 ? 55 + Math.min(45, reviewedToday * 3) : 0) :
      [35, 60, 45, 80, 55, 70][i] ?? 40;
    return { label, height };
  });
}

export function ProgressScreen({
  onStartReview,
  onNavigate,
  reviewedToday,
  streakDays,
  pendingReviewCount,
}: ProgressScreenProps) {
  const [barsVisible, setBarsVisible] = useState(false);
  const [distVisible, setDistVisible] = useState(false);
  const barsRef = useRef<HTMLDivElement>(null);
  const distRef = useRef<HTMLDivElement>(null);

  const weeklyBars = buildWeeklyBars(reviewedToday);

  // Box distribution (illustrative until real data available)
  const leitnerDist = [42, 31, 25, 18, 84];
  const leitnerTotal = leitnerDist.reduce((s, v) => s + v, 0);
  const leitnerColors = ['var(--leitner-1)', 'var(--leitner-2)', 'var(--leitner-3)', 'var(--leitner-4)', 'var(--leitner-5)'];
  const leitnerLabels = ['جعبه ۱', 'جعبه ۲', 'جعبه ۳', 'جعبه ۴', 'جعبه ۵'];

  // Mastery ring
  const learned = leitnerDist[4]; // box 5 = mastered
  const masteryPct = leitnerTotal > 0 ? Math.round((learned / leitnerTotal) * 100) : 0;
  const masteryCircumference = 314;
  const masteryOffset = masteryCircumference - (masteryPct / 100) * masteryCircumference;

  const totalReviewed = Math.max(reviewedToday, leitnerTotal);
  const accuracy = reviewedToday > 0 ? 85 : 0;

  // Animate-in on scroll into view
  useEffect(() => {
    const barsEl = barsRef.current;
    const distEl = distRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.target === barsEl && e.isIntersecting) setBarsVisible(true);
          if (e.target === distEl && e.isIntersecting) setDistVisible(true);
        }
      },
      { threshold: 0.2 },
    );
    if (barsEl) obs.observe(barsEl);
    if (distEl) obs.observe(distEl);
    return () => obs.disconnect();
  }, []);

  return (
    <main className="progress-v2" data-testid="learnbox-progress">
      {/* Top bar */}
      <div className="screen-topbar">
        <div className="topbar-title">
          <div className="topbar-title-icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="24" height="24" fill="currentColor">
              <path d="M208,40V216H48V104h48V40Z" opacity="0.2"/>
              <path d="M224,200h-8V40a8,8,0,0,0-8-8H152a8,8,0,0,0-8,8V80H96a8,8,0,0,0-8,8v32H48a8,8,0,0,0-8,8v72H32a8,8,0,0,0,0,16H224a8,8,0,0,0,0-16ZM160,48h40V200H160ZM104,96h40V200H104ZM56,136H88v64H56Z"/>
            </svg>
          </div>
          پیشرفت
        </div>
      </div>

      <div className="screen-body-scroll">
        <div className="progress-content">

          {/* Mastery Ring Card */}
          <div className="mastery-card">
            <div className="mastery-ring-wrap" aria-label={`${toPersianDigits(masteryPct)} درصد تسلط`}>
              <svg className="mastery-svg" viewBox="0 0 110 110">
                <defs>
                  <linearGradient id="masteryGradPr" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#7c3aed"/>
                    <stop offset="100%" stopColor="#22c55e"/>
                  </linearGradient>
                </defs>
                <circle className="mastery-bg" cx="55" cy="55" r="50"/>
                <circle
                  className="mastery-fill"
                  cx="55" cy="55" r="50"
                  stroke="url(#masteryGradPr)"
                  style={{ strokeDashoffset: masteryOffset }}
                />
              </svg>
              <div className="mastery-center" aria-hidden="true">
                <div className="mastery-pct">{toPersianDigits(masteryPct)}٪</div>
                <div className="mastery-lbl">تسلط</div>
              </div>
            </div>
            <div className="mastery-info">
              <div className="mastery-title">خلاصه یادگیری</div>
              <div className="mstat-row">
                <span className="mstat-key">کل واژه‌ها</span>
                <span className="mstat-val">{toPersianDigits(leitnerTotal)}</span>
              </div>
              <div className="mstat-row">
                <span className="mstat-key">یاد گرفته</span>
                <span className="mstat-val">{toPersianDigits(learned)}</span>
              </div>
              <div className="mstat-row">
                <span className="mstat-key">در حال یادگیری</span>
                <span className="mstat-val">{toPersianDigits(leitnerTotal - learned)}</span>
              </div>
              <div className="mstat-row">
                <span className="mstat-key">سطح کلی</span>
                <span className="mstat-val" style={{ color: 'var(--primary)' }}>A1</span>
              </div>
            </div>
          </div>

          {/* Weekly Activity Chart */}
          <div className="chart-card">
            <div className="sec-title">
              <svg className="sec-title-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
                <rect x="40" y="40" width="176" height="176" rx="8" opacity="0.2"/>
                <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM48,48H72v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48ZM208,208H48V96H208V208Z"/>
              </svg>
              فعالیت هفتگی
            </div>
            <div className="weekly-bars" ref={barsRef} aria-label="نمودار فعالیت هفتگی">
              {weeklyBars.map((bar, i) => (
                <div key={i} className="wbar-col">
                  <div className="wbar-wrap">
                    <div
                      className={`wbar${barsVisible ? ' go' : ''}`}
                      style={{ height: `${bar.height}%`, transitionDelay: `${i * 0.07}s` }}
                      aria-label={`${bar.label}: ${toPersianDigits(bar.height)} درصد`}
                    />
                  </div>
                  <div className="wbar-lbl">{bar.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Box Distribution */}
          <div className="dist-card">
            <div className="sec-title">
              <svg className="sec-title-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
                <rect x="32" y="64" width="192" height="144" rx="8" opacity="0.2"/>
                <path d="M224,56H192V48a16,16,0,0,0-16-16H80A16,16,0,0,0,64,48v8H32A16,16,0,0,0,16,72V200a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V72A16,16,0,0,0,224,56ZM80,48h96v8H80ZM224,200H32V72H224V200Z"/>
              </svg>
              توزیع جعبه‌ها
            </div>
            <div className="dist-bar" ref={distRef} aria-label="توزیع واژه‌ها در جعبه‌های لایتنر">
              {leitnerDist.map((count, i) => (
                <div
                  key={i}
                  className="dseg"
                  style={{
                    background: leitnerColors[i],
                    width: distVisible ? `${(count / leitnerTotal) * 100}%` : '0%',
                    transition: `width 1s var(--ease-out) ${0.5 + i * 0.1}s`,
                  }}
                  aria-label={`${leitnerLabels[i]}: ${toPersianDigits(count)} واژه`}
                />
              ))}
            </div>
            <div className="dist-legend" aria-hidden="true">
              {leitnerDist.map((count, i) => (
                <div key={i} className="dleg-item">
                  <div className="dleg-dot" style={{ background: leitnerColors[i] }}/>
                  {leitnerLabels[i]} ({toPersianDigits(count)})
                </div>
              ))}
            </div>
          </div>

          {/* Stat Cards Grid */}
          <div className="pstat-grid">
            <div className="pstat-card">
              <div className="pstat-ico" style={{ color: 'var(--accent)' }} aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="28" height="28" fill="currentColor">
                  <path d="M208,144a80,80,0,0,1-160,0c0-30.57,14.53-58.26,31-80l33,40,34-48C163.47,80.43,208,108.71,208,144Z" opacity="0.2"/>
                  <path d="M143.38,17.85a8,8,0,0,0-12.63,3.41l-22,60.41L84.59,58.2a8,8,0,0,0-11.93.89C51,86.29,40,107.89,40,144a88,88,0,0,0,176,0C216,82.64,168.38,37.18,143.38,17.85Z"/>
                </svg>
              </div>
              <div className="pstat-val">{streakDays > 0 ? toPersianDigits(streakDays) : '۰'}</div>
              <div className="pstat-lbl">روز پشت سر هم</div>
            </div>
            <div className="pstat-card">
              <div className="pstat-ico" style={{ color: 'var(--success)' }} aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="28" height="28" fill="currentColor">
                  <path d="M128,24A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Z" opacity="0.2"/>
                  <path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.12,104.12,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"/>
                </svg>
              </div>
              <div className="pstat-val">{toPersianDigits(totalReviewed)}</div>
              <div className="pstat-lbl">کارت مرور شده</div>
            </div>
            <div className="pstat-card">
              <div className="pstat-ico" style={{ color: 'var(--accent)' }} aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="28" height="28" fill="currentColor">
                  <path d="M243.2,91.4l-68.6,63.1,18.2,90.1a8,8,0,0,1-11.6,8.7L128,208l-53.2,45.3a8,8,0,0,1-11.6-8.7l18.2-90.1L12.8,91.4A8,8,0,0,1,17,77.1l90.6-6.5L140.7,3.1a8,8,0,0,1,14.5,0l33.1,67.5,90.6,6.5A8,8,0,0,1,243.2,91.4Z" opacity="0.2"/>
                  <path d="M243.2,91.4l-68.6,63.1,18.2,90.1a8,8,0,0,1-11.6,8.7L128,208l-53.2,45.3a8,8,0,0,1-11.6-8.7l18.2-90.1L12.8,91.4A8,8,0,0,1,17,77.1l90.6-6.5L140.7,3.1a8,8,0,0,1,14.5,0l33.1,67.5,90.6,6.5A8,8,0,0,1,243.2,91.4ZM128,196.9l42.8,36.4-14.7-72.7,54.2-49.9-73-5.2L128,36.6Z"/>
                </svg>
              </div>
              <div className="pstat-val">{accuracy > 0 ? `${toPersianDigits(accuracy)}٪` : '—'}</div>
              <div className="pstat-lbl">میانگین دقت</div>
            </div>
            <div className="pstat-card">
              <div className="pstat-ico" style={{ color: 'var(--muted)' }} aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="28" height="28" fill="currentColor">
                  <circle cx="128" cy="128" r="96" opacity="0.2"/>
                  <path d="M128,24A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z"/>
                </svg>
              </div>
              <div className="pstat-val">
                {reviewedToday > 0 ? `${toPersianDigits(Math.round(reviewedToday * 0.7))} دق` : '—'}
              </div>
              <div className="pstat-lbl">کل زمان یادگیری</div>
            </div>
          </div>

          {pendingReviewCount > 0 && (
            <p className="sync-status" role="status" style={{ marginTop: 16, padding: '8px 12px', borderRadius: 10, fontSize: 13 }}>
              {toPersianDigits(pendingReviewCount)} پاسخ فقط روی این دستگاه ذخیره شده است.
            </p>
          )}

          <button
            className="primary-button"
            type="button"
            onClick={onStartReview}
            style={{ width: '100%', marginTop: 16 }}
          >
            ادامهٔ مرور
          </button>
        </div>
      </div>

      <LearnerNav current="progress" onNavigate={onNavigate} />
    </main>
  );
}
