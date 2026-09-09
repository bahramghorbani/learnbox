import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const adminInfrastructure = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function renderedCompose(overrides = {}) {
  const environment = {
    ...process.env,
    DATABASE_URL: 'postgresql://example.invalid/learnbox?sslmode=verify-full',
    LEARNBOX_ADMIN_ORIGIN: 'https://admin.example.invalid',
    LEARNBOX_ADMIN_RP_ID: 'admin.example.invalid',
    ...overrides,
  };
  if (!Object.hasOwn(overrides, 'LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED')) {
    delete environment.LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED;
  }

  return JSON.parse(
    execFileSync('docker', ['compose', '--file', 'compose.yaml', 'config', '--format', 'json'], {
      cwd: adminInfrastructure,
      encoding: 'utf8',
      env: environment,
    }),
  );
}

test('persisted content review stays disabled unless explicitly enabled', () => {
  const disabled = renderedCompose();
  const enabled = renderedCompose({ LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED: 'true' });

  assert.equal(disabled.services.admin.environment.LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED, 'false');
  assert.equal(enabled.services.admin.environment.LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED, 'true');
});
