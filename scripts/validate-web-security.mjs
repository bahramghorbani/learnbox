import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [websiteConfig, adminConfig, serviceWorker, offlineFallback, manifest, apiBootstrap] =
  await Promise.all([
    read('apps/website/next.config.mjs'),
    read('apps/admin/next.config.mjs'),
    read('apps/website/public/sw.js'),
    read('apps/website/public/offline.html'),
    read('apps/website/app/manifest.ts'),
    read('apps/api/src/main.ts'),
  ]);

for (const [name, config] of [
  ['website', websiteConfig],
  ['admin', adminConfig],
]) {
  for (const requiredHeader of [
    'Content-Security-Policy',
    'X-Content-Type-Options',
    'X-Frame-Options',
    "frame-ancestors 'none'",
  ]) {
    assert.ok(
      config.includes(requiredHeader),
      `${name} security config is missing ${requiredHeader}`,
    );
  }
}

assert.ok(serviceWorker.includes("const OFFLINE_URL = '/offline.html'"));
assert.ok(serviceWorker.includes("'/images/bobo/recovery-v2.png'"));
assert.ok(serviceWorker.includes("'/fonts/IRANSansX-Regular.woff2'"));
assert.ok(serviceWorker.includes("event.request.method !== 'GET'"));
assert.ok(serviceWorker.includes("!requestUrl.pathname.startsWith('/api/')"));
assert.ok(serviceWorker.includes("!event.request.headers.has('Authorization')"));
assert.ok(serviceWorker.includes("requestUrl.pathname.startsWith('/_next/static/')"));
assert.ok(serviceWorker.includes('cache.put(event.request, response.clone())'));
assert.ok(serviceWorker.includes('caches.match(event.request)'));
assert.ok(!serviceWorker.includes('localStorage'), 'service worker must not cache learner state');
assert.ok(
  serviceWorker.includes("!event.request.headers.has('Authorization')"),
  'service worker must not cache credentialed requests',
);
assert.ok(offlineFallback.includes('/images/bobo/recovery-v2.png'));
assert.ok(offlineFallback.includes('IRANSansX LearnBox'));
assert.ok(manifest.includes("display: 'standalone'"));
assert.ok(manifest.includes("start_url: '/'"));
assert.ok(apiBootstrap.includes("response.setHeader('X-Content-Type-Options', 'nosniff')"));
assert.ok(apiBootstrap.includes("process.env.NODE_ENV === 'production'"));

console.log('Validated web security and PWA boundaries.');
