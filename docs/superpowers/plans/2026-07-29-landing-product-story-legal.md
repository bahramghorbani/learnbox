# LearnBox Product Story, Themed BuBu, and Legal Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fictional landing product mockups with an honest four-stage story built from the owner-supplied LearnBox screenshots, add scene-specific BuBu derivatives, publish Persian privacy and terms pages, and activate the verified Telegram and email destinations in a reviewable Preview deployment.

**Architecture:** Keep the marketing site in `apps/learnbox-website` as the sole implementation scope. A server-rendered landing composition mounts a focused client-side `ProductStory`; the existing deferred `MotionOrchestrator` owns desktop scroll choreography, while CSS provides the mobile and reduced-motion fallbacks. Shared server-rendered legal-page primitives keep legal copy out of the landing client bundle. Verified destination defaults live in `site.mjs`, and unavailable release destinations remain fail-closed.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Next/Image, GSAP/ScrollTrigger already present in the repository, CSS, Node test runner, ImageGen for versioned BuBu derivatives, Browser QA, Lighthouse, Vercel Preview.

## Global Constraints

- Work only in `apps/learnbox-website`, website documentation, and new versioned landing assets.
- Do not modify the learner app in `apps/website`, mobile app, authentication, payments, analytics providers, DNS, the production domain, or production deployment state.
- Preserve all canonical BuBu source files byte-for-byte. Add derivatives under a new versioned directory.
- Keep the supplied screenshots as product truth. Do not paint new controls into them, change their numbers, imply marketplace availability, or claim an unpublished capability.
- Add no animation dependency and do not move GSAP or ScrollTrigger into the initial client bundle.
- Desktop may use sticky storytelling; mobile uses ordinary vertical document flow; reduced-motion shows every stage without animation-dependent visibility.
- Internal legal pages are server-rendered Persian RTL routes. They are an operational draft, not a claim of lawyer approval.
- Use these verified defaults: `https://t.me/learnboxapp`, `mailto:hi@learnboxapp.com`, `/privacy`, and `/terms`.
- Keep web app, Café Bazaar, Instagram, LinkedIn, and Pinterest unavailable until the owner supplies official URLs.
- Deploy only to the existing isolated `learnbox-landing-preview` Vercel Preview project.
- Home First Load JS remains at or below approximately 170 kB; Lighthouse targets remain Performance ≥ 90, Accessibility 100, Best Practices 100, and CLS 0.

---

### Task 1: Lock the product-story asset and content contract

**Files:**

- Modify: `apps/learnbox-website/tests/landing-v3.test.mjs`
- Create: `apps/learnbox-website/app/components/landing/product-story-data.ts`
- Create: `apps/learnbox-website/public/product/screens/v1/start-journey.jpeg`
- Create: `apps/learnbox-website/public/product/screens/v1/today.jpeg`
- Create: `apps/learnbox-website/public/product/screens/v1/calm-return.jpeg`
- Create: `apps/learnbox-website/public/product/screens/v1/progress.jpeg`

**Interfaces:**

```ts
export type ProductStoryStageId = 'start' | 'today' | 'return' | 'progress';

export type ProductStoryStage = {
  id: ProductStoryStageId;
  eyebrow: string;
  title: string;
  description: string;
  image: {
    src: string;
    alt: string;
    width: 1080;
    height: 1920;
  };
  place: 'berlin' | 'transit' | 'park' | 'rhine';
};

export const productStoryStages: readonly ProductStoryStage[];
```

- [ ] Add a source contract test that imports `productStoryStages` and asserts the exact stage order:

```js
assert.deepEqual(
  productStoryStages.map(({ id }) => id),
  ['start', 'today', 'return', 'progress'],
);
assert.equal(new Set(productStoryStages.map(({ image }) => image.src)).size, 4);
for (const stage of productStoryStages) {
  assert.equal(stage.image.width, 1080);
  assert.equal(stage.image.height, 1920);
  assert.match(stage.image.alt, /LearnBox/);
}
```

