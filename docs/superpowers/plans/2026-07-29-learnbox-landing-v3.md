# LearnBox Landing V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task by task in the original LearnBox repository.

**Goal:** Replace the current LearnBox public marketing landing with the approved, conversion-clear German summer direction while preserving product boundaries and returning the repository to its prior roadmap resume point.

**Architecture:** Keep the landing inside `apps/learnbox-website`. Move the summer world into `src/themes/summer/`, compose the page from focused scene components under `app/components/landing/`, and retain one client-side motion orchestrator for GSAP/ScrollTrigger lifecycle. Use Motion for React only where component state changes, CSS for lightweight ambient loops, SVG for learning paths, and Next Image for responsive assets.

**Tech Stack:** Next.js 15, React 19, TypeScript, GSAP + ScrollTrigger, Motion for React, CSS, SVG, Node test runner.

## Global Constraints

- Work only in `apps/learnbox-website` plus website documentation.
- Do not modify `apps/website` or `apps/mobile`.
- Preserve all existing BuBu files; new V3 assets must be versioned additions.
- The subject is German language learning. Use German words and recognizable German locations without turning the page into a tourism collage.
- The exact Persian copy in the V3 brief is the source of truth.
- Do not imply a released App Store app. Android and web are the only download choices.
- Keep content visible without JavaScript and under `prefers-reduced-motion`.
- Keep all temporary variant pages `noindex`.

## Task 1: Lock the V3 content and architecture with a failing contract test

**Files:**

- Create: `apps/learnbox-website/tests/landing-v3.test.mjs`
- Modify: `apps/learnbox-website/package.json`

**Steps:**

1. Add Node test cases that read the landing source and assert:
   - all exact V3 headings, paragraphs and CTA labels are present;
   - `src/themes/summer/` exports a theme module;
   - all three variant routes exist and include `robots.index = false`;
   - the production page contains German vocabulary and no App Store claim;
   - Motion for React, GSAP and ScrollTrigger have real source references;
   - reduced-motion CSS and runtime branches exist.
2. Add a `test` script using `node --test tests/*.test.mjs`.
3. Run `pnpm --filter @learnbox/marketing-website test`.
4. Confirm the test fails because the V3 implementation files do not exist yet.
5. Commit the red contract test.

## Task 2: Add the summer runtime and versioned scene assets

**Files:**

- Create: `apps/learnbox-website/src/themes/summer/tokens.ts`
- Create: `apps/learnbox-website/src/themes/summer/SummerBackdrop.tsx`
- Create: `apps/learnbox-website/src/themes/summer/summer-theme.css`
- Create: `apps/learnbox-website/src/themes/summer/index.ts`
- Create: `apps/learnbox-website/public/themes/summer/backgrounds/berlin-summer-v3.jpg`
- Create: `apps/learnbox-website/public/themes/summer/backgrounds/rhine-summer-v3.jpg`
- Create: versioned files under `apps/learnbox-website/public/themes/summer/bubu/`

**Steps:**

1. Generate a wide Berlin summer scene with clear sky, soft clouds, warm light, foliage and restrained Brandenburg Gate/TV Tower silhouettes; exclude text, UI and characters.
2. Generate a quieter Cologne/Rhine summer scene for download/finale; exclude text, UI and characters.
3. Generate or derive multiple versioned BuBu scene poses that preserve the official face, proportions, purple color and eyes.
4. Verify transparency and inspect the assets visually; never overwrite existing files in `public/characters/BuBu/`.
5. Implement a semantic layered backdrop with sky, clouds, distant architecture, midground, foreground foliage, light and particles.
6. Use Next Image for responsive delivery and CSS variables for theme tokens.
7. Run the contract test and typecheck; expected remaining failures should be limited to unimplemented scenes and routes.
8. Commit the theme runtime and assets.

## Task 3: Implement RTL header and conversion-first hero

**Files:**

- Create: `apps/learnbox-website/app/components/landing/LandingHeader.tsx`
- Create: `apps/learnbox-website/app/components/landing/HeroScene.tsx`
- Create: `apps/learnbox-website/app/components/landing/LandingNotice.tsx`
- Modify: `apps/learnbox-website/app/page.tsx`
- Modify: `apps/learnbox-website/app/globals.css`

**Steps:**

1. Install `motion` in the marketing package.
2. Build a desktop RTL header with brand and nav on the right and CTA/utility controls on the left.
3. Build an accessible mobile menu with `aria-expanded`, focus-visible states, Escape/route closing, and Motion component transitions.
4. Implement the exact hero title, paragraph and two CTA labels from the brief.
5. Use the Berlin theme layers, large BuBu, German vocabulary cards and one SVG review path.
6. Keep the primary CTA visible in the first mobile viewport.
7. Run tests and typecheck.
8. Commit the header and hero.

## Task 4: Implement the learning story scenes and exact copy

**Files:**

- Create: `apps/learnbox-website/app/components/landing/ForgettingScene.tsx`
- Create: `apps/learnbox-website/app/components/landing/LeitnerStage.tsx`
- Create: `apps/learnbox-website/app/components/landing/VocabularyReveal.tsx`
- Create: `apps/learnbox-website/app/components/landing/LearningPaths.tsx`
- Create: `apps/learnbox-website/app/components/landing/GamificationScene.tsx`
- Modify: `apps/learnbox-website/app/page.tsx`
- Modify: `apps/learnbox-website/app/globals.css`

