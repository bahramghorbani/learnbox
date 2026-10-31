# Versioning and GitHub Releases

Authoritative rules for how LearnBox products are versioned, tagged and released. This document
is the single source of truth for version numbers and release tags; `CHANGELOG.md` records what
each released version contained, and `docs/release/` holds the per-release evidence records.

Creating a Git tag, publishing a GitHub Release and deploying to Production are three distinct
actions. Each one requires separate owner authorization. Merging a PR authorizes none of them.

## Products and their version lines

LearnBox ships three products that version **independently**. A change to one never renumbers
another.

| Product                      | Authoritative version source                                        | Tag namespace    | Published releases so far                                  |
| ---------------------------- | ------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------- |
| Learner PWA (`apps/website`) | `apps/website/package.json` → `version`                             | `learner/vX.Y.Z` | `v1.0.0`, `v1.2.0`, `v1.2.1` (legacy repository-wide tags) |
| Admin Web (`apps/admin`)     | `apps/admin/package.json` → `version`                               | `admin/vX.Y.Z`   | none                                                       |
| Android (`apps/android`)     | `apps/android/app/build.gradle.kts` → `versionName` / `versionCode` | `android/vX.Y.Z` | none                                                       |

`scripts/validate-version-sources.mjs` (`pnpm verify:version-sources`) enforces that each product
reads only its own source, that no product can display another's version, and that no accessor
carries a hardcoded fallback version.

### Preserved history

Tags `v1.0.0`, `v1.1.0`, `v1.2.0` and `v1.2.1` are the historical repository-wide line. They
described learner-facing releases and remain valid, immutable history; they are never renamed,
moved or deleted. The Learner PWA continues that numbering under its new namespace, so its next
release is `learner/v1.3.0` (or `learner/v1.2.2` for a patch) — the number does not restart.

Admin Web has never published a release. Its package version therefore still reads `0.1.0`: a deployed artifact is not a published release, and declaring `1.0.0` before the first `admin/v1.0.0` release would invent a version that does not exist. Admin's first published release is an owner-gated decision, not an automatic consequence of its deployment.

Android's checked-in Kotlin baseline is `versionName=0.1.1`, `versionCode=2`. It has no published GitHub Release and no store publication; neither a merged PR, a signed artifact nor a store submission may be described as a release. The next submitted Android build must derive its versionCode from the actual latest submitted artifact, not merely the checked-in value.

## Semantic Versioning

`MAJOR.MINOR.PATCH` per product:

- **MAJOR** — a breaking change for that product's users or clients (removed learner capability,
  incompatible API contract, forced re-authentication, data shape a prior client cannot read).
- **MINOR** — backward-compatible capability (a new screen, a new admin workflow, a new flag).
- **PATCH** — backward-compatible fix, security hardening or copy correction.

### Prereleases

Prerelease identifiers are appended with a dot-separated counter and sort before the final
release:

```
learner/v1.3.0-beta.1    admin/v1.0.0-rc.2    android/v1.0.0-beta.1
```

Use `beta` for a build under active validation and `rc` for a candidate believed releasable. A
prerelease GitHub Release is published with the **pre-release** flag set, never as `Latest`.

## GitHub Release contents

Every GitHub Release, for every product, states:

1. **Product and version** — the tag itself, e.g. `admin/v1.0.0`.
2. **Source commit** — the full 40-character SHA the release was built from, reachable from
   `main`. The tag points at that commit and never moves.
3. **Release date** — UTC date of publication.
4. **Release notes** — what changed, in the same voice as `CHANGELOG.md`; breaking changes first.
5. **Build artifact and checksum** — when an artifact exists:
   - Learner PWA and Admin Web ship as container images. Record the image digest
     (`sha256:…`); the digest _is_ the checksum, and the image carries the commit as the OCI
     `org.opencontainers.image.revision` label and the runtime `APP_SOURCE_SHA` env var.
   - Android ships as a signed AAB/APK. Record the file name and its SHA-256.
   - A release with no artifact (documentation, tooling) says so explicitly.
6. **Deployment or distribution status** — one of: _not deployed_, _deployed to Production on
   `<date>`_, _rolled back_, or for Android _submitted to Café Bazaar / Google Play_ versus
   _published_. A GitHub Release never implies deployment.

Nothing in a release body may contain a secret, credential, phone number or personal data.

## Android releases

`apps/android` is a Kotlin native shell around the existing Learner PWA. Its currently checked-in baseline is `0.1.1+2`; it has neither a GitHub Release nor a store listing/publication. The permanent signing identity is external to the repository. Bazaar implementation and publication remain separately gated by [`CAFE_BAZAAR_MULTICHANNEL_COMMERCE_ROADMAP.md`](../planning/CAFE_BAZAAR_MULTICHANNEL_COMMERCE_ROADMAP.md).

- **versionName** is the Android component SemVer string and matches the `android/vX.Y.Z` tag when a GitHub Release is authorized.
- **versionCode** is a separate integer that **increases monotonically on every build submitted to any store**, regardless of flavor. It never decreases or repeats — not across a rollback, re-signed artifact or store rejection. It lives beside `versionName` in `apps/android/app/build.gradle.kts` and must be reconciled with the latest submitted artifact before a release build.
- **Channel is artifact metadata, not a new app version line.** A Bazaar artifact may be named `learnbox-android-bazaar-v0.2.0+3.apk`, but it remains one Android component with the same signed application identity and global versionCode sequence.
- **Signed artifact handling** — the upload/signing key and keystore are owner-held secrets. They are never committed, never placed in CI without an owner decision, and never stored in this repository. The GitHub Release records the artifact's SHA-256 so a store binary can be matched back to a commit; the signing material itself never appears in the release.
- **Backend compatibility** — Android is a client of the same Learner backend as the PWA. It shares accounts, progress, entitlements and the review-sync contract; it does not get its own database, its own account namespace or a divergent sync protocol. An Android release that needs a server change depends on that server release and must state the minimum backend version it requires.
- **Store publication is separate** — publishing `android/v1.0.0` on GitHub does not submit, release or roll out anything on Café Bazaar or Google Play. Store submission, staged rollout and store takedown are independent owner-authorized actions, tracked in the release's distribution status.

## Release procedure

1. Merge the change through a reviewed PR with all four required checks green.
2. Decide the new version per the rules above and update that product's version source in its
   own PR (or in the feature PR when the release is immediate).
3. **Owner authorization gate.** Obtain explicit owner approval before the next step.
4. Create the annotated tag on the exact released commit and publish the GitHub Release with the
   six fields above.
5. Deploy, if deploying, as a separately authorized action; then update the release's deployment
   status and the relevant record in `docs/release/`.

Rollback never rewrites a tag or deletes a release. It ships a new patch version, or redeploys a
previously released artifact, and the superseded release is annotated with its new status.
