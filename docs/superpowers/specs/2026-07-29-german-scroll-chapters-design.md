# LearnBox German Scroll Chapters — Design Specification

## Status

Approved for inline implementation by the user's request to ideate and execute without a review pause.

## Goal

Turn every landing segment into a distinct, attractive German learning chapter whose background and scroll motion reinforce the section's meaning while preserving copy, conversion clarity, mobile performance and reduced motion.

## Direction selection

Three approaches were considered:

1. **More generic parallax:** fast and light, but repetitive and not ownable.
2. **Fullscreen video or Canvas:** visually rich, but expensive, difficult to adapt and unnecessary.
3. **Layered German scroll chapters:** code-native skyline, route, rail, street and landscape layers with one meaningful scroll action per section.

Approach 3 is selected because it extends the existing German summer world without replacing it or adding a heavy runtime.

## Motion thesis

- **Focal moment:** a purple learning route travels through Germany and changes meaning in every chapter.
- **Continuity:** sky, architecture and foreground layers move at different scroll rates so the visitor feels one continuous journey rather than stacked page blocks.
- **Feedback:** path selection remains Motion-driven; scroll chapters do not delay interaction.
- **Budget:** transform, opacity, SVG stroke and bounded clip-path only; no Canvas, WebGL, fullscreen video or new dependency.

## Chapter map

| Segment        | German setting               | Learning meaning                                   | Scroll action                                                           |
| -------------- | ---------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| Hero           | Berlin summer                | Beginning the German journey                       | Existing deep parallax and route entrance                               |
| Forgetting     | Berlin U-Bahn platform       | Words pass by and disappear without timely review  | Train and signage move in opposite depth bands; scattered words resolve |
| Leitner        | German regional rail network | Review intervals are stops on a route              | Track line draws and review cards advance between stations              |
| Multimedia     | Berlin residential street    | A word becomes memorable inside a real context     | Apartment windows reveal in sequence; the word card opens               |
| Learning paths | Germany route map            | Different goals lead to different cities           | Route draws across city nodes and responds to the selected path         |
| Progress       | Munich Olympiapark           | Daily practice accumulates like distance markers   | Sun arc and kilometer markers progress with scroll                      |
| Product        | Hamburg harbor               | Product screens arrive as organized working layers | Harbor depth shifts while screens dock into place                       |
| Download       | Cologne and Rhine            | Access becomes the next destination                | Existing Rhine parallax; phone, web and access preview settle           |
| Social         | Berlin public square         | Learning continues through connected channels      | Signal rings and city boards connect without moving content             |
| Finale         | Green German garden path     | The journey resolves into one clear invitation     | Foreground path converges toward BuBu and then rests                    |

## Architecture

- Add `GermanyChapterBackdrop.tsx` under `src/themes/summer/`.
- Add `germany-chapters.css` beside the existing summer theme.
- The component accepts a typed `chapter` value and renders stable `far`, `mid`, `route`, `near` and `accent` layers.
- Every non-hero section receives exactly one backdrop.
- `MotionOrchestrator` creates one scrubbed ScrollTrigger per layer group and one chapter-specific semantic motion.
- Existing scene timelines remain responsible for foreground content.

## Responsive behavior

- Desktop uses all depth layers and up to 14% relative translation.
- Tablet uses the same composition with reduced near-layer travel.
- Mobile hides one nonessential far layer and caps travel at 4%; no pinning or scroll hijacking.
- Text and interactive content always remain above background layers.

## Reduced motion

- No parallax, route drawing, train travel, sun arc or ambient loop.
- All chapter layers render in their resolved position.
- Content remains visible and interactive.

## Acceptance criteria

- Every production segment has a distinct German-themed backdrop.
- No backdrop resembles a flag collage or generic tourism wallpaper.
- Every background has one observable scroll-linked motion on capable desktop.
- Background motion never covers copy or CTA.
- Zero horizontal overflow at 1440, 1024 and 390 CSS pixels.
- All ScrollTriggers are scoped and reverted.
- Existing exact Persian copy and product claims remain unchanged.
- Contract tests, typecheck and production build pass.
