#!/usr/bin/env node
/**
 * M3.3 mutation battery.
 *
 * An audit viewer is the one screen whose tests are easiest to fake: hand-written rows, a green
 * suite, and no real guarantee that an operator sees the truth. So each mutant here is a plausible
 * wrong implementation of one M3.3 property — a leaked trail, a silently narrowed filter, a page
 * that lies about its total, a redaction that never happens, a destination that routes nowhere —
 * and the suites must FAIL for every one. A survivor means that guarantee is asserted nowhere.
 *
 * Sources are restored after each run, and a non-clean worktree aborts the battery rather than
 * risking an operator's uncommitted work.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..');
const store = 'apps/admin/lib/server/postgres-admin-users-store.ts';
const routes = 'apps/admin/lib/server/admin-users-routes.ts';
const metadata = 'apps/admin/lib/server/audit-metadata.ts';
const router = 'apps/admin/app/components/AdminWorkspaceRouter.tsx';
const workspace = 'apps/admin/app/components/AuditLogWorkspace.tsx';

const dbUrl = process.env.TEST_DATABASE_URL;
if (!dbUrl) throw new Error('TEST_DATABASE_URL is required: the proof is worthless without the DB');

const mutants = [
  // ---- Authorization: the trail names real administrative actions against real learners. ----
  {
    id: 'MUT1',
    claim: 'the operational role is required to read the trail',
    file: store,
    from: `      if (!(await this.hasRole(client, input.actorUserId))) return { status: 'forbidden' };

      const limit = Math.min(`,
    to: `      if (false && !(await this.hasRole(client, input.actorUserId))) return { status: 'forbidden' };

      const limit = Math.min(`,
  },
  {
    id: 'MUT2',
    claim: 'an unauthorized operator is answered 404, not told the trail exists',
    file: routes,
    from: `      if (result.status === 'forbidden') return notFound();
      return json({
        entries: result.rows,`,
    to: `      if (result.status === 'forbidden') return unauthorized();
      return json({
        entries: result.rows,`,
  },
  {
    id: 'MUT3',
    claim: 'a valid Admin session is required',
    file: routes,
    from: `    if (!session) return unauthorized();

    const params = new URL(request.url).searchParams;`,
    to: `    if (false) return unauthorized();

    const params = new URL(request.url).searchParams;`,
  },
  {
    id: 'MUT4',
    claim: 'the whole surface is 404 while the support flag is off',
    file: routes,
    from: `export function createAdminAuditLogRoute(dependencies: UsersDependencies<'listAuditLog'>) {
  return async function GET(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||`,
    to: `export function createAdminAuditLogRoute(dependencies: UsersDependencies<'listAuditLog'>) {
  return async function GET(request: Request) {
    if (
      !dependencies.config.enabled ||`,
  },

  // ---- Honesty: a filter that is quietly ignored shows a page a reviewer reads as the truth. ----
  {
    id: 'MUT5',
    claim: 'a malformed window is refused instead of silently dropped',
    file: routes,
    from: `    if (from === null || to === null || limit === null || offset === null) return genericInvalid();`,
    to: ``,
  },
  {
    id: 'MUT6',
    claim: 'an unparseable date is an error, not an absent filter',
    file: routes,
    from: `  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();`,
    to: `  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();`,
  },
  {
    id: 'MUT7',
    claim: 'an action filter must look like a producer identifier',
    file: routes,
    from: `const auditTokenPattern = /^[a-z0-9][a-z0-9_.-]{0,63}$/i;`,
    to: `const auditTokenPattern = /^[\\s\\S]*$/;`,
  },
  {
    id: 'MUT8',
    claim: 'a target filter must be a canonical identifier',
    file: routes,
    from: `    if (entityId && !uuidPattern.test(entityId)) return genericInvalid();`,
    to: ``,
  },
  {
    id: 'MUT9',
    claim: 'the target filter actually reaches the query',
    file: store,
    from: `            AND ($4::uuid IS NULL OR a.entity_id = $4)`,
    to: ``,
  },
  {
    id: 'MUT10',
    claim: 'the upper date bound excludes later actions rather than earlier ones',
    file: store,
    from: `            AND ($6::timestamptz IS NULL OR a.created_at < $6)`,
    to: `            AND ($6::timestamptz IS NULL OR a.created_at > $6)`,
  },
  {
    id: 'MUT11',
    claim: 'the newest action is the one a reviewer sees first',
    file: store,
    from: `          ORDER BY a.created_at DESC, a.id DESC`,
    to: `          ORDER BY a.created_at ASC, a.id ASC`,
  },
  {
    id: 'MUT12',
    claim: 'the reported total is the real unpaged total',
    file: store,
    from: `                count(*) OVER ()                                   AS total`,
    to: `                0                                                  AS total`,
  },
  {
    id: 'MUT13',
    claim: 'a hostile page size is clamped instead of dumping the table',
    file: store,
    from: `  private static readonly auditMaxLimit = 100;`,
    to: `  private static readonly auditMaxLimit = 100_000;`,
  },

  // ---- Immutability: reading evidence must not write evidence. ----
  {
    id: 'MUT14',
    claim: 'reading the trail writes nothing to it',
    file: store,
    from: `      const limit = Math.min(`,
    to: `      await client.query(
        \`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, 'audit_log.viewed', 'audit_log', $1, '{}'::jsonb)\`,
        [input.actorUserId],
      );
      const limit = Math.min(`,
  },

  // ---- Metadata is untrusted display data written by six independent producers. ----
  {
    id: 'MUT15',
    claim: 'credential-shaped and internal keys are redacted',
    file: metadata,
    from: `    if (REDACTED_KEY.test(rawKey)) {`,
    to: `    if (false && REDACTED_KEY.test(rawKey)) {`,
  },
  {
    id: 'MUT16',
    claim: 'a redacted field is still listed, so redaction is not mistaken for absence',
    file: metadata,
    from: `      details.push({ key, value: '•••', redacted: true });
      continue;`,
    to: `      continue;`,
  },
  {
    id: 'MUT17',
    claim: 'a metadata shape the viewer does not understand is refused',
    file: metadata,
    from: `  if (!isPlainObject(metadata)) return { reason: null, details: [] };`,
    to: `  if (false) return { reason: null, details: [] };`,
  },
  {
    id: 'MUT18',
    claim: 'one oversized record cannot flood the viewer',
    file: metadata,
    from: `const MAX_DETAILS = 12;`,
    to: `const MAX_DETAILS = 10_000;`,
  },
  {
    id: 'MUT19',
    claim: 'the UI shows a redaction label, never the stored placeholder',
    file: workspace,
    from: `                                {detail.redacted ? 'پنهان‌شده' : detail.value}`,
    to: `                                {detail.value}`,
  },
  {
    id: 'MUT20',
    claim: 'a failed read is distinguishable from an empty trail',
    file: workspace,
    from: `      if (!response.ok) {
        setPhase('error');
        return;
      }`,
    to: `      if (!response.ok) {
        setPage({ entries: [], total: 0, limit: 25, offset: 0, actions: [], entityTypes: [], actors: [] });
        setPhase('ready');
        return;
      }`,
  },

  // ---- Reachability: a screen with no route is indistinguishable from an unbuilt feature. ----
  {
    id: 'MUT21',
    claim: '«عملیات» resolves to the real audit viewer',
    file: router,
    from: `  if (route === 'audit') return <AuditLogWorkspace />;`,
    to: ``,
  },
  {
    id: 'MUT22',
    claim: '«کاربران» resolves to the real M3.1/M3.2 support screen',
    file: router,
    from: `  if (value === 'users') return 'users';`,
    to: ``,
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
      'test/admin-audit-log-routes.test.ts',
      'test/audit-log-workspace.test.tsx',
      'test/admin-mutation-route-inventory.test.ts',
    ],
    join(repoRoot, 'apps/admin'),
  );
  if (!admin) return false;
  return run(
    'node_modules/.bin/vitest',
    ['run', 'test/m3.3-admin-audit-log-db.test.ts'],
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
  // An anchor present more than once is a HARNESS failure, not a survivor. `replace` rewrites the
  // first occurrence, and these files hold byte-identical guard lines on the M3.1 and M3.2 paths —
  // so a duplicated anchor silently mutates a path these suites do not run and reports SURVIVED for
  // a property that is in fact asserted. That reads exactly like a real coverage gap, which makes it
  // the most expensive way for this script to be wrong.
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
