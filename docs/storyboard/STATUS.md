# LearnBox storyboard and delivery status

The original 30-stage storyboard is historical design context. Current delivery uses the six seasons in `ROADMAP.md`; season numbers are release gates, not a count of commits or UI scenes.

## Current season

**S0 of S5 — Finish-line freeze and delivery control.** Merged foundations exist across M1–M3, but the product is not production-ready. The first external product checkpoint is the Web closed alpha at S1; the endpoint is public v1.0 at S5.

## Release-season map

| Season | Outcome                                                        | Status      | Primary unresolved gate                                     |
| ------ | -------------------------------------------------------------- | ----------- | ----------------------------------------------------------- |
| S0     | One canonical finish line, bounded scope and forecast controls | in progress | merge reviewed canonical update                             |
| S1     | 35-item starter live in a lossless Web closed alpha            | blocked     | isolated private media, human approval, seed and activation |
| S2     | Operable Admin/account/ops and one release-ready premium pack  | partial     | complete only release-critical workflows and content        |
| S3     | One Cafe Bazaar purchase produces a shared entitlement         | planned     | merchant/provider readiness and server adapter              |
| S4     | Native Android online release candidate                        | blocked     | non-SSO gateway and stable content/commerce contracts       |
| S5     | Closed-beta evidence and supported public v1.0                 | planned     | S1–S4 and owner/store release gates                         |

## Foundation-to-season mapping

| Former milestone    | Current truth                                   | Season contribution                           |
| ------------------- | ----------------------------------------------- | --------------------------------------------- |
| M0 Product truth    | completed                                       | S0 governance foundation                      |
| M1 Online learning  | partial                                         | S1 Web activation and S4 Android activation   |
| M2 Admin/content    | partial                                         | S1 starter approval and S2 release operations |
| M3 Profile/Settings | partial, implemented foundations on Web/Android | S2 release-critical account completion        |
| M4 Commerce         | provider-neutral foundation only                | S3 one-provider MVP                           |
| M5 Native online    | dormant client/sync foundations                 | S4 Android candidate                          |
| M6 Beta hardening   | planned                                         | S5                                            |
| M7 Android release  | planned                                         | S5                                            |
| M8 native iOS       | deferred beyond v1.0                            | post-v1                                       |

`partial` means verified foundations exist but the applicable `ROADMAP.md` exit gate is incomplete. No dormant flag, test fixture, concept or Preview slice is a released feature.

## Forecast checkpoints

- Web closed alpha: best 2026-10-10; planning target 2026-10-31; outer case 2026-12-05.
- Closed beta entry: best 2026-12-05; planning target 2027-01-16; outer case 2027-03-27.
- Public v1.0: best 2027-01-30; planning target 2027-04-03; outer case 2027-06-19.

These are planning envelopes from the 2026-09-12 baseline. They are recalculated at every season exit and move with measured owner/provider latency.
