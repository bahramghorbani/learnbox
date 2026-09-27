import { describe, expect, it } from 'vitest';

import {
  boboCanonicalAssets,
  boboExpressions,
  boboUsageRules,
  isCanonicalBoboAsset,
} from './index.js';

describe('Bobo design-system policy', () => {
  it('keeps the approved expression vocabulary finite', () => {
    expect(boboExpressions).toEqual(['welcome', 'encourage', 'celebrate', 'recovery', 'focus']);
  });

  it('does not treat an unversioned asset as canonical', () => {
    expect(
      isCanonicalBoboAsset({
        expression: 'welcome',
        assetId: 'bobo-welcome',
        canonicalVersion: null,
        path: '/images/bobo/welcome-v2.png',
      }),
    ).toBe(false);
    expect(boboUsageRules.canShameLearner).toBe(false);
    expect(boboUsageRules.canBlockStudy).toBe(false);
  });

  it('maps every approved expression to a versioned canonical delivery asset', () => {
    expect(Object.keys(boboCanonicalAssets)).toEqual(boboExpressions);
    expect(Object.values(boboCanonicalAssets).every(isCanonicalBoboAsset)).toBe(true);
  });
});
