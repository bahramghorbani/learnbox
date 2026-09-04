/**
 * Fail-closed gate for seeding canonical LearnBox Start catalog content into `cards`.
 *
 * ADR 0013 makes bundled `start-a1-*` ids the canonical immutable `cards.content_id`, but a card
 * becomes resolvable content only once its `card_versions` row is `approved`/`published`. This
 * gate is the reusable precondition check for any future seed task: it can only report a catalog
 * as seedable when every target item exists and is release-approved. It exposes no transition that
 * marks content approved or published, so a partial or draft catalog always stays blocked.
 *
 * ponytail: pure snapshot gate for the server seed task; add DB-backed state and a runner only
 * when an owner-authorized seed task is implemented (ADR 0016).
 */
export interface StartCatalogDraftItem {
  /** Canonical bundled content id, e.g. `start-a1-haus` (ADR 0013 namespace). */
  contentId: string;
  /** True only when German and Persian linguistic review is recorded for the item. */
  linguisticallyReviewed: boolean;
  /** True only when an approved/published `card_versions` row exists for the item. */
  approvedForRelease: boolean;
}

export interface StartCatalogDraftState {
  targetItemCount: number;
  items: ReadonlyArray<StartCatalogDraftItem>;
}

export type StartCatalogSeedDecision =
  { seedable: true; seedItemIds: string[] } | { seedable: false; blockers: string[] };

/** Evaluates the catalog snapshot; seedable requires every item to be present and release-approved. */
export function evaluateStartCatalogSeed(state: StartCatalogDraftState): StartCatalogSeedDecision {
  const blockers: string[] = [];
  if (!Number.isInteger(state.targetItemCount) || state.targetItemCount < 1) {
    blockers.push('catalog target item count must be a positive integer');
    return { seedable: false, blockers };
  }
  if (state.items.length !== state.targetItemCount) {
    blockers.push(
      `catalog has ${state.items.length} of ${state.targetItemCount} target items; ` +
        `seed requires exactly ${state.targetItemCount} release-approved items`,
    );
  }
  const seen = new Set<string>();
  for (const item of state.items) {
    if (seen.has(item.contentId)) {
      blockers.push('catalog item ids must be unique');
      break;
    }
    seen.add(item.contentId);
    if (!item.linguisticallyReviewed) {
      blockers.push(`item ${item.contentId} has not passed linguistic review`);
    }
    if (!item.approvedForRelease) {
      blockers.push(
        `item ${item.contentId} has no approved/published card version (ADR 0013 gate)`,
      );
    }
  }
  if (blockers.length > 0) {
    return { seedable: false, blockers };
  }
  return { seedable: true, seedItemIds: [...seen].sort() };
}