- [ ] Add filesystem assertions for the four versioned public files and explicit checks that no stage text contains `منتشر شده`, `هم‌اکنون دانلود`, or an unsupported marketplace claim.
- [ ] Run `pnpm --filter @learnbox/marketing-website test -- landing-v3.test.mjs` and confirm failure because `product-story-data.ts` and the versioned assets do not exist.
- [ ] Record SHA-256 hashes of every current canonical BuBu file under `public/themes/summer/bubu` in the test fixture before adding any derivative.
- [ ] Copy the four owner-supplied 1080×1920 JPEGs into the versioned filenames without editing screenshot content:

```text
/Users/test/Downloads/اسپلش تبلیغاتی.jpeg  -> start-journey.jpeg
/Users/test/Downloads/صفحهٔ امروز.jpeg     -> today.jpeg
/Users/test/Downloads/بازگشت آرام.jpeg     -> calm-return.jpeg
/Users/test/Downloads/پیشرفت.jpeg          -> progress.jpeg
```

- [ ] Inspect all four copied files at full resolution and verify dimensions with `sips -g pixelWidth -g pixelHeight`.
- [ ] Create `product-story-data.ts` with concise Persian copy that describes only the visible stage and includes a note in the section composition that screenshot numbers are illustrative interface states.
- [ ] Run the focused test again and confirm it passes.
- [ ] Commit:

```bash
git add apps/learnbox-website/tests/landing-v3.test.mjs \
  apps/learnbox-website/app/components/landing/product-story-data.ts \
  apps/learnbox-website/public/product/screens/v1
git commit -m "feat(website): add truthful product story assets"
```

---

### Task 2: Activate verified destinations and add static legal routes

**Files:**

- Modify: `apps/learnbox-website/src/config/site.mjs`
- Modify: `apps/learnbox-website/tests/site-config.test.mjs`
- Modify: `apps/learnbox-website/tests/release-readiness.test.mjs`
- Create: `apps/learnbox-website/tests/legal-pages.test.mjs`
- Create: `apps/learnbox-website/app/components/legal/LegalPageLayout.tsx`
- Create: `apps/learnbox-website/app/components/legal/legal-page.css`
- Create: `apps/learnbox-website/app/privacy/page.tsx`
- Create: `apps/learnbox-website/app/terms/page.tsx`
- Modify: `apps/learnbox-website/app/sitemap.ts`
- Modify: `apps/learnbox-website/app/components/landing/LandingExperience.tsx`

**Interfaces:**

```js
const verifiedDefaults = {
  telegram: 'https://t.me/learnboxapp',
  privacy: 'https://learnboxapp.com/privacy',
  terms: 'https://learnboxapp.com/terms',
  contact: 'mailto:hi@learnboxapp.com',
};
```

```tsx
type LegalPageLayoutProps = {
  eyebrow: string;
  title: string;
  description: string;
  effectiveDate: string;
  children: React.ReactNode;
};
```

- [ ] Extend `site-config.test.mjs` so an empty environment resolves the four verified defaults as `available`, while web app, Café Bazaar, Instagram, LinkedIn, and Pinterest remain `unavailable`.
- [ ] Add one invalid-override test per destination class; for example, `NEXT_PUBLIC_TELEGRAM_URL=https://example.com/learnboxapp` must return `invalid` rather than fall back to the default.
- [ ] Change the complete release fixture email from `mailto:hello@learnboxapp.com` to `mailto:hi@learnboxapp.com`.
- [ ] Update the production-gate test so the newly verified defaults are not reported missing, but the gate still reports the five unavailable destinations plus QR, Open Graph, and product approval when their release inputs are absent.
- [ ] Create `legal-pages.test.mjs` that reads the two page sources and asserts:

```js
for (const phrase of [
  'داده‌های روی دستگاه',
  'رضایت',
  'نگهداری',
  'حذف',
  'فروش اطلاعات شخصی',
  'hi@learnboxapp.com',
]) {
  assert.match(privacySource, new RegExp(phrase));
}

for (const phrase of [
  'نسخهٔ پیش‌انتشار',
  'استفادهٔ مجاز',
  'مالکیت فکری',
  'هدف آموزشی',
  'حقوق غیرقابل اسقاط',
  'hi@learnboxapp.com',
]) {
  assert.match(termsSource, new RegExp(phrase));
}
```

