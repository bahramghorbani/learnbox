# German Scroll Chapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every LearnBox landing segment a distinct German-themed layered background and purposeful scroll-linked motion.

**Architecture:** A typed theme component renders reusable depth layers for eight German chapters. Existing section content remains unchanged and the GSAP orchestrator owns all scroll-linked transforms and cleanup.

**Tech Stack:** Next.js 15, React 19, TypeScript, GSAP, ScrollTrigger, CSS, inline SVG, Node test runner.

## Global Constraints

- Work only in `apps/learnbox-website` and related website documentation.
- Preserve exact copy, existing BuBu assets and product truth.
- Add no dependency and no heavy media runtime.
- No scroll pinning or hijacking.
- Mobile travel is capped at 4%; reduced motion skips every chapter animation.

---

### Task 1: Extend the source contract

**Files:**

- Modify: `apps/learnbox-website/tests/landing-v3.test.mjs`

**Interfaces:**

- Consumes: production landing source.
- Produces: a failing contract for eight chapter names and five layer names.

- [ ] Add assertions for `station`, `rail`, `street`, `map`, `park`, `harbor`, `square`, `garden`.
- [ ] Add assertions for `data-chapter-layer="far|mid|route|near|accent"`.
- [ ] Run the test and confirm failure before implementation.

### Task 2: Build the chapter theme component

**Files:**

- Create: `apps/learnbox-website/src/themes/summer/GermanyChapterBackdrop.tsx`
- Create: `apps/learnbox-website/src/themes/summer/germany-chapters.css`
- Modify: `apps/learnbox-website/src/themes/summer/index.ts`
- Modify: `apps/learnbox-website/app/layout.tsx`

**Interfaces:**

- Produces: `GermanyChapterBackdrop({ chapter }: { chapter: GermanyChapter })`.
- Produces: `GermanyChapter = 'station' | 'rail' | 'street' | 'map' | 'park' | 'harbor' | 'square' | 'garden'`.

- [ ] Render decorative, `aria-hidden` far/mid/route/near/accent layers.
- [ ] Give each chapter a distinct German place cue and palette.
- [ ] Keep all geometry within an overflow-hidden absolute root.
- [ ] Add desktop, mobile and reduced-motion styles.

### Task 3: Mount one backdrop per segment

**Files:**

- Modify: `apps/learnbox-website/app/components/landing/LandingExperience.tsx`
- Modify: `apps/learnbox-website/app/components/landing/LearningPaths.tsx`

**Interfaces:**

- Consumes: `GermanyChapterBackdrop`.

- [ ] Mount station in forgetting, rail in Leitner and street in multimedia.
- [ ] Mount map in learning paths, park in progress and harbor in product.
- [ ] Keep the existing Rhine backdrop in download.
- [ ] Mount square in social and garden in finale.
- [ ] Keep every content wrapper above the background.

### Task 4: Add scroll choreography

**Files:**

- Modify: `apps/learnbox-website/app/components/MotionOrchestrator.tsx`

**Interfaces:**

- Consumes: `[data-chapter-backdrop]` and `[data-chapter-layer]`.

- [ ] Add scrubbed far/mid/near parallax with `ease: 'none'`.
- [ ] Draw route SVGs from measured length to zero.
- [ ] Move the station train, advance rail markers, reveal street windows, move the park sun and expand square signals.
- [ ] Cap mobile movement at 4%.
- [ ] Skip all chapter triggers for reduced motion.
- [ ] Rely on the existing GSAP context cleanup.

### Task 5: Verify and document

**Files:**

- Modify: `docs/website/FIDELITY_LEDGER_V3.md`
- Modify: `docs/website/CHANGE_REQUESTS.md`

**Interfaces:**

- Produces: browser evidence and final commit.

- [ ] Run contract tests, typecheck, production build and formatting.
- [ ] QA 1440×900, 1024×768 and 390×844.
- [ ] Verify reduced motion and zero console/network errors.
- [ ] Run the Impeccable detector once over changed UI targets.
- [ ] Commit implementation and documentation.
