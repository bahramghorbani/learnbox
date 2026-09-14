import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { format, resolveConfig } from 'prettier';

import {
  altTextLanguages,
  altTextSourceSuffix,
  altTextStatus,
  buildStart35HumanReviewPacket,
  cardVersionLinkageBasis,
  draftSourceNames,
  finalVisualAudioEvidenceScope,
  packetRepositoryPath,
  renderStart35HumanReviewPacket,
  runStart35HumanReviewPacketBuild,
  visualConceptStatus,
} from './build-start-35-human-review-packet.mjs';
import { assertStart35HumanReviewPacket } from './validate-start-35-human-review-packet.mjs';

const repositoryRoot = new URL('..', import.meta.url).pathname;
const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const packetUrl = new URL('validation/start-a1-35-human-review-packet.json', contentRoot);
const load = (name) =>
  readFile(new URL(`validation/${name}`, contentRoot), 'utf8').then(JSON.parse);
const loadDraft = (name) =>
  readFile(new URL(`vocabulary/${name}`, contentRoot), 'utf8').then(JSON.parse);

const sources = {
  catalogSlice: await load('start-a1-35-catalog-slice.json'),
  drafts: await loadDraft('start-a1-vertical-slice-drafts.json'),
  pendingDrafts: await loadDraft('start-a1-catalog-35-pending-drafts.json'),
  linguisticApproval: await load('start-a1-slice-linguistic-approval.json'),
  provenanceLedger: await load('start-a1-provenance-ledger.json'),
  pendingProvenanceLedger: await load('start-a1-catalog-35-pending-provenance-ledger.json'),
  candidateQa: await load('start-a1-candidate-qa.json'),
  v2CandidateQa: await load('start-a1-v2-candidate-qa.json'),
  mediaAttachment: await load('start-a1-media-attachment-draft.json'),
  v2Images: await load('start-a1-v2-image-attachment-draft.json'),
  finalCandidates: await load('start-a1-15-candidate-media-attachment-draft.json'),
  finalManifest: await load('start-a1-35-final-media-manifest.json'),
};

const migrationSql = await readFile(
  new URL('../database/migrations/0006_content_review_quality_gates.sql', import.meta.url),
  'utf8',
);
const adminStore = await readFile(
  new URL('../apps/admin/lib/server/postgres-content-review-store.ts', import.meta.url),
  'utf8',
);

const enumerated = (text) => [...text.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
const canonicalDimensions = enumerated(
  migrationSql.match(/CREATE TYPE content_review_dimension AS ENUM \(([\s\S]*?)\);/)[1],
);
const canonicalOutcomes = enumerated(
  migrationSql.match(/CREATE TYPE content_review_outcome AS ENUM \(([^)]*)\);/)[1],
);
const adminDimensions = enumerated(
  adminStore.match(/export const contentReviewDimensions = \[([\s\S]*?)\] as const;/)[1],
);
const adminActions = enumerated(adminStore.match(/export type ContentReviewAction = ([^;]+);/)[1]);

const committedSource = await readFile(packetUrl, 'utf8');
const committed = JSON.parse(committedSource);

const build = (overrides = {}) => buildStart35HumanReviewPacket({ ...sources, ...overrides });

const original = [...sources.drafts.items.map((item) => item.id)].sort();
const final = [...sources.pendingDrafts.items.map((item) => item.id)].sort();
const canonicalItemIds = [...original, ...final].sort();
const item = (contentId) => committed.items.find((entry) => entry.contentId === contentId);

test('the committed packet matches its sources, the formatter and the 35-item/6-dimension scope', async () => {
  const expected = build();

  assert.deepEqual(committed, expected);
  assert.equal(
    committedSource,
    await format(JSON.stringify(expected), {
      ...(await resolveConfig(packetUrl.pathname)),
      filepath: packetUrl.pathname,
    }),
  );
  await assert.doesNotReject(() => assertStart35HumanReviewPacket(committed, sources));
  assert.equal(committed.items.length, 35);
  assert.deepEqual(committed.reviewScope, {
    itemCount: 35,
    dimensionCount: 6,
    itemDimensionPairs: 210,
    originalItemCount: 20,
    finalItemCount: 15,
  });
});

