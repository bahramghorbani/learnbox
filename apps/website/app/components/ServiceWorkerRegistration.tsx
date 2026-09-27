'use client';

import { useEffect } from 'react';

/** Registers only the public offline fallback; learner data stays in the device queue. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // Installation remains optional; the web app must still work without PWA support.
      });
    }
  }, []);

  return null;
}
