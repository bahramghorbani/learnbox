#!/usr/bin/env node
/**
 * M3.2 mutation battery.
 *
 * Each mutant is a plausible wrong implementation of one M3.2 safety property. For every one, the
 * suites must FAIL — a mutant that survives means the corresponding guarantee is asserted nowhere
 * and the green suite is decoration. Sources are restored after each run, and a non-clean worktree
 * aborts the battery rather than risking an operator's uncommitted work.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..');
const store = 'apps/admin/lib/server/postgres-admin-users-store.ts';
const routes = 'apps/admin/lib/server/admin-users-routes.ts';
const migration = 'database/migrations/0029_support_pack_entitlements.sql';

const dbUrl = process.env.TEST_DATABASE_URL;
if (!dbUrl) throw new Error('TEST_DATABASE_URL is required: the proof is worthless without the DB');

const mutants = [
  {
    id: 'MUT1',
    claim: 'a verified purchase cannot be revoked',
    file: store,
    from: "            ? 'purchased'",
    to: "            ? 'allowed'",
  },
  {
    id: 'MUT2',
    claim: 'the delete statement itself refuses anything but a support entitlement',
    file: store,
    from: "WHERE user_id = $1::uuid AND pack_id = $2 AND acquisition_type = 'support'",
    to: 'WHERE user_id = $1::uuid AND pack_id = $2',
  },
  {
    id: 'MUT3',
    claim: 'a support grant is stored as support provenance, not as a purchase',
    file: store,
    from: "           VALUES ($1::uuid, $2, 'support')",
    to: "           VALUES ($1::uuid, $2, 'purchased')",
  },
  {
    id: 'MUT4',
    claim: 'a support grant is not a free self-activation',
    file: store,
    from: "           VALUES ($1::uuid, $2, 'support')",
    to: "           VALUES ($1::uuid, $2, 'free')",
  },
  {
    id: 'MUT5',
    claim: 'revoking a free self-activation is refused',
    file: store,
    from: "              ? 'free_acquisition'",
    to: "              ? 'allowed'",
  },
  {
    id: 'MUT6',
    claim: 'granting a globally free pack is refused as meaningless',
    file: store,
    from: "            ? 'free_pack'",
    to: "            ? 'allowed'",
  },
  {
    id: 'MUT7',
    claim: 'granting to a suspended account is refused',
    file: store,
    from: "              ? 'disabled_account'",
    to: "              ? 'allowed'",
  },
  {
    id: 'MUT8',
    claim: 'a replayed request is not applied twice',
    file: store,
    from: "          'user_pack_entitlement',\n          input.userId,\n          input.idempotencyKey,",
    to: "          'user_pack_entitlement',\n          input.userId,\n          'never-matches',",
  },
  {
    id: 'MUT9',
    claim: 'the audit entry carries the operator reason',
    file: store,
    from: '            reason: input.reason,\n            pack_id: input.packId,',
    to: '            pack_id: input.packId,',
  },
  {
    id: 'MUT10',
    claim: 'the audit entry records the resulting access state truthfully',
    file: store,
    from: '            new_access: after?.hasAccess ?? false,',
    to: '            new_access: true,',
  },
  {
    id: 'MUT11',
    claim: 'the access answer matches the canonical rule (publication included)',
    file: store,
    from: 'const hasAccess = freeAccess || (row.published && entitled);',
    to: 'const hasAccess = freeAccess || entitled;',
  },
  {
    id: 'MUT12',
    claim: 'free access is attributed to the pack being free, not to the row',
    file: store,
    from: "accessVia: freeAccess ? 'free_pack' : hasAccess ? 'entitlement' : null,",
    to: "accessVia: hasAccess ? 'entitlement' : null,",
  },
  {
    id: 'MUT13',
    claim: 'a reason is required for a grant or a revoke',
    file: routes,
    from: '  if (trimmed.length < minReason || trimmed.length > maxReason) return undefined;\n  return { userId, packId, action, reason: trimmed };',
    to: '  return { userId, packId, action, reason: trimmed };',
  },
  {
    id: 'MUT14',
    claim: 'only grant and revoke are accepted as actions',
    file: routes,
    from: "  if (action !== 'grant' && action !== 'revoke') return undefined;",
    to: "  if (typeof action !== 'string') return undefined;",
  },
  {
    id: 'MUT15',
    claim: 'a refused action is not reported as success',
    file: routes,
    from: "      return json({ status: 'refused', verdict: result.verdict, pack: result.row }, { status: 409 });",
    to: "      return json({ status: 'refused', verdict: result.verdict, pack: result.row });",
  },
  {
    id: 'MUT16',
    claim: 'the migration forbids a payment link on a non-purchased entitlement',
    file: migration,
    from: "  CHECK (purchase_event_id IS NULL OR acquisition_type = 'purchased');",
    to: '  CHECK (true);',
  },
  {
    id: 'MUT17',
    claim: 'the acquisition vocabulary stays closed',
    file: migration,
    from: "  CHECK (acquisition_type IN ('free', 'purchased', 'support'));",
    to: '  CHECK (acquisition_type IS NOT NULL);',
  },
];

function run(command, args, cwd) {
  try {
    execFileSync(command, args, {
      cwd,
      stdio: 'pipe',
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
    ['run', 'test/admin-users-routes.test.ts', 'test/admin-mutation-route-inventory.test.ts'],
    join(repoRoot, 'apps/admin'),
  );
  if (!admin) return false;
  return run(
    'node_modules/.bin/vitest',
    ['run', 'test/m3.2-support-pack-entitlement-db.test.ts'],
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
for (const mutant of mutants) {
  const path = join(repoRoot, mutant.file);
  const original = readFileSync(path, 'utf8');
  if (!original.includes(mutant.from)) {
    console.log(`${mutant.id} NOT APPLIED (anchor missing) — ${mutant.claim}`);
    survivors.push(`${mutant.id} (anchor missing)`);
    continue;
  }
  writeFileSync(path, original.replace(mutant.from, mutant.to));
  const stillGreen = suitesPass();
  writeFileSync(path, original);
  console.log(`${mutant.id} ${stillGreen ? 'SURVIVED' : 'KILLED  '} — ${mutant.claim}`);
  if (stillGreen) survivors.push(`${mutant.id}: ${mutant.claim}`);
}

console.log(`\n${mutants.length - survivors.length}/${mutants.length} killed`);
if (survivors.length > 0) {
  console.log('SURVIVORS:\n' + survivors.map((item) => `  - ${item}`).join('\n'));
  process.exit(1);
}
console.log('ALL MUTANTS KILLED');
