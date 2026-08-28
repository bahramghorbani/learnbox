# LearnBox delivery storyboard

The former 30-stage storyboard is retained as historical design context. The active execution plan uses eight outcome-based milestones so the team can ship a real product without treating every technical slice as a separate project phase.

| Milestone                | Delivery outcome                                                          | Main surfaces                          |
| ------------------------ | ------------------------------------------------------------------------- | -------------------------------------- |
| M0 Product truth         | One canonical status, architecture, roadmap and worker model              | All documentation                      |
| M1 Online learning core  | Online learner loop, free A1 content, progress and reconnect sync         | Web, Android, API                      |
| M2 Content factory/Admin | AI-assisted complete packs with QA, review, release and rollback          | Admin, workers, API                    |
| M3 Account center        | Profile, settings, purchases, pack access, sync status and personal words | Web, Android, API                      |
| M4 Commerce              | Platform-specific real purchase adapters and shared entitlements          | Web, Android, iOS contract, Admin, API |
| M5 Native online         | Secure native gateway, Android online auth/sync and iOS preparation       | Infrastructure, API, mobile            |
| M6 Private beta          | Reliability, observability, abuse, backup, support and limited cohort     | All                                    |
| M7/M8 public platforms   | Android release followed by native iOS App Store release                  | Mobile, commerce, operations           |

## Relationship to historical stages

Historical stages 1–30 describe how the repository evolved and should not be deleted because they contain evidence and design decisions. They are not the active backlog. New work must reference an active milestone and workstream in `.ai/WORK_QUEUE.md` and `.ai/WORKSTREAMS.md`.

## Current status

M0 is in progress. Product capability truth is in `docs/PRODUCT_STATUS.md`; release exit criteria are in `ROADMAP.md`; documentation update rules are in `docs/DOCUMENTATION_GOVERNANCE.md`.
