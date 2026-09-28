#!/usr/bin/env node
/**
 * Starter media integrity gate — 35 cards / 105 required media slots.
 *
 * Deterministic release gate. Fails when any required Starter media slot is
 * missing, mismapped, duplicated, zero-byte, of an unexpected MIME, or when a
 * file's SHA-256 disagrees with the canonical manifest.
 *
 * Resolution deliberately mirrors app/api/content-media/[contentId]/[kind]/route.ts
 * so the manifest can never drift from what the route actually serves.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const packRoot = path.join(repoRoot, 'content/packs/learnbox-start');
const manifestPath = path.join(
  packRoot,
  'validation/start-a1-35-canonical-starter-media-manifest.json',
);

const EXPECTED_CARDS = 35;
const EXPECTED_ASSETS = 105;
const KINDS = ['image', 'word-audio', 'sentence-audio'];
const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
};

/** Same candidate order as the delivery route. */
function candidatesFor(slug, kind) {
  const images = path.join(packRoot, 'images');
  const audio = path.join(packRoot, 'audio');
  if (kind === 'image') {
    return [
      path.join(images, `${slug}-image-v2.jpg`),
      path.join(images, `${slug}-image-v1.jpg`),
      path.join(images, `${slug}-image-v1.png`),
    ];
  }
  const suffix = kind === 'word-audio' ? 'word-audio' : 'sentence-audio';
  return [
    path.join(audio, `${slug}-${suffix}-v2.mp3`),
    path.join(audio, `${slug}-${suffix}-v1.mp3`),
  ];
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

const failures = [];
const fail = (message) => failures.push(message);

if (!existsSync(manifestPath)) {
  console.error('FAIL: canonical Starter media manifest is missing');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const assets = manifest.assets ?? [];

if (assets.length !== EXPECTED_ASSETS) {
  fail(`manifest declares ${assets.length} assets, expected ${EXPECTED_ASSETS}`);
}

const cards = new Set(assets.map((asset) => asset.contentId));
if (cards.size !== EXPECTED_CARDS) {
  fail(`manifest covers ${cards.size} cards, expected ${EXPECTED_CARDS}`);
}

// Every card must declare exactly the three required slots, exactly once.
const slots = new Map();
for (const asset of assets) {
  const key = `${asset.contentId}:${asset.kind}`;
  if (slots.has(key)) fail(`duplicate manifest slot ${key}`);
  slots.set(key, asset);
}
for (const contentId of cards) {
  for (const kind of KINDS) {
    if (!slots.has(`${contentId}:${kind}`)) fail(`missing manifest slot ${contentId}:${kind}`);
  }
}

// No asset file may be claimed by two different slots (cross-card swap guard).
const byPath = new Map();
const byHash = new Map();
for (const asset of assets) {
  const seen = byPath.get(asset.repositoryPath);
  if (seen) fail(`asset file reused by ${seen} and ${asset.contentId}:${asset.kind}`);
  byPath.set(asset.repositoryPath, `${asset.contentId}:${asset.kind}`);

  const dupe = byHash.get(asset.sha256);
  if (dupe) fail(`identical bytes in ${dupe} and ${asset.contentId}:${asset.kind}`);
  byHash.set(asset.sha256, `${asset.contentId}:${asset.kind}`);
}

// Each declared asset must exist, be non-empty, hash-match, and be the file the
// route would actually resolve for that slot.
for (const asset of assets) {
  const file = path.join(repoRoot, asset.repositoryPath);
  if (!existsSync(file)) {
    fail(`missing file for ${asset.contentId}:${asset.kind} (${asset.repositoryPath})`);
    continue;
  }

  const size = statSync(file).size;
  if (size === 0) fail(`zero-byte asset ${asset.contentId}:${asset.kind}`);
  if (size !== asset.bytes) {
    fail(
      `byte mismatch for ${asset.contentId}:${asset.kind}: disk ${size}, manifest ${asset.bytes}`,
    );
  }

  const digest = sha256(file);
  if (digest !== asset.sha256) {
    fail(`sha256 mismatch for ${asset.contentId}:${asset.kind}`);
  }

  const expectedMime = MIME_BY_EXT[path.extname(file).toLowerCase()];
  if (!expectedMime) fail(`unsupported extension for ${asset.contentId}:${asset.kind}`);
  else if (expectedMime !== asset.mimeType) {
    fail(
      `MIME mismatch for ${asset.contentId}:${asset.kind}: ${asset.mimeType} vs ${expectedMime}`,
    );
  }

  const resolved = candidatesFor(asset.contentId, asset.kind).find((candidate) =>
    existsSync(candidate),
  );
  if (!resolved) {
    fail(`route resolver cannot locate any file for ${asset.contentId}:${asset.kind}`);
  } else if (path.resolve(resolved) !== path.resolve(file)) {
    fail(
      `resolver/manifest disagree for ${asset.contentId}:${asset.kind}: ` +
        `route serves ${path.relative(repoRoot, resolved)}, manifest claims ${asset.repositoryPath}`,
    );
  }
}

// Learning media must never be reachable from a public web path.
const publicRoot = path.join(repoRoot, 'apps/website/public');
for (const asset of assets) {
  const leaked = path.join(publicRoot, path.basename(asset.repositoryPath));
  if (existsSync(leaked)) {
    fail(`learning asset exposed publicly: ${path.relative(repoRoot, leaked)}`);
  }
}

if (manifest.publicationBlocked !== true) fail('manifest must keep publicationBlocked=true');
if (manifest.publicActivationPerformed !== false) {
  fail('manifest must record publicActivationPerformed=false');
}

if (failures.length > 0) {
  console.error(`Starter media integrity gate FAILED (${failures.length}):`);
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

const counts = manifest.counts ?? {};
console.info(
  `Starter media integrity gate PASSED: ${cards.size}/${EXPECTED_CARDS} cards, ` +
    `${assets.length}/${EXPECTED_ASSETS} media slots, ` +
    `${counts.newOwnerAuthorizedReplacement ?? 0} new + ${counts.existingPreserved ?? 0} preserved, ` +
    `0 missing, 0 duplicate, 0 mismapped.`,
);
