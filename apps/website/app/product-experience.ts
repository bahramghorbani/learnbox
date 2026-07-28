import {
  resolveLearnBoxTierAccess,
  type LearnBoxTierAccess,
  type LearnBoxTierId,
} from '@learnbox/billing-core';

import productExperienceJson from '../../../config/product-experience.json';

export const productExperience = productExperienceJson;
export const startTierExperience = productExperience.tiers.learnbox_start;
export const plusTierExperience = productExperience.tiers.learnbox_plus;
export const supportivePlusOfferFeature = productExperience.features.supportivePlusOffer;
export const defaultSuggestedNewWords = startTierExperience.recommendedNewWordsPerDay.default;
export const personalWordLimit = startTierExperience.personalWordLimit;

/**
 * The client receives only a verified entitlement set. Provider IDs, prices and purchase
 * verification stay outside the web app; this adapter simply joins that result to remote config.
 */
export interface ClientTierExperience {
  access: LearnBoxTierAccess;
  displayName: string;
  recommendedNewWordsPerDay: {
    minimum: number;
    maximum: number;
    default: number;
  } | null;
  personalWordLimit: number | null;
  packIds: readonly string[];
}

function buildClientTierExperience(access: LearnBoxTierAccess): ClientTierExperience {
  if (access.tierId === 'learnbox_plus') {
    return {
      access,
      displayName: plusTierExperience.displayName,
      recommendedNewWordsPerDay: null,
      personalWordLimit: null,
      packIds: [],
    };
  }

  return {
    access,
    displayName: startTierExperience.displayName,
    recommendedNewWordsPerDay: startTierExperience.recommendedNewWordsPerDay,
    personalWordLimit: startTierExperience.personalWordLimit,
    packIds: startTierExperience.packIds,
  };
}

/** Resolves a safe client presentation from server-verified entitlement keys. */
export function resolveClientTierExperience(
  entitlements: ReadonlySet<string>,
): ClientTierExperience {
  return buildClientTierExperience(resolveLearnBoxTierAccess(entitlements));
}

/** A learner without a verified entitlement remains on permanent LearnBox Start. */
export const defaultClientTierExperience = resolveClientTierExperience(new Set<string>());

export function isClientTier(experience: ClientTierExperience, tierId: LearnBoxTierId): boolean {
  return experience.access.tierId === tierId;
}
