# Remote configuration parameters

The checked-in JSON is the reviewed default contract, not a public production switch. A future signed/configuration service must expose the same schema with a version and rollback history.

| Parameter                                        | Default                    | Rule                                                          |
| ------------------------------------------------ | -------------------------- | ------------------------------------------------------------- |
| `tiers.learnbox_start.displayName`               | LearnBox Start             | Display-only; internal ID stays stable.                       |
| `tiers.learnbox_start.recommendedNewWordsPerDay` | 10–15, default 12          | Recommendation, never a due-review cap.                       |
| `tiers.learnbox_start.personalWordLimit`         | 30                         | Eligible limit event only; learned content stays available.   |
| `tiers.learnbox_start.reviewAccess`              | unlimited/retained         | Non-negotiable learner protection.                            |
| `tiers.learnbox_plus.displayName`                | LearnBox Plus              | Display-only; internal ID stays stable.                       |
| `tiers.learnbox_plus.subscriptionPeriods`        | monthly/three-month/annual | Provider mapping is server-side.                              |
| `paywall.firstSeriousOfferNotBeforeActiveDays`   | 3                          | Must not be reduced to first-day pressure.                    |
| `paywall.eligibility`                            | value-signal thresholds    | Testable independently; any configured signal may qualify.    |
| `paywall.supportiveCopy`                         | approved Persian copy      | Must keep calm, non-coercive tone.                            |
| `paywall.forbiddenTactics`                       | five tactics               | Client/UI validation must reject these patterns.              |
| `features.supportivePlusOffer`                   | disabled, version `v1`     | Closed alpha keeps the offer hidden until explicitly enabled. |

Config changes require audit metadata, a staged rollout, metrics review and one-click rollback.