**Steps:**

1. Implement the forgetting scene with scattered German words, a large BuBu reaction and an SVG path from disorder to order.
2. Implement the central Leitner mechanism with real stage transitions and the four exact brief labels.
3. Implement the multimedia word card with sequential pronunciation, meaning, image, example, gender, plural and level content.
4. Implement the five learning paths, visually prioritizing work and study migration; use Motion for React to change environment and copy when a path is selected.
5. Implement streak, badge, progress and level UI as clearly illustrative product states, with a controlled BuBu celebration.
6. Use all exact V3 headings and paragraphs.
7. Run tests, typecheck and keyboard interaction checks.
8. Commit the learning story scenes.

## Task 5: Implement product, download, social and finale scenes

**Files:**

- Create: `apps/learnbox-website/app/components/landing/ProductStage.tsx`
- Create: `apps/learnbox-website/app/components/landing/DownloadScene.tsx`
- Create: `apps/learnbox-website/app/components/landing/SocialScene.tsx`
- Create: `apps/learnbox-website/app/components/landing/FinaleScene.tsx`
- Create: `apps/learnbox-website/app/components/landing/LandingExperience.tsx`
- Modify: `apps/learnbox-website/app/page.tsx`
- Modify: `apps/learnbox-website/app/globals.css`

**Steps:**

1. Build a layered product stage with screen depth rather than a static card row.
2. Build the Rhine/Cologne download scene with Android, web and a clearly labelled non-functional QR preview.
3. Define distinct roles for Telegram, Instagram, LinkedIn and Pinterest.
4. Finish with the exact calm final CTA copy and a large inviting BuBu.
5. Ensure unavailable public links provide a useful status message instead of dead navigation.
6. Run tests and typecheck.
7. Commit the closing scenes.

## Task 6: Author and lifecycle-manage the motion system

**Files:**

- Modify: `apps/learnbox-website/app/components/MotionOrchestrator.tsx`
- Modify: `apps/learnbox-website/src/themes/summer/summer-theme.css`
- Modify: `apps/learnbox-website/app/globals.css`

**Steps:**

1. Implement a GSAP hero timeline with layered camera motion, BuBu entrance, vocabulary-card routes and controlled lighting.
2. Implement ScrollTrigger timelines for forgetting-to-order, Leitner card movement, vocabulary reveal, product depth and download settlement.
3. Toggle scene-active state so CSS cloud/foliage loops stop offscreen.
4. Use SVG stroke motion to explain review relationships.
5. Provide shorter mobile timing and avoid scroll traps.
6. Under reduced motion, remove parallax, loops and long timelines while leaving all content visible.
7. Revert every GSAP context and kill owned triggers on unmount.
8. Run tests, typecheck and a route-mount/unmount console check.
9. Commit the motion system.

## Task 7: Build the three focused noindex variants

**Files:**

- Create: `apps/learnbox-website/app/components/landing/VariantPreview.tsx`
- Create: `apps/learnbox-website/app/dev/landing-variant-a/page.tsx`
- Create: `apps/learnbox-website/app/dev/landing-variant-b/page.tsx`
- Create: `apps/learnbox-website/app/dev/landing-variant-c/page.tsx`

**Steps:**

1. Build a shared preview component with focused header, hero, one learning scene, product, download, mobile sample and motion sample.
2. Configure A as cinematic summer journey.
3. Configure B as the purple character world.
4. Configure C as the corrected German hybrid product/story direction.
5. Add route metadata with `index: false` and `follow: false`.
6. Verify C matches the production direction while A and B remain comparison evidence.
7. Run tests, typecheck and build.
8. Commit the variant routes.

## Task 8: Responsive, accessibility, performance and visual QA

**Files:**

- Modify as needed: `apps/learnbox-website/app/globals.css`
- Modify as needed: landing components and summer theme
- Create: `docs/website/FIDELITY_LEDGER_V3.md`

**Steps:**

1. Verify desktop at 1440×900 and 1280×720, tablet at 1024×768, and mobile at 390×844.
2. Check overflow, RTL header placement, first-viewport CTA, BuBu crop/scale, real-copy wrapping and readable contrast.
3. Verify keyboard navigation, mobile menu, path picker, focus states, status notices and reduced motion.
4. Verify no console errors, trigger leaks, missing images or layout shifts.
5. Inspect the approved concept and latest implementation screenshot with visual QA tools.
6. Record at least five source-to-implementation comparisons plus justified differences in the fidelity ledger.
7. Run `pnpm --filter @learnbox/marketing-website test`, `typecheck`, formatting checks and `build`.
8. Commit QA corrections and the fidelity ledger.

## Task 9: Close the change request and return to the roadmap

**Files:**

- Modify: `docs/website/CHANGE_REQUESTS.md`
- Modify: `docs/website/PROJECT_STATE.md`
- Modify: `docs/website/05_THEME_ENGINE.md`

**Steps:**

1. Mark `CR-LANDING-003` complete with selected variant, commit references and QA evidence.
2. Document the modular summer theme and motion/reduced-motion contract.
3. Restore the prior production-content handoff as the active roadmap resume point.
4. Run `git diff --check`, confirm the protected apps are untouched, and review the final commit range from the checkpoint.
5. Commit the documentation closeout.