test('item IDs are set-equal to the canonical catalog slice and split 20 original plus 15 final', () => {
  const packetIds = committed.items.map((entry) => entry.contentId).sort();

  assert.deepEqual(packetIds, canonicalItemIds);
  assert.deepEqual(packetIds, [...sources.catalogSlice.draftedItemIds].sort());
  assert.equal(new Set(packetIds).size, 35);
  assert.deepEqual(
    committed.items
      .filter((entry) => entry.catalogBatch === 'original_vertical_slice')
      .map((e) => e.contentId)
      .sort(),
    original,
  );
  assert.deepEqual(
    committed.items
      .filter((entry) => entry.catalogBatch === 'final_catalog_pending')
      .map((e) => e.contentId)
      .sort(),
    [...sources.catalogSlice.pendingDraftedItemIds].sort(),
  );
  assert.deepEqual(
    [...committed.items].sort((a, b) => a.order - b.order).map((e) => e.order),
    [...Array.from({ length: 35 }, (_, index) => index + 1)],
  );
});

test('every item carries exactly the six canonical review-dimension IDs', () => {
  assert.deepEqual(committed.reviewDimensions, canonicalDimensions);
  assert.deepEqual(committed.reviewDimensions, adminDimensions);
  assert.equal(committed.reviewDimensions.length, 6);

  for (const entry of committed.items) {
    assert.deepEqual(
      Object.keys(entry.checks),
      canonicalDimensions,
      `${entry.contentId} dimensions`,
    );
  }
});

test('no release-level outcome is recorded and app_flow stays pending/unproven for all 35', () => {
  assert.equal(committed.releasePosition.releaseApprovedItemCount, 0);
  assert.equal(committed.releasePosition.releaseOutcomesRecorded, 0);
  assert.equal(committed.releasePosition.releaseOutcomesPending, 210);

  for (const entry of committed.items) {
    for (const dimension of canonicalDimensions) {
      assert.equal(entry.checks[dimension].releaseOutcome, null, `${entry.contentId} ${dimension}`);
    }
    assert.equal(entry.checks.app_flow.status, 'pending_unproven');
    assert.equal(entry.checks.app_flow.releaseOutcome, null);
    assert.equal(entry.decision.recorded, null);
  }

  // Candidate-stage app-flow evidence is preserved exactly where a source records it.
  assert.deepEqual(item('start-a1-haus').checks.app_flow.evidence, [
    'validation/start-a1-candidate-qa.json#app_flow',
  ]);
  assert.equal(
    item('start-a1-haus').checks.app_flow.candidateStageRecord,
    'passed_for_candidate_stage',
  );
  assert.deepEqual(item('start-a1-fenster').checks.app_flow.evidence, []);
  assert.equal(item('start-a1-fenster').checks.app_flow.candidateStageRecord, null);
});

test('only the two owner-approved linguistic dimensions are recorded as approved', () => {
  const approved = sources.catalogSlice.linguisticApproval.approvedDimensions;

  assert.deepEqual(approved, ['german_linguistic', 'persian_translation']);
  for (const entry of committed.items) {
    for (const dimension of approved) {
      assert.equal(entry.checks[dimension].status, 'owner_linguistic_approval_recorded');
      assert.equal(entry.checks[dimension].candidateStageRecord, 'approved_by_product_owner');
      assert.ok(
        entry.checks[dimension].evidence.some((reference) =>
          reference.startsWith('validation/start-a1-slice-linguistic-approval.json'),
        ),
      );
    }
    for (const dimension of committed.dimensionsAwaitingReleaseReview) {
      assert.notEqual(entry.checks[dimension].status, 'owner_linguistic_approval_recorded');
    }
  }
  assert.deepEqual(committed.dimensionsAwaitingReleaseReview, [
    'provenance',
    'visual',
    'audio',
    'app_flow',
  ]);
});

