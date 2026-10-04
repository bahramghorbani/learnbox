import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './ci-changed-areas.mjs';

test('documentation-only change skips every expensive job', () => {
  const r = classify([
    'docs/design/BOBO_SYSTEM.md',
    'docs/product-decisions/PDR-009-ADMIN-UI-DESIGN-FREEZE-AND-BOBO-VARIANTS.md',
  ]);
  assert.equal(r.docsOnly, true);
  assert.equal(r.code, false);
  assert.equal(r.mobile, false);
  assert.equal(r.infra, false);
});

test('frozen Admin UI prototype is inert', () => {
  const r = classify([
    'prototypes/admin-ui-v1/index.html',
    'prototypes/admin-ui-v1/assets/css/app.css',
  ]);
  assert.equal(r.docsOnly, true);
  assert.equal(r.code, false);
});

test('one source file alongside docs forces full verification', () => {
  const r = classify(['docs/README.md', 'apps/website/app/page.tsx']);
  assert.equal(r.docsOnly, false);
  assert.equal(r.code, true);
  assert.equal(r.infra, true, 'website source is baked into the production image');
});

test('mobile-only change runs mobile but not the production image', () => {
  const r = classify(['apps/mobile/lib/main.dart']);
  assert.equal(r.mobile, true);
  assert.equal(r.infra, false);
  assert.equal(r.code, true);
});

test('website change runs the production image build', () => {
  const r = classify(['apps/website/app/layout.tsx']);
  assert.equal(r.infra, true, 'Docker build context is the repository root');
  assert.equal(r.mobile, false);
});

test('shared package change runs the production image build', () => {
  const r = classify(['packages/learning-engine/src/scheduler.ts']);
  assert.equal(r.infra, true);
  assert.equal(r.code, true);
});

test('lockfile change runs the production image build', () => {
  assert.equal(classify(['pnpm-lock.yaml']).infra, true);
});

test('infrastructure change runs the production stack', () => {
  const r = classify(['infrastructure/production/app/compose.yaml']);
  assert.equal(r.infra, true);
  assert.equal(r.mobile, false);
});

test('workflow change runs every job', () => {
  const r = classify(['.github/workflows/quality.yml']);
  assert.equal(r.docsOnly, false);
  assert.equal(r.mobile, true);
  assert.equal(r.infra, true);
  assert.equal(r.code, true);
});

test('an unrecognised path is never treated as inert', () => {
  const r = classify(['database/migrations/0024_new.sql']);
  assert.equal(r.docsOnly, false);
  assert.equal(r.code, true);
});

test('every path baked into the production image triggers the image build', () => {
  // Derived from infrastructure/production/app/Dockerfile COPY lines. If the
  // Dockerfile starts copying a new path, add it here and to INFRA.
  const bakedIn = [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig.base.json',
    'apps/website/app/page.tsx',
    'apps/api/src/index.ts',
    'packages/billing-core/src/index.ts',
    'packages/learning-engine/src/index.ts',
    'config/app.json',
    'content/starter/pack.json',
    'database/migrations/0024_example.sql',
  ];
  for (const file of bakedIn) {
    assert.equal(classify([file]).infra, true, `${file} is in the image build context`);
  }
});

test('Admin-only change does not rebuild the learner image', () => {
  // apps/admin is deliberately excluded from the production image.
  const r = classify(['apps/admin/app/api/users/route.ts']);
  assert.equal(r.code, true, 'still needs lint/types/tests');
  assert.equal(r.infra, false);
  assert.equal(r.mobile, false);
});

test('a brand-new top-level directory defaults to full CI', () => {
  const r = classify(['some-future-service/src/index.ts']);
  assert.equal(r.docsOnly, false);
  assert.equal(r.code, true);
});

test('an empty diff defaults to full CI rather than skipping', () => {
  const r = classify([]);
  assert.equal(r.docsOnly, false);
  assert.equal(r.code, true);
  assert.equal(r.mobile, true);
  assert.equal(r.infra, true);
});

test('blank lines from the diff are ignored, not treated as a path', () => {
  const r = classify(['docs/a.md', '', '  ', '\n']);
  assert.equal(r.docsOnly, true);
});
