'use client';

import { useEffect, useState } from 'react';

import { Bobo } from '../components/Bobo';

const offlineMessage = 'اشکالی ندارد؛ وقتی دوباره آنلاین شدی، از همین‌جا ادامه می‌دهیم.';
const reconnectMessage = 'دوباره آنلاین شدی؛ برای ادامه دوباره تلاش کن.';
const offlineHeading = 'فعلاً به اینترنت وصل نیستی';
const reconnectHeading = 'دوباره آنلاین شدی';

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    setIsOnline(window.navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

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
        <h1 id="offline-title">{isOnline ? reconnectHeading : offlineHeading}</h1>
        <p className="offline-message">{isOnline ? reconnectMessage : offlineMessage}</p>
        <p className="sr-only" role="status" aria-atomic="true">
          {isOnline ? reconnectMessage : ''}
        </p>
        <p className="offline-reassurance">پاسخ‌های قبلی‌ات با خیال راحت روی دستگاهت می‌مانند.</p>
        <button className="offline-retry" type="button" onClick={() => window.location.reload()}>
          دوباره تلاش می‌کنم
        </button>
      </section>
    </main>
  );
}
