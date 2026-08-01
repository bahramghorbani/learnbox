# Landing Product Story and Legal — Final Fix Report

- Date: 2026-08-01
- Status: `DONE` for the requested final-review fix wave
- Source commit: `40e79e42bc8ad88d3af55de65f10178847e36ba5`
- Scope: `apps/learnbox-website`, `docs/website`, and this SDD report only

## Outcome

All six important final-review findings are fixed and regression-protected. The
clean source commit was deployed only to the isolated Vercel Preview project and
the resulting URL passed the live browser contract. Production, the custom
domain, DNS, SSL, the learner web app and the mobile app were not changed.

Preview:

```text
Project: learn-box/learnbox-landing-preview
Project ID: prj_pPFcSkNaFvEWvKKAOxPNcbLmWEsd
Deployment ID: dpl_AQQNTjQrJj3A2LPsBxYRDibmbmBJ
URL: https://learnbox-landing-preview-hzk38cm9m-learn-box.vercel.app
Target/status: Preview / Ready
Source: 40e79e42bc8ad88d3af55de65f10178847e36ba5
```

## Finding-by-finding RED/GREEN evidence

### 1. Download availability copy

RED:

- The landing source test rejected the previous unconditional release language.
- The built-route legal/landing test rejected both the unavailable and available
  download-state contracts.

GREEN:

- Download text now has explicit branches for both destinations available, one
  destination available, and neither destination available.
- The current Preview, where neither official destination is configured, says
  that official release links have not yet been announced and renders the two
  controls as unavailable buttons.
- The available-state fixture proves the copy changes when a verified destination
  is present.

### 2. Privacy policy contract

RED:

- Six focused built-route assertions failed while the privacy page still lacked
  the complete required contract.

GREEN:

- The Persian RTL policy now covers scope, data categories, purpose and legal
  basis, processors and transfers, retention, security, child use, user rights,
  deletion/contact, changes and the effective date.
- It remains an honest pre-release draft pending owner/counsel approval.
- `/privacy` returns static readable HTML with JavaScript disabled and includes
  the correct canonical URL and contact address.

### 3. Terms contract

RED:

- The focused built-route suite rejected the incomplete terms content.

GREEN:

- The Persian RTL terms now cover eligibility/account responsibility, acceptable
  use, intellectual property, third-party services, availability and changes,
  disclaimers, limitation of liability, suspension/termination, governing-law
  review boundary, changes, contact and the effective date.
- `/terms` returns static readable HTML with JavaScript disabled and includes the
  correct canonical URL and contact address.

### 4. Footer destination behavior

RED:

- Configuration tests failed when same-origin absolute legal URLs were left as
  external destinations.
- Built-route tests rejected missing external-link safety and invalid destination
  behavior.

GREEN:

- Footer destinations now come from the shared destination configuration.
- Same-origin absolute privacy/terms values normalize to internal pathnames.
- Valid external HTTPS destinations open in a new tab with
  `rel="noopener noreferrer"`.
- Missing or invalid destinations render as non-navigation elements with
  `aria-disabled="true"`; they never become guessed or unsafe links.

### 5. Production legal-review gate

RED:

- The readiness suite failed because production did not require an explicit
  legal-review approval value.

GREEN:

- Production now requires `LEARNBOX_LEGAL_REVIEW_STATUS=approved`.
- `.env.example` and the deployment runbook document the value and its owner/legal
  review meaning.
- Preview remains buildable without claiming legal approval.
- The current production check exits non-zero and names all nine unresolved
  inputs, including the legal-review status.

### 6. Motion-query lifecycle

RED:

- On the same page, resizing desktop to mobile left the motion profile at `full`
  instead of `mobile`.

GREEN:

- A single live media-query lifecycle now covers desktop width and reduced-motion
  preference.
- Every transition cancels queued idle/timeout work, reverts the previous GSAP
  context, resets semantic state and starts only the profile appropriate to the
  current media state.
- GSAP remains dynamically imported only for motion-capable desktop layouts.
- Same-page deployed results:
  - desktop → mobile: profile `mobile`, zero active screens, zero runtime-hidden
    screens, all four screens in relative document flow;
  - mobile → desktop: profile `full`, one active screen and four hidden inactive
    screens;
  - reduced motion enabled: profile `reduced`, zero active/hidden screens and all
    content static and visible;
  - full motion restored: profile `full`, one active screen and four hidden
    inactive screens.

## Additional review cleanup

- Removed dead `.product-scene` and `.app-screen-*` motion selectors.
- Product-story explanatory copy now uses the shared content constant.
- The browser network audit now fails on every HTTP response with status 400 or
  higher in addition to unexpected `Network.loadingFailed` events.
