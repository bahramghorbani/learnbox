# LearnBox Landing Upload Readiness

## Current verdict

```text
PREVIEW UPLOAD READY
PRODUCTION UPLOAD BLOCKED BY VERIFIED CONTENT
```

Checked implementation commit: `4c13abe`.

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

- `pnpm test`: 13/13 passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed; 11 static routes generated.
- Repository-wide `pnpm check`: passed, including format, lint, all workspace
  tests and every security/content/release verifier.
- `pnpm check:preview`: passed.
- `pnpm check:release`: blocked as designed while production inputs are absent.
- Security headers verified on the production server.
- `/`, `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`, `/icon.svg` and the
  summer social image return HTTP 200.

## Browser evidence

- Chrome-compatible in-app browser: 1440×900, 1024×768 and 390×844; zero
  horizontal overflow and zero console warnings/errors.
- Safari: full RTL document and all ten story chapters exposed; page scroll smoke
  test passed.
- Firefox: full RTL document and all ten story chapters exposed.
- Mobile menu: opens with the correct expanded state and closes with Escape.
- Internal anchors: all targets exist.
- Placeholder CTA: fixed live status remains visible in the current viewport.
- DOM audit: one H1, no duplicate IDs, no unnamed buttons, no images without alt,
  and no nested interactive controls.

## Verified public preview

The landing is deployed as an isolated Vercel Preview:

```text
Project: learnbox-landing-preview
Project ID: prj_pPFcSkNaFvEWvKKAOxPNcbLmWEsd
Deployment ID: dpl_EG4UUBJPGCVk9yLYrBg34hHhNypd
URL: https://learnbox-landing-preview-cwf3x39du-learn-box.vercel.app
Target: Preview
```

- The preview is public and does not require a Vercel login.
- No production domain, DNS record or server-side secret has been attached.
- Vercel Preview indexing is intentionally disabled with `X-Robots-Tag: noindex`.
- `/`, `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` and `/icon.svg`
  return HTTP 200 over HTTPS.
- CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and the
  referrer/permissions policies are present.
- The Vercel feedback toolbar is disabled for this project, so it does not
  inject a script outside the landing CSP.
- Live mobile browser audit at 390×844: Persian/RTL document, one H1, all ten
  chapters, no horizontal overflow and no console errors.

## Lighthouse baseline

Local production build, simulated mobile:

| Category       | Score |
| -------------- | ----: |
| Performance    |    91 |
| Accessibility  |   100 |
| Best Practices |   100 |
| SEO            |   100 |

Key metrics:

- First Contentful Paint: 0.8 s
- Speed Index: 1.3 s
- Total Blocking Time: 60 ms
- Cumulative Layout Shift: 0
- Largest Contentful Paint: 3.4 s under Lighthouse throttling

Lighthouse was pinned to `12.8.2` because the registry dependency graph for
`13.4.1` was temporarily inconsistent during QA.

The public Preview was also measured after deployment. Accessibility and Best
Practices score 100, and CLS remains 0. Performance varied from 67 to 82 across
cold/throttled Preview runs; the local production-build baseline above remains
the reproducible release benchmark. Preview SEO scores 69 solely because Vercel
correctly adds `noindex`; production indexing must be tested again after the
approved domain is attached.

## Production blockers

`pnpm check:release` names every missing item:

1. Web app URL.
2. Café Bazaar URL.
3. Telegram URL.
4. Instagram URL.
5. LinkedIn URL.
6. Pinterest URL.
7. Privacy URL.
8. Terms URL.
9. Contact URL.
10. Owner-approved real product screenshots.
11. Owner-approved QR codes generated from the final destinations.
12. Owner-approved branded Open Graph artwork.

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
