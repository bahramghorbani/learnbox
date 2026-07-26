import { LearnerNav } from './LearnerNav';

interface ProgressScreenProps {
  onStartReview: () => void;
  onNavigate: (destination: 'today' | 'words' | 'progress') => void;
  reviewedToday: number;
  streakDays: number;
}

const weekDays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

export function ProgressScreen({
  onStartReview,
  onNavigate,
  reviewedToday,
  streakDays,
}: ProgressScreenProps) {
  const weeklyReviews = 42 + reviewedToday;
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
            : 'این هفته، آرام و پیوسته جلو رفتی.'}
        </p>
      </section>
      <section className="weekly-chart" aria-labelledby="weekly-chart-title">
        <div className="chart-heading">
          <h2 id="weekly-chart-title">مرورهای این هفته</h2>
          <span>{weeklyReviews} کارت مرور شد</span>
        </div>
        <div className="chart-visual" aria-hidden="true">
          <svg viewBox="0 0 336 184" preserveAspectRatio="none">
            <defs>
              <linearGradient id="weekly-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#e7e2ff" stopOpacity="0.88" />
                <stop offset="100%" stopColor="#f8f6ff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M8 156 L60 120 L108 92 L156 92 L204 68 L252 62 L292 114 L328 92 L328 174 L8 174 Z"
              fill="url(#weekly-fill)"
            />
            <path
              d="M8 156 L60 120 L108 92 L156 92 L204 68 L252 62 L292 114 L328 92"
              fill="none"
              stroke="#4d6bfe"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
            <line
              x1="252"
              x2="252"
              y1="62"
              y2="168"
              stroke="#ffb36b"
              strokeDasharray="4 6"
              strokeWidth="1.5"
            />
            {[
              ['8', '156'],
              ['60', '120'],
              ['108', '92'],
              ['156', '92'],
              ['204', '68'],
              ['252', '62'],
              ['292', '114'],
              ['328', '92'],
            ].map(([cx, cy]) => (
              <circle
                key={cx}
                cx={cx}
                cy={cy}
                fill="#4d6bfe"
                r="6"
                stroke="white"
                strokeWidth="2.5"
              />
            ))}
            <circle cx="252" cy="62" fill="#ffb36b" r="7" stroke="white" strokeWidth="3" />
          </svg>
        </div>
        <div className="week-labels" aria-label="روزهای هفته">
          {weekDays.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
      </section>
      <section className="time-insight" aria-labelledby="time-insight-title">
        <div>
          <h2 id="time-insight-title">بهترین زمان تو</h2>
          <p>شب‌ها، حدود ساعت ۸</p>
        </div>
        <span className="insight-ripple" aria-hidden="true" />
      </section>
      <section className="streak-insight" aria-label="زنجیرهٔ یادگیری">
        <span aria-hidden="true">✦</span>
        <div>
          <h2>{streakDays} روز همراه LearnBox</h2>
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
