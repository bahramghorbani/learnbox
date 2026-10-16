import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const template = readFileSync(
  new URL('../../iran/landing/Caddyfile.template', import.meta.url),
  'utf8',
);

test('Iran Caddyfile template carries no credential', () => {
  assert.equal(/\$2[aby]\$\d{2}\$/.test(template), false, 'bcrypt hash must stay on the host');
  assert.equal(template.match(/\{\$LEARNBOX_OPS_SSH_BCRYPT_HASH\}/g)?.length, 1);
});

test('Iran Caddyfile template serves the Admin, not the old containment 404', () => {
  const admin = template.slice(template.indexOf('admin.learnboxapp.com {'));
  assert.match(admin, /import admin_app/);
  assert.match(admin, /reverse_proxy 172\.19\.0\.1:8022/);
  assert.equal(/respond "Not Found" 404/.test(admin), false);
});
