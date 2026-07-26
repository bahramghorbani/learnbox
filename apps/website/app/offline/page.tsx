'use client';

export default function OfflinePage() {
  return (
    <main className="offline-shell">
      <section>
        <span className="offline-mark" aria-hidden="true">
          ◇
        </span>
        <h1>فعلاً به اینترنت وصل نیستی</h1>
        <p>پاسخ‌های ثبت‌شده روی دستگاهت امن می‌مانند. وقتی دوباره آنلاین شدی، ادامه می‌دهیم.</p>
        <button type="button" onClick={() => window.location.reload()}>
          تلاش دوباره
        </button>
      </section>
    </main>
  );
}
