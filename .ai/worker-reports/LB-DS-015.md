# LB-DS-015 activation

- Task: NI-008A native Preview host/config seam
- Base: main at `30673a2`
- Branch: `docs/activate-lb-ds-015`
- Status: ready for activation review
- Allowed implementation paths: Android manifest INTERNET permission, new immutable mobile preview config, direct tests, two docs, queue/report/current-work metadata.
- Forbidden: endpoint, HTTP client, token/session composition, UI, provider, secret, flag activation, deployment, Preview request, Production, background work and review-sync upload.
- Required implementation: strict TDD, default-disabled behavior, exact compile-time define names and Preview-origin validation from the merged NI-008 design.