test('final German and Persian text plus deterministic alt text come from the draft sources', () => {
  const draftById = new Map(
    [...sources.drafts.items, ...sources.pendingDrafts.items].map((draft) => [draft.id, draft]),
  );

  for (const entry of committed.items) {
    const draft = draftById.get(entry.contentId);
    assert.ok(draft, `${entry.contentId} must exist in a draft source`);
    assert.equal(entry.german.lemma, draft.lemma);
    assert.equal(entry.german.article, draft.article ?? null);
    assert.equal(entry.german.partOfSpeech, draft.partOfSpeech);
    assert.equal(entry.german.simpleGermanDefinition, draft.simpleGermanDefinition);
    assert.equal(entry.german.example, draft.examples[0].german);
    assert.deepEqual(entry.persian.meanings, draft.persianMeanings);
    assert.equal(entry.persian.example, draft.examples[0].persian);
    assert.equal(
      entry.image.altText,
      `${draft.lemma} — ${draft.persianMeanings.join('، ')}: ${draft.simpleGermanDefinition}`,
    );
    assert.equal(entry.image.visualConcept, draft.visualConcept);
    assert.ok(entry.image.altText.trim().length > 0);
  }

  assert.equal(new Set(committed.items.map((entry) => entry.image.altText)).size, 35);
});

test('selected media and rollback/version linkage match the final media manifest', () => {
  const manifestAsset = (assetId) =>
    sources.finalManifest.assets.find((asset) => asset.assetId === assetId);
  const originalSet = new Set(original);

  for (const entry of committed.items) {
    for (const [kind, version] of [
      ['image', entry.image.assetVersion],
      ['word_audio', 'v1'],
      ['sentence_audio', 'v1'],
    ]) {
      const asset = manifestAsset(
        `${entry.contentId}-${kind.replace('_audio', '-audio')}-${version}`,
      );
      assert.ok(asset, `${entry.contentId} ${kind} must be selected in the final manifest`);
      assert.equal(asset.contentId, entry.contentId);
      assert.equal(asset.kind, kind);
      assert.equal(asset.assetVersion, version);
    }
    assert.equal(entry.image.selectedAssetId, item(entry.contentId).image.selectedAssetId);
    assert.equal(entry.versions.image.assetId, entry.image.selectedAssetId);
    assert.equal(entry.versions.draftVersion, 1);
    assert.equal(entry.versions.candidateCardVersion, 1);
    assert.equal(
      entry.versions.image.supersededAssetId,
      originalSet.has(entry.contentId) ? `${entry.contentId}-image-v1` : null,
    );
    assert.ok(
      !sources.finalManifest.assets.some(
        (asset) => asset.assetId === `${entry.contentId}-image-v1`,
      ) || !originalSet.has(entry.contentId),
    );
  }

  assert.equal(committed.rollbackPlan.reference, 'PDR-008');
  assert.equal(committed.rollbackPlan.destructiveDeletionRequiresSeparateAuthorization, true);
});

test('both recorded transcription exceptions stay explicit and unresolved', () => {
  assert.deepEqual(
    committed.knownExceptions.map((exception) => exception.exceptionId),
    ['start-a1-essen-sentence', 'start-a1-gross-word'],
  );
  for (const exception of committed.knownExceptions) {
    assert.equal(exception.state, 'recorded_not_resolved');
    assert.equal(exception.dimension, 'audio');
    assert.ok(exception.itemId.startsWith('start-a1-'));
  }
  assert.deepEqual(item('start-a1-essen').checks.audio.exceptions, ['start-a1-essen-sentence']);
  assert.deepEqual(item('start-a1-gross').checks.audio.exceptions, ['start-a1-gross-word']);
  assert.equal(item('start-a1-essen').checks.audio.releaseOutcome, null);
  assert.ok(
    committed.knownExceptions[0].evidence.includes(
      'validation/start-a1-catalog-35-pending-provenance-ledger.json',
    ),
  );
});