- A real computed-color regression caught insufficient mobile Leitner contrast;
  the final minimum measured text contrast is `4.6428:1`.

## Files changed in the source commit

```text
apps/learnbox-website/.env.example
apps/learnbox-website/app/components/MotionOrchestrator.tsx
apps/learnbox-website/app/components/landing/LandingExperience.tsx
apps/learnbox-website/app/components/landing/ProductStory.tsx
apps/learnbox-website/app/globals.css
apps/learnbox-website/app/privacy/page.tsx
apps/learnbox-website/app/terms/page.tsx
apps/learnbox-website/scripts/check-upload-readiness.mjs
apps/learnbox-website/src/config/site.mjs
apps/learnbox-website/tests/landing-v3.test.mjs
apps/learnbox-website/tests/legal-pages.test.mjs
apps/learnbox-website/tests/release-readiness.test.mjs
apps/learnbox-website/tests/site-config.test.mjs
docs/website/DEPLOYMENT_RUNBOOK.md
```

No file under `apps/website` or `apps/mobile` changed.

## Final local verification

- Website tests: 35 total, 34 passed, 1 browser-environment test skipped in the
  normal suite as designed.
- Focused source/config/readiness tests: 24 passed and 1 browser-only test skipped.
- Built legal-route suite: 8/8 passed.
- Website typecheck: passed.
- Website production build: passed and generated 13 static pages.
- Repository-wide `pnpm check`: passed.
- `check:preview`: `PREVIEW UPLOAD READY`.
- `check:release`: blocked as designed by the nine unresolved production inputs.

Production build output:

| Route      |    Size | First Load JS |
| ---------- | ------: | ------------: |
| `/`        | 12.4 kB |        120 kB |
| `/privacy` |   180 B |        106 kB |
| `/terms`   |   180 B |        106 kB |
| shared     |       — |        102 kB |

Local production Lighthouse 12.8.2, simulated mobile 390×844:

| Category       | Score |
| -------------- | ----: |
| Performance    |    97 |
| Accessibility  |   100 |
| Best Practices |   100 |
| SEO            |   100 |

Metrics: FCP 0.8 s, LCP 2.6 s, Speed Index 0.8 s, TBT 20 ms and CLS 0.

## Deployed verification

- Vercel build: compiled successfully, type/lint checks passed, 13 static pages
  generated (`/` was 12.6 kB with 120 kB First Load JS), deployment status
  `Ready` and target `Preview`.
- `/`, `/privacy` and `/terms`: HTTP 200 over HTTPS.
- Canonicals: `https://learnboxapp.com`,
  `https://learnboxapp.com/privacy`, and
  `https://learnboxapp.com/terms` respectively.
- Every route returned the expected Preview `X-Robots-Tag: noindex`, CSP, HSTS,
  frame, MIME-sniffing, referrer and permissions headers.
- The full Chrome/CDP contract passed against the deployed URL: desktop sticky
  sync, same-page desktop/mobile/reduced transitions, 390×844 containment,
  keyboard focus, JavaScript-disabled legal pages and successful image decoding.
- Runtime console warnings/errors/exceptions: 0 unexpected.
- `Network.loadingFailed`: 0 unexpected.
- HTTP responses with status 400 or higher: 0.
- Deployed Lighthouse: Performance 97, Accessibility 100, Best Practices 100,
  FCP 1.0 s, LCP 2.3 s, Speed Index 2.2 s, TBT 130 ms and CLS 0. Preview SEO is
  intentionally 69 because `X-Robots-Tag: noindex` correctly blocks indexing;
  the production-mode local audit is 100.

## Remaining production inputs

Production remains deliberately blocked until the owner supplies or approves:

1. Official web app URL.
2. Official Café Bazaar URL.
3. Official Instagram URL.
4. Official LinkedIn URL.
5. Official Pinterest URL.
6. Product-screen approval status.
7. Owner-approved QR codes generated from final destinations.
8. Owner-approved branded Open Graph artwork.
9. Owner/counsel legal review, represented by
   `LEARNBOX_LEGAL_REVIEW_STATUS=approved` only after that review is complete.

The production domain, DNS and SSL work also require an explicit future owner
instruction after `check:release` passes.

## Known non-blocking minors

- Node emits `MODULE_TYPELESS_PACKAGE_JSON` when the source test imports the
  ESM content module. Changing package module semantics was intentionally outside
  this focused fix wave.
- The previously documented filename-filter tooling minor remains non-blocking.
