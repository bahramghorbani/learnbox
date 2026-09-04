import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  evaluateStartCatalogSeed,
  type StartCatalogDraftItem,
  type StartCatalogDraftState,
} from '../src/catalog/start-catalog-seed-gate.js';

const reviewed = (contentId: string): StartCatalogDraftItem => ({
  contentId,
  linguisticallyReviewed: true,
  approvedForRelease: true,
});

const state = (
  items: StartCatalogDraftItem[],
  targetItemCount: number,
): StartCatalogDraftState => ({
  targetItemCount,
  items,
});

describe('start catalog seed gate', () => {
  it('is blocked with a clear reason while the catalog target is missing drafted items', () => {
    const result = evaluateStartCatalogSeed(state([reviewed('start-a1-haus')], 35));
    expect(result.seedable).toBe(false);
    if (result.seedable) throw new Error('unreachable');
    expect(result.blockers).toContain(
      'catalog has 1 of 35 target items; seed requires exactly 35 release-approved items',
    );
  });

  it('is blocked when no item has an approved/published card version', () => {
    const result = evaluateStartCatalogSeed(
      state(
        [{ contentId: 'start-a1-haus', linguisticallyReviewed: true, approvedForRelease: false }],
        1,
      ),
    );
    expect(result.seedable).toBe(false);
    if (result.seedable) throw new Error('unreachable');
    expect(result.blockers).toContain(
      'item start-a1-haus has no approved/published card version (ADR 0013 gate)',
    );
  });

  it('is blocked when an item has not passed linguistic review', () => {
    const result = evaluateStartCatalogSeed(
      state(
        [{ contentId: 'start-a1-haus', linguisticallyReviewed: false, approvedForRelease: true }],
        1,
      ),
    );
    expect(result.seedable).toBe(false);
    if (result.seedable) throw new Error('unreachable');
    expect(result.blockers).toContain('item start-a1-haus has not passed linguistic review');
  });

  it('is blocked on a duplicate canonical content id', () => {
    const result = evaluateStartCatalogSeed(
      state([reviewed('start-a1-haus'), reviewed('start-a1-haus')], 2),
    );
    expect(result.seedable).toBe(false);
    if (result.seedable) throw new Error('unreachable');
    expect(result.blockers).toContain('catalog item ids must be unique');
  });

  it('is blocked on a non-positive catalog target', () => {
    const result = evaluateStartCatalogSeed(state([], 0));
    expect(result.seedable).toBe(false);
    if (result.seedable) throw new Error('unreachable');
    expect(result.blockers).toContain('catalog target item count must be a positive integer');
  });

  it('never reports a partially approved catalog as seedable (fail closed)', () => {
    const partial: StartCatalogDraftItem[] = [
      reviewed('start-a1-haus'),
      { contentId: 'start-a1-tisch', linguisticallyReviewed: true, approvedForRelease: false },
    ];
    const result = evaluateStartCatalogSeed(state(partial, 2));
    expect(result.seedable).toBe(false);
    if (result.seedable) throw new Error('unreachable');
    expect(result.blockers).toEqual([
      'item start-a1-tisch has no approved/published card version (ADR 0013 gate)',
    ]);
  });

  it('reports seedable only for a complete catalog of approved items', () => {
    const complete = [reviewed('start-a1-haus'), reviewed('start-a1-tisch')];
    const result = evaluateStartCatalogSeed(state(complete, 2));
    expect(result).toEqual({ seedable: true, seedItemIds: ['start-a1-haus', 'start-a1-tisch'] });
  });

  it('keeps a complete catalog blocked when one approved item is missing', () => {
    const result = evaluateStartCatalogSeed(state([reviewed('start-a1-haus')], 2));
    expect(result.seedable).toBe(false);
    if (result.seedable) throw new Error('unreachable');
    expect(result.blockers).toEqual([
      'catalog has 1 of 2 target items; seed requires exactly 2 release-approved items',
    ]);
  });

  it('stays blocked for the real 20-draft slice against the 35-word target', () => {
    const drafts = JSON.parse(
      readFileSync(
        new URL(
          '../../../content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as { items: Array<{ id: string; status: string }> };
    const approval = JSON.parse(
      readFileSync(
        new URL(
          '../../../content/packs/learnbox-start/validation/start-a1-slice-linguistic-approval.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as { itemIds: string[]; approvedDimensions: string[] };
    const approvedIds = new Set(approval.itemIds);
    expect(approval.approvedDimensions).toEqual(['german_linguistic', 'persian_translation']);

    const result = evaluateStartCatalogSeed(
      state(
        drafts.items.map((item) => ({
          contentId: item.id,
          linguisticallyReviewed: approvedIds.has(item.id),
          approvedForRelease: false,
        })),
        35,
      ),
    );
    expect(result.seedable).toBe(false);
    if (result.seedable) throw new Error('unreachable');
    expect(result.blockers).toContain(
      'catalog has 20 of 35 target items; seed requires exactly 35 release-approved items',
    );
    expect(
      result.blockers.some((blocker) => blocker.includes('no approved/published card version')),
    ).toBe(true);
  });

  it('matches the committed 35-catalog slice snapshot to the real draft sources', () => {
    const sha256 = (path: string) =>
      createHash('sha256')
        .update(readFileSync(new URL(path, import.meta.url)))
        .digest('hex');
    const catalog = JSON.parse(
      readFileSync(
        new URL(
          '../../../content/packs/learnbox-start/validation/start-a1-35-catalog-slice.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as {
      targetItemCount: number;
      releaseStatus: string;
      counts: {
        draftedItemCount: number;
        linguisticReviewedItemCount: number;
        approvedForReleaseItemCount: number;
        missingDraftedItemCount: number;
      };
      seedDecision: { seedable: boolean; blockers: string[]; seedableItemIds: string[] };
      publicationBlocked: boolean;
      integrity: { draftsSha256: string; linguisticApprovalSha256: string };
    };
    expect(catalog.targetItemCount).toBe(35);
    expect(catalog.releaseStatus).toBe('draft');
    expect(catalog.seedDecision.seedable).toBe(false);
    expect(catalog.seedDecision.seedableItemIds).toEqual([]);
    expect(catalog.publicationBlocked).toBe(true);
    expect(catalog.counts).toEqual({
      targetItemCount: 35,
      draftedItemCount: 20,
      linguisticReviewedItemCount: 20,
      approvedForReleaseItemCount: 0,
      missingDraftedItemCount: 15,
    });
    expect(catalog.integrity.draftsSha256).toBe(
      sha256(
        '../../../content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json',
      ),
    );
    expect(catalog.integrity.linguisticApprovalSha256).toBe(
      sha256(
        '../../../content/packs/learnbox-start/validation/start-a1-slice-linguistic-approval.json',
      ),
    );
  });
});
