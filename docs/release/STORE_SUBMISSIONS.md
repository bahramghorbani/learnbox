# Store submissions ledger

Append-only record of every binary submitted to an app store. Rules: [`VERSIONING.md`](VERSIONING.md).
Status is one of `submitted`, `in_review`, `published`, `rejected`, `superseded`. Never delete or
renumber a row; a rejected build's number stays consumed.

<!-- ledger:start -->

| Platform | Store       | Version | Build | Source commit                            | Artifact SHA-256                                                 | Submitted  | Status    |
| -------- | ----------- | ------- | ----- | ---------------------------------------- | ---------------------------------------------------------------- | ---------- | --------- |
| android  | cafe_bazaar | 0.1.1   | 2     | 40cd19c3c4b5d726c01b95a4fc2d15e8b0b5c453 | e1b8c09299c081ede643c1e0239c8035776f16a03100164aec4675f6d865170d | 2026-10-31 | published |
| ios      | sibapp      | 0.1.1   | 2     | ef9328035b49e203f96cdb9cd6631b01ac62cfa4 | 07c1dbc52e64edb1afcb101e72a2ba707f9df23f1817b860b2d3babb697f845e | 2026-11-01 | published |

<!-- ledger:end -->

Notes:

- Both Android artifacts are signed by the same release certificate (SHA-256 prefix
  `4aa1b1ec96b36adf`). Every future Android build for any store must use that same key, or
  installed users cannot update. The keystore is owner-held and is never committed.
- `apps/android` is unchanged since `40cd19c` and `apps/ios` since `ef93280`, so those commits are
  the exact sources of the rows above.
- Myket: a build is in review, but which artifact was uploaded was not recorded. It must be
  confirmed from the Myket panel and appended here. A local `0.1.0+1` APK (SHA-256
  `5f234beecd30274e…`, built 2026-10-26) predates the real Myket billing flow; if that is the
  build in review, it must be replaced by a new build with `versionCode` 3 or higher.
