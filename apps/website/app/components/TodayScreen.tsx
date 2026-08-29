import { Bobo } from './Bobo';
import { syncStateText, type LearnerSyncState } from '../learner-sync-state';

interface TodayScreenProps {
  reviewCount: number;
  syncState?: LearnerSyncState;
}

export function TodayScreen({ reviewCount, syncState = 'local-only' }: TodayScreenProps) {
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
          <strong>{reviewCount}</strong>
          <small>{reviewCount} کارت برای شروع آماده است</small>
        </div>
      </section>
      <p className="sync-truth" role="status">
        {syncStateText(syncState)}
      </p>
      <Bobo expression="welcome" className="bobo bobo-header" priority />
    </main>
  );
}
