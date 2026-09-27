# LearnBox Landing Product Story and Legal Pages Design

Date: 2026-07-29  
Status: Approved by owner for implementation
Scope: `apps/learnbox-website`

## 1. Objective

Replace the landing page's illustrative product mockups with a truthful,
high-impact story built from the four owner-supplied LearnBox app screenshots.
Enrich BuBu with scene-specific clothing and accessories while preserving the
character's identity. Publish clear Persian privacy and terms pages, and activate
the owner-verified Telegram and contact destinations.

This work remains limited to the marketing landing. It must not modify the
learner application in `apps/website`, the mobile application, learner data,
authentication providers, billing, DNS, or the production domain.

## 2. Approved Inputs

### Product screenshots

All four source files are owner-supplied, 1080×1920 JPEG images:

1. `/Users/test/Downloads/اسپلش تبلیغاتی.jpeg`
2. `/Users/test/Downloads/صفحهٔ امروز.jpeg`
3. `/Users/test/Downloads/بازگشت آرام.jpeg`
4. `/Users/test/Downloads/پیشرفت.jpeg`

They represent the intended promotional product experience. They may be
recomposed for the landing, but must not be used to claim that the app is already
published or that unavailable features are live.

### Character and visual reference

`/Users/test/Downloads/wa-sum.png` is the approved direction for a richer,
accessorized BuBu in a vivid German summer setting.

The reference establishes:

- a recognizable BuBu face and body;
- scene-specific clothing and props;
- high color saturation and dimensional lighting;
- a dense but legible German travel atmosphere;
- LearnBox purple as the unifying brand accent.

It does not authorize replacing the canonical BuBu assets. New images are
versioned derivatives and require visual approval before they replace any
existing landing composition.

### Verified public destinations

- Telegram: `https://t.me/learnboxapp`
- Contact: `mailto:hi@learnboxapp.com`
- Privacy: `https://learnboxapp.com/privacy`
- Terms: `https://learnboxapp.com/terms`

The web app, Café Bazaar, Instagram, LinkedIn, and Pinterest remain unavailable
until the owner supplies their official destinations.

## 3. Product Story

### 3.1 Narrative order

The existing `#product` chapter becomes a four-stage narrative:

1. **Start the journey** — the promotional splash screen.
2. **Today's calm plan** — the Today screen.
3. **Return without pressure** — the recovery screen.
4. **Visible progress** — the Progress screen.

Each stage has one short headline and one supporting line. Copy describes only
what is visible in the supplied screen and already supported by the approved
LearnBox product direction.

Numbers shown inside the supplied promotional screens are examples of the
interface state, not a promise of a learner's result or a claim about a live
account.

### 3.2 Desktop behavior

- A device frame remains sticky within the product chapter.
- Scroll progress selects one of four stages.
- The active screen transitions with restrained depth, scale, light, and
  translation.
- The supporting copy and feature callout change with the selected screen.
- The background travels through coordinated German scenes such as Berlin,
  transit, a summer park, and the Rhine.
- The sticky interval must not trap the user or require excessive scrolling.

GSAP and ScrollTrigger remain deferred outside the initial client bundle. The
new story must reuse the existing motion orchestration boundary rather than add
another large animation runtime.

### 3.3 Mobile behavior

- Screens appear as four normal vertical story cards.
- Every image and explanation is available without horizontal swiping.
- No long pinning, scroll hijacking, or nested scroll container is allowed.
- The user can move through the section using ordinary document scrolling.

### 3.4 Reduced motion

When `prefers-reduced-motion: reduce` is active:

- all four stages remain visible;
- the sticky transformation and scroll-linked movement are disabled;
- opacity, blur, and large positional transitions are removed;
- no content depends on an animation event to become readable.

## 4. Promotional Screen Treatment

The original screenshots are the source of product truth. Landing presentation
may add:

- a refined phone frame;
- perspective and soft shadow;
- controlled color and contrast treatment;
- short capability labels outside the screenshot;
- German-scene background elements;
- transition highlights that point to visible UI.

The landing must not paint new controls into a screenshot, alter numeric claims,
invent an unpublished capability, or imply marketplace availability.

The optimized source images are stored as versioned public assets. Next/Image
must receive explicit dimensions and responsive `sizes`. Only the first
currently visible product screen may be eager; the remaining screens must be
lazy-loaded.

## 5. BuBu Story System

### 5.1 Identity invariants

Every derivative keeps:

- BuBu's white rounded body;
- two upright ears;
- large dark eyes;
- small dark nose;
- warm cheek color;
- friendly, supportive expression;
- recognizable proportions.

Clothing and accessories may not obscure the face, ears, or silhouette.

### 5.2 Approved full outfits

Five major scenes receive a complete thematic treatment:

1. **Hero / summer traveler:** straw hat, purple sunglasses, camera, postcard,
   and light travel shirt.
2. **Forgetting / card organizer:** small cross-body card bag, practical vest,
   and gathered review cards.
3. **Vocabulary / language coach:** headphones, round glasses, pointer, and a
   compact vocabulary notebook.
4. **Progress / calm achiever:** headband, small medal, and celebratory progress
   token.
5. **Finale / journey companion:** light backpack, folded map, and invitation
   gesture.

Secondary sections use one restrained prop, such as a train ticket, book, mug,
German flag detail, or route marker.

### 5.3 Asset boundary

- Canonical and currently approved BuBu files are never overwritten.
- Derivatives use descriptive, versioned filenames in a dedicated landing
  subdirectory.
- True transparency is preferred only when the result is clean at full
  resolution.
- If edge quality is weak, use a complete scene composition or a controlled
  mask rather than a visibly damaged transparent cutout.
- Every derivative is visually reviewed at its real rendered size before use.

## 6. Privacy Page

Route: `/privacy`  
Language: Persian, RTL  
Rendering: static/server-rendered  
Contact: `hi@learnboxapp.com`

The policy uses plain language and separates current behavior from future
production behavior. It includes:

1. document version and effective date;
2. LearnBox contact information;
3. device-local learning data, including review queue, personal vocabulary,
   daily progress, and calm streak;
4. future account data, including phone authentication, session metadata,
   learning history, personal-card text, and purchases, only after activation;
5. consent-gated coarse analytics with no free text or sensitive identifier;
6. optional notifications and permission timing;
7. purposes of processing;
8. security and access controls;
9. service providers and cross-border processing only when actually activated;
10. retention, export, correction, and deletion requests;
11. no sale of personal data;
12. no default access to contacts, SMS content, location, or microphone;
13. users below the legal age of their place of residence;
14. policy changes and contact route.

The first published draft is an operational disclosure based on the repository's
current data map. It is not labeled as lawyer-approved. A final legal review
remains a production-release requirement.

For the current local-only experience, the policy explains that device data
remains until the learner clears application/browser storage or removes the
application. It must not invent a server retention period. Exact account,
purchase, backup, and security-log retention periods must be added and legally
reviewed before the corresponding production services are activated.

Primary drafting references:

- EU GDPR, including transparency and data-processing principles:
  `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679`
- Iran Electronic Commerce Law:
  `https://nezamat.ir/post-34221/`

## 7. Terms Page

Route: `/terms`  
Language: Persian, RTL  
Rendering: static/server-rendered  
Contact: `hi@learnboxapp.com`

The terms include:

1. document version and effective date;
2. acceptance of terms;
3. pre-release and evolving-service status;
4. eligibility and guardian permission where local law requires it;
5. account and security responsibilities after account activation;
6. permitted personal learning use;
7. prohibited abuse, interference, scraping, and unlawful content;
8. LearnBox and licensed-content intellectual property;
9. user responsibility for personal vocabulary or submitted content;
10. educational-purpose disclaimer;
11. service availability, maintenance, and change;
12. future purchases and marketplace terms only after activation;
13. suspension or termination for abuse;
14. reasonable liability limits without excluding non-waivable legal rights;
15. changes to terms;
16. contact and dispute-resolution path.

