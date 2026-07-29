# LearnBox Landing V3 Design Specification

## Decision status

Approved for implementation by the mandatory V3 brief and the user's instruction to make reversible technical decisions autonomously.

## Product boundary

- Surface: public Persian marketing landing intended for `learnboxapp.com`.
- Package: `apps/learnbox-website`.
- Visitor mode: Persuade.
- Protected applications: `apps/website` and `apps/mobile`.
- Product promise: help Persian-speaking learners retain German vocabulary through spaced review, Leitner organization and short daily practice.

## Sources of truth

1. `learnbox-website-codex-pack/learnbox-landing-revision-brief-v3/LEARNBOX_LANDING_REVISION_BRIEF_V3.md`
2. `docs/website/references/summer-theme-reference-v3.jpeg`
3. Exact Persian copy in Brief V3.
4. Existing canonical BuBu assets and character rules.

## Variant comparison

| Direction | Strength | Risk | Decision |
| --- | --- | --- | --- |
| A — Cinematic Summer Journey | Strongest sense of travel, depth and card movement | The landscape can overpower the product and become tourism-led | Keep its layered parallax and card-path ideas |
| B — LearnBox Character World | Strongest owned character world and close-up BuBu moments | The generated concept drifted into English learning and reduced product clarity | Reject as the primary direction |
| C — Hybrid Product and Story | Clearest product mechanism, CTA hierarchy, mobile continuation and download stage | Generic summer geography needed correction | Select after revising the world to Germany |

Selected concept:

`docs/website/concepts/v3/variant-c-hybrid-german-selected.png`

## Direction contract

**THESIS:** A German word travels from first encounter to durable memory while BuBu visibly guides the return path; the page refuses the category-default stack of generic feature cards.

**OWN-WORLD:** Bright Berlin-blue sky, cloud white, LearnBox purple, sun yellow and living green form layered German summer stages. Open bands, purple learning paths, clean white product surfaces and large BuBu crops remain recognizable without copy.

**STORY:** The visitor recognizes forgetting, sees how Leitner review returns hard words sooner, understands multimedia and goal-based paths, sees the product, and chooses Android or web access.

**FIRST VIEWPORT:** RTL brand and navigation occupy the right header cluster; utility and primary action sit left. Persian offer and CTAs are right; a large BuBu and layered Berlin summer world are left. The primary CTA remains above the fold on mobile.

**FORM:** Hybrid Product and German Summer Story, derived from Variant C and strengthened with A's cinematic depth.

## German cultural and language lock

- The product teaches German, never English.
- Visible vocabulary examples use `die Wohnung`, `der Beruf`, `lernen`, `der Termin` and other verified German words already present in the experience.
- German summer locations appear as coherent chapter settings:
  - Berlin garden/city layers for the hero;
  - German rail and urban cues for learning paths;
  - Rhine and Cologne atmosphere for product/download chapters.
- Do not combine landmarks into a tourist collage.
- Do not use the German flag as decoration.
- Do not imply travel services or destination content.

## Information architecture and copy

1. RTL header
2. Hero
3. Forgetting problem
4. Leitner and smart review
5. Multimedia vocabulary learning
6. Goal-based learning paths
7. Daily motivation and gamification
8. Product experience
9. Download and web access
10. Social channels
11. Final CTA

All headings, body copy and CTAs must match Brief V3. Unsupported URLs remain honest unavailable states. App Store availability is prohibited.

## Component and file architecture

### Theme

Create `apps/learnbox-website/src/themes/summer/`:

- `tokens.ts`: durable color and motion roles.
- `SummerBackdrop.tsx`: semantic decorative layer composition.
- `summer-theme.css`: sky, clouds, city, foliage, lighting and responsive/reduced-motion rules.
- `index.ts`: public theme exports.

Theme layers:

1. sky
2. clouds
3. distant German landscape
4. midground German architecture
5. foreground flowers and foliage
6. BuBu
7. vocabulary cards and SVG paths
8. light particles
9. content and CTA

### Landing components

- `app/components/LandingHeader.tsx`: desktop RTL cluster and accessible mobile disclosure.
- `app/components/BuBuScene.tsx`: scene-based character sizing, crop and asset selection.
- `app/components/LeitnerStage.tsx`: visual card travel between review stages.
- `app/components/VocabularyReveal.tsx`: Motion for React sequence for word-card details.
- `app/components/LearningPaths.tsx`: interactive selected path with working/study priority.
- `app/components/ProductStage.tsx`: phone/browser depth composition and progress UI.
- `app/components/LandingExperience.tsx`: ordered page composition and shared unavailable-state handling.
- `app/components/VariantPreview.tsx`: focused A/B/C development previews.
- `app/components/MotionOrchestrator.tsx`: GSAP/ScrollTrigger scene timelines and cleanup.