- [ ] Run:

```bash
pnpm --filter @learnbox/marketing-website test -- \
  site-config.test.mjs release-readiness.test.mjs legal-pages.test.mjs
```

Confirm failure because defaults and legal routes are absent.

- [ ] Add `defaultValue` only to the four verified destination definitions. Resolve an explicitly supplied environment value first; if supplied but invalid, fail closed and never silently replace it with a default.
- [ ] Create `LegalPageLayout` as a server component with skip link, LearnBox home link, version/effective-date block, readable article width, visible focus states, and a mail link to `hi@learnboxapp.com`.
- [ ] Write `/privacy` in plain Persian RTL with the 14 approved sections. Clearly distinguish current device-local behavior from future account, purchase, notification, analytics, and provider behavior; do not invent server retention periods.
- [ ] Write `/terms` in plain Persian RTL with the 16 approved sections. State the pre-release boundary and future marketplace/purchase boundary without implying a live subscription or store listing.
- [ ] Export route metadata with canonical `https://learnboxapp.com/privacy` and `https://learnboxapp.com/terms`.
- [ ] Add both routes to `sitemap.ts`.
- [ ] Ensure the landing footer uses internal `/privacy` and `/terms` navigation, activates Telegram with safe external-link attributes, and activates the verified mail link.
- [ ] Run focused tests, typecheck, and a production build; confirm `/privacy` and `/terms` are static/server-rendered routes and are absent from the home client bundle.
- [ ] Commit:

```bash
git add apps/learnbox-website/src/config/site.mjs \
  apps/learnbox-website/tests \
  apps/learnbox-website/app/components/legal \
  apps/learnbox-website/app/privacy \
  apps/learnbox-website/app/terms \
  apps/learnbox-website/app/sitemap.ts \
  apps/learnbox-website/app/components/landing/LandingExperience.tsx
git commit -m "feat(website): publish legal pages and verified links"
```

---

### Task 3: Replace fictional mockups with the responsive ProductStory

**Files:**

- Create: `apps/learnbox-website/app/components/landing/ProductStory.tsx`
- Modify: `apps/learnbox-website/app/components/landing/LandingExperience.tsx`
- Modify: `apps/learnbox-website/app/globals.css`
- Modify: `apps/learnbox-website/tests/landing-v3.test.mjs`

**Interfaces:**

```tsx
export function ProductStory(): React.JSX.Element;

type ProductStoryStageProps = {
  stage: ProductStoryStage;
  index: number;
};
```

DOM contract:

```html
<section id="product" data-motion="product-story">
  <article data-product-stage="start" aria-current="true">…</article>
  <article data-product-stage="today">…</article>
  <article data-product-stage="return">…</article>
  <article data-product-stage="progress">…</article>
  <div data-product-device>
    <figure data-product-screen="start">…</figure>
    …
  </div>
</section>
```

- [ ] Add contract assertions for `data-product-stage`, `data-product-screen`, four `Image` renders, explicit `width`, `height`, responsive `sizes`, and `priority={index === 0}`.
- [ ] Assert that the old `.app-screen--back`, `.app-screen--middle`, and `.app-screen--front` fictional UI sources are gone.
- [ ] Assert that the section contains the visible disclosure `اعداد داخل تصویر، نمونه‌ای از وضعیت رابط کاربری‌اند`.
- [ ] Run the focused landing test and confirm failure because `ProductStory` is absent and fictional mockups remain.
- [ ] Build `ProductStory` from `productStoryStages`. Keep all meaningful copy in the DOM once; do not swap it by injecting HTML.
- [ ] On desktop, render a two-column layout: stage copy in document flow and one sticky, accessible phone frame with four layered screenshot figures.
- [ ] On widths below the established mobile breakpoint, render each screenshot directly inside its matching article and disable the separate sticky device.
- [ ] Use `Next/Image` with `width={1080}`, `height={1920}`, `sizes="(max-width: 720px) 86vw, (max-width: 1100px) 44vw, 420px"`, first-stage priority, and lazy loading for the remaining images.
- [ ] Add a meaningful image fallback surface through a stable figure background and adjacent stage text so a failed image does not collapse the story.
- [ ] Retain the German harbor/Rhine background language and add stage-specific decorative cues through CSS/data attributes without obscuring screenshot readability.
- [ ] Add keyboard-safe anchors or passive progress markers only; do not add controls that imply the screenshots themselves are interactive.
- [ ] Replace the old product block in `LandingExperience` with `<ProductStory />`.
- [ ] Run tests, typecheck, and build. Inspect the route-size table and confirm home First Load JS remains ≤ 170 kB.
- [ ] Commit:

