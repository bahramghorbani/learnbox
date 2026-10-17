# Release artifact preflight

This is the artifact section of the Production runbook. It does not authorize a deploy, image transfer, migration, configuration change, bypass, restart, payment activation, or traffic change.

## Source of truth

- `infrastructure/production/app/release-build.env` is the approved, non-secret learner **build-time** matrix. It is read from the exact Git commit used to create the image. `NEXT_PUBLIC_*` values are compiled into the client and cannot be changed at runtime.
- Runtime configuration remains the deployed service's protected environment. Never copy secrets into the matrix, image labels, Git, or evidence.
- The artifact records source SHA, image digest, OS/architecture, and its public learner build matrix in OCI labels. Retain those values for the deployed image and the `.previous` rollback image in release evidence.

## Development image versus release approval

`infrastructure/production/admin/build-admin-image.sh` has two intentionally different paths:

- The ordinary build path is permitted for development, Staging and tests without a running baseline. Its success line is **`DEVELOPMENT IMAGE CANDIDATE: VERIFIED (…; not release-approved)`**. It is never deployment approval.
- `LEARNBOX_RELEASE_PREFLIGHT=true` validates an **existing** learner App image and does not build it. It requires both `LEARNBOX_CANDIDATE_IMAGE` and `LEARNBOX_RUNNING_CONTAINER`. The container must exist and be running; its immutable `.Image` digest, not a supplied tag, is the baseline.

A release preflight without either value exits non-zero. `LEARNBOX_RUNNING_IMAGE` is rejected in release-preflight mode so a stale or manually substituted image reference cannot stand in for Production.

## Iran App `87490d60…` one-time bridge

The currently running App image is deliberately pinned in `infrastructure/production/app/release-baselines/iran-app-87490d60.env`:

- baseline digest: `sha256:87490d60978e83cff664df31e5820ff47fb085d41754c8f666b0a6d7e82355d5`
- baseline source: `15e6783b8f3efed2dbf1de382161099fd8b0b7fe`
- architecture: `linux/amd64`
- six public learner flags: all `true`
- candidate digest: `sha256:d327590ca12e919dfff5f2d45394cb909b890a51422092c222ed569900517971`
- candidate source: `a7f582647e0297c04dcf2e967989e39ffd38df9c`
- candidate `apps/website/package.json` SHA-256: `2cd5a3d8fff8d2ac39eefdb8e7ea48faa58570a315385505092f02eef8ff1ba7`

The bridge is self-contained so the validation works from a shallow release checkout: it does **not** loosen the generic source-matrix path. It still accepts only that running baseline and that candidate. The preflight verifies the baseline source/architecture, candidate source/architecture/labels/package blob, the six matrix values, and the compiled bundle markers for both images. Another unlabeled baseline, another candidate digest, a stopped container, or a changed matrix fails closed.

The historical `175daeb8… → 87490d60…` comparison remains release evidence; it is not a baseline accepted by the current tool.

## Validate the preserved commerce App artifact

Only after the candidate image has been made available on the Iran host through separately authorised release preparation, run this read-only validation from the checked-out release commit:

```bash
LEARNBOX_IMAGE_TARGET=app \
LEARNBOX_RELEASE_PREFLIGHT=true \
LEARNBOX_CANDIDATE_IMAGE=sha256:d327590ca12e919dfff5f2d45394cb909b890a51422092c222ed569900517971 \
LEARNBOX_RUNNING_CONTAINER=learnbox-app-production-app-1 \
infrastructure/production/admin/build-admin-image.sh \
  a7f582647e0297c04dcf2e967989e39ffd38df9c release
```

A successful result prints `RELEASE ARTIFACT: APPROVED`, records the exact candidate and baseline digests, and does not rebuild, deploy, start, stop or restart a container. This approval applies only while the named container still resolves to the same baseline digest. Re-run it after any baseline or candidate change.

## Before a Production release

1. Confirm the active container, source SHA, digest, OS/architecture and non-secret configuration names read-only. `linux/amd64` is required for the Iran host.
2. Build a new learner image only through `infrastructure/production/admin/build-admin-image.sh`; ordinary build output remains non-releasable until the release preflight succeeds.
3. Run release preflight against the actual running Production container. A missing comparable label, a digest outside the exact bridge, a bundle/label mismatch or any changed enabled feature stops the release.
4. Record the exact candidate and baseline source SHA, digest, OS/architecture, public labels, migration set and separate App/Admin rollback identities before traffic changes.
5. Post-deploy, run the feature smoke for each changed flag as well as health/authentication checks. `health=200` alone does not prove a client flag.

Temporary local/dev test sessions or bypasses must stay outside images, tracked configuration and Production. Remove test identities/tokens after the proof.
