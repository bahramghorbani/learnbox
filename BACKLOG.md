# Product backlog

Current storyboard position is **23 of 30 — Closed alpha**. Completed stages are not reopened; the entries below are compatibility and hardening work in dependency order.

| Priority | Work                                                                                   | Dependency                                        | Status                                            | Classification              |
| -------- | -------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- | --------------------------- |
| P0       | Versioned Start/Plus config contract and entitlement protections                       | none                                              | implemented foundation; client adapter next       | minor_implementation_change |
| P0       | Start pack schema, manifest and 20-item vertical-slice review gate                     | content model                                     | implemented; real slice next                      | minor_implementation_change |
| P0       | Validate 20 real items in web/mobile: media, scheduling, offline, progress and Bobo QA | source-referenced drafts and editorial review     | linguistic drafts ready; media and app QA pending | requires_new_task           |
| P1       | Admin controls for configuration versions and pack release                             | auth/audit UI                                     | quality-review ledger foundation implemented      | requires_new_task           |
| P1       | Privacy-safe analytics adapter and event delivery                                      | event contract                                    | not started                                       | requires_new_task           |
| P1       | Supportive paywall UI behind a disabled feature flag                                   | config + analytics                                | not started                                       | requires_new_task           |
| P1       | Factory job adapters: normalization, duplicate, linguistic/CEFR and asset QA           | schema + admin                                    | normalization and duplicate foundation done       | requires_new_task           |
| P2       | Produce reviewed, versioned batches of about 50 Start items to 350                     | 20-item acceptance                                | blocked                                           | blocked_by_owner            |
| P2       | Transparent canonical Bobo asset set                                                   | image-generation billing credit                   | deferred                                          | blocked_by_owner            |
| P2       | Activate real pricing/payment provider                                                 | provider account, terms, legal and owner approval | blocked                                           | blocked_by_owner            |

No bulk image/audio generation occurs before the 20-item slice passes all review gates.
