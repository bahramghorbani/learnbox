import { LearnerNav } from './LearnerNav';

interface ProgressScreenProps {
  onStartReview: () => void;
  onNavigate: (destination: 'today' | 'words' | 'progress') => void;
  reviewedToday: number;
  streakDays: number;
}

export function ProgressScreen({
  onStartReview,
  onNavigate,
  reviewedToday,
  streakDays,
}: ProgressScreenProps) {
  return (
    <main className="app-shell progress-shell" data-testid="learnbox-progress">
      <header className="progress-brand">
        <span className="brand">LearnBox</span>
      </header>
      <section className="progress-intro" aria-labelledby="progress-title">
        <h1 id="progress-title">پیشرفت تو</h1>
        <p>
          {reviewedToday
            ? `امروز ${reviewedToday} کارت را ثبت کردی.`
            : 'با یک مرور کوتاه، گزارش واقعی‌ات از همین‌جا شکل می‌گیرد.'}
        </p>
      </section>
      <section className="weekly-chart" aria-labelledby="weekly-chart-title">
        <div className="chart-heading">
          <h2 id="weekly-chart-title">مرورهای امروز</h2>
          <span>{reviewedToday} کارت ثبت شد</span>
        </div>
        <div className="chart-summary" role="status">
          <strong>{reviewedToday}</strong>
          <span>کارتِ ثبت‌شده در امروز</span>
          <p>نمودار هفتگی پس از ثبت دادهٔ واقعی چند روز نمایش داده می‌شود.</p>
        </div>
      </section>
      <section className="time-insight" aria-labelledby="time-insight-title">
        <div>
          <h2 id="time-insight-title">الگوی مطالعهٔ تو</h2>
          <p>بعد از چند روز مرور، زمان مناسب خودت را اینجا می‌بینی.</p>
        </div>
        <span className="insight-ripple" aria-hidden="true" />
      </section>
      <section className="streak-insight" aria-label="زنجیرهٔ یادگیری">
        <span aria-hidden="true">✦</span>
        <div>
          <h2>{streakDays ? `${streakDays} روز همراه LearnBox` : 'شروع تازه با LearnBox'}</h2>
          <p>هر روزی که برگردی، زنجیره ادامه دارد.</p>
        </div>
      </section>
      <button className="primary-button progress-cta" type="button" onClick={onStartReview}>
        ادامهٔ مرور
      </button>
      <LearnerNav current="progress" onNavigate={onNavigate} />
    </main>
  );
}
