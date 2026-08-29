import { Bobo } from './Bobo';
import { syncStateText, type LearnerSyncState } from '../learner-sync-state';
import { toPersianDigits } from '../persian-digits';

export interface TodayScreenProps {
  reviewCount: number;
  syncState?: LearnerSyncState;
  /** Number of events pending in the device-local sync queue; null when the read failed. */
  pendingReviewCount?: number | null;
}

export function TodayScreen({
  reviewCount,
  syncState = 'local-only',
  pendingReviewCount = 0,
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
          <strong>{toPersianDigits(reviewCount)}</strong>
          <small>{toPersianDigits(reviewCount)} کارت برای شروع آماده است</small>
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
      <Bobo expression="welcome" className="bobo bobo-header" priority />
    </main>
  );
}
