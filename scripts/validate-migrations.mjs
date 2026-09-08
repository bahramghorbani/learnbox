import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const migrationsUrl = new URL('../database/migrations/', import.meta.url);
const migrations = await readdir(migrationsUrl);
const numberedMigrations = migrations
  .map((file) => ({ file, match: /^(\d{4})_.+\.sql$/.exec(file) }))
  .filter((entry) => entry.match !== null)
  .map((entry) => ({ file: entry.file, number: Number(entry.match[1]) }))
  .sort((a, b) => a.number - b.number || a.file.localeCompare(b.file));

if (numberedMigrations.length === 0) {
  throw new Error('At least one numbered SQL migration is required.');
}

for (let index = 0; index < numberedMigrations.length; index += 1) {
  const expected = index + 1;
  if (numberedMigrations[index].number !== expected) {
    throw new Error(
      `Migration numbering must be contiguous; expected ${String(expected).padStart(4, '0')}.`,
    );
  }
}

console.log(`Validated ${numberedMigrations.length} migration(s).`);

// LB-DS-049 (PDR-008): deep, deterministic validation of the 35-candidate review migration.
const candidateMigration = numberedMigrations.find(
  (entry) => entry.file === '0017_start_catalog_review_candidates.sql',
);
if (!candidateMigration) {
  throw new Error('0017_start_catalog_review_candidates.sql is required.');
}
const sql = await readFile(new URL(candidateMigration.file, migrationsUrl), 'utf8');

const draftSources = [
  ['content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json'],
  ['content/packs/learnbox-start/vocabulary/start-a1-catalog-35-pending-drafts.json'],
];
for (const [draftPath] of draftSources) {
  const draftUrl = new URL(`../${draftPath}`, import.meta.url);
  const bytes = await readFile(fileURLToPath(draftUrl));
  const expectedSha = createHash('sha256').update(bytes).digest('hex');
  if (!sql.includes(`-- sourceSha256 ${draftPath} ${expectedSha}`)) {
    throw new Error(`0017 source anchor is stale or missing for ${draftPath}.`);
  }
}

const candidateLines = sql.match(/^-- candidate [a-z0-9-]+ card=[0-9a-f-]+ version=[0-9a-f-]+$/gm);
if (candidateLines?.length !== 35) {
  throw new Error(
    `0017 must declare exactly 35 deterministic candidates; found ${candidateLines?.length ?? 0}.`,
  );
}
const checkLines = sql.match(
  /^-- check [a-z0-9-]+ (german_linguistic|persian_translation|provenance|visual|audio|app_flow) id=[0-9a-f-]+ idem=[0-9a-f-]+$/gm,
);
if (checkLines?.length !== 210) {
  throw new Error(
    `0017 must declare exactly 210 deterministic pending checks; found ${checkLines?.length ?? 0}.`,
  );
}

const uuid5Count = (
  sql.match(/[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g) ?? []
).length;
if (uuid5Count !== 980) {
  throw new Error(
    `0017 identity literals must be fixed uuid5 values (980 expected); found ${uuid5Count}.`,
  );
}

for (const forbidden of [
  'gen_random_uuid',
  'INSERT INTO content_review_decisions',
  "status = 'approved'",
  "status = 'published'",
  "outcome = 'passed'",
  "outcome = 'failed'",
]) {
  if (sql.includes(forbidden)) {
    throw new Error(`0017 must not contain ${forbidden}.`);
  }
}

for (const required of [
  'ADD COLUMN IF NOT EXISTS idempotency_key UUID',
  'content_review_checks_idempotency_key_unique',
  'INSERT INTO content_review_checks (id, card_version_id, dimension, outcome, check_key)',
  "RAISE EXCEPTION '0017 fail-closed",
]) {
  if (!sql.includes(required)) {
    throw new Error(`0017 is missing required construct: ${required}.`);
  }
}
if ((sql.match(/'needs_review'/g) ?? []).length < 2) {
  throw new Error('0017 must insert card_versions rows with status needs_review only.');
}

console.log('Validated 0017 review-candidate migration determinism and fail-closed guards.');
