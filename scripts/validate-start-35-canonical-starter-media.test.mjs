import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..');
const gate = path.join(repoRoot, 'scripts/validate-start-35-canonical-starter-media.mjs');
const manifestPath = path.join(
  repoRoot,
  'content/packs/learnbox-start/validation/start-a1-35-canonical-starter-media-manifest.json',
);

function runGate() {
  try {
    return { code: 0, output: execFileSync(process.execPath, [gate], { encoding: 'utf8' }) };
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

/** Run `mutate`, always restoring the original bytes afterwards. */
function withRestored(file, mutate) {
  const backup = `${file}.integrity-test-backup`;
  copyFileSync(file, backup);
  try {
    return mutate();
  } finally {
    renameSync(backup, file);
  }
}

test('the canonical manifest declares 35 cards and 105 media slots', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.assets.length, 105);
  assert.equal(new Set(manifest.assets.map((asset) => asset.contentId)).size, 35);

  const byKind = new Map();
  for (const asset of manifest.assets) {
    byKind.set(asset.kind, (byKind.get(asset.kind) ?? 0) + 1);
  }
  assert.equal(byKind.get('image'), 35);
  assert.equal(byKind.get('word-audio'), 35);
  assert.equal(byKind.get('sentence-audio'), 35);

  const statuses = new Set(manifest.assets.map((asset) => asset.sourceStatus));
  assert.deepEqual([...statuses].sort(), [
    'EXISTING_PRESERVED',
    'NEW_OWNER_AUTHORIZED_REPLACEMENT',
  ]);
  assert.equal(manifest.counts.newOwnerAuthorizedReplacement, 45);
  assert.equal(manifest.counts.existingPreserved, 60);
});

test('every asset carries a unique sha256 and a non-zero byte count', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const digests = new Set();
  for (const asset of manifest.assets) {
    assert.match(asset.sha256, /^[0-9a-f]{64}$/, `bad digest for ${asset.contentId}`);
    assert.ok(asset.bytes > 0, `zero bytes declared for ${asset.contentId}:${asset.kind}`);
    assert.ok(!digests.has(asset.sha256), `duplicate digest for ${asset.contentId}:${asset.kind}`);
    digests.add(asset.sha256);
  }
  assert.equal(digests.size, 105);
});

test('declared digests match the bytes on disk', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const asset of manifest.assets) {
    const file = path.join(repoRoot, asset.repositoryPath);
    const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
    assert.equal(digest, asset.sha256, `sha256 mismatch for ${asset.contentId}:${asset.kind}`);
  }
});

test('the manifest keeps publication blocked and records no public activation', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.publicationBlocked, true);
  assert.equal(manifest.publicActivationPerformed, false);
  assert.equal(manifest.supersedes.historicalRecordsDeleted, false);
});

test('the integrity gate passes on the committed tree', () => {
  const result = runGate();
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /35\/35 cards/);
  assert.match(result.output, /105\/105 media slots/);
});

test('the integrity gate fails when an asset is corrupted', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const target = path.join(repoRoot, manifest.assets[0].repositoryPath);
  const result = withRestored(target, () => {
    writeFileSync(target, Buffer.concat([readFileSync(target), Buffer.from('corrupt')]));
    return runGate();
  });
  assert.equal(result.code, 1);
  assert.match(result.output, /sha256 mismatch/);
});

test('the integrity gate fails when a required slot is dropped', () => {
  const result = withRestored(manifestPath, () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.assets = manifest.assets.slice(1);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return runGate();
  });
  assert.equal(result.code, 1);
  assert.match(result.output, /expected 105|missing manifest slot/);
});
