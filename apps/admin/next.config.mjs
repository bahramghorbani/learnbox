import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = path.dirname(fileURLToPath(import.meta.url));

// `next dev` compiles modules with eval-based source maps, so hydration throws EvalError under a
// CSP without 'unsafe-eval' and the UI freezes on its server-rendered shell. Production builds use
// no eval, so the deployed CSP keeps its original value — this relaxation is dev-only.
const scriptSrc =
  process.env.NODE_ENV === 'production'
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(appDirectory, '../..'),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`,
          },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        // LB-B30: Admin pages and API responses are never cacheable by a browser, proxy or CDN.
        // Static build assets under /_next/static keep Next's own immutable caching.
        source: '/((?!_next/static|_next/image|favicon.ico).*)',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
