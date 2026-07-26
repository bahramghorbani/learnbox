export const boboExpressions = ['welcome', 'encourage', 'celebrate', 'recovery', 'focus'] as const;

export type BoboExpression = (typeof boboExpressions)[number];

export interface BoboAssetReference {
  expression: BoboExpression;
  assetId: string;
  canonicalVersion: string | null;
}

export const boboUsageRules = {
  canShameLearner: false,
  canBlockStudy: false,
  requiresReducedMotionFallback: true,
  requiresOwnerApprovalForCanonicalAppearance: true,
} as const;

export function isCanonicalBoboAsset(asset: BoboAssetReference): boolean {
  return asset.canonicalVersion !== null && asset.assetId.trim().length > 0;
}