The terms must not claim an active subscription, marketplace listing, or
production account system before those boundaries are live.

## 8. Link and Configuration Behavior

The verified Telegram, contact, privacy, and terms destinations become default
valid landing destinations. They remain overridable by explicit valid
environment values.

- Internal legal links use normal same-site navigation.
- Email uses `mailto:hi@learnboxapp.com`.
- Telegram opens the verified `https://t.me/learnboxapp` destination and uses
  safe external-link attributes when a new tab is requested.
- Missing official destinations retain the honest disabled state.

The production gate must accept these four newly verified destinations while
continuing to block absent web app, Café Bazaar, Instagram, LinkedIn, Pinterest,
approved QR, and approved Open Graph inputs.

## 9. Component Boundaries

Expected focused units:

- `ProductStory`: owns product-stage content and responsive rendering.
- `ProductStoryStage`: renders one screenshot, label, and explanation.
- `LegalPageLayout`: shared static layout for privacy and terms.
- `site.mjs`: validates and resolves verified/default destinations.
- existing motion orchestrator: activates product-story motion without a second
  animation runtime.

The landing page remains the composition owner. Legal content does not enter the
large client component.

## 10. Failure and Fallback Behavior

- Missing or failed images preserve a meaningful text label and do not collapse
  the product chapter.
- The source screenshot remains readable without animation.
- Invalid external destinations fail closed to the unavailable state.
- Legal pages remain available without client JavaScript.
- Unsupported sticky behavior falls back to the mobile-style document flow.

## 11. Test Strategy

Tests are written before implementation and must fail for the absent behavior.
They cover:

- all four product assets and approved narrative order;
- descriptive alt text, explicit dimensions, and responsive image sizing;
- absence of unsupported marketplace or live-feature claims;
- verified Telegram, contact, privacy, and terms destinations;
- fail-closed invalid URL behavior;
- required privacy-policy sections;
- required terms sections;
- static legal metadata and canonical routes;
- reduced-motion visibility;
- no replacement of canonical BuBu files;
- production gate still blocking every genuinely unavailable input.

## 12. Browser and Performance QA

Required browser viewports:

- 1440×900 desktop;
- 1024×768 laptop;
- 390×844 mobile.

Required checks:

- correct Persian RTL page identity;
- all four product stages visible and in order;
- sticky desktop transition without scroll trapping;
- normal mobile document flow;
- reduced-motion static fallback;
- keyboard navigation and visible focus;
- legal navigation and email/Telegram destinations;
- no horizontal overflow;
- no failed images, framework overlays, warnings, or console errors.

Performance targets:

- home First Load JS at or below approximately 170 kB;
- Lighthouse Performance at least 90 under the established test profile;
- Accessibility 100;
- Best Practices 100;
- CLS 0;
- no regression that moves the GSAP runtime back into the initial bundle.

## 13. Deployment Boundary

After local verification, deploy only to the isolated
`learnbox-landing-preview` Vercel Preview project.

Do not:

- deploy to Production;
- attach `learnboxapp.com`;
- edit DNS;
- activate authentication, payment, or analytics providers;
- mark QR or Open Graph artwork approved without owner review.

The owner is notified before any server, production-domain, DNS, or SSL step.

## 14. Acceptance Criteria

The design is complete when:

- the real product screenshots replace the fictional product mockups;
- the four-stage story is visually strong and honest;
- BuBu appears in the approved hybrid outfit system;
- privacy and terms pages are readable, truthful, and linked;
- Telegram and contact are active;
- unavailable release destinations remain disabled;
- automated, browser, responsive, reduced-motion, and performance gates pass;
- the optimized public Preview is available for owner review;
- no learner app, mobile app, production domain, DNS, or server state changes.
