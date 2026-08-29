'use client';

import { useEffect, useState } from 'react';

/** Keeps a brief, non-blocking connection hint visible while local learning continues. */
export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (isOnline !== false) return null;

  return (
    <p className="network-status" role="status">
      اینترنت قطع است؛ پاسخ‌ها روی همین دستگاه امن می‌مانند و تا وصل‌شدن به سرور، همگام‌سازی انجام
      نمی‌شود.
    </p>
  );
}
