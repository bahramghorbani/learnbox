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
}

export function TodayScreen({
  reviewCount,
  syncState = 'local-only',
  pendingReviewCount = 0,
  lastSyncedAt = null,
}: TodayScreenProps) {
  const pendingChipVisible = typeof pendingReviewCount === 'number' && pendingReviewCount > 0;
  return (
    <main className="app-shell" data-testid="learnbox-today">
      <section className="today-intro" aria-labelledby="today-title">
        <p className="eyeline">امروز</p>
        <h1 id="today-title">با چند دقیقه شروع کن</h1>
        <p>مرور کوتاه امروز، مسیر یادگیریت را زنده نگه می‌دارد.</p>
      </section>
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
      {pendingChipVisible ? (
        <p className="today-chip sync-status" role="status">
          {toPersianDigits(pendingReviewCount)} رویداد در انتظار همگام‌سازی
        </p>
      ) : null}
      <p className="sync-truth" role="status">
        {syncStateText(syncState)}
      </p>
      {syncState === 'server-backed' && lastSyncedAt ? (
        <p className="sync-truth last-synced" role="status">
          آخرین خواندن از سرور: {formatSyncTime(lastSyncedAt)}
        </p>
      ) : null}
      <Bobo expression="welcome" className="bobo bobo-header" priority />
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