```bash
git add apps/learnbox-website/app/components/landing/ProductStory.tsx \
  apps/learnbox-website/app/components/landing/LandingExperience.tsx \
  apps/learnbox-website/app/globals.css \
  apps/learnbox-website/tests/landing-v3.test.mjs
git commit -m "feat(website): build responsive product story"
```

---

### Task 4: Add deferred desktop story motion and complete reduced-motion behavior

**Files:**

- Modify: `apps/learnbox-website/app/components/MotionOrchestrator.tsx`
- Modify: `apps/learnbox-website/app/globals.css`
- Modify: `apps/learnbox-website/tests/landing-v3.test.mjs`

**Interfaces:**

The existing dynamic imports remain the only GSAP boundary:

```ts
const [{ gsap }, { ScrollTrigger }] = await Promise.all([
  import('gsap'),
  import('gsap/ScrollTrigger'),
]);
```

The orchestrator consumes:

```text
[data-motion="product-story"]
[data-product-stage]
[data-product-screen]
[data-product-device]
```

- [ ] Add test assertions that GSAP and ScrollTrigger remain dynamic imports, `motion/react` is not introduced, and the new product selectors are consumed by the existing orchestrator.
- [ ] Add source assertions for a `matchMedia("(prefers-reduced-motion: reduce)")` guard and CSS rules that set every stage/screen visible with `position: static`, `opacity: 1`, `transform: none`, and no sticky behavior under reduced motion.
- [ ] Run the focused test and confirm failure because the product-story selectors are not animated and the complete fallback rules are absent.
- [ ] In the existing deferred setup, create one `ScrollTrigger` per desktop stage. On enter/enter-back, set `aria-current` on stage copy and activate the matching screen with restrained opacity, `y`, scale, shadow, and light changes.
- [ ] Keep the device sticky through CSS rather than ScrollTrigger pinning so the section cannot trap scroll.
- [ ] Add shallow, stage-specific background parallax using the existing chapter-layer system; keep movement capped and use `ease: "none"` for scrubbed travel.
- [ ] Skip product timelines entirely when reduced motion is requested or the mobile media query matches.
- [ ] Register every timeline/trigger inside the existing GSAP context so route cleanup removes it.
- [ ] Verify no stage begins hidden before the deferred runtime initializes. Stage 1 is the safe initial active state.
- [ ] Run tests, typecheck, and build; inspect emitted chunks to confirm GSAP did not re-enter the initial client bundle.
- [ ] Commit:

```bash
git add apps/learnbox-website/app/components/MotionOrchestrator.tsx \
  apps/learnbox-website/app/globals.css \
  apps/learnbox-website/tests/landing-v3.test.mjs
git commit -m "feat(website): animate product story on scroll"
```

---

### Task 5: Produce and integrate versioned themed BuBu derivatives

**Files:**

- Read without modification: `apps/learnbox-website/public/themes/summer/bubu/*`
- Read reference: `/Users/test/Downloads/wa-sum.png`
- Create: `apps/learnbox-website/public/themes/summer/bubu-themed/v1/hero-traveler.png`
- Create: `apps/learnbox-website/public/themes/summer/bubu-themed/v1/card-organizer.png`
- Create: `apps/learnbox-website/public/themes/summer/bubu-themed/v1/language-coach.png`
- Create: `apps/learnbox-website/public/themes/summer/bubu-themed/v1/progress-achiever.png`
- Create: `apps/learnbox-website/public/themes/summer/bubu-themed/v1/journey-companion.png`
- Modify: `apps/learnbox-website/app/components/landing/LandingExperience.tsx`
- Modify: `apps/learnbox-website/app/components/landing/LearningPaths.tsx`
- Modify: `apps/learnbox-website/tests/landing-v3.test.mjs`
- Create: `docs/website/evidence/bubu-themed-v1-contact-sheet.png`

