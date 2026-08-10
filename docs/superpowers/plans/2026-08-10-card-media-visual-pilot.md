# Card Media Visual Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce three AvalAI image review candidates for `Haus`, `Wasser`, and `Brot` without attaching or publishing media.

**Architecture:** Reuse the local-only AvalAI seam and retain output in its local candidate area. Existing candidate, attachment, and receipt records remain untouched because this is an owner-review pilot, not a content release.

**Tech Stack:** Node.js, AvalAI OpenAI-compatible Images API, `flux.2-pro`, PNG, existing LearnBox candidate QA rules.

## Global Constraints

- Keep `AVALAI_API_KEY` only in ignored `.env.avalai.local`; never print, commit, or transmit it to the browser.
- Generate only `Haus`, `Wasser`, and `Brot` at 1024×1024.
- Use warm off-white studio ground with restrained LearnBox purple/lilac accents.
- No generated text, watermark, logo, visual clutter, or generated Bobo-like character.
- Do not overwrite Start images/audio, change private-media records, enable flags, or publish media.
- Store results only under `/Users/test/.codex/tmp/learnbox-avalai/card-visual-pilot/`.

---

### Task 1: Generate isolated visual review candidates

**Files:**

- Create: `/Users/test/.codex/tmp/learnbox-avalai/card-visual-pilot/start-a1-haus-image-v2-candidate.png`
- Create: `/Users/test/.codex/tmp/learnbox-avalai/card-visual-pilot/start-a1-wasser-image-v2-candidate.png`
- Create: `/Users/test/.codex/tmp/learnbox-avalai/card-visual-pilot/start-a1-brot-image-v2-candidate.png`
- Create: `/Users/test/.codex/tmp/learnbox-avalai/card-visual-pilot/manifest.json`

**Interfaces:**

- Consumes: `.env.avalai.local` with `AVALAI_API_KEY`; `POST https://api.avalai.ir/v1/images/generations`.
- Produces: three 1024×1024 PNG candidates and a non-secret manifest containing ID, model, output path, SHA-256, dimensions, and `pending_owner_visual_approval` state.

- [x] **Step 1: Verify the provider connection without generating media**

Run: `pnpm check:avalai`

Expected: `اتصال AvalAI برقرار است.`

- [x] **Step 2: Generate Haus candidate**

Use `flux.2-pro` with this prompt:

```text
Educational German A1 vocabulary-card illustration for "Haus". One friendly three-dimensional German-style house is the only teaching concept, centered and large. Clear roof, door and windows. Warm off-white studio background with a restrained lilac LearnBox accent and soft natural shadow. Premium yet simple mobile-app visual language. No people, characters, Bobo, text, logo, watermark, signs, scenery, or clutter.
```

Expected: one PNG at 1024×1024 in the candidate directory.

- [x] **Step 3: Generate Wasser candidate**

Use `flux.2-pro` with this prompt:

```text
Educational German A1 vocabulary-card illustration for "Wasser". One transparent drinking glass with clearly visible water is the only teaching concept, centered and large. The waterline and glass reflection must be immediately recognizable at small mobile-card size. Warm off-white studio background with a restrained lilac LearnBox accent and soft natural shadow. Premium yet simple mobile-app visual language. No hands, food, bottle, label, text, logo, watermark, characters, Bobo, or clutter.
```

Expected: one PNG at 1024×1024 in the candidate directory.

- [x] **Step 4: Generate Brot candidate**

Use `flux.2-pro` with this prompt:

```text
Educational German A1 vocabulary-card illustration for "Brot". One appetizing loaf of bread is the only teaching concept, centered and large. Warm off-white studio background with a restrained lilac accent and soft natural shadow. Premium yet simple mobile-app visual language. No hands, people, payment card, counter, packaging, labels, currency, receipts, text, logo, watermark, Bobo, or clutter.
```

Expected: one PNG at 1024×1024 in the candidate directory.

- [x] **Step 5: Verify files and write provenance manifest**

Run: `sips -g pixelWidth -g pixelHeight /Users/test/.codex/tmp/learnbox-avalai/card-visual-pilot/*.png && shasum -a 256 /Users/test/.codex/tmp/learnbox-avalai/card-visual-pilot/*.png`

Write a non-secret `manifest.json` with `status: pending_owner_visual_approval`, `model: flux.2-pro`, the three content IDs, checksums, dimensions, and `publicationBlocked: true`.

Expected: three valid square PNGs; no credential, bearer token, or release permission in the manifest.

- [x] **Step 6: Visually inspect and present candidates**

Inspect each at full resolution and at mobile-card scale. Regenerate an image if it has text, a watermark, unapproved Bobo-like character, ambiguity, or clutter. Present only passing candidates for owner approval.

- [x] **Step 7: Commit documentation only**

Run: `git add docs/superpowers/plans/2026-08-10-card-media-visual-pilot.md && git commit -m "docs: plan card media visual pilot"`

Expected: generated candidates remain outside Git; only the plan is committed.

## Plan self-review

- The plan covers the three concepts, art direction, AvalAI boundary, Bobo protection, candidate-only state, visual QA, dimensions, and no-release rule.
- No unresolved markers or unspecified prompts remain.
- Every generated output stays in the local candidate directory and ends at owner visual approval; no card attachment or runtime interface is introduced.
