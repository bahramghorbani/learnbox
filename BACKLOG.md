# LearnBox release backlog

The historical 30-stage storyboard no longer controls execution. Work is admitted only when it closes a `ROADMAP.md` season exit gate. Completed implementation history remains in Git, the queue and evidence documents; this file lists only release-critical outcomes.

## Ordered critical path

| Order | Season | Outcome                                                        | Current state | Blocking input                                                   | Completion evidence                                             |
| ----- | ------ | -------------------------------------------------------------- | ------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| 1     | S0     | Freeze one public-v1.0 definition and bounded season plan      | accepted      | none                                                             | PR #276 merged; canonical docs agree; scope exclusions recorded |
| 2     | S1     | Attach and human-approve all starter media/content             | blocked       | owner-selected isolated private store, owner upload/review gates | 35/35 release-approved; approved media attached                 |
| 3     | S1     | Seed/release the 35-item starter and activate Web server truth | blocked       | order 2                                                          | exactly 35 learner rows; rollback; lossless reconnect test      |
| 4     | S1     | Run owner pilot and 2–3-user Web closed alpha                  | blocked       | order 3 and owner invitations                                    | closed-alpha evidence and go/stop decision                      |
| 5     | S2     | Complete release/rollback Admin flow for two packs             | partial       | stable published starter contract                                | operator exercise without direct DB edit                        |
| 6     | S2     | Prepare and approve exactly one premium pack                   | blocked       | bounded content brief and owner review capacity                  | one release-ready premium pack                                  |
| 7     | S2     | Complete release-critical support/privacy/deletion and ops     | partial       | approved policy copy and non-production environment              | exercised deletion, support, alert and restore evidence         |
| 8     | S3     | Implement one Cafe Bazaar verified entitlement path            | planned       | merchant account/product/terms, owner approval                   | purchase/restore/refund/revoke audit evidence                   |
| 9     | S4     | Activate native Android auth, catalog, sync and entitlement    | blocked       | non-SSO gateway and stable S1/S3 contracts                       | physical-device critical journey and rollback build             |
| 10    | S5     | Closed beta, compliance and phased public release              | planned       | orders 4–9                                                       | beta go decision, signed tag, store/public verification         |

## Immediate next actions

1. Merge the S0 canonical roadmap update after independent review and green CI.
2. Present the owner with one decision: create/select an isolated private-media target and accept its cost; no upload is implied.
3. Once selected, execute the already-guarded upload and attachment as separately approved operations.
4. Batch the 35-item human release decision so each item receives one approve/return outcome while all six check dimensions remain auditable.
5. Keep Web learner activation downstream of 35/35 release approval.

## Delivery limits

- At most one status-only reconciliation PR per functional release slice; normal status updates belong in the feature PR.
- Target ≥70% functional PRs and ≤15% docs-only maintenance PRs over a rolling 30 days.
- Do not create a queue task unless it maps to one season outcome and names measurable exit evidence.
- Non-critical design/brand work, extra providers, extra packs and speculative platform work stay outside the critical path.
- Owner/provider latency is reported as a blocker, not hidden inside engineering estimates.

## Post-v1 backlog

- direct Web bank payment;
- native iOS and StoreKit;
- additional premium packs and general AI pack-generation UX;
- personal-vocabulary server sync and AI suggestions;
- subscriptions, notifications, leagues, social/gamification;
- Bobo expansion, seasonal themes and non-critical motion.
