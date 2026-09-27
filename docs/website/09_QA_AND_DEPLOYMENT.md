# QA and Deployment Guide

## Quality priorities

1. Product truth
2. Mobile usability
3. Performance
4. Motion stability
5. Accessibility
6. SEO
7. Visual consistency
8. Browser compatibility

## Automated checks

Use the existing repository tools where possible.

Recommended categories:

- type checking,
- linting,
- unit tests,
- component tests,
- production build,
- link validation,
- accessibility checks,
- visual regression,
- smoke tests.

## Manual checks

### Copy

- Persian text is readable.
- RTL punctuation and numbers are correct.
- No unsupported product claims.
- BuBu and DuDu names use exact capitalization.

### Links

- Café Bazaar
- Web app
- Telegram
- Instagram
- LinkedIn
- Pinterest
- legal pages
- contact links

### Motion

- no motion trap,
- no broken pinned scene,
- no content hidden after resize,
- no duplicate triggers after navigation,
- reduced-motion mode works,
- mobile scroll remains natural.

### Characters

- BuBu matches the existing repository source of truth.
- DuDu matches the supplied official reference.
- no accidental character redesign.
- no spelling changes.

### Performance

- critical content loads first,
- character assets are optimized,
- large scene assets are lazy-loaded,
- no runaway memory use,
- no severe cumulative layout shift.

## Deployment strategy

Codex should inspect existing deployment first.

Use the existing provider and pipeline when sensible.

Do not introduce a new paid provider without user approval.

## Preview before production

Always produce or use a preview deployment before public release.

Verify:

- links,
- responsive behavior,
- animation,
- metadata,
- Open Graph,
- theme,
- production environment variables.

## Production actions

Codex should perform all possible deployment work.

Only involve the user for unavoidable access, approval, DNS, or account actions.

## Rollback

Document:

- previous stable commit,
- provider rollback method,
- environment variable backup,
- theme rollback,
- DNS rollback if applicable.
