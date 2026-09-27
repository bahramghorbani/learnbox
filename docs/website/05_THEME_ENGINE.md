# Theme Engine and Seasonal Updates

## Goal

The website should support fast seasonal updates without rebuilding the landing page or introducing a heavy CMS.

The user should be able to request:

> تم سایت را به نوروز تغییر بده.

Codex should then independently update the theme, test it, preview it, commit it, and prepare or perform deployment.

## Theme architecture

Separate theme data from scene code.

The current verified implementation lives at:

```text
apps/learnbox-website/src/themes/summer/
├── SummerBackdrop.tsx
├── index.ts
├── summer-theme.css
└── tokens.ts
```

It exposes typed tokens and a layered scene component. The current backdrop
contract is:

```text
sky
clouds
architecture
light
foliage
particles
content
```

Berlin is used for the learning opening and Cologne/Rhine for the calm download
chapter. Both remain explicitly tied to German learning rather than generic
tourism.

A theme may control:

- background colors,
- lighting colors,
- decorative assets,
- BuBu or DuDu accessories,
- hero supporting copy,
- optional seasonal greeting,
- particles,
- motion intensity,
- Open Graph image,
- metadata,
- start and end dates.

A theme must not redefine the entire website.

## Suggested structure

```text
src/themes/
├── registry.ts
├── types.ts
├── default/
│   ├── theme.ts
│   ├── content.ts
│   └── motion.ts
├── nowruz/
│   ├── theme.ts
│   ├── content.ts
│   ├── motion.ts
│   └── assets.ts
└── seasonal-demo/
```

## Example contract

```ts
export interface WebsiteTheme {
  id: string;
  enabled: boolean;
  schedule?: {
    startsAt: string;
    endsAt: string;
  };
  colors: {
    background: string;
    surface: string;
    primary: string;
    accent: string;
  };
  hero: {
    title?: string;
    description?: string;
    characterAsset?: string;
    backgroundAsset?: string;
  };
  decorations: {
    enabled: boolean;
    assets: string[];
    intensity: 'low' | 'medium' | 'high';
  };
  motion: {
    preset: string;
    particleEffect?: string;
    reducedMotionFallback: boolean;
  };
  seo: {
    title?: string;
    description?: string;
    openGraphImage?: string;
  };
}
```

## Activation

Provide a single central setting:

```ts
activeTheme: 'default';
```

Manual activation is preferred for version 1.

Automatic schedule support may exist, but should not activate production themes without validated date and timezone handling.

## Required initial themes

- `summer` — verified default for Landing V3
- future seasonal themes must keep the same module boundary

## Motion contract

- GSAP owns cinematic timelines and scroll-linked depth.
- ScrollTrigger owns scene activation and stops ambient CSS loops offscreen.
- Motion for React owns component state changes such as the mobile menu and path selector.
- CSS owns lightweight cloud, foliage and vocabulary-card loops.
- SVG paths explain review timing and movement.
- `prefers-reduced-motion: reduce` removes parallax, long timelines and loops while preserving every content state.
- All GSAP work is scoped to the landing root and reverted on unmount.

## Asset contract

- Existing files in `public/characters/BuBu/` are immutable identity sources.
- Landing-specific character compositions are versioned under `public/themes/summer/bubu/`.
- Environmental artwork is stored under `public/themes/summer/backgrounds/`.
- Next Image provides responsive WebP/AVIF delivery from the compressed source images.

## Codex seasonal workflow

When asked to create or activate a seasonal theme:

1. inspect the current theme system,
2. create or update the seasonal package,
3. preserve core branding,
4. prepare theme-specific assets,
5. validate character identity,
6. test desktop and mobile,
7. test reduced motion,
8. test performance,
9. generate or update the Open Graph image,
10. create a preview,
11. commit the change,
12. deploy or guide the user through unavoidable deployment actions.

Do not request approval for reversible aesthetic details.
