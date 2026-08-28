# LearnBox monetization

## Model

LearnBox is a free-to-download app with a permanent free A1 starter collection of approximately 350 words. Premium products are complete vocabulary packs sold as one-time purchases initially. Subscription is deferred until pack commerce and retention are proven.

## Platform payment adapters

| Surface | Payment                          | Verification                                        | Entitlement             |
| ------- | -------------------------------- | --------------------------------------------------- | ----------------------- |
| Web App | Direct bank gateway              | Server callback/status verification and idempotency | Shared pack entitlement |
| Android | Cafe Bazaar in-app billing       | Server-side purchase-token verification             | Shared pack entitlement |
| iOS     | Apple In-App Purchase / StoreKit | Server-side transaction/receipt verification        | Shared pack entitlement |

The same pack can have distinct platform offers, prices, currencies, taxes and provider product IDs. The content and entitlement key remain canonical.

## Data boundaries

```text
Pack
└── canonical educational content

PackOffer
└── platform, provider, product ID, currency, amount, active window

Purchase
└── provider transaction, amount, status, verification evidence

Entitlement
└── user + pack access, source purchase, active/revoked state
```

The client never grants access based only on a local purchase result. Refunds, chargebacks and revocations update entitlement through a verified server process.

## Admin requirements

Admin must manage catalog, pack availability, platform offers, pricing, product IDs, promotions, purchase status, entitlement repair and audit history. Price changes are versioned; historic purchases retain their original transaction data.

## Rollout

1. Implement provider-neutral catalog and entitlement contracts.
2. Test all providers in their approved sandbox/test environments.
3. Verify one controlled real transaction per enabled platform.
4. Enable broader sales only after support, refund, reconciliation and rollback procedures pass.

No price, provider credential or production payment activation belongs in source control.
