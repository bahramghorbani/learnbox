#!/usr/bin/env node
/**
 * M4.1 mutation battery.
 *
 * M4.1 fixes a class of defect that green test suites happily allowed: a capability that exists,
 * is guarded, is reviewed — and reaches nobody. A splash panel no route could open; a promoted
 * splash the learner endpoint refused to serve. Tests written after such a fix are the easiest kind
 * to fake, because the fix is mostly wiring and wiring looks asserted even when it is not.
 *
 * So each mutant here is a plausible wrong implementation of one M4.1 property — delivery that
 * needs the legacy token again, delivery that serves an unpromoted upload, a revert that destroys
 * evidence, a revert that is unaudited or non-idempotent, a guard that is gone, a destination that
 * routes nowhere — and the suites must FAIL for every one. A survivor means that property is
 * asserted nowhere.
 *
 * Sources are restored after each run, and a non-clean worktree aborts the battery rather than
 * risking an operator's uncommitted work.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..');
const delivery = 'apps/website/lib/launch-splash.ts';
const store = 'apps/admin/lib/server/postgres-splash-store.ts';
const routes = 'apps/admin/lib/server/admin-splash-routes.ts';
const router = 'apps/admin/app/components/AdminWorkspaceRouter.tsx';
const sidebar = 'apps/admin/app/components/AdminSidebar.tsx';
const workspace = 'apps/admin/app/components/PresentationWorkspace.tsx';
const panel = 'apps/admin/app/components/SplashReplacementPanel.tsx';

const dbUrl = process.env.TEST_DATABASE_URL;
if (!dbUrl) throw new Error('TEST_DATABASE_URL is required: the proof is worthless without the DB');

const mutants = [
  // ---- Delivery: the Admin promoting a splash and a learner receiving it must be one fact. ----
  {
    id: 'MUT1',
    claim: 'a missing legacy blob token does not disable delivery (the original defect)',
    file: delivery,
    from: `  if (!/^postgres(ql)?:\\/\\//.test(databaseUrl)) return null;
  try {`,
    to: `  if (!/^postgres(ql)?:\\/\\//.test(databaseUrl)) return null;
  if (!blobToken) return null;
  try {`,
  },
  {
    id: 'MUT2',
    claim: 'the canonical database bytes are read before any private storage',
    file: delivery,
    from: `      if (dbResult.rows[0]?.image_data) {`,
    to: `      if (false && dbResult.rows[0]?.image_data) {`,
  },
  {
    id: 'MUT3',
    claim: 'only the PROMOTED version is deliverable, never the latest upload',
    file: delivery,
    from: `        \`SELECT sv.image_data, sv.media_type
           FROM current_splash cs
           JOIN splash_versions sv ON sv.id = cs.version_id
          WHERE cs.singleton_id = 1
            AND sv.image_data IS NOT NULL
          LIMIT 1\`,`,
    to: `        \`SELECT sv.image_data, sv.media_type
           FROM splash_versions sv
          WHERE sv.image_data IS NOT NULL
          ORDER BY sv.created_at DESC
          LIMIT 1\`,`,
  },
  {
    id: 'MUT4',
    claim: 'the cached launch image expires fast enough for a revert to be visible',
    file: delivery,
    from: `            'Cache-Control': 'public, max-age=60',`,
    to: `            'Cache-Control': 'public, max-age=3600',`,
  },

  // ---- Revert: deactivation must never become destruction. ----
  {
    id: 'MUT5',
    claim: 'revert deletes the pointer only, never a version row or its bytes',
    file: store,
    from: `      await client.query('DELETE FROM current_splash WHERE singleton_id = 1');`,
    to: `      await client.query('DELETE FROM current_splash WHERE singleton_id = 1');
      await client.query('DELETE FROM splash_versions WHERE id = $1', [versionId]);`,
  },
  {
    id: 'MUT6',
    claim: 'a revert is recorded in the canonical audit trail',
    file: store,
    from: `      await client.query(
        \`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES (NULL, 'splash.reverted', 'splash_version', $1,
                 jsonb_build_object('reverted_to', 'bundled_default', 'reverted_at', $2::text))\`,
        [versionId, input.now.toISOString()],
      );`,
    to: ``,
  },
  {
    id: 'MUT7',
    claim: 'the audit record is committed in the same transaction as the deactivation',
    file: store,
    from: `      await client.query('DELETE FROM current_splash WHERE singleton_id = 1');
      await client.query(`,
    to: `      await client.query('DELETE FROM current_splash WHERE singleton_id = 1');
      await client.query('COMMIT');
      await client.query('BEGIN');
      await client.query(`,
  },
  {
    id: 'MUT8',
    claim: 'revert takes the same advisory lock as promotion, so they cannot interleave',
    file: store,
    from: `      await client.query('SELECT pg_advisory_xact_lock($1)', [splashPromotionLockId]);
      const current = await client.query(
        \`SELECT version_id FROM current_splash WHERE singleton_id = 1 FOR UPDATE\`,
      );`,
    to: `      const current = await client.query(
        \`SELECT version_id FROM current_splash WHERE singleton_id = 1 FOR UPDATE\`,
      );`,
  },
  {
    id: 'MUT9',
    claim: 'a repeated revert is a no-op instead of a second write',
    file: store,
    from: `      if (!versionId) {
        await client.query('COMMIT');
        return { status: 'already_default' };
      }`,
    to: ``,
  },

  // ---- The revert route is a mutation: every guard the replacement route has, it has. ----
  {
    id: 'MUT10',
    claim: 'revert requires authentication within the previous five minutes',
    file: routes,
    from: `    if (!session.recent) {
      return Response.json(
        { code: 'reauthentication_required' },
        { status: 428, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    try {
      const result = await dependencies.revert({ now: currentTime });`,
    to: `    try {
      const result = await dependencies.revert({ now: currentTime });`,
  },
  {
    id: 'MUT11',
    claim: 'revert verifies the per-session CSRF token',
    file: routes,
    // The replacement route carries a byte-identical CSRF block, so the anchor must reach into the
    // 428 body that follows to stay unique — a duplicated anchor would mutate the wrong route and
    // then report a survivor for a property that is in fact asserted.
    from: `    try {
      verifyAdminCsrf(request, session.csrfHash, config);
    } catch {
      return genericInvalid();
    }
    if (!session.recent) {
      return Response.json(
        { code: 'reauthentication_required' },
        { status: 428, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    try {
      const result = await dependencies.revert({ now: currentTime });`,
    to: `    if (!session.recent) {
      return Response.json(
        { code: 'reauthentication_required' },
        { status: 428, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    try {
      const result = await dependencies.revert({ now: currentTime });`,
  },
  {
    id: 'MUT12',
    claim: 'revert is invisible while the splash server flag is off',
    file: routes,
    from: `    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.revert
    ) {
      return notFound();
    }`,
    to: `    if (!dependencies.config.enabled || !dependencies.sessionStore || !dependencies.revert) {
      return notFound();
    }`,
  },

  // ---- Reachability: a panel with no route is indistinguishable from an unbuilt feature. ----
  {
    id: 'MUT13',
    claim: '«نمایش اپ» resolves to the real presentation workspace',
    file: router,
    from: `  if (route === 'presentation') return <PresentationWorkspace />;`,
    to: ``,
  },
  {
    id: 'MUT14',
    claim: 'the sidebar entry is a real link to the presentation destination',
    file: sidebar,
    from: `  { label: 'نمایش اپ', icon: 'image', route: 'presentation' },`,
    to: `  { label: 'نمایش اپ', icon: 'image' },`,
  },
  {
    id: 'MUT15',
    claim: 'the presentation workspace mounts the real splash panel',
    file: workspace,
    from: `        <SplashReplacementPanel />`,
    to: ``,
  },

  // ---- The revert control itself. ----
  {
    id: 'MUT16',
    claim: 'revert is offered only while a dynamic splash is actually promoted',
    file: panel,
    from: `          {current && state !== 'confirming-revert' && state !== 'reverting' ? (`,
    to: `          {state !== 'confirming-revert' && state !== 'reverting' ? (`,
  },
  {
    id: 'MUT17',
    claim: 're-authentication retries the revert, not the replacement it shares the flow with',
    file: panel,
    from: `      if (pending.kind === 'revert') await sendRevert();
      else await sendReplacement(pending.key);`,
    to: `      await sendReplacement('550e8400-e29b-41d4-a716-446655440000');`,
  },
];

function run(command, args, cwd) {
  try {
    execFileSync(command, args, {
      cwd,
      stdio: 'ignore',
      env: { ...process.env, TEST_DATABASE_URL: dbUrl },
    });
    return true;
  } catch {
    return false;
  }
}

function suitesPass() {
  const admin = run(
    'node_modules/.bin/vitest',
    [
      'run',
      'test/admin-splash-routes.test.ts',
      'test/postgres-splash-store.test.ts',
      'test/splash-replacement-ui.test.tsx',
      'test/admin-presentation-route.test.tsx',
      'test/admin-mutation-route-inventory.test.ts',
    ],
    join(repoRoot, 'apps/admin'),
  );
  if (!admin) return false;
  return run(
    'node_modules/.bin/vitest',
    ['run', 'test/launch-splash.test.ts', 'test/m4.1-splash-delivery-db.test.ts'],
    join(repoRoot, 'apps/website'),
  );
}

const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
if (dirty.trim().length > 0) {
  console.log('worktree not clean — commit first so a failed restore cannot lose work:\n' + dirty);
  process.exit(2);
}

console.log('baseline (unmutated) must pass...');
if (!suitesPass()) {
  console.log('BASELINE FAILED — fix the suite before trusting any mutant result');
  process.exit(1);
}
console.log('baseline PASS\n');

const survivors = [];
const harnessErrors = [];
for (const mutant of mutants) {
  const path = join(repoRoot, mutant.file);
  const original = readFileSync(path, 'utf8');
  // An anchor present more than once is a HARNESS failure, not a survivor: `replace` rewrites the
  // first occurrence, so a duplicated anchor can mutate a path these suites never run and then
  // report SURVIVED for a property that is in fact asserted — which reads exactly like a real
  // coverage gap, the most expensive way for this script to be wrong.
  const occurrences = original.split(mutant.from).length - 1;
  if (occurrences !== 1) {
    const detail = occurrences === 0 ? 'anchor missing' : `anchor matches ${occurrences} places`;
    console.log(`${mutant.id} HARNESS ERROR (${detail}) — ${mutant.claim}`);
    harnessErrors.push(`${mutant.id} (${detail})`);
    continue;
  }
  writeFileSync(path, original.replace(mutant.from, mutant.to));
  const stillGreen = suitesPass();
  writeFileSync(path, original);
  if (readFileSync(path, 'utf8') !== original) {
    console.log(`${mutant.id} FATAL — ${mutant.file} not restored`);
    process.exit(2);
  }
  console.log(`${mutant.id} ${stillGreen ? 'SURVIVED' : 'KILLED  '} — ${mutant.claim}`);
  if (stillGreen) survivors.push(`${mutant.id}: ${mutant.claim}`);
}

console.log(
  `\n${mutants.length - survivors.length - harnessErrors.length}/${mutants.length} killed`,
);
if (harnessErrors.length > 0) {
  console.log(
    'HARNESS ERRORS (no verdict earned):\n' + harnessErrors.map((item) => `  - ${item}`).join('\n'),
  );
}
if (survivors.length > 0) {
  console.log('SURVIVORS:\n' + survivors.map((item) => `  - ${item}`).join('\n'));
}
if (survivors.length > 0 || harnessErrors.length > 0) process.exit(1);
console.log('ALL MUTANTS KILLED');
