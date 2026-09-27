# 001 — Turn the static landing page into a cinematic learning journey

- **Status**: DONE
- **Commit**: 4eca897
- **Severity**: HIGH
- **Category**: Purpose, continuity, accessibility and missed opportunities
- **Estimated scope**: 3 files, medium

## Problem

The storyboard requires every scene to have an entry, action, message and exit, but `apps/learnbox-website/app/page.tsx` currently renders all ten scenes without a motion lifecycle. `apps/learnbox-website/app/globals.css` only disables motion under `prefers-reduced-motion`; it does not define meaningful motion to reduce.

The result is a sequence of static sections rather than the promised journey from scattered words to an organized review system.

## Target

- Author one focal hero sequence: vocabulary cards settle, the LearnBox cube activates, its path reveals and BuBu arrives.
- As the forgetting scene enters, scattered cards move away while BuBu remains the organizing anchor.
- Reveal the four Leitner stages in order with a capped 70ms stagger so movement communicates progression.
- Transform the multimedia card with a bounded clip-path/scale entrance.
- Animate path selection as an interruptible 220ms state change.
- Animate progress bars from their baseline with transform only.
- Add no dependency: use CSS, IntersectionObserver and progressive CSS scroll timelines.
- Default HTML remains visible. Only apply pre-entry states after JavaScript adds `motion-ready`.
- Use motion tokens:

```css
--motion-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--motion-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--motion-fast: 160ms;
--motion-state: 220ms;
--motion-scene: 720ms;
```

## Repo conventions to follow

- Motion remains colocated with the landing surface in `apps/learnbox-website/app/globals.css`.
- The existing `@media (prefers-reduced-motion: reduce)` block is the accessibility boundary.
- Canonical BuBu images remain unchanged.

## Steps

1. Add an isolated `MotionOrchestrator` client component that marks the document `motion-ready`, observes `[data-motion]`, adds `is-visible`, and disconnects on unmount.
2. Mark narrative sections with stable `data-motion` names and add `data-motion-item` only to elements whose movement explains that scene.
3. Add the focal hero sequence and slow, restrained vocabulary-card float for fine-pointer desktop only.
4. Add scene-specific transitions for forgetting, Leitner, vocabulary, path choice, habit and product progress.
5. On mobile, shorten distances and disable scroll-linked depth. Under reduced motion, remove spatial movement while retaining 160ms opacity/color feedback.

## Boundaries

- Do NOT alter copy, release claims, URLs, character artwork or app project files.
- Do NOT add GSAP, Motion, Three.js or Rive for this foundation.
- Do NOT hide content unless `motion-ready` is present.
- Do NOT add looping particles, bounce, scroll hijacking or pinned mobile scenes.

## Verification

- **Mechanical**: `pnpm --filter @learnbox/marketing-website typecheck`, `pnpm --filter @learnbox/marketing-website build`, and the Impeccable detector must pass.
- **Feel check**: inspect desktop and 390px mobile; scroll through each scene and confirm motion describes organization/progression rather than repeated fade-up. Toggle path tabs repeatedly; transitions must retarget without blocking input. Emulate reduced motion and confirm spatial movement disappears while all content and controls remain visible.
- **Done when**: the hero has one authored sequence, the problem-to-Leitner transition reads as a story, mobile scroll stays natural and there are no console errors.
