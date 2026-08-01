# LearnBox Landing Upload Readiness

## Current verdict

```text
PREVIEW UPLOAD READY
PRODUCTION UPLOAD BLOCKED BY VERIFIED CONTENT
```

Task 6 Fix Round 1 source commit:
`831fdc8d234b3c40429bea90557715d146355419`.

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

- Website tests: 26 passed and 1 browser-environment test skipped in the normal
  suite; the browser-environment contract passed 14/14 against the built site.
- Website typecheck: passed.
- Website build: passed; 13 static routes generated. Home First Load JS is
  120 kB, with 102 kB shared.
- `pnpm check:preview`: passed.
- `pnpm check:release`: blocked as designed while production inputs are absent.
- Repository-wide `pnpm check`: passed, including format, lint, all workspace
  typechecks/tests and every repository verification script.
- The immutable Preview passed the same 14/14 browser contract after deployment.

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
- Keyboard traversal reaches header anchors, the product/download flow, footer,
  Telegram, privacy, terms and email. Every interactive target has a meaningful
  name and a visible 3 px focus outline.
- `/privacy` and `/terms` render readable Persian RTL HTML with JavaScript
  disabled, canonical metadata and `mailto:hi@learnboxapp.com`; neither route
  depends on the landing client runtime.
- Product-story screenshots and legal mobile evidence are versioned under
  `docs/website/evidence/`.

## Verified public preview

The exact Task 6 Fix Round 1 source commit is deployed as an isolated Vercel
Preview, superseding the earlier Task 6 Preview:

```text
Project: learnbox-landing-preview
Project ID: prj_pPFcSkNaFvEWvKKAOxPNcbLmWEsd
Source: 831fdc8d234b3c40429bea90557715d146355419
Deployment ID: dpl_8zMFz3YvMPyMdndav4FzTbEmgYMw
URL: https://learnbox-landing-preview-ix8lgp6h2-learn-box.vercel.app
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
  390×844 mobile containment and document flow, reduced motion, keyboard focus,
  JavaScript-disabled legal HTML, Telegram/email targets, zero console/runtime
  issues and zero unexpected network failures. A cold optimizer decode rejected
  once immediately after deployment; all five source and optimized images then
  returned decodable HTTP 200 image responses and the complete retry passed
  14/14.
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
- Speed Index: 1.1 s
- Total Blocking Time: 40 ms
- Cumulative Layout Shift: 0
- Largest Contentful Paint: 2.6 s under Lighthouse throttling
- Home-route First Load JS: 120 kB; shared First Load JS: 102 kB

The Task 6 run used Lighthouse `12.8.2`, simulated mobile 390×844, a new clean
Chrome profile and the built local site. GSAP and ScrollTrigger remain deferred
outside the initial home bundle.

## Production blockers

`pnpm check:release` names every missing item:

1. Web app URL.
2. Café Bazaar URL.
3. Instagram URL.
4. LinkedIn URL.
5. Pinterest URL.
6. Owner-approved QR codes generated from the final destinations.
7. Owner-approved branded Open Graph artwork.
8. Owner/counsel review of the pre-release privacy and terms drafts.

Telegram (`https://t.me/learnboxapp`), contact
(`mailto:hi@learnboxapp.com`), `/privacy`, `/terms` and the four owner-supplied
product screenshots are now present and verified. The legal pages are honest
pre-release product drafts for owner/counsel review; they are not legal advice
or a claim of legal approval.

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
