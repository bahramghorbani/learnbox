# Visual and Motion Bible

## Visual direction

The website should feel:

- cinematic,
- premium,
- playful but not childish,
- friendly,
- modern,
- educational,
- dimensional,
- cohesive with LearnBox branding.

Avoid:

- generic SaaS templates,
- random glassmorphism,
- noisy gradients,
- excessive particles,
- constant movement,
- toy-like UI,
- game-casino visual language,
- heavy 3D everywhere,
- visual effects that obscure copy or CTAs.

## German ambient world

The landing background is an authored visual world, not a generic gradient layer.

- Use cinematic wallpaper imagery built from German architecture, rail, river, city and landscape motifs.
- Treat the landmarks as one poetic learning journey rather than a tourist collage.
- Keep the right side and critical copy zones calm and dark.
- Separate sky, landmark and route-light layers so they can move at different depths.
- Background movement must remain slow, scroll-linked and subordinate to the story.
- Do not use flags, decorative German clichés, generic particles or unverified factual claims.
- On mobile, reduce the scene to one atmospheric layer.
- Under `prefers-reduced-motion`, freeze every background layer without removing the visual world.

## Motion stack

Preferred stack:

- GSAP for timeline-based, scroll-driven, cinematic sequences.
- Motion for React for component transitions and interface interactions.
- CSS animations for lightweight repeated effects.
- SVG for morphing, paths, lines, and vector transitions.
- Three.js only when real-time 3D creates meaningful value.
- Pre-rendered WebM or optimized image sequences for scenes that are too expensive to render live.

Do not add Rive as a required dependency for version 1.

Use it only after proving that a specific approved interaction cannot be implemented effectively with the existing free stack.

## Cost rule

Prefer mature free and open-source tools.

Do not purchase a motion platform, asset subscription, or paid plugin without explicit user approval.

## Motion principles

1. Motion must explain the product.
2. Every scene needs a reason to move.
3. Use one dominant movement at a time.
4. Preserve text readability.
5. Do not hijack scrolling.
6. Avoid long pinned sections on mobile.
7. Motion must degrade gracefully.
8. The static experience must remain complete.
9. Respect `prefers-reduced-motion`.
10. Avoid heavy effects before the critical content is visible.

## Motion profiles

### Full

For capable desktop devices.

### Standard

For typical desktop and mobile devices.

### Reduced

For reduced-motion preference and constrained devices.

### Static fallback

All content and CTAs remain usable without scene animation.

## Performance rules

- Lazy-load non-critical scene assets.
- Avoid loading all character and video assets at startup.
- Optimize images to AVIF or WebP where appropriate.
- Use responsive image sizes.
- Avoid autoplay video with audio.
- Keep background video optional and lightweight.
- Prevent layout shifts.
- Clean up GSAP contexts and event listeners.
- Test memory use during long scroll sessions.
- Avoid simultaneous filters and blur effects across large areas.

## Mobile direction

Mobile is a designed experience, not a scaled-down desktop.

Mobile scenes may:

- simplify depth,
- reduce particle count,
- shorten timelines,
- replace complex 3D with still or pre-rendered assets,
- use swipe or tap where hover is unavailable,
- avoid excessive pinned scrolling.
