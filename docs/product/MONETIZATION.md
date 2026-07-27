# Monetization

LearnBox is one product with two stable entitlement tiers: `learnbox_start` (permanent free) and
`learnbox_plus` (paid subscription). Plus has stable period IDs `monthly`, `three_month` and
`annual`. Public names, prices, limits and feature presentation are configuration, never client
constants. The default tier and paywall configuration lives in
[`config/product-experience.json`](../../config/product-experience.json).

Start provides real learning value before any serious offer: controlled A1 content, 10–15
recommended new cards daily, unlimited due reviews and retained learned free content. A payment
state must never block due reviews or remove learned content. The offer is supportive, does not
appear aggressively on day one and excludes fear, guilt, countdowns, streak threats and false
scarcity.

Future provider-neutral subscriptions and one-time packs use Cafe Bazaar and direct Iranian PWA
payment adapters. Pricing, legal terms, provider contracts, and production billing require owner approval.

The executable foundation keeps LearnBox products separate from provider identifiers and resolves access only after server verification. No final price is committed to the repository. Before a real provider is connected, the owner must approve its account, terms, legal requirements and production configuration.
