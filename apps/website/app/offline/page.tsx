'use client';

import { Bobo } from '../components/Bobo';

export default function OfflinePage() {
  return (
    <main className="offline-shell">
      <section className="offline-content" aria-labelledby="offline-title">
        <div className="offline-illustration" aria-hidden="true">
          <span className="offline-spark offline-spark-one" />
          <span className="offline-spark offline-spark-two" />
          <span className="offline-spark offline-spark-three" />
          <Bobo expression="recovery" className="bobo bobo-offline" priority />
        </div>
        <p className="offline-kicker">LearnBox کنار تو می‌ماند</p>
        <h1>فعلاً به اینترنت وصل نیستی</h1>
        <p className="offline-message">
          اشکالی ندارد؛ وقتی دوباره آنلاین شدی، از همین‌جا ادامه می‌دهیم.
        </p>
        <p className="offline-reassurance">پاسخ‌های قبلی‌ات با خیال راحت روی دستگاهت می‌مانند.</p>
        <button className="offline-retry" type="button" onClick={() => window.location.reload()}>
          دوباره تلاش می‌کنم
        </button>
      </section>
    </main>
  );
}
