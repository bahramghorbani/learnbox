# Store submissions ledger

Append-only record of every binary submitted to an app store. Rules: [`VERSIONING.md`](VERSIONING.md).
Status is one of `submitted`, `in_review`, `published`, `rejected`, `superseded`. Never delete or
renumber a row; a rejected build's number stays consumed.

<!-- ledger:start -->

| Platform | Store       | Version | Build | Source commit                            | Artifact SHA-256                                                 | Submitted  | Status     |
| -------- | ----------- | ------- | ----- | ---------------------------------------- | ---------------------------------------------------------------- | ---------- | ---------- |
| android  | cafe_bazaar | 0.1.1   | 2     | 40cd19c3c4b5d726c01b95a4fc2d15e8b0b5c453 | e1b8c09299c081ede643c1e0239c8035776f16a03100164aec4675f6d865170d | 2026-10-31 | published  |
| android  | myket       | 0.1.1   | 2     | b1ce241cb7cd4438ecb60bc08b8a09cfc2a3bdec | 9737d97ef7e2abd29dfb760301232f7e449df3e05f989215662cb64949c00710 | 2026-10-27 | superseded |
| ios      | sibapp      | 0.1.1   | 2     | ef9328035b49e203f96cdb9cd6631b01ac62cfa4 | 07c1dbc52e64edb1afcb101e72a2ba707f9df23f1817b860b2d3babb697f845e | 2026-11-01 | published  |
| android  | cafe_bazaar | 0.1.2   | 3     | 237119c02d6d42bfef7a7e959e83fbd27105a231 | 1385b72e60482681af3926faebb0f4b430b17b68c817823bb6e15461bca94618 | 2026-11-02 | in_review  |
| android  | myket       | 0.1.2   | 3     | 237119c02d6d42bfef7a7e959e83fbd27105a231 | 1cb1cb9474a213a59d0e3a3fbe831dd76f04e3207ef574b13608c2d20d630500 | 2026-11-02 | in_review  |

<!-- ledger:end -->

Notes:

- Both Android artifacts are signed by the same release certificate (SHA-256 prefix
  `4aa1b1ec96b36adf`). Every future Android build for any store must use that same key, or
  installed users cannot update. The keystore is owner-held and is never committed.
- `apps/android` is unchanged since `40cd19c` and `apps/ios` since `ef93280`, so those commits are
  the exact sources of the rows above.
- Myket `0.1.1+2` was built on 2026-10-27 12:04 (+03:30) from the working tree that became commit
  `b1ce241` (it already carries the `ir.mservices.market.BILLING` permission added there) and
  contains the real Myket billing flow. It and the Bazaar build share `versionCode` 2 as separate
  flavor artifacts; each store has only one build 2.
- Android `0.1.2+3` (both stores, 2026-11-02) fixes the Bazaar purchase hang on MIUI (PR #511).
  It replaced Myket `0.1.1+2` while that build was still in review, so that row is `superseded`.
