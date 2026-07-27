# Product decision integration test plan

| Area             | Check                                          | Acceptance                                                                                   |
| ---------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Tier resolver    | no Plus purchase, expired purchase, valid Plus | Start retains due/learned review; Plus resolves with stable ID.                              |
| Config contract  | JSON schema/value validation                   | No public labels/limits/prices hardcoded in client paths; forbidden tactics remain excluded. |
| Content model    | complete item and invalid metadata             | `rejected` accepted; full item validates; missing metadata fails.                            |
| AI/review flow   | generated draft to release                     | AI cannot publish; reviewer and publisher remain separate.                                   |
| 20-item slice    | PWA/mobile card and offline flow               | media, audio, schedule, progress and recovery work offline.                                  |
| Bobo visual QA   | nouns/actions/places/abstract cards            | semantic subject wins; canonical Bobo only; no text/watermark/clutter.                       |
| Paywall          | eligible/dismissed/expired access              | never first-day aggressive; no due-review block; event emission privacy-safe.                |
| Release/rollback | staged pack/config reversal                    | prior approved pack/config restores without data loss.                                       |

Run package tests plus `pnpm check`, migration validation and relevant Flutter checks before any commit. Record real-device evidence before alpha expansion.
