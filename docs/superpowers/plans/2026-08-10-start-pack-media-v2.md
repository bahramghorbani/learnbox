# Start Pack Media V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create and quality-check a complete V2 visual and audio candidate set for the 20-card LearnBox Start pack, then attach it only through the existing private-media release gates.

**Architecture:** The owner-approved V2 visual language is recorded in the merged visual-pilot reference. A deterministic local generator reads the existing reviewed vocabulary drafts, produces isolated candidates, and records model/prompt/checksum evidence. Only a fully passing 60-asset set can enter the existing attachment and private-storage flow; no runtime release flag changes.

**Tech Stack:** Node.js, AvalAI Images API with `flux.2-pro`, AvalAI speech with `eleven_flash_v2_5`, Whisper transcription QA, PNG, MP3, existing Start receipt validators.

**Completion note (2026-08-10):** The owner approved reuse of the existing 40/40 German V1 audio
files after transcription re-validation, so duplicate V2 speech generation was deliberately
removed from scope. The 20 V2 images, private receipt attestation, session-guarded delivery and
disabled release posture merged through PRs #17 and #18. The permanent V2 quality-gate wiring was
closed through PR #21.

## Global Constraints

- Read the live GitHub `main` and active PR list before every branch, generation, attachment, or merge decision.
- Keep the AvalAI key only in ignored `.env.avalai.local`.
- Generate 20 square 1024×1024 images and 40 German audio clips only for the approved Start slice.
- Preserve canonical Bobo assets: no generated or altered Bobo may appear in V2 card media.
- Noun cards have one dominant object/place; action, state, and phrase cards use a simple generic human scene without text or branded UI.
- Every image forbids text, letters, numbers, logos, watermarks, cards, frames, labels, and unrelated objects.
- Do not overwrite current checked-in assets, attach media, enable a release flag, or publish until the complete candidate batch passes QA.

---

### Task 1: Add a V2 candidate-generation contract

**Files:**

- Create: `content/packs/learnbox-start/prompts/start-a1-v2-visual-contract.json`
- Create: `scripts/generate-avalai-start-pack-v2.mjs`
- Test: `scripts/validate-start-pack-v2-contract.mjs`

**Interfaces:**

- Consumes `start-a1-vertical-slice-drafts.json` and owner-approved V2 visual rules.
- Produces local candidate PNGs under `/Users/test/.codex/tmp/learnbox-avalai/start-pack-v2/images/` plus non-secret provenance manifest.

- [x] Write a validator that rejects missing/duplicate card IDs, prompts containing `Bobo`, or a prompt missing the no-text and no-watermark constraints.
- [x] Run the validator against the contract and confirm it passes.
- [x] Implement a two-request-concurrency generator using `flux.2-pro`, base64 output, 1024×1024, checksum recording, and no Git output.
- [x] Visually inspect every candidate; retain the three owner-approved pilot files and the 17 clean generated candidates.
- [x] Keep rejected pilot output outside the candidate manifest; no generated V2 candidate required regeneration.
- [x] Commit contract, generator, validator, and their tests.

### Task 2: Reuse and re-validate approved German audio

**Files:**

- Reuse: `content/packs/learnbox-start/audio/`
- Verify: `content/packs/learnbox-start/validation/start-a1-avalai-audio-transcription-qa.json`

**Interfaces:**

- Consumes the 20 approved draft lemmas and first German examples.
- Reuses the 40 already approved MP3 files after checksum and transcription re-validation.

- [x] Preserve one approved word and one approved example-sentence clip per card without duplicate provider generation.
- [x] Re-validate MP3 integrity and one-to-one coverage for all 40 files.
- [x] Re-check all 40 expected German strings through the existing transcription QA evidence.
- [x] Keep provider secrets and external upload receipts outside the repository.

### Task 3: Stage V2 media without release

**Files:**

- Modify: `content/packs/learnbox-start/images/`
- Modify: `content/packs/learnbox-start/audio/`
- Modify: `content/packs/learnbox-start/validation/start-a1-media-attachment-draft.json`
- Modify: `content/packs/learnbox-start/validation/start-a1-private-media-attestation.json`
- Test: existing `verify:start-*` commands.

**Interfaces:**

- Consumes 60 approved V2 candidates and the existing attachment schema.
- Produces versioned V2 local media plus candidate-only checksums; it does not produce a release flag or public URL.

- [x] Copy only passing image candidates into versioned pack paths and record V2 candidate QA; existing audio remains unchanged after 40/40 transcription re-validation.
- [x] Run all Start media, V2 contract/draft/private-attestation/upload-dry-run and full quality gates.
- [x] Upload the 20 V2 images to the existing private `learnbox-media-private` store, verify the receipt and attestation, and keep public release flags disabled.
- [x] Verify no direct Blob URL, provider credential, or public asset endpoint enters the learner client.
- [x] Commit only after every local verifier passes.

### Task 4: PR, review, and controlled integration

**Files:**

- Modify: `CURRENT_WORK.md`
- Modify: `PROJECT_STATE.md` only after merge.

- [x] Push focused PR #17 from `feat/start-pack-media-v2` after the pilot-reference PR merged.
- [x] Require Quality, secrets, mobile, production-stack, and Vercel checks to pass.
- [x] Merge only the passing PR, then synchronize stable state through PR #18 without enabling public release flags.

## Plan self-review

- The plan separates generation, semantic/visual QA, audio/transcription QA, attachment, storage, and release.
- All prompts and outputs are versioned and traceable; credentials, canonical Bobo identity, and disabled release boundaries remain protected.
- A missing storage credential is a recorded blocker, not a reason to expose media or bypass the receipt gate.
