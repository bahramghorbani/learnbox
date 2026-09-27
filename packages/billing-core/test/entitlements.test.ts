import { describe, expect, it } from 'vitest';

import {
  evaluatePersonalWordLimit,
  resolveEntitlements,
  resolveLearnBoxTierAccess,
  validatePurchaseForEnvironment,
} from '../src/index.js';

const products = [
  { id: 'premium', kind: 'subscription' as const, entitlementKeys: ['premium'], active: true },
  {
    id: 'nurse-pack',
    kind: 'one_time_pack' as const,
    entitlementKeys: ['pack:nurse'],
    active: true,
  },
];

describe('billing entitlements', () => {
  it('grants only verified, active purchases', () => {
    expect(
      resolveEntitlements(
        products,
        [
          {
            provider: 'cafe_bazaar',
            environment: 'sandbox',
            providerPurchaseId: 'test-1',
            productId: 'premium',
            status: 'verified',
            expiresAt: new Date('2026-08-01'),
          },
          {
            provider: 'direct_web',
            environment: 'sandbox',
            providerPurchaseId: 'test-2',
            productId: 'nurse-pack',
            status: 'refunded',
          },
        ],
        new Date('2026-07-26'),
      ),
    ).toEqual(new Set(['premium']));
  });

  it('does not restore expired subscriptions or inactive products', () => {
    expect(
      resolveEntitlements(
        [{ ...products[0], active: false }],
        [
          {
            provider: 'cafe_bazaar',
            environment: 'production',
            providerPurchaseId: 'live-1',
            productId: 'premium',
            status: 'verified',
            expiresAt: new Date('2026-07-01'),
          },
        ],
        new Date('2026-07-26'),
      ),
    ).toEqual(new Set());
  });

  it('requires a provider purchase identifier before verification', () => {
    expect(
      validatePurchaseForEnvironment({
        provider: 'direct_web',
        environment: 'sandbox',
        providerPurchaseId: '',
        productId: 'premium',
        status: 'verified',
      }),
    ).toBe(false);
  });

  it('keeps Start review access permanent when Plus is absent or expires', () => {
    expect(resolveLearnBoxTierAccess(new Set())).toEqual({
      tierId: 'learnbox_start',
      canReviewDueContent: true,
      retainsLearnedContent: true,
    });
  });

  it('recognizes the stable Plus entitlement without hardcoded public labels', () => {
    expect(resolveLearnBoxTierAccess(new Set(['learnbox_plus']))).toMatchObject({
      tierId: 'learnbox_plus',
      canReviewDueContent: true,
      retainsLearnedContent: true,
    });
  });

  it('applies a personal-word limit without removing saved words or review access', () => {
    expect(evaluatePersonalWordLimit(29, 30)).toEqual({ canAdd: true, remaining: 1 });
    expect(evaluatePersonalWordLimit(30, 30)).toEqual({ canAdd: false, remaining: 0 });
  });

  it('rejects a purchase with an unknown billing environment', () => {
    expect(
      validatePurchaseForEnvironment({
        provider: 'direct_web',
        environment: 'staging',
        providerPurchaseId: 'test-1',
        productId: 'premium',
        status: 'verified',
      } as never),
    ).toBe(false);
  });

  it('accepts a sandbox and a production purchase with a provider id', () => {
    for (const environment of ['sandbox', 'production'] as const) {
      expect(
        validatePurchaseForEnvironment({
          provider: 'cafe_bazaar',
          environment,
          providerPurchaseId: 'live-1',
          productId: 'premium',
          status: 'verified',
        }),
      ).toBe(true);
    }
  });

  it('rejects a personal-word count or limit that is not a non-negative integer', () => {
    expect(() => evaluatePersonalWordLimit(-1, 30)).toThrow(
      'Current personal word count must be a non-negative integer.',
    );
    expect(() => evaluatePersonalWordLimit(1.5, 30)).toThrow(
      'Current personal word count must be a non-negative integer.',
    );
    expect(() => evaluatePersonalWordLimit(1, -2)).toThrow(
      'Personal word limit must be a non-negative integer.',
    );
  });

  it('ignores purchases for products that are not in the catalog', () => {
    expect(
      resolveEntitlements(
        products,
        [
          {
            provider: 'direct_web',
            environment: 'sandbox',
            providerPurchaseId: 'test-3',
            productId: 'unknown-product',
            status: 'verified',
          },
        ],
        new Date('2026-07-26'),
      ),
    ).toEqual(new Set());
  });

  it('does not grant an expired subscription even when the product is active', () => {
    expect(
      resolveEntitlements(
        products,
        [
          {
            provider: 'cafe_bazaar',
            environment: 'production',
            providerPurchaseId: 'live-2',
            productId: 'premium',
            status: 'verified',
            expiresAt: new Date('2026-07-01'),
          },
        ],
        new Date('2026-07-26'),
      ),
    ).toEqual(new Set());
  });
});