test('check and decision vocabulary equals the canonical Admin and migration vocabulary', () => {
  assert.deepEqual(committed.reviewVocabulary.checkOutcomes, ['passed', 'failed']);
  assert.deepEqual(
    committed.reviewVocabulary.checkOutcomes,
    canonicalOutcomes.filter((outcome) => outcome !== 'pending'),
  );
  const sorted = (values) => [...values].sort();
  assert.deepEqual(sorted(committed.reviewVocabulary.reviewDecisions), sorted(adminActions));
  assert.deepEqual(sorted(committed.reviewVocabulary.reviewDecisions), [
    'approve',
    'reject',
    'return_for_revision',
  ]);
  for (const entry of committed.items) {
    assert.deepEqual(sorted(entry.decision.allowed), sorted(adminActions));
    assert.equal(entry.decision.recorded, null);
  }
});

test('the packet stays default-off, decision-free and publication-blocked', async () => {
  for (const [key, value] of Object.entries({
    publicationBlocked: false,
    attachmentAllowed: true,
    seedable: true,
    reviewDecisionRecorded: true,
    databaseMutationPerformed: true,
    providerCallPerformed: true,
    learnerExposure: true,
    state: 'reviewed',
  })) {
    const tampered = structuredClone(committed);
    tampered[key] = value;
    await assert.rejects(
      () => assertStart35HumanReviewPacket(tampered, sources),
      /default-off|decision-free|publication-blocked/i,
      `${key}=${value} must be rejected`,
    );
  }
});

test('a recorded decision, release outcome or non-passable vocabulary fails closed', async () => {
  const decided = structuredClone(committed);
  decided.items[0].decision.recorded = 'approve';
  await assert.rejects(() => assertStart35HumanReviewPacket(decided, sources), /decision/i);

  const passed = structuredClone(committed);
  passed.items[0].checks.provenance.releaseOutcome = 'passed';
  await assert.rejects(() => assertStart35HumanReviewPacket(passed, sources), /release-level/i);

  const unknownOutcome = structuredClone(committed);
  unknownOutcome.items[0].checks.provenance.releaseOutcome = 'approved';
  await assert.rejects(
    () => assertStart35HumanReviewPacket(unknownOutcome, sources),
    /passed|failed/i,
  );

  const provenAppFlow = structuredClone(committed);
  provenAppFlow.items[5].checks.app_flow.status = 'candidate_stage_evidence_recorded';
  await assert.rejects(() => assertStart35HumanReviewPacket(provenAppFlow, sources), /app_flow/);

  const wrongVocabulary = structuredClone(committed);
  wrongVocabulary.reviewVocabulary.checkOutcomes = ['passed', 'failed', 'pending'];
  await assert.rejects(
    () => assertStart35HumanReviewPacket(wrongVocabulary, sources),
    /vocabulary/i,
  );
});

test('provider, private-location, digest and mutation leaks fail closed', async () => {
  for (const [key, value] of [
    ['url', 'https://private.example.test/asset'],
    ['provider', 'avalai'],
    ['sha256', 'a'.repeat(64)],
    ['bytes', 1024],
    ['attachmentId', 'attachment-1'],
    ['cardVersionId', '00000000-0000-0000-0000-000000000000'],
  ]) {
    const tampered = structuredClone(committed);
    tampered.items[0].image[key] = value;
    await assert.rejects(
      () => assertStart35HumanReviewPacket(tampered, sources),
      new RegExp(key),
      `${key} must be rejected`,
    );
  }

  const linked = structuredClone(committed);
  linked.items[0].checks.visual.evidence = ['validation/https://private.example.test/x.json'];
  await assert.rejects(() => assertStart35HumanReviewPacket(linked, sources), /evidence|local/i);

  const digestInText = structuredClone(committed);
  digestInText.items[0].german.simpleGermanDefinition = 'deadbeef'.repeat(8);
  await assert.rejects(() => assertStart35HumanReviewPacket(digestInText, sources), /digest|hash/i);
});

