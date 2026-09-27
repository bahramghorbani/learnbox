# Releases

Main is the default branch; GitHub branch protection is not enabled on the free private plan, so
releases rely on the documented convention that meaningful work enters only through a reviewed pull
request with green CI. Releases use tested tags and changelog entries. Production deployment and
marketplace submission require explicit owner approval.

The automated release gate runs formatting, linting, types, unit tests, migration validation, dependency audit, Flutter checks in CI, a security/PWA contract check, and safe closed-alpha defaults. Browser installation and real-device offline validation remain required before a public release. Closed-alpha activation also requires the scoped checklist in `CLOSED_ALPHA.md`; it does not authorize a public release.
