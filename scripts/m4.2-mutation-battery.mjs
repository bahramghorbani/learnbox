#!/usr/bin/env node
/**
 * M4.2 mutation battery.
 *
 * The Slider Manager makes claims that a green suite can easily fake: "at most three slides are
 * active, even for concurrent requests", "an invalid destination is refused", "nothing is deleted",
 * "every write is audited in the same transaction", "a replay changes nothing". Each of those is a
 * property of code that mostly looks like ordinary CRUD, so each one here is broken on purpose in
 * the most plausible wrong way — the lock removed, the count off by one, the destination trusted,
 * a deactivation turned into a delete, the audit moved outside the transaction, the idempotency
 * check dropped, a guard removed, the panel wired to nothing — and the suites must FAIL for every
 * one. A survivor means that property is asserted nowhere.
 *
 * Sources are restored after each run, and a non-clean worktree aborts the battery rather than
 * risking an operator's uncommitted work.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..');
const store = 'apps/admin/lib/server/postgres-presentation-slides-store.ts';
const routes = 'apps/admin/lib/server/admin-presentation-routes.ts';
const panel = 'apps/admin/app/components/SliderManagerPanel.tsx';
const workspace = 'apps/admin/app/components/PresentationWorkspace.tsx';

const dbUrl = process.env.TEST_DATABASE_URL;
if (!dbUrl) throw new Error('TEST_DATABASE_URL is required: the proof is worthless without the DB');

const mutants = [
  // ---- The three-active maximum is the owner's rule and must be a database invariant. ----
  {
    id: 'MUT1',
    claim: 'activation is serialized, so concurrent requests cannot both find a free slot',
    file: store,
    from: `      await client.query(\`SELECT pg_advisory_xact_lock(hashtext($1))\`, [activationLockKey]);

      const replayedBannerId = await this.appliedBannerId(client, input.idempotencyKey);`,
    to: `      const replayedBannerId = await this.appliedBannerId(client, input.idempotencyKey);`,
  },
  {
    id: 'MUT2',
    claim: 'the limit admits three, not four',
    file: store,
    from: `        if (activeCount >= maximumActiveSlides) {`,
    to: `        if (activeCount > maximumActiveSlides) {`,
  },
  {
    id: 'MUT3',
    claim: 'the limit is checked at all',
    file: store,
    from: `      if (input.isActive && !wasActive) {
        const active = await client.query(`,
    to: `      if (false) {
        const active = await client.query(`,
  },
  {
    id: 'MUT4',
    claim: 'an already-active slide is not counted against itself when it is edited',
    file: store,
    from: `          \`SELECT count(*)::int AS active FROM banners
            WHERE is_active = true AND id <> COALESCE($1, '')\`,`,
    to: `          \`SELECT count(*)::int AS active FROM banners WHERE is_active = true\`,`,
  },
  {
    id: 'MUT5',
    claim: 'an active slide must have canonical image bytes',
    file: store,
    from: `      if (input.isActive && !willHaveImage) {`,
    to: `      if (false) {`,
  },

  // ---- Destinations and roles are server-side facts. ----
  {
    id: 'MUT6',
    claim: 'a pack destination must name a pack that exists',
    file: store,
    from: `        if (pack.rows.length === 0) {`,
    to: `        if (false) {`,
  },
  {
    id: 'MUT7',
    claim: 'the role is resolved from the database and actually gates the write',
    file: store,
    from: `    return result.rows.length > 0;`,
    to: `    return true;`,
  },
  {
    id: 'MUT8',
    claim: 'image bytes are served only to an Admin holding the role',
    file: store,
    from: `      if (!(await this.hasRole(client, input.actorUserId))) return { status: 'forbidden' };
      const result = await client.query(
        \`SELECT image_data FROM banners WHERE id = $1 AND image_data IS NOT NULL\`,`,
    to: `      const result = await client.query(
        \`SELECT image_data FROM banners WHERE id = $1 AND image_data IS NOT NULL\`,`,
  },
  {
    id: 'MUT9',
    claim: 'the list reports whether a slide has an image without carrying the bytes',
    file: store,
    from: `      hasImage: row.has_image === true,`,
    to: `      hasImage: row.has_image === true,
      imageData: row.image_data,`,
  },

  // ---- Nothing is destroyed, and the trail is part of the transaction. ----
  {
    id: 'MUT10',
    claim: 'deactivating a slide keeps the row instead of deleting it',
    file: store,
    from: `        slideId = input.slideId;
        await client.query(`,
    to: `        slideId = input.slideId;
        if (!input.isActive) {
          await client.query('DELETE FROM banners WHERE id = $1', [slideId]);
        }
        await client.query(`,
  },
  {
    id: 'MUT11',
    claim: 'an edit without a new upload keeps the stored image',
    file: store,
    from: `                  image_data = COALESCE($7, image_data)`,
    to: `                  image_data = $7`,
  },
  {
    id: 'MUT12',
    claim: 'every write is recorded in the canonical audit trail',
    file: store,
    from: `    await client.query(
      \`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5)\`,`,
    to: `    if (false) await client.query(
      \`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5)\`,`,
  },
  {
    id: 'MUT13',
    claim: 'the audit row commits with the change, so a refused write leaves no trail',
    file: store,
    from: `      await this.audit(client, input.actorUserId, action, slideId, {`,
    to: `      await client.query('COMMIT');
      await client.query('BEGIN');
      await this.audit(client, input.actorUserId, action, slideId, {`,
  },
  {
    id: 'MUT14',
    claim: 'an activation and a deactivation are named as such in the trail',
    file: store,
    from: `      const action = !input.slideId
        ? 'presentation_slide.created'
        : input.isActive === wasActive
          ? 'presentation_slide.updated'
          : input.isActive
            ? 'presentation_slide.activated'
            : 'presentation_slide.deactivated';`,
    to: `      const action = !input.slideId
        ? 'presentation_slide.created'
        : 'presentation_slide.updated';`,
  },
  {
    id: 'MUT15',
    claim: 'a replayed mutation reports the first outcome instead of applying a second change',
    file: store,
    from: `      if (replayedBannerId !== undefined) {`,
    to: `      if (false) {`,
  },
  {
    id: 'MUT16',
    claim: 'a reorder must name every slide exactly once, never renumber a subset',
    file: store,
    from: `      if (
        submitted.size !== input.order.length ||
        submitted.size !== existingIds.length ||
        !existingIds.every((id) => submitted.has(id))
      ) {`,
    to: `      if (false) {`,
  },

  // ---- The route gate: the same chain that guards a splash replacement. ----
  {
    id: 'MUT17',
    claim: 'the presentation flag is default-off and gates every mutation',
    file: routes,
    from: `  if (!dependencies.enabled || !dependencies.config.enabled || !dependencies.sessionStore) {
    return { ok: false, response: notFound() };
  }
  const config: EnabledAdminAuthConfig = dependencies.config;`,
    to: `  if (!dependencies.config.enabled || !dependencies.sessionStore) {
    return { ok: false, response: notFound() };
  }
  const config: EnabledAdminAuthConfig = dependencies.config;`,
  },
  {
    id: 'MUT18',
    claim: 'the Origin and Content-Type of a mutation are validated',
    file: routes,
    from: `  try {
    assertTrustedAdminMutation(request, config, contentTypes);
  } catch {
    return { ok: false, response: genericInvalid() };
  }`,
    to: ``,
  },
  {
    id: 'MUT19',
    claim: 'the per-session CSRF token is verified',
    file: routes,
    from: `  try {
    verifyAdminCsrf(request, session.csrfHash, config);
  } catch {
    return { ok: false, response: genericInvalid() };
  }`,
    to: ``,
  },
  {
    id: 'MUT20',
    claim: 'a stale authentication is answered with 428 before the body is read',
    file: routes,
    from: `  if (!session.recent) {`,
    to: `  if (false) {`,
  },
  {
    id: 'MUT21',
    claim: 'a mutation requires a canonical idempotency key',
    file: routes,
    from: `  if (!idempotencyKey) return { ok: false, response: genericInvalid() };`,
    to: ``,
  },
  {
    id: 'MUT22',
    claim: 'the destination in the request body is validated, never trusted',
    file: routes,
    from: `  const destination = parseSlideDestination(payload.destination);
  if (!destination) return undefined;`,
    to: `  const destination = payload.destination;`,
  },
  {
    id: 'MUT23',
    claim: 'an oversized upload is refused before it is decoded',
    file: routes,
    from: `      if (form.image.size > maximumUploadBytes) {`,
    to: `      if (false) {`,
  },
  {
    id: 'MUT24',
    claim: 'a rejected image is never stored',
    file: routes,
    from: `      if (normalized.kind === 'rejected') {`,
    to: `      if (false && normalized.kind === 'rejected') {`,
  },
  {
    id: 'MUT25',
    claim: 'the image read takes a slide id, so it cannot be walked to another object',
    file: routes,
    from: `    if (!slideId || !slideIdPattern.test(slideId)) return genericInvalid();`,
    to: ``,
  },
  {
    id: 'MUT26',
    claim: 'operator-only image bytes are never cacheable',
    file: routes,
    from: `          'Cache-Control': 'private, no-store',`,
    to: `          'Cache-Control': 'public, max-age=3600',`,
  },

  // ---- The panel: the operator's half of the contract. ----
  {
    id: 'MUT27',
    claim: 'a re-authenticated retry replays the SAME idempotency key',
    file: panel,
    from: `      if (pending.kind === 'reorder') await sendReorder(pending);
      else await sendUpsert(pending);`,
    to: `      if (pending.kind === 'reorder') await sendReorder({ ...pending, key: crypto.randomUUID() });
      else await sendUpsert({ ...pending, key: crypto.randomUUID() });`,
  },
  {
    id: 'MUT28',
    claim: 'a reorder submits the complete new order, not just the slide that moved',
    file: panel,
    from: `    [order[from], order[to]] = [order[to], order[from]];
    void sendReorder({ key: crypto.randomUUID(), order });`,
    to: `    [order[from], order[to]] = [order[to], order[from]];
    void sendReorder({ key: crypto.randomUUID(), order: [slideId] });`,
  },
  {
    id: 'MUT29',
    claim: 'the panel sends the CSRF token with a slide mutation',
    file: panel,
    from: `          'idempotency-key': action.key,
          'x-learnbox-csrf-token': csrfToken,
        },
        body: form,`,
    to: `          'idempotency-key': action.key,
        },
        body: form,`,
  },
  {
    id: 'MUT30',
    claim: 'the Slider Manager is actually mounted on the presentation workspace',
    file: workspace,
    from: `        <SliderManagerPanel />
        <SplashReplacementPanel />`,
    to: `        <SplashReplacementPanel />`,
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
  return run(
    'node_modules/.bin/vitest',
    [
      'run',
      'test/m4.2-presentation-slides-db.test.ts',
      'test/admin-presentation-routes.test.ts',
      'test/presentation-slide.test.ts',
      'test/slider-manager-ui.test.tsx',
      'test/admin-presentation-route.test.tsx',
      'test/admin-mutation-route-inventory.test.ts',
    ],
    join(repoRoot, 'apps/admin'),
  );
}

const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });

// `--check-anchors` verifies every anchor still matches exactly one place and stops. Useful after a
// reformat, because a stale anchor costs a whole battery run to discover otherwise.
if (process.argv.includes('--check-anchors')) {
  let bad = 0;
  for (const mutant of mutants) {
    const source = readFileSync(join(repoRoot, mutant.file), 'utf8');
    const occurrences = source.split(mutant.from).length - 1;
    if (occurrences !== 1) {
      bad += 1;
      console.log(`${mutant.id} anchor matches ${occurrences} places in ${mutant.file}`);
    }
  }
  console.log(bad === 0 ? `all ${mutants.length} anchors unique` : `${bad} bad anchors`);
  process.exit(bad === 0 ? 0 : 1);
}

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
