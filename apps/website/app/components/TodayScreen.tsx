import type { Ref } from 'react';

import { Bobo } from './Bobo';
import { syncStateText, type LearnerSyncState } from '../learner-sync-state';
import { toPersianDigits } from '../persian-digits';

export interface TodayScreenProps {
  reviewCount: number;
  syncState?: LearnerSyncState;
  /** Number of events pending in the device-local sync queue; null when the read failed. */
  pendingReviewCount?: number | null;
  /** ISO timestamp of the last successful server snapshot; shown only with server-backed state. */
  lastSyncedAt?: string | null;
  /** Re-reads GET /api/learner/state after a failed read (D1 §5 error state). */
  onRetryServerRead?: () => void;
  onBrowseWords?: () => void;
  primaryActionRef?: Ref<HTMLButtonElement>;
}

export function TodayScreen({
  reviewCount,
  syncState = 'local-only',
  pendingReviewCount = 0,
  lastSyncedAt = null,
  onRetryServerRead,
  onBrowseWords,
  primaryActionRef,
}: TodayScreenProps) {
  const pendingChipVisible = typeof pendingReviewCount === 'number' && pendingReviewCount > 0;
  const isEmpty = syncState !== 'loading' && reviewCount === 0;
  const emptyMessage =
    'در فهرست فعلی این دستگاه کارتی برای مرور نیست؛ می‌توانی واژه‌ها را ببینی یا بعداً برگردی.';
  return (
    <main className="app-shell" data-testid="learnbox-today">
      <section className="today-intro" aria-labelledby="today-title">
        <p className="eyeline">امروز</p>
        <h1 id="today-title">با چند دقیقه شروع کن</h1>
        <p>مرور کوتاه امروز، مسیر یادگیریت را زنده نگه می‌دارد.</p>
      </section>
      {isEmpty ? (
        <section className="today-empty" aria-labelledby="today-empty-title">
          <h2 id="today-empty-title">کارتی برای مرور نیست</h2>
          <p>{emptyMessage}</p>
        </section>
      ) : (
        <section className="summary" aria-label="پیشنهاد امروز">
          <div>
            <span>مرورهای امروز</span>
            {syncState === 'loading' ? (
              <span className="today-summary-skeleton" aria-hidden="true" />
            ) : (
              <strong>{toPersianDigits(reviewCount)}</strong>
            )}
            <small>
              {syncState === 'loading'
                ? 'در حال آماده‌کردن مرور امروز…'
                : `${toPersianDigits(reviewCount)} کارت برای شروع آماده است`}
            </small>
          </div>
        </section>
      )}
      {pendingChipVisible ? (
        <p className="today-chip sync-status" role="status">
          {toPersianDigits(pendingReviewCount)} رویداد در انتظار همگام‌سازی
        </p>
      ) : null}
      <p className="sync-truth" role="status">
        {syncStateText(syncState)}
      </p>
      {syncState === 'error' && onRetryServerRead ? (
        <button className="retry-server-read" type="button" onClick={onRetryServerRead}>
          تلاش دوباره
        </button>
      ) : null}
      {syncState === 'server-backed' && lastSyncedAt ? (
        <p className="sync-truth last-synced" role="status">
          آخرین خواندن از سرور: {formatSyncTime(lastSyncedAt)}
        </p>
      ) : null}
      <Bobo expression={isEmpty ? 'recovery' : 'welcome'} className="bobo bobo-header" priority />
      {isEmpty && onBrowseWords ? (
        <button
          ref={primaryActionRef}
          className="primary-button"
          type="button"
          onClick={onBrowseWords}
        >
          رفتن به واژه‌ها
        </button>
      ) : null}
    </main>
  );
}

function formatSyncTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