**Interfaces:**

```ts
const themedBubu = {
  hero: '/themes/summer/bubu-themed/v1/hero-traveler.png',
  forgetting: '/themes/summer/bubu-themed/v1/card-organizer.png',
  vocabulary: '/themes/summer/bubu-themed/v1/language-coach.png',
  progress: '/themes/summer/bubu-themed/v1/progress-achiever.png',
  finale: '/themes/summer/bubu-themed/v1/journey-companion.png',
} as const;
```

- [ ] Before image work, read and follow the `imagegen` skill. Announce when it directs an asset-generation or inspection action.
- [ ] Inspect the canonical BuBu assets and `wa-sum.png` with the image viewer. Select the closest canonical face/body references without altering them.
- [ ] Add tests that require all five versioned derivative paths, descriptive alt text, explicit dimensions/sizes, and the previously recorded canonical-file hashes.
- [ ] Run the focused test and confirm failure because derivative files and references are absent.
- [ ] Generate five separate, high-resolution BuBu derivatives with a consistent identity:

```text
Hero: straw hat, purple sunglasses, camera, postcard, light summer shirt.
Forgetting: practical vest, small cross-body card bag, visible review cards.
Vocabulary: headphones, round glasses, pointer, compact vocabulary notebook.
Progress: sporty headband, small medal, celebratory progress token.
Finale: light backpack, folded map, open invitation gesture.
```

- [ ] In every generation prompt, explicitly preserve the white rounded body, two upright ears, large dark eyes, small dark nose, warm cheeks, friendly expression, and canonical proportions. Keep face, ears, and silhouette unobstructed.
- [ ] Prefer clean transparent PNG output. If transparency produces damaged edges, keep a complete controlled scene or mask; do not ship a visibly broken cutout.
- [ ] Create a contact sheet at real intended render sizes and inspect expression, hands, accessories, edge quality, lighting consistency, and German/LearnBox visual cues.
- [ ] Reject and regenerate any derivative with identity drift, malformed anatomy, unreadable branded text, or clothing that hides BuBu's defining silhouette.
- [ ] Integrate the approved derivatives in the five major scenes. Give secondary scenes at most one restrained prop already present in the composition.
- [ ] Use explicit `Image` dimensions and responsive `sizes`; keep non-hero BuBu images lazy.
- [ ] Recompute canonical BuBu hashes and confirm they match the baseline exactly.
- [ ] Run tests, typecheck, build, and a browser smoke test before committing.
- [ ] Commit:

```bash
git add apps/learnbox-website/public/themes/summer/bubu-themed/v1 \
  apps/learnbox-website/app/components/landing \
  apps/learnbox-website/tests/landing-v3.test.mjs \
  docs/website/evidence/bubu-themed-v1-contact-sheet.png
git commit -m "feat(website): add themed BuBu story variants"
```

---

### Task 6: Complete browser, accessibility, performance, and Preview release verification

**Files:**

- Modify: `docs/website/UPLOAD_READINESS.md`
- Modify: `docs/website/PROJECT_STATE.md`
- Modify: `docs/website/CHANGE_REQUESTS.md`
- Create: `docs/website/evidence/product-story-desktop.png`
- Create: `docs/website/evidence/product-story-laptop.png`
- Create: `docs/website/evidence/product-story-mobile.png`
- Create: `docs/website/evidence/privacy-mobile.png`
- Create: `docs/website/evidence/terms-mobile.png`

**Interfaces:**

Preview-only release evidence records:

```text
source commit
preview deployment URL
route HTTP status
browser viewports
console/network result
reduced-motion result
Lighthouse scores
home First Load JS
canonical BuBu hash result
production boundary
```

- [ ] Run the focused website gates:

