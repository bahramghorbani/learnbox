export type BillingProvider = 'cafe_bazaar' | 'direct_web' | 'google_play' | 'app_store';
export type BillingEnvironment = 'sandbox' | 'production';
export type ProductKind = 'subscription' | 'one_time_pack';
export type PurchaseStatus = 'verified' | 'revoked' | 'refunded' | 'rejected';

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