test('canonical-set, dimension and count drift fail closed', async () => {
  const missingItem = structuredClone(committed);
  missingItem.items = missingItem.items.slice(1);
  await assert.rejects(() => assertStart35HumanReviewPacket(missingItem, sources), /35/);

  const droppedDimension = structuredClone(committed);
  delete droppedDimension.items[0].checks.audio;
  await assert.rejects(
    () => assertStart35HumanReviewPacket(droppedDimension, sources),
    /six|dimension/i,
  );

  const alienDimension = structuredClone(committed);
  alienDimension.reviewDimensions = [...alienDimension.reviewDimensions, 'marketing'];
  await assert.rejects(() => assertStart35HumanReviewPacket(alienDimension, sources), /dimension/i);

  const alienItem = structuredClone(committed);
  alienItem.items[0].contentId = 'start-a1-not-a-canonical-item';
  await assert.rejects(
    () => assertStart35HumanReviewPacket(alienItem, sources),
    /canonical|catalog/i,
  );
});

test('alt text, visual concept, database and media claims stay explicitly unverified', () => {
  const draftById = new Map(
    [...sources.drafts.items, ...sources.pendingDrafts.items].map((draft) => [draft.id, draft]),
  );
  const originalSet = new Set(original);
  const mediaExtensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'audio/mpeg': '.mp3' };

  assert.deepEqual(committed.transparencyLimits, {
    altTextStatus,
    altTextSourceBasis: `committed_draft_fields_${altTextSourceSuffix}`,
    altTextLanguages,
    visualConceptStatus,
    databaseRowsVerified: false,
    cardVersionLinkageBasis,
    finalVisualAudioEvidenceScope,
    evidenceScopeIds: [
      'repository_local_per_item',
      'batch_aggregate_unverified_in_repository',
      'unproven_at_release_level',
    ],
    humanMediaReviewStillRequired: true,
  });

  for (const entry of committed.items) {
    const draft = draftById.get(entry.contentId);
    const isOriginal = originalSet.has(entry.contentId);
    const draftRef = `vocabulary/${
      isOriginal ? draftSourceNames.drafts : draftSourceNames.pendingDrafts
    }#${entry.contentId}`;

    assert.equal(entry.image.altTextStatus, 'derived_not_reviewed');
    assert.equal(entry.image.altTextSource, `${draftRef}:${altTextSourceSuffix}`);
    assert.deepEqual(entry.image.altTextLanguages, ['de', 'fa']);
    assert.equal(entry.image.altTextLocale, draft.pronunciation.locale);
    assert.equal(entry.image.visualConceptStatus, 'draft_intent_not_verified_depiction');
    assert.equal(entry.image.visualConceptSource, draftRef);

    assert.equal(entry.versions.databaseRowsVerified, false);
    assert.equal(
      entry.versions.linkageBasis,
      'repository_and_migration_baseline_not_live_database',
    );

    for (const asset of [
      entry.image,
      entry.versions.image,
      entry.versions.wordAudio,
      entry.versions.sentenceAudio,
    ]) {
      assert.equal(
        asset.repositoryLocalMedia,
        isOriginal,
        `${entry.contentId} repositoryLocalMedia`,
      );
    }

    assert.equal(entry.checks.app_flow.evidenceScope, 'unproven_at_release_level');
    for (const dimension of ['german_linguistic', 'persian_translation', 'provenance']) {
      assert.equal(entry.checks[dimension].evidenceScope, 'repository_local_per_item');
    }
    for (const dimension of ['visual', 'audio']) {
      assert.equal(
        entry.checks[dimension].evidenceScope,
        isOriginal ? 'repository_local_per_item' : 'batch_aggregate_unverified_in_repository',
      );
    }

    // The repositoryLocalMedia claim matches the media files actually on disk.
    for (const [assetId, mimeType] of [
      [entry.image.selectedAssetId, entry.image.expectedMimeType],
      [entry.versions.wordAudio.assetId, 'audio/mpeg'],
      [entry.versions.sentenceAudio.assetId, 'audio/mpeg'],
    ]) {
      const extension = mediaExtensions[mimeType];
      const directory = mimeType.startsWith('image/') ? 'images' : 'audio';
      const present = existsSync(
        new URL(
          `../content/packs/learnbox-start/${directory}/${assetId}${extension}`,
          import.meta.url,
        ),
      );
      assert.equal(present, isOriginal, `${entry.contentId} ${assetId} on-disk presence`);
    }
  }

  const firstFinal = committed.items.find(
    (entry) => entry.catalogBatch === 'final_catalog_pending',
  );
  const firstOriginal = committed.items.find(
    (entry) => entry.catalogBatch === 'original_vertical_slice',
  );
  assert.equal(firstFinal.image.repositoryLocalMedia, false);
  assert.equal(firstOriginal.image.repositoryLocalMedia, true);
});

