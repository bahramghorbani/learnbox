/**
 * The runtime reuse point for the canonical LearnBox image-generation standard.
 *
 * WHERE THE CANONICAL STANDARD LIVES: `content/packs/learnbox-start/prompts/
 * start-a1-v2-visual-contract.json`. That versioned visual contract already governs the shipped
 * card images and is the single source of the LearnBox visual language (`style`), the standard
 * version, the per-card curated briefs, and the model the standard was proven against.
 *
 * This module does not restate, paraphrase or extend that standard. It loads it, so the Admin
 * inherits exactly the same visual knowledge the existing batch tooling
 * (`scripts/generate-avalai-start-pack-v2.mjs`) uses. There is deliberately no second,
 * Admin-specific prompt standard that could drift from it.
 */

import type { LearnBoxImageStandard } from '@learnbox/content-models';

import visualContract from '../../../../content/packs/learnbox-start/prompts/start-a1-v2-visual-contract.json';

interface VisualContractCard {
  contentId: string;
  brief: string;
}

interface VisualContract {
  version: string;
  model: string;
  style: string;
  cards: VisualContractCard[];
}

const contract = visualContract as VisualContract;

/** The canonical standard, exactly as recorded in the versioned visual contract. */
export function readCanonicalImageStandard(): LearnBoxImageStandard {
  if (!contract.style?.trim() || !contract.version?.trim()) {
    throw new Error('پیمان تصویری قانونی LearnBox ناقص است.');
  }
  return { version: contract.version, model: contract.model, style: contract.style };
}

/**
 * The human-curated brief for a card, when the canonical contract already carries one.
 *
 * A curated brief is a reviewed editorial value and must win over anything derived at runtime, so
 * regenerating a shipped card reproduces the standard it was approved under.
 */
export function readCanonicalCardBrief(contentId: string): string | undefined {
  return contract.cards.find((card) => card.contentId === contentId)?.brief?.trim() || undefined;
}
