import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const offlineFallback = readFileSync(resolve(process.cwd(), 'public/offline.html'), 'utf8');
const serviceWorker = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

const syncClaimPattern = /همگام|سینک|بازیاب|منتقل شد/;

describe('static offline fallback', () => {
  it('stays Persian RTL with one named main landmark and one heading', () => {
    expect(offlineFallback).toContain('<html lang="fa" dir="rtl">');
    expect(offlineFallback).toContain('aria-labelledby="offline-title"');
    expect(offlineFallback).toContain('<h1 id="offline-title">فعلاً به اینترنت وصل نیستی</h1>');
  });

  it('hides the decorative recovery illustration from assistive technology', () => {
    expect(offlineFallback).toMatch(/<img[^>]*alt=""/);
    expect(offlineFallback).not.toMatch(/<img[^>]*alt="[^"]+"/);
  });

  it('keeps the retry action a keyboard-reachable link back to the app', () => {
    expect(offlineFallback).toMatch(/<a class="retry" href="\/">دوباره تلاش می‌کنم<\/a>/);
  });

  it('claims no sync or recovery in the fallback copy', () => {
    expect(offlineFallback).not.toMatch(syncClaimPattern);
  });
});

describe('service worker cache version', () => {
  it('ships one bumped cache version literal and the unchanged prefix and fallback url', () => {
    expect([...serviceWorker.matchAll(/CACHE_PREFIX\}v(\d+)/g)].map((match) => match[1])).toEqual([
      '9',
    ]);
    expect(serviceWorker).toContain("const CACHE_PREFIX = 'learnbox-public-shell-'");
    expect(serviceWorker).toContain("const OFFLINE_URL = '/offline.html'");
  });

  it('keeps the caching strategy and credential boundaries unchanged', () => {
    expect(serviceWorker).toContain('self.skipWaiting()');
    expect(serviceWorker).toContain('self.clients.claim()');
    expect(serviceWorker).toContain('name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME');
    expect(serviceWorker).toContain("event.request.method !== 'GET'");
    expect(serviceWorker).toContain("!requestUrl.pathname.startsWith('/api/')");
    expect(serviceWorker).toContain("!event.request.headers.has('Authorization')");
    expect(serviceWorker).toContain("requestUrl.pathname.startsWith('/_next/static/')");
    expect(serviceWorker).toContain('cache.put(event.request, response.clone())');
    expect(serviceWorker).toContain('caches.match(event.request)');
    expect(serviceWorker).toContain('caches.match(OFFLINE_URL)');
    expect(serviceWorker).not.toContain('localStorage');
    expect(serviceWorker).toContain(
      [
        'const OFFLINE_ASSETS = [',
        '  OFFLINE_URL,',
        "  '/images/bobo/recovery-v2.png',",
        "  '/images/launch/germany-welcome-v1.jpg',",
        "  '/icons/learnbox-v1-192.png',",
        "  '/icons/learnbox-v1-512.png',",
        "  '/fonts/IRANSansX-Regular.woff2',",
        "  '/fonts/IRANSansX-Bold.woff2',",
        '];',
      ].join('\n'),
    );
  });
});