```bash
pnpm --filter @learnbox/marketing-website test
pnpm --filter @learnbox/marketing-website typecheck
pnpm --filter @learnbox/marketing-website build
pnpm --filter @learnbox/marketing-website check:preview
```

- [ ] Run repository-wide verification:

```bash
pnpm check
```

- [ ] Before browser automation, read and follow the in-app Browser control skill.
- [ ] Start the built site locally and inspect the home route at 1440×900, 1024×768, and 390×844.
- [ ] At each viewport, verify Persian RTL identity, all four stages in exact order, no horizontal overflow, no failed images, no framework overlay, no console errors, and no blocked network requests for local assets.
- [ ] At desktop/laptop sizes, scroll through every product threshold and confirm the device remains sticky without pinning or trapping the page. Confirm active copy and image remain synchronized in both scroll directions.
- [ ] At 390×844, confirm four ordinary vertical cards, readable screenshots/copy, no horizontal swiper, and no sticky device.
- [ ] Emulate `prefers-reduced-motion: reduce`; confirm all four stages remain statically visible and no opacity/transform event is required to reveal content.
- [ ] Navigate with keyboard through header, product content, footer, Telegram, email, privacy, and terms. Confirm visible focus and meaningful accessible names.
- [ ] Open `/privacy` and `/terms` with JavaScript disabled; confirm readable static Persian content, correct canonical metadata, email link, and no landing client runtime requirement.
- [ ] Confirm Telegram resolves to `https://t.me/learnboxapp` and contact resolves to `mailto:hi@learnboxapp.com`. Confirm web app, Café Bazaar, Instagram, LinkedIn, and Pinterest remain honestly unavailable.
- [ ] Run Lighthouse under the established profile. Record Performance ≥ 90, Accessibility 100, Best Practices 100, CLS 0, and the home First Load JS from the Next.js build output.
- [ ] Update the three website status documents with exact pass/fail evidence, the legal-review caveat, unavailable release inputs, and the explicit statement that Production/DNS/server state was untouched.
- [ ] Commit the verified local source and evidence:

```bash
git add docs/website apps/learnbox-website
git commit -m "docs(website): record product story preview readiness"
```

- [ ] Build a clean temporary deployment staging directory from the exact committed source. Include only files required by the existing Vercel Preview workflow; do not mutate production configuration.
- [ ] Deploy to the existing `learnbox-landing-preview` project as a Preview deployment, never with `--prod`.
- [ ] Record the immutable commit SHA and returned Preview URL.
- [ ] Verify HTTP 200 for `/`, `/privacy`, and `/terms`; inspect canonical/security headers and ensure the production domain/DNS was not attached or modified.
- [ ] Repeat the browser smoke path against the deployed Preview, including product stage order, mobile flow, legal navigation, Telegram/email targets, console, and failed requests.
- [ ] If any deployed check fails, fix locally, rerun all proportional gates, create a new commit, and deploy a new Preview. Do not patch the deployed artifact in place.
- [ ] Stop after handing the owner the verified Preview URL, screenshots, legal-review caveat, and remaining owner-supplied release inputs. Notify the owner before any future server, production-domain, DNS, or SSL action.

---

## Completion Checklist

- [ ] Four owner-supplied screenshots are versioned, dimension-checked, and shown in the approved narrative order.
- [ ] Fictional product mockups and unsupported claims are removed.
- [ ] Desktop sticky storytelling, mobile document flow, and reduced-motion static fallback all pass.
- [ ] Five themed BuBu derivatives pass visual QA while canonical assets remain unchanged.
- [ ] `/privacy` and `/terms` are Persian RTL static/server-rendered routes with honest pre-release boundaries.
- [ ] Telegram and `hi@learnboxapp.com` are active; unavailable destinations remain disabled.
- [ ] Focused tests, typecheck, build, preview gate, and `pnpm check` pass.
- [ ] Browser, keyboard, console, responsive, reduced-motion, and Lighthouse gates pass.
- [ ] A clean commit is deployed only to the isolated Vercel Preview project.
- [ ] Production, `learnboxapp.com`, DNS, SSL, auth, payments, and analytics remain untouched.
