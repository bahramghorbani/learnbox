import { describe, expect, it } from 'vitest';

import { resolveSupportivePlusOfferEligibility } from '../src/index.js';

const rules = {
  firstSeriousOfferNotBeforeActiveDays: 3,
  minimumLearningCycleWords: 80,
  minimumCompletedSessions: 3,
};

describe('supportive Plus offer eligibility', () => {
  it('never permits an offer before the active-day protection', () => {
    expect(
      resolveSupportivePlusOfferEligibility(rules, {
        activeDays: 2,
        learningCycleWords: 100,
        completedSessions: 4,
        firstCollectionCompleted: true,
        meaningfulProgressReportReceived: true,
      }),
    ).toEqual({ eligible: false, signal: null });
  });

  it('allows a value signal after the active-day protection', () => {
    expect(
      resolveSupportivePlusOfferEligibility(rules, {
        activeDays: 3,
        learningCycleWords: 12,
        completedSessions: 3,
        firstCollectionCompleted: false,
        meaningfulProgressReportReceived: false,
      }),
    ).toEqual({ eligible: true, signal: 'completed_sessions' });
  });

  it('recognizes a completed collection without requiring a payment state', () => {
    expect(
      resolveSupportivePlusOfferEligibility(rules, {
        activeDays: 3,
        learningCycleWords: 0,
        completedSessions: 0,
        firstCollectionCompleted: true,
        meaningfulProgressReportReceived: false,
      }),
    ).toEqual({ eligible: true, signal: 'first_collection_completed' });
  });
});
