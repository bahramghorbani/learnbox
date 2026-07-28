'use client';

import Link from 'next/link';

import { Bobo } from './components/Bobo';

export default function ErrorPage({
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <main className="offline-shell error-shell">
      <section className="offline-content" aria-labelledby="error-title">
        <div className="offline-illustration">
          <span className="offline-spark offline-spark-one" aria-hidden="true" />
          <span className="offline-spark offline-spark-two" aria-hidden="true" />
          <span className="offline-spark offline-spark-three" aria-hidden="true" />
          <Bobo expression="recovery" className="bobo bobo-offline" priority />
        </div>
        <p className="offline-kicker">بوبو کنار تو است</p>
        <h1 id="error-title">این بخش فعلاً آماده نیست</h1>
        <p className="offline-message">
          اشکالی ندارد؛ یک‌بار دیگر تلاش کن یا به صفحهٔ اصلی برگرد تا از همان‌جا ادامه بدهیم.
        </p>
        <div className="error-actions">
          <button className="offline-retry" type="button" onClick={reset}>
            دوباره تلاش می‌کنم
          </button>
          <Link className="error-home-link" href="/">
            بازگشت به صفحهٔ اصلی
          </Link>
        </div>
      </section>
    </main>
  );
}
