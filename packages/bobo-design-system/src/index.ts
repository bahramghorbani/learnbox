export const boboExpressions = ['welcome', 'encourage', 'celebrate', 'recovery', 'focus'] as const;

export type BoboExpression = (typeof boboExpressions)[number];

export interface BoboAssetReference {
  expression: BoboExpression;
  assetId: string;
  canonicalVersion: string | null;
  path: string;
}

export const boboCanonicalReference = 'docs/design/concepts/bobo-expression-review-v2.png' as const;

export const boboCanonicalAssets: Record<BoboExpression, BoboAssetReference> = {
  welcome: {
    expression: 'welcome',
    assetId: 'bobo-welcome-v2',
    path: '/images/bobo/welcome-v2.png',
    canonicalVersion: '1.0.0',
  },
  encourage: {
    expression: 'encourage',
    assetId: 'bobo-encourage-v2',
    path: '/images/bobo/encourage-v2.png',
    canonicalVersion: '1.0.0',
  },
  celebrate: {
    expression: 'celebrate',
    assetId: 'bobo-celebrate-v2',
    path: '/images/bobo/celebrate-v2.png',
    canonicalVersion: '1.0.0',
  },
  recovery: {
    expression: 'recovery',
    assetId: 'bobo-recovery-v2',
    path: '/images/bobo/recovery-v2.png',
    canonicalVersion: '1.0.0',
  },
  focus: {
    expression: 'focus',
    assetId: 'bobo-focus-v2',
    path: '/images/bobo/focus-v2.png',
    canonicalVersion: '1.0.0',
  },
};

export const boboUsageRules = {
  canShameLearner: false,
  canBlockStudy: false,
  requiresReducedMotionFallback: true,
  requiresOwnerApprovalForCanonicalAppearance: true,
} as const;

export function isCanonicalBoboAsset(asset: BoboAssetReference): boolean {
  return (
    asset.canonicalVersion !== null &&
    asset.assetId.trim().length > 0 &&
    asset.path.startsWith('/images/bobo/')
  );
}