test('alt-text, database, repository-media and evidence-scope drift fail closed', async () => {
  const finalIndex = committed.items.findIndex(
    (entry) => entry.catalogBatch === 'final_catalog_pending',
  );
  const originalIndex = committed.items.findIndex(
    (entry) => entry.catalogBatch === 'original_vertical_slice',
  );

  for (const [label, mutate, expected] of [
    [
      'altTextStatus',
      (t) => (t.items[originalIndex].image.altTextStatus = 'reviewed'),
      /alt text/i,
    ],
    [
      'altTextSource',
      (t) => (t.items[originalIndex].image.altTextSource = 'model_generated'),
      /alt text/i,
    ],
    [
      'altTextLanguages',
      (t) => (t.items[originalIndex].image.altTextLanguages = ['de']),
      /alt text/i,
    ],
    ['altTextLocale', (t) => (t.items[originalIndex].image.altTextLocale = 'fa-IR'), /alt text/i],
    [
      'visualConceptStatus',
      (t) => (t.items[originalIndex].image.visualConceptStatus = 'verified_depiction'),
      /visual concept/i,
    ],
    [
      'visualConceptSource',
      (t) => (t.items[originalIndex].image.visualConceptSource = 'unknown_source'),
      /visual concept/i,
    ],
    [
      'databaseRowsVerified',
      (t) => (t.items[originalIndex].versions.databaseRowsVerified = true),
      /database rows/i,
    ],
    [
      'linkageBasis',
      (t) => (t.items[originalIndex].versions.linkageBasis = 'live_database_verified'),
      /database rows/i,
    ],
    [
      'originalRepositoryLocalMedia',
      (t) => (t.items[originalIndex].versions.wordAudio.repositoryLocalMedia = false),
      /repositoryLocalMedia/i,
    ],
    [
      'finalRepositoryLocalMedia',
      (t) => (t.items[finalIndex].image.repositoryLocalMedia = true),
      /repositoryLocalMedia/i,
    ],
    [
      'finalVisualEvidenceScope',
      (t) => (t.items[finalIndex].checks.visual.evidenceScope = 'repository_local_per_item'),
      /evidence scope/i,
    ],
    [
      'finalAudioEvidenceScope',
      (t) => (t.items[finalIndex].checks.audio.evidenceScope = 'repository_local_per_item'),
      /evidence scope/i,
    ],
    [
      'originalVisualEvidenceScope',
      (t) =>
        (t.items[originalIndex].checks.visual.evidenceScope =
          'batch_aggregate_unverified_in_repository'),
      /evidence scope/i,
    ],
    [
      'unknownEvidenceScope',
      (t) => (t.items[originalIndex].checks.provenance.evidenceScope = 'made_up'),
      /evidence scope/i,
    ],
    [
      'transparencyAltTextStatus',
      (t) => (t.transparencyLimits.altTextStatus = 'reviewed'),
      /transparency limits/i,
    ],
    [
      'transparencyDatabaseRows',
      (t) => (t.transparencyLimits.databaseRowsVerified = true),
      /transparency limits/i,
    ],
    [
      'transparencyHumanMediaReview',
      (t) => (t.transparencyLimits.humanMediaReviewStillRequired = false),
      /transparency limits/i,
    ],
    ['transparencyMissing', (t) => delete t.transparencyLimits, /transparency limits/i],
  ]) {
    const tampered = structuredClone(committed);
    mutate(tampered);
    await assert.rejects(
      () => assertStart35HumanReviewPacket(tampered, sources),
      expected,
      `${label} must be rejected`,
    );
  }
});

