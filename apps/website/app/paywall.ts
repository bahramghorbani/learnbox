import {
  resolveSupportivePlusOfferEligibility,
  type SupportivePlusOfferProgress,
} from '@learnbox/billing-core';

import { productExperience, supportivePlusOfferFeature } from './product-experience';

export interface SupportivePlusOfferDecision {
  eligible: boolean;
  shouldDisplay: boolean;
  supportiveCopy: string;
  signal: string | null;
}

/** The default configuration keeps the component mounted but invisible during closed alpha. */
export function resolveSupportivePlusOffer(
  progress: SupportivePlusOfferProgress,
): SupportivePlusOfferDecision {
  const eligibility = resolveSupportivePlusOfferEligibility(
    {
      firstSeriousOfferNotBeforeActiveDays:
        productExperience.paywall.firstSeriousOfferNotBeforeActiveDays,
      minimumLearningCycleWords: productExperience.paywall.eligibility.learningCycleWords.minimum,
      minimumCompletedSessions: productExperience.paywall.eligibility.completedSessions,
    },
    progress,
  );
  return {
    eligible: eligibility.eligible,
    shouldDisplay: supportivePlusOfferFeature.enabled && eligibility.eligible,
    supportiveCopy: productExperience.paywall.supportiveCopy,
    signal: eligibility.signal,
  };
}
