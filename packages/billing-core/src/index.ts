export type BillingProvider = 'cafe_bazaar' | 'direct_web' | 'google_play' | 'app_store';
export type BillingEnvironment = 'sandbox' | 'production';
export type ProductKind = 'subscription' | 'one_time_pack';
export type PurchaseStatus = 'verified' | 'revoked' | 'refunded' | 'rejected';
export type LearnBoxTierId = 'learnbox_start' | 'learnbox_plus';
export type LearnBoxSubscriptionPeriod = 'monthly' | 'three_month' | 'annual';

/**
 * Stable, non-localized identifiers. Public labels, prices and limits are supplied by remote
 * configuration rather than being embedded in clients or provider product IDs.
 */
export const LEARNBOX_TIER_IDS = ['learnbox_start', 'learnbox_plus'] as const;
export const LEARNBOX_SUBSCRIPTION_PERIODS = ['monthly', 'three_month', 'annual'] as const;

export interface LearnBoxTierAccess {
  tierId: LearnBoxTierId;
  canReviewDueContent: boolean;
  retainsLearnedContent: boolean;
}

export interface PersonalWordLimitResult {
  canAdd: boolean;
  remaining: number;
}

/** A configured personal-word limit never affects review access or previously saved words. */
export function evaluatePersonalWordLimit(
  currentWordCount: number,
  configuredLimit: number,
): PersonalWordLimitResult {
  if (!Number.isInteger(currentWordCount) || currentWordCount < 0) {
    throw new Error('Current personal word count must be a non-negative integer.');
  }
  if (!Number.isInteger(configuredLimit) || configuredLimit < 0) {
    throw new Error('Personal word limit must be a non-negative integer.');
  }
  return {
    canAdd: currentWordCount < configuredLimit,
    remaining: Math.max(0, configuredLimit - currentWordCount),
  };
}

export function resolveLearnBoxTierAccess(entitlements: ReadonlySet<string>): LearnBoxTierAccess {
  if (entitlements.has('learnbox_plus')) {
    return {
      tierId: 'learnbox_plus',
      canReviewDueContent: true,
      retainsLearnedContent: true,
    };
  }

  // Start is permanent. A payment state must never remove due reviews or learned free content.
  return {
    tierId: 'learnbox_start',
    canReviewDueContent: true,
    retainsLearnedContent: true,
  };
}

export interface BillingProduct {
  id: string;
  kind: ProductKind;
  entitlementKeys: string[];
  active: boolean;
}

export interface VerifiedPurchase {
  provider: BillingProvider;
  environment: BillingEnvironment;
  providerPurchaseId: string;
  productId: string;
  status: PurchaseStatus;
  expiresAt?: Date;
}

/** Resolves only server-verified, active purchases. Provider IDs never live in the catalog. */
export function resolveEntitlements(
  products: BillingProduct[],
  purchases: VerifiedPurchase[],
  now: Date,
): Set<string> {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const entitlements = new Set<string>();

  for (const purchase of purchases) {
    const product = productsById.get(purchase.productId);
    if (!product || !product.active || purchase.status !== 'verified') continue;
    if (product.kind === 'subscription' && (!purchase.expiresAt || purchase.expiresAt <= now)) {
      continue;
    }
    for (const entitlement of product.entitlementKeys) entitlements.add(entitlement);
  }
  return entitlements;
}

export function validatePurchaseForEnvironment(purchase: VerifiedPurchase): boolean {
  return (
    Boolean(purchase.providerPurchaseId.trim()) &&
    (purchase.environment === 'sandbox' || purchase.environment === 'production')
  );
}
