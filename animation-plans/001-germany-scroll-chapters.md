# 001 — Add German scroll chapters to every landing segment

- **Status**: SELECTED
- **Commit**: 2f41ed6
- **Severity**: MEDIUM
- **Category**: Missed opportunities / cohesion
- **Estimated scope**: 5 files, approximately 450 lines

## Problem

Only the hero and download sections currently have layered environmental backdrops. The other chapters use flat color fields, so the German summer journey disappears between the opening and closing scenes.

`apps/learnbox-website/app/components/landing/LandingExperience.tsx` assigns `data-scene` to each chapter, but no theme component is mounted in forgetting, Leitner, vocabulary, progress, product, social or finale.

`apps/learnbox-website/app/components/MotionOrchestrator.tsx` animates Berlin sky and foliage only. The existing scene timelines animate foreground cards and BuBu but do not maintain environmental continuity.

## Target

- Mount one typed `GermanyChapterBackdrop` in each non-hero chapter.
- Use five stable layer names: `far`, `mid`, `route`, `near`, `accent`.
- Animate scroll-linked layers with GSAP transforms only:
  - far: `yPercent` from `-2` to `3`;
  - mid: `xPercent` from `2` to `-2`, `yPercent` from `-3` to `5`;
  - route: SVG `strokeDashoffset` from its measured length to `0`;
  - near: `yPercent` from `4` to `-8`;
  - mobile: cap every translation at `4%`.
- Use `ease: "none"` for scrubbed motion.
- Use `prefers-reduced-motion` to skip all chapter ScrollTriggers and render resolved layers.

## Repo conventions to follow

- Theme components live under `apps/learnbox-website/src/themes/summer/`.
- GSAP is scoped inside `gsap.context()` and reverted on unmount.
- Scene activation uses `[data-scene]` and `.is-scene-active`.
- Existing easing token: `--arrive: cubic-bezier(0.16, 1, 0.3, 1)`.

## Steps

1. Add a failing source-contract test for all chapter names and the five layer attributes.
2. Add `GermanyChapterBackdrop.tsx` with the `GermanyChapter` union and decorative, hidden SVG layers.
3. Add `germany-chapters.css` with distinct U-Bahn, rail, street, map, park, harbor, square and garden palettes.
4. Mount the backdrop inside every production section without changing copy.
5. Extend `MotionOrchestrator.tsx` with scoped scrubbed parallax and chapter-specific route/train/sun/signal motion.
6. Add mobile and reduced-motion CSS.
7. Run contract tests, typecheck, build and browser QA.

## Boundaries

- Do not modify `apps/website` or `apps/mobile`.
- Do not replace or regenerate BuBu.
- Do not add dependencies, video, Canvas or WebGL.
- Do not change approved landing copy or claims.

## Verification

- **Mechanical:** `pnpm --filter @learnbox/marketing-website test`, `typecheck`, `build`.
- **Feel check:** scroll slowly through every chapter at 1440×900 and confirm each environment moves with a distinct semantic action, never the same repeated entrance.
- Toggle reduced motion and confirm all layer transforms are `none` and content remains visible.
- At 390×844, confirm `scrollWidth === clientWidth` and no background intercepts input.
- **Done when:** all ten landing chapters read as one German journey and every verification passes.
