# LearnBox Landing V3 Fidelity Ledger

## Approved direction

Selected source:

- `docs/website/concepts/v3/variant-c-hybrid-german-selected.png`

Implemented surface:

- `apps/learnbox-website`

## Source-to-implementation comparison

| Design contract             | Approved concept                                                  | Implemented result                                                                                     | Status              |
| --------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------- |
| German summer hero          | Bright Berlin scene with TV Tower and Brandenburg Gate            | Responsive Berlin summer backdrop with the same landmarks, warm light, clouds and foreground foliage   | Matched             |
| RTL conversion clarity      | Persian copy and primary CTA on the right, BuBu/world on the left | Right-aligned hero copy, first-viewport CTA and large official BuBu opposite the copy                  | Matched             |
| German-learning specificity | German vocabulary cards and German locations                      | `lernen`, `der Beruf`, `die Wohnung`, `der Termin`, Berlin and Cologne/Rhine are embedded in the story | Matched             |
| Product/story hybrid        | Summer hero and download scenes around a purple product center    | Bright Berlin opening, purple product stage and Rhine finale are separated into a clear narrative arc  | Matched             |
| Large BuBu guidance         | Large character in hero and supporting modules                    | Five official states appear as full-body, half-body and close-up compositions across key scenes        | Matched             |
| Learning mechanism          | Leitner arrows and word-card flow                                 | SVG review route, four-stage Leitner progression and hard-word return path explain timing              | Matched             |
| Mobile conversion           | Single-column mobile with clear CTA and large cropped character   | CTA is at y=513 within a 390×844 viewport, no horizontal overflow, dedicated RTL menu                  | Matched             |
| Download honesty            | Concept contains Android, browser and a visual QR                 | Implementation keeps Android/web; QR is explicitly labelled a non-functional preview                   | Intentionally safer |

## Intentional differences

- The concept's hoodie/accessory treatment was not applied to the production character because the canonical transparent BuBu assets are the identity source of truth.
- The concept's QR is not used as a working destination because no verified public URL is available.
- Generated environmental art is kept behind product content and is not reused as a flat full-page wallpaper.
- Illustrative product values are shown as interface examples, not marketing claims.

## Browser evidence

- Desktop: 1440×900, `scrollWidth === clientWidth`, all nine motion scenes triggered and visually inspected.
- Tablet: 1024×768, zero horizontal overflow; brand/nav cluster on the right and CTA at the left.
- Mobile: 390×844, zero horizontal overflow; primary CTA inside the first viewport; menu opens and closes with Escape.
- Reduced motion: profile `reduced`, no floating-card animation, no transform, and all vocabulary details visible.
- Variant routes A/B/C emit `noindex, nofollow`.
- Production console: no error; failed HTTP responses: none.

## German scroll-chapter enhancement

Every previously flat middle segment now has a distinct setting tied to its learning role:

- Berlin Alexanderplatz U-Bahn for words that pass out of memory.
- Berlin–Leipzig–Munich regional rail for spaced-review intervals.
- Prenzlauer Berg residential street for `die Wohnung` in context.
- Germany route map for goal-based learning paths.
- Munich Olympiapark for daily progress.
- Hamburg HafenCity for the layered product stage.
- Berlin Stadtmitte for connected social channels.
- A green German garden path for the final invitation.

Each chapter has far, mid, route, near and accent layers. Desktop scroll motion is measured and active; mobile translation is capped at 4%; reduced motion resolves all layers without movement.

## German landmark polish

The chapter system now includes a recognizable, chapter-specific silhouette in its accent layer:

- U-Bahn roundel and platform sign in Alexanderplatz.
- Regional railway platform and clock on the review journey.
- Fernsehturm in Prenzlauer Berg.
- Germany outline and learning route in the path selector.
- Olympiapark tent roof in the daily-progress scene.
- Elbphilharmonie in HafenCity.
- Brandenburg Gate in Stadtmitte.
- German learning signpost on the final garden path.

The silhouettes use low-contrast chapter colors so they reinforce location without competing with the product story. A soft, theme-aware heading veil keeps Persian copy readable where route lines and architecture pass behind it. Landmark parallax is capped at 1% on mobile and is included in the reduced-motion reset.

Polish QA evidence:

- Production build and TypeScript validation passed.
- Source contract: 7/7 tests passed.
- Desktop 1440×900: eight landmarks rendered, chapter navigation exercised, scroll transform observed, zero horizontal overflow.
- Tablet 1024×768 and mobile 390×844: zero horizontal overflow.
- Browser console: zero warnings or errors.
