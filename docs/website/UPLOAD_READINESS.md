# LearnBox Landing Upload Readiness

## Current verdict

```text
PREVIEW UPLOAD READY
PRODUCTION UPLOAD BLOCKED BY VERIFIED CONTENT
```

Final-review source commit:
`40e79e42bc8ad88d3af55de65f10178847e36ba5`.

Target package:

```text
apps/learnbox-website
```

Protected packages:

```text
apps/website
apps/mobile
```

## Automated evidence

- Website tests: 34 passed and 1 browser-environment test skipped in the normal
  suite; the browser-environment contract passed against the built site and the
  exact deployed Preview.
- Website typecheck: passed.
- Website build: passed; 13 static routes generated. Home First Load JS is
  120 kB, with 102 kB shared.
- `pnpm check:preview`: passed.
- `pnpm check:release`: blocked as designed while production inputs are absent.
- Repository-wide `pnpm check`: passed, including format, lint, all workspace
  typechecks/tests and every repository verification script.
- The immutable Preview passed the complete browser contract after deployment,
  including HTTP-response status auditing.

## Browser evidence

- In-app browser baseline at 1440×900, 1024×768 and 390×844: Persian RTL identity,
  exact product order `start → today → return → progress`, no horizontal
  overflow, failed images, framework overlay or console errors.
- Desktop/laptop: the device remains CSS-sticky while the page scrolls normally;
  copy and owner-supplied screenshot stay synchronized down and back up.
- Mobile Fix Round 1: the browser contract now requires every stage and matching
  screen to stay inside the product container and 390 px viewport, alternate in
  one column and leave the page `scrollWidth` at 390 px. Four ordinary vertical
  cards remain, with no swiper and no sticky device.
- Reduced motion: all four stages are static, visible and require no transform or
  opacity transition.
- Same-page media transitions: desktop → mobile, mobile → desktop, reduced motion
  on and full motion restored all reinitialize cleanly without stale GSAP state or
  hidden content.
- Mobile Leitner text has a measured minimum contrast ratio of 4.6428:1.
- Keyboard traversal reaches header anchors, the product/download flow, footer,
  Telegram, privacy, terms and email. Every interactive target has a meaningful
  name and a visible 3 px focus outline.
- `/privacy` and `/terms` render readable Persian RTL HTML with JavaScript
  disabled, canonical metadata and `mailto:hi@learnboxapp.com`; neither route
  depends on the landing client runtime.
- Product-story screenshots and legal mobile evidence are versioned under
  `docs/website/evidence/`.

## Verified public preview

The exact final-review source commit is deployed as an isolated Vercel Preview,
superseding the Fix Round 1 Preview:

```text
Project: learnbox-landing-preview
Project ID: prj_pPFcSkNaFvEWvKKAOxPNcbLmWEsd
Source: 40e79e42bc8ad88d3af55de65f10178847e36ba5
Deployment ID: dpl_AQQNTjQrJj3A2LPsBxYRDibmbmBJ
URL: https://learnbox-landing-preview-hzk38cm9m-learn-box.vercel.app
Target: Preview
```

- Vercel reports status Ready and target Preview; only a Vercel Preview alias is
  present, with no production/custom domain.
- `/`, `/privacy` and `/terms` return HTTP 200 over HTTPS with correct canonical
  links.
- All three routes include `X-Robots-Tag: noindex`, CSP, HSTS,
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, referrer and
  permissions policies.
- Deployed Chrome/CDP contract: desktop sticky/bidirectional stage sync, exact
  390×844 mobile containment and document flow, same-page media-query lifecycle,
  reduced motion, keyboard focus, JavaScript-disabled legal HTML, Telegram/email
  targets, zero unexpected console/runtime issues, zero unexpected network
  failures and zero HTTP responses with status 400 or higher.
- Production, `learnboxapp.com`, DNS, SSL and server state were untouched.

## Lighthouse baseline

Local production build, simulated mobile:

| Category       | Score |
| -------------- | ----: |
| Performance    |    97 |
| Accessibility  |   100 |
| Best Practices |   100 |
| SEO            |   100 |

Key metrics:

- First Contentful Paint: 0.8 s
- Speed Index: 0.8 s
- Total Blocking Time: 20 ms
- Cumulative Layout Shift: 0
- Largest Contentful Paint: 2.6 s under Lighthouse throttling
- Home-route First Load JS: 120 kB; shared First Load JS: 102 kB

The Task 6 run used Lighthouse `12.8.2`, simulated mobile 390×844, a new clean
Chrome profile and the built local site. GSAP and ScrollTrigger remain deferred
outside the initial home bundle.

The deployed Preview scored Performance 97, Accessibility 100 and Best Practices
100, with FCP 1.0 s, LCP 2.3 s, Speed Index 2.2 s, TBT 130 ms and CLS 0. Its SEO
score is intentionally 69 because Preview responses carry `X-Robots-Tag: noindex`;
the production-mode local audit above remains 100.

## Production blockers

`pnpm check:release` names every missing item:

1. Web app URL.
2. Café Bazaar URL.
3. Instagram URL.
4. LinkedIn URL.
5. Pinterest URL.
6. Owner approval of the supplied product screens.
7. Owner-approved QR codes generated from the final destinations.
8. Owner-approved branded Open Graph artwork.
9. Owner/counsel review of the privacy and terms drafts, recorded only after
   completion as `LEARNBOX_LEGAL_REVIEW_STATUS=approved`.

Telegram (`https://t.me/learnboxapp`), contact
(`mailto:hi@learnboxapp.com`), `/privacy`, `/terms` and the four owner-supplied
product screenshots are present and technically verified but still require the
explicit production approval status. The legal pages are comprehensive, honest
pre-release product drafts for owner/counsel review; they are not legal advice or
a claim of legal approval.

No destination should be inferred from a username or an unverified search result.

## Upload boundary

The repository-root `vercel.json` deploys the learner web app. The landing must
never be uploaded from that project.

The separate Vercel project now exists with:

```text
Root Directory: apps/learnbox-website
Framework: Next.js
Build Command: pnpm build
Output Directory: .next
```

The Preview smoke test has passed. Do not attach `learnboxapp.com` until all
production blockers above are supplied, `pnpm check:release` passes and the
owner explicitly starts the production-domain step.