test('source drift fails closed before a packet can be built', () => {
  const fewerDrafts = structuredClone(sources.drafts);
  fewerDrafts.items = fewerDrafts.items.slice(1);
  assert.throws(() => build({ drafts: fewerDrafts }), /20|set|canonical/i);

  const renamedItem = structuredClone(sources.pendingDrafts);
  renamedItem.items[0].id = 'start-a1-not-a-canonical-item';
  assert.throws(() => build({ pendingDrafts: renamedItem }), /set|canonical|pending/i);

  const releasedCatalog = structuredClone(sources.catalogSlice);
  releasedCatalog.seedDecision.seedable = true;
  assert.throws(() => build({ catalogSlice: releasedCatalog }), /seed|publication/i);

  const approvedEverything = structuredClone(sources.linguisticApproval);
  approvedEverything.approvedDimensions = [
    'german_linguistic',
    'persian_translation',
    'provenance',
    'visual',
    'audio',
    'app_flow',
  ];
  assert.throws(() => build({ linguisticApproval: approvedEverything }), /linguistic|dimension/i);

  const droppedException = structuredClone(sources.finalCandidates);
  droppedException.recordedTranscriptionExceptions =
    droppedException.recordedTranscriptionExceptions.slice(1);
  assert.throws(() => build({ finalCandidates: droppedException }), /exception/i);

  const driftedManifest = structuredClone(sources.finalManifest);
  driftedManifest.contentIds = driftedManifest.contentIds.slice(1);
  assert.throws(() => build({ finalManifest: driftedManifest }), /35|manifest|canonical/i);
});

test('regeneration is byte-identical, order-independent and writes only the packet path', async () => {
  const shuffled = (source, key) => {
    const clone = structuredClone(source);
    clone[key] = [...clone[key]].reverse();
    return clone;
  };

  const first = await renderStart35HumanReviewPacket(build());
  const second = await renderStart35HumanReviewPacket(build());
  const reordered = await renderStart35HumanReviewPacket(
    build({
      drafts: shuffled(sources.drafts, 'items'),
      pendingDrafts: shuffled(sources.pendingDrafts, 'items'),
      finalManifest: shuffled(sources.finalManifest, 'assets'),
      provenanceLedger: shuffled(sources.provenanceLedger, 'items'),
    }),
  );
  assert.equal(second, first);
  assert.equal(reordered, first);

  const tracked = execFileSync('git', ['ls-files'], { cwd: repositoryRoot, encoding: 'utf8' })
    .trim()
    .split('\n');
  const digest = async (file) =>
    createHash('sha256')
      .update(await readFile(new URL(file, `file://${repositoryRoot}`)))
      .digest('hex');
  const snapshot = async () => {
    const entries = await Promise.all(
      tracked
        .filter((file) => file !== packetRepositoryPath)
        .map(async (file) => [file, await digest(file)]),
    );
    return new Map(entries);
  };

  const before = await snapshot();
  const written = await runStart35HumanReviewPacketBuild({ write: true });
  const after = await snapshot();

  assert.equal(written.batchId, committed.batchId);
  assert.deepEqual([...after], [...before]);
  assert.equal(await readFile(packetUrl, 'utf8'), first);
});