### Routes

- `/`: selected Variant C integration.
- `/dev/landing-variant-a`
- `/dev/landing-variant-b`
- `/dev/landing-variant-c`

Every development route exports `robots: { index: false, follow: false }`.

## Motion architecture

### Tool ownership

- GSAP: cinematic scene timelines and camera movement.
- ScrollTrigger: scroll progress, enter/main/exit phases and trigger lifecycle.
- Motion for React: mobile menu, selected learning path and vocabulary-card component transitions.
- CSS: low-cost cloud/foliage idle loops, paused when offscreen and removed for reduced motion.
- SVG: Leitner card route, progress ring and directional learning paths.
- Three.js: excluded because it adds no unique value for this page.
- Video/image sequence: excluded because live layers are lighter and more responsive.

### Scene concepts

- Hero: layered Berlin parallax, restrained camera advance, BuBu entrance, cloud/light/foliage movement and floating German vocabulary cards.
- Forgetting: German words scatter and dim; BuBu reacts; the same words regroup toward the Leitner mechanism.
- Leitner: hard cards return on a short route; learned cards advance to longer intervals.
- Multimedia: one word card reveals pronunciation, meaning, image, example, gender, plural and level in sequence.
- Paths: scene and copy transition when the visitor selects work, study, conversation, general or exam.
- Motivation: streak, badge and progress ring resolve in order; BuBu celebrates once.
- Product: phone and browser screens enter at different depths and settle into one usable stage.
- Download/finale: Android, web and a clearly labelled non-functional QR preview enter, then all motion settles into a calm invitation.

Every scene has an entrance, a primary explanatory movement, a calm exit/settle, a shorter mobile version and a reduced-motion static composition.

## Character system

- Existing source files are immutable.
- New scene assets, if generated, receive versioned filenames under `public/themes/summer/bubu/`.
- Hero and final CTA use large full-body staging.
- Forgetting and Leitner use half-body interaction staging.
- Multimedia uses a close-up crop.
- Paths and product use pointing/presenting staging.
- Motivation uses a celebration staging.
- Reuse is allowed only when crop, scale and scene role materially differ; no small repeated sticker treatment.

## Responsive behavior

### Desktop

- Full layered parallax and separated scene depths.
- Header navigation aligns beside the brand on the right.
- Content width remains readable at 1280–1440 px.

### Tablet

- Reduced background depth and shorter ScrollTrigger distances.
- Hero stays two-column while controls retain readable hit areas.

### Mobile

- Single main background layer plus restrained clouds/foliage.
- Header becomes an accessible RTL disclosure.
- Large BuBu is cropped deliberately rather than scaled into a sticker.
- Primary CTA appears in the first 844 px viewport.
- No hover dependency, horizontal overflow, pinned scroll or scroll trap.

### Reduced motion

- No parallax, long timeline, route travel or idle loops.
- All content and final states are visible.
- Only short opacity/color transitions may remain.

## Accessibility and performance

- One `h1`, logical heading order, visible focus and a working skip link.
- Mobile menu uses a button with `aria-expanded`, `aria-controls` and an accessible label.
- Decorative scene layers are `aria-hidden`.
- German vocabulary uses `lang="de"` and isolated LTR direction.
- Images use responsive dimensions, lazy loading below the fold and optimized WebP/JPEG assets.
- GSAP context and ScrollTrigger instances are reverted on cleanup.
- No full-screen video, unnecessary Three.js, trigger leaks or significant layout shift.

## Verification

- Source-contract tests validate exact copy, noindex routes, theme modules, Motion for React use and protected product boundaries.
- TypeScript, ESLint, Prettier and production build must pass.
- Browser QA covers 1440×900, 1024×768 and 390×844.
- Reduced motion is verified through both system preference handling and `?motion=reduced`.
- Interaction QA covers mobile menu, learning-path selection, multimedia reveal, unavailable destination messaging and final CTA.
- Fidelity QA compares the selected concept and final screenshots at no fewer than five concrete points.

## Roadmap return

After `CR-LANDING-003` is complete:

- mark the change request completed;
- preserve the V3 selected direction and theme engine;
- restore `PROJECT_STATE.md` to the prior production-content handoff resume point;
- continue waiting for verified URLs, QR destination, social destinations, approved product screenshots and deployment access.
