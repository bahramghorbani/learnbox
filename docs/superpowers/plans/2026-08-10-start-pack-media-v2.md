# Start Pack Media V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create and quality-check a complete V2 visual and audio candidate set for the 20-card LearnBox Start pack, then attach it only through the existing private-media release gates.

**Architecture:** The owner-approved V2 visual language is recorded in the merged visual-pilot reference. A deterministic local generator reads the existing reviewed vocabulary drafts, produces isolated candidates, and records model/prompt/checksum evidence. Only a fully passing 60-asset set can enter the existing attachment and private-storage flow; no runtime release flag changes.

**Tech Stack:** Node.js, AvalAI Images API with `flux.2-pro`, AvalAI speech with `eleven_flash_v2_5`, Whisper transcription QA, PNG, MP3, existing Start receipt validators.

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

- [ ] Write a validator that rejects missing/duplicate card IDs, prompts containing `Bobo`, or a prompt missing the no-text and no-watermark constraints.
- [ ] Run the validator against the contract and confirm it passes.
- [ ] Implement a two-request-concurrency generator using `flux.2-pro`, base64 output, 1024×1024, checksum recording, and no Git output.
- [ ] Generate a contact sheet and visually inspect every candidate at full and mobile-card scale.
- [ ] Regenerate only failed IDs, recording the rejection reason and keeping rejected files outside the candidate manifest.
- [ ] Commit contract, generator, validator, and their tests.

### Task 2: Produce and validate V2 German audio

**Files:**

- Create: `scripts/generate-avalai-start-pack-v2-audio.mjs`
- Create: `content/packs/learnbox-start/validation/start-a1-v2-audio-candidate-qa.json`

**Interfaces:**

- Consumes the 20 approved draft lemmas and first German examples.
- Produces 40 local MP3 candidate files and a transcription QA report.

- [ ] Generate one word and one example sentence per card using `eleven_flash_v2_5` and the existing voice choice.
- [ ] Validate MP3 MIME, non-zero size, duration range, and one-to-one asset coverage.
- [ ] Transcribe every clip with the existing German Whisper QA seam; regenerate only failed clips.
- [ ] Commit scripts and QA metadata, never generated audio or provider secrets.

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

- [ ] Copy only passing candidate files into versioned pack paths and update each checksum/byte/MIME record.
- [ ] Run all Start media, private-attestation, and full quality gates.
- [ ] Upload only if the existing private-storage credential and receipt gate are available; otherwise leave the exact owner-free blocker in `CURRENT_WORK.md` and do not simulate success.
- [ ] Verify no direct Blob URL, provider credential, or public asset endpoint enters the learner client.
- [ ] Commit only after every local verifier passes.

### Task 4: PR, review, and controlled integration

**Files:**

- Modify: `CURRENT_WORK.md`
- Modify: `PROJECT_STATE.md` only after merge.

- [ ] Push a focused PR from `feat/start-pack-media-v2` after the pilot-reference PR is merged and rebase onto current `origin/main`.
- [ ] Require all Quality, secrets, mobile, production-stack, and Vercel checks to pass.
- [ ] Merge only the passing PR, update stable state, and verify the candidate/private-media path without enabling public release flags.

## Plan self-review

- The plan separates generation, semantic/visual QA, audio/transcription QA, attachment, storage, and release.
- All prompts and outputs are versioned and traceable; credentials, canonical Bobo identity, and disabled release boundaries remain protected.
- A missing storage credential is a recorded blocker, not a reason to expose media or bypass the receipt gate.
