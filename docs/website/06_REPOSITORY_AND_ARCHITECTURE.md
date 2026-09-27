# Repository and Architecture Rules

## Integration rule

The LearnBox website must be built inside the existing LearnBox repository.

Do not create a separate repository.

## Repository-first process

Before implementation:

1. scan the repository,
2. identify package manager,
3. identify build system,
4. inspect existing apps and packages,
5. inspect shared UI and design tokens,
6. inspect existing deployment,
7. inspect branding and character assets,
8. inspect coding standards and test tools,
9. identify the safest integration point.

## Preferred project location

If compatible with the repository:

```text
apps/learnbox-website/
```

Otherwise use the repository’s established convention.

## Minimal-change principle

Do not refactor the full repository merely to make the website structure aesthetically ideal.

Prefer the smallest safe integration.

## Technology direction

Preferred:

- Next.js
- TypeScript
- existing CSS system or Tailwind if already used or justified
- GSAP
- Motion for React
- SVG
- Three.js only where necessary

Codex may adjust the stack after repository inspection, but must document the reason.

## Content configuration

Centralize:

- download URLs,
- web app URL,
- social links,
- release statuses,
- feature availability,
- “coming soon” flags,
- legal links,
- contact information,
- active theme.

Do not scatter these values across components.

## Suggested internal structure

```text
learnbox-website/
├── src/
│   ├── app/
│   ├── components/
│   ├── scenes/
│   ├── motion/
│   ├── themes/
│   ├── content/
│   ├── config/
│   ├── lib/
│   └── styles/
├── public/
│   ├── branding/
│   ├── characters/
│   ├── app-screens/
│   └── themes/
├── tests/
├── docs/
└── README.md
```

## Future-readiness rule

The structure should allow future integration with:

- blog,
- CMS,
- localization,
- analytics,
- API,
- documentation,
- dashboard links.

Do not implement these in version 1 unless explicitly required.

## SEO and rendering

The primary copy and CTAs must be server-rendered or statically renderable.

Motion must not be required for indexing or basic usability.

## Static export

Use static export only if it matches the actual hosting and routing needs.

Do not force static export if the existing deployment is already optimized for server rendering.
