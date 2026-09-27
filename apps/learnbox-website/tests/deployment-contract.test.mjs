import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const appRoot = resolve(import.meta.dirname, '..');

test('marketing deployment emits the required browser security headers', async () => {
  const { default: nextConfig } = await import('../next.config.mjs');
  assert.equal(nextConfig.poweredByHeader, false);
  const rules = await nextConfig.headers();
  const pageRule = rules.find((rule) => rule.source === '/:path*');
  const headerNames = new Set(pageRule?.headers.map(({ key }) => key));

  for (const key of [
    'Content-Security-Policy',
    'Referrer-Policy',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Permissions-Policy',
  ]) {
    assert.ok(headerNames.has(key), `Missing security header: ${key}`);
  }
});

test('marketing deployment config cannot target the learner web app', async () => {
  const source = await readFile(resolve(appRoot, 'vercel.json'), 'utf8');
  const config = JSON.parse(source);

  assert.equal(config.framework, 'nextjs');
  assert.equal(config.buildCommand, 'pnpm build');
  assert.equal(config.outputDirectory, '.next');
  assert.doesNotMatch(source, /apps\/website/);
});
