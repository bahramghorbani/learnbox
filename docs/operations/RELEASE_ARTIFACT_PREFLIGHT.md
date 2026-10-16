# Release artifact preflight

This is the artifact section of the Production runbook. It does not authorize a deploy, migration, configuration change, bypass, or restart.

## Source of truth

- `infrastructure/production/app/release-build.env` is the approved, non-secret learner **build-time** matrix. It is read from the exact Git commit used to create the image. `NEXT_PUBLIC_*` values are compiled into the client and cannot be changed at runtime.
- Runtime configuration remains the deployed service's protected environment. Never copy secrets into the matrix, image labels, Git, or evidence.
- The artifact also records source SHA, image digest, OS/architecture, and its public build matrix in OCI labels. Retain those values for the deployed image and the `.previous` rollback image in release evidence.

## First labeled release bridge (current Production only)

The active image `sha256:175daeb8a23542d6a1201483a2de928ed54b98c4b6d8840f8c9e1b0688783cc2` predates the labels, so the tool deliberately rejects it as an ordinary baseline. Do **not** bypass that failure or treat an unknown image as equal.

For this one transfer, attach a read-only artifact comparison to release evidence instead:

1. Confirm the active digest exactly equals `175daeb8…` and candidate exactly equals `87490d60…`; otherwise stop.
2. Normalize only Next's changing build-id directory and compare every learner client JS chunk. The recorded result is 63 identical chunk contents out of 64; each image has 64 chunks.
3. Token-diff the sole learner page chunk. The sole hunk must be `profileIdentityFlag: "false" → "true"`; no other hunk is allowed.
4. Record that comparison with the source SHA, both digests and amd64 architecture. This is the approved one-time difference. The normal labelled-image preflight applies from the next release onward.

## Before a Production release

1. Read the active image's source SHA, digest, OS/architecture, and public build labels. `linux/amd64` is required for the Iran host.
2. Build through `infrastructure/production/admin/build-admin-image.sh`, with `LEARNBOX_IMAGE_TARGET=app` for learner. It reads the matrix from the requested commit and rejects an incomplete one.
3. Give `LEARNBOX_RUNNING_IMAGE` the active image. The script prints a plain running-to-candidate public build-setting diff. A missing comparable label or any changed enabled feature requires an owner decision recorded in the PR; do not treat Dockerfile or compose defaults as evidence.
4. Record source SHA, digest, OS/architecture, public labels, and the rollback identity in release evidence before traffic changes.
5. Post-deploy, run the feature smoke for each changed flag as well as health/authentication checks. `health=200` alone does not prove a client flag.

Temporary local/dev test sessions or bypasses must stay outside images, tracked configuration and Production. Remove test identities/tokens after the proof.
