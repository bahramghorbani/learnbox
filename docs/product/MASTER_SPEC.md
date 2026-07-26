# LearnBox — Master Product, Design & Execution Specification for Codex

> **Document status:** Authoritative execution specification  
> **Project codename:** LearnBox  
> **Probable public domain:** `learnboxapp.com`  
> **Primary market:** Persian-speaking learners of German  
> **Primary distribution:** Cafe Bazaar Android app  
> **Secondary distribution:** Direct PWA/web app with direct Iranian payment gateway  
> **Future distribution:** Google Play and Apple App Store  
> **Brand mascot:** **بوبو / Bobo**  
> **Repository visibility:** Private  
> **Primary executor:** Codex  
> **Owner:** Non-technical product owner

---

## 0. Authority and operating principle

This document is the main source of truth for the first implementation of LearnBox.

Codex must treat it as an executable product specification, not as brainstorming notes. It must create the repository, initialize the project, make ordinary reversible technical decisions, implement features incrementally, test its own work, document decisions, and keep the project runnable.

The product owner has no technical background. Therefore:

1. Do not ask the owner to make technical choices that Codex can reasonably make.
2. Do not explain routine implementation details unless they affect cost, legal exposure, publication, data ownership, security, or an irreversible decision.
3. Prepare all files, commands, values, forms, checklists, and copy before requesting owner action.
4. Ask the owner to act only when human authorization, identity verification, payment, account ownership, legal acceptance, access credentials, physical-device action, or marketplace approval is unavoidable.
5. When owner action is required:
   - explain the purpose in one sentence;
   - give exact numbered steps;
   - provide exact text to copy;
   - state what result or screenshot Codex needs;
   - do not assume technical knowledge.
6. Never block progress on an avoidable clarification. Choose the safest sensible default, record it in an ADR, and continue.
7. Ordinary reversible decisions must not require approval.
8. Public publication, paid infrastructure, destructive database operations, deletion of user data, changes to production billing, legal acceptance, and submission to an app marketplace require explicit owner approval.
9. Keep explanations to the owner short and action-oriented.
10. Never expose secrets in Git, logs, screenshots, issue bodies, test fixtures, generated docs, or chat output.

---

# 1. Product vision

LearnBox is a Persian-first German vocabulary learning platform centered on adaptive spaced repetition, active recall, visual memory, contextual examples, calm gamification, and personalized learning paths.

LearnBox must not feel like a simple flashcard utility or a static dictionary. It should behave like a supportive personal learning companion that determines:

- what the learner should review today;
- which words are at risk of being forgotten;
- how many new words are appropriate;
- which language skills are weak;
- how the daily session should adapt;
- what progress the learner has made;
- when the learner should return.

The product promise is:

> LearnBox helps Persian-speaking learners remember German vocabulary through short, intelligent, visual, calm, and motivating daily practice.

Possible Persian brand line:

> آلمانی را فقط یاد نگیر؛ به خاطر بسپار.

Do not treat the slogan as legally or permanently final until branding review.

---

# 2. Product priorities

The target priorities are:

1. German for work migration
2. German for academic migration
3. Everyday conversation
4. General German
5. Exam preparation

The first public content strategy must favor practical A1 and A2 vocabulary for migration and everyday life, while keeping the architecture ready for B1, B2, C1, and exam-specific content.

The initial interface language is Persian. German appears as learning content.

---

# 3. Product principles

All product decisions must follow these principles:

## 3.1 Simple before comprehensive

The product may contain rich data, but the learner should see only what is useful at that moment.

## 3.2 Daily success over long sessions

A five-minute successful session is better than a demanding session the learner abandons.

## 3.3 Memory over exposure

Showing a word is not learning. LearnBox must use active recall and adaptive review.

## 3.4 Encouragement without guilt

The app must never shame the learner, create anxiety, or weaponize streaks.

## 3.5 Offline resilience

Core review sessions must continue when internet access is slow, unstable, filtered, or unavailable.

## 3.6 AI as infrastructure, not a dependency for every tap

AI supports content creation, quality control, personalization, and optional explanations. Core learning must not require a live AI request.

## 3.7 Privacy and minimum permissions

Request only the device permissions that are genuinely necessary. Every permission must have a documented purpose, user-facing explanation, fallback behavior, and marketplace justification.

## 3.8 Continuous delivery

Do not wait for a huge “final” version. Ship small, testable, versioned increments.

## 3.9 Brand consistency

Bobo and the LearnBox visual system are permanent product assets, not decorative afterthoughts.

## 3.10 Measurable learning

Every major feature must support a clear learning, retention, engagement, reliability, or revenue metric.

---

# 4. Core audience personas

## 4.1 Work migration learner

Needs vocabulary for interviews, workplace communication, documents, housing, banking, insurance, transportation, and administration.

## 4.2 Academic migration learner

Needs vocabulary for university, enrollment, housing, research, classes, student services, and formal communication.

## 4.3 New migrant

Needs practical vocabulary for daily life, appointments, shopping, healthcare, transportation, and public services.

## 4.4 General learner

Studies German for personal development and needs a structured daily routine.

## 4.5 Exam learner

Needs focused vocabulary and practice for Goethe, TELC, ÖSD, and related exams. This is not the first priority but must be supported later.

---

# 5. Registration and onboarding

Registration is mandatory from the beginning.

## 5.1 Primary authentication

Use mobile number and one-time password as the default entry method.

Requirements:

- Iranian mobile number support;
- normalized E.164 storage;
- OTP expiration;
- resend cooldown;
- rate limiting;
- anti-abuse controls;
- optional CAPTCHA when risk is detected;
- secure refresh-token handling;
- session and device management;
- account recovery process;
- provider abstraction so the SMS provider can be replaced;
- a development OTP mode that is impossible to enable in production accidentally.

Email may be added later as a recovery or secondary identity method, but must not replace mobile-first onboarding.

## 5.2 Initial onboarding questions

Keep the first onboarding short and visual:

1. first name;
2. learning goal;
3. estimated German level;
4. available daily study time;
5. preferred reminder time;
6. optional target date;
7. optional current learning source or book.

Do not request all profile details at registration.

## 5.3 Progressive profiling

Encourage profile completion later using XP, badges, or useful personalization.

Possible later fields:

- destination city or country;
- occupation;
- field of study;
- planned migration date;
- target exam;
- current textbook;
- study days;
- interests;
- preferred study time;
- profession-specific vocabulary needs.

## 5.4 First-use education

Create a short, skippable, interactive tutorial.

It should explain:

- what Today means;
- why cards return;
- how to flip a card;
- the meaning of answer buttons;
- how images and audio help;
- where personal words are added;
- how progress is calculated;
- how reminders work;
- how to mute sounds.

Do not use a long slideshow. Teach actions at the moment the learner first performs them.

Use Bobo as the guide.

---

# 6. Core learning loop

## 6.1 Daily session

The Today screen must answer:

- How many reviews are due?
- How many new words are recommended?
- How long will the session take?
- What is the highest-priority task?
- Is the learner at risk of losing momentum?
- What did the learner improve recently?

A learner should be able to start the recommended session with one prominent action.

## 6.2 Review responses

Initial response model:

- فراموش کردم
- سخت بود
- یادم آمد
- کاملاً بلد بودم

The UI may later show estimated next-review timing, but must avoid clutter.

## 6.3 Scheduling engine

Implement the learning engine behind an interface so the algorithm can evolve.

Initial release may use a conservative adaptive spaced-repetition model inspired by modern SRS systems, not a rigid visual-only five-box mechanism.

Track at least:

- review history;
- correctness;
- response grade;
- response latency;
- lapse count;
- stability;
- difficulty;
- last reviewed time;
- next due time;
- learning state;
- skill-specific performance;
- card source;
- content version.

The visual product may still explain progress using familiar “boxes” or memory stages, but the scheduling engine must be data-driven.

Required learning states:

- new;
- learning;
- review;
- relearning;
- mastered;
- suspended;
- archived.

## 6.4 Backlog rescue

If a learner misses several days, do not present an overwhelming queue.

Create a Recovery Mode that:

- prioritizes high-value and high-risk cards;
- temporarily reduces new cards;
- offers 5-, 10-, and 15-minute sessions;
- reschedules lower-priority items safely;
- tells the learner that returning is success;
- never punishes missed days.

## 6.5 Session composition

A session may combine:

- due review;
- relearning;
- new cards;
- article practice;
- listening;
- spelling;
- sentence context;
- personal words.

Use remote configuration for ratios.

---

# 7. Card experience

Cards are the visual signature of LearnBox.

## 7.1 Front of card

May include:

- German lemma;
- article;
- pronunciation button;
- word type;
- CEFR level;
- high-quality visual;
- optional pronunciation cue;
- optional example hint.

## 7.2 Flip behavior

Use a smooth three-dimensional flip with:

- subtle tactile feedback;
- soft page or tick sound;
- performant animation;
- reduced-motion fallback;
- no forced delay.

## 7.3 Back of card

Information order:

1. Persian meaning;
2. visual;
3. practical German example;
4. Persian translation;
5. sentence audio;
6. plural or essential conjugation;
7. necessary grammar note;
8. relevant case or preposition;
9. common collocation;
10. optional “More” section.

A card must be understandable in less than ten seconds.

## 7.4 Grammar simplicity

Show Dativ, Akkusativ, separable prefixes, irregular forms, plural, and prepositions only where useful.

Do not turn each card into a grammar textbook.

## 7.5 Practice variants

Support progressive addition of:

- German to Persian;
- Persian to German;
- article choice;
- listening recognition;
- spelling;
- sentence cloze;
- plural recognition;
- verb form;
- preposition/case;
- context choice.

The scheduler should track skill dimensions separately where feasible.

---

# 8. Personal vocabulary

Users must be able to add their own words.

## 8.1 Manual add

Allow:

- German word or phrase;
- optional Persian meaning;
- optional note;
- optional category;
- optional example;
- optional image;
- optional audio.

## 8.2 Assisted add

When online, the system may enrich a personal word with AI-generated suggestions:

- article;
- plural;
- part of speech;
- translation;
- CEFR level;
- example sentence;
- grammar note;
- image;
- audio.

The user must see that generated content is a suggestion before saving.

## 8.3 Offline add

A learner must be able to save a basic personal card offline and sync it later.

## 8.4 Import and future expansion

Design for later support of:

- CSV import;
- clipboard detection;
- browser extension;
- sharing text to LearnBox;
- image text extraction;
- teacher-created lists.

Do not request broad storage, clipboard, or accessibility permissions without explicit user action and documented necessity.

---

# 9. Visual vocabulary system

Each important word should have an image when an image improves memory.

Image categories:

- object;
- action;
- emotion;
- situation;
- contrast;
- abstract metaphor;
- sequence;
- mnemonic.

Visual style:

- consistent;
- warm;
- uncluttered;
- one dominant concept;
- no embedded text unless explicitly required;
- culturally neutral when possible;
- suitable for light and dark contexts;
- optimized for mobile;
- versioned.

AI image generation must use a controlled prompt system and visual QA.

Do not publish images that:

- depict the wrong concept;
- contain malformed hands or objects that distract;
- include wrong written words;
- introduce cultural or factual confusion;
- violate licensing or safety requirements.

---

# 10. Audio and sound

## 10.1 Pronunciation

Generate or license German pronunciation audio.

Requirements:

- neutral standard German as default;
- consistent voice identity;
- correct stress and phonetics;
- separate word and sentence audio;
- quality-control status;
- cached offline for active cards;
- versioned assets;
- no dependency on live text-to-speech during review.

## 10.2 Interface sound

Create a coherent sound system:

- tap;
- card flip;
- correct response;
- retry;
- session complete;
- level up;
- badge;
- reward;
- streak;
- navigation transitions where useful.

Sounds must be short, soft, and non-fatiguing.

## 10.3 Calm study music

Provide optional, very soft, meditation-like focus music during review.

Rules:

- off by default until user opts in, unless user testing strongly supports another choice;
- separate volume control;
- seamless loop;
- no vocals;
- no abrupt transitions;
- no licensing uncertainty;
- downloaded or streamed as an optional asset;
- stop or duck during pronunciation playback;
- continue session when unavailable;
- respect battery and data usage.

## 10.4 Sound settings

Separate controls:

- pronunciation;
- UI sound effects;
- background study music;
- haptic feedback;
- master mute.

A prominent mute control should be available during study.

---

# 11. Gamification

Gamification must reinforce learning.

## 11.1 XP

Award XP for meaningful actions:

- completed review;
- learned new word;
- correct active recall;
- session completion;
- weekly goal;
- profile completion;
- mastery milestone;
- return after absence.

Do not reward meaningless repeated tapping.

## 11.2 Levels

Use a calm progression system. Level names can be refined during branding.

## 11.3 Streak

Provide a daily streak, but:

- do not shame missed days;
- allow limited streak protection;
- allow planned rest days;
- celebrate return;
- prevent exploitative notification language.

## 11.4 Missions

Maximum three daily missions.

## 11.5 Badges

Create badges tied to learning outcomes and consistency.

## 11.6 Rewards

Possible rewards:

- visual themes;
- Bobo accessories;
- profile frames;
- streak protectors;
- bonus practice modes;
- trial access to selected content.

Do not make essential learning inaccessible through random rewards.

## 11.7 Future leagues

Architect but do not prioritize leagues in the earliest release.

If implemented:

- group comparable users;
- reward consistency and learning quality;
- detect abuse;
- provide privacy controls;
- allow opt-out.

---

# 12. Progress and analytics for the learner

## 12.1 Daily report

Show:

- reviews completed;
- accuracy;
- time studied;
- new words;
- XP;
- daily goal.

## 12.2 Weekly report

Show:

- activity by day;
- comparison with previous week;
- mastered words;
- lapsed words;
- study time;
- strongest and weakest skill;
- recommended adjustment.

## 12.3 Memory map

Use understandable stages:

- new;
- learning;
- stabilizing;
- long-term;
- at risk.

## 12.4 Skill profile

Possible dimensions:

- meaning;
- article;
- listening;
- spelling;
- sentence;
- plural;
- conjugation;
- preposition and case.

## 12.5 AI-generated report

Generate server-side or precomputed reports, not a mandatory live-chat response.

The report must be concise, supportive, evidence-based, and generated from actual learner data.

---

# 13. Bobo — brand character system

## 13.1 Official identity

Name:

- Persian: بوبو
- Latin: Bobo

Role:

- LearnBox learning companion;
- brand face;
- onboarding guide;
- motivational voice;
- helper in empty states;
- presenter on the website;
- mascot in marketing and motion.

## 13.2 Canonical appearance lock

The approved appearance of Bobo is a permanent brand asset.

The following are locked unless an explicit brand decision is recorded:

- body silhouette;
- head-to-body proportion;
- white soft body;
- eye shape and spacing;
- mouth and nose style;
- pink cheeks;
- ear shape;
- rounded, friendly volume;
- core three-dimensional material style.

Allowed variations:

- pose;
- expression;
- clothing;
- accessories;
- held object;
- direction;
- context;
- seasonal styling;
- animation.

## 13.3 Personality

Bobo is:

- kind;
- calm;
- clever;
- patient;
- playful without being childish;
- encouraging;
- never sarcastic;
- never angry at the learner.

Bobo must not:

- call the learner lazy;
- create guilt;
- threaten streak loss;
- pressure payment;
- exaggerate progress;
- behave as a medical, legal, or psychological authority.

## 13.4 Voice and tone

Examples:

Instead of:

> امروز تمرین نکردی.

Use:

> بیا با هم فقط پنج کارت مرور کنیم.

Instead of:

> زنجیره‌ات در حال نابودی است.

Use:

> یک مرور کوتاه می‌تواند زنجیره‌ات را حفظ کند.

After absence:

> خوش اومدی. از همان جایی ادامه می‌دهیم که متوقف شدی.

After error:

> اشکالی ندارد؛ همین اشتباه کمک می‌کند بهتر یادت بماند.

## 13.5 Bobo states

Create identifiers such as:

- `bobo.neutral`
- `bobo.welcome`
- `bobo.happy`
- `bobo.celebrating`
- `bobo.thinking`
- `bobo.encouraging`
- `bobo.listening`
- `bobo.reading`
- `bobo.sleepy`
- `bobo.focused`
- `bobo.confused`
- `bobo.proud`
- `bobo.gentle_error`
- `bobo.streak`
- `bobo.level_up`
- `bobo.subscription`
- `bobo.empty_state`
- `bobo.offline`
- `bobo.notification`

## 13.6 Bobo Design System subproject

Create:

```text
packages/bobo-design-system/
├── README.md
├── CHANGELOG.md
├── BOBO_BRAND_BIBLE.md
├── BOBO_CHARACTER_SPEC.md
├── BOBO_PERSONALITY.md
├── BOBO_VOICE_AND_TONE.md
├── BOBO_MOTION_GUIDE.md
├── BOBO_UI_USAGE.md
├── BOBO_ASSET_GUIDE.md
├── BOBO_AI_GENERATION_RULES.md
├── BOBO_ACCESSIBILITY.md
├── BOBO_VERSIONING.md
├── assets/
├── animations/
├── components/
├── tokens/
├── prompts/
└── tests/
```

The Bobo Design System must be versioned independently.

Initial roadmap:

- v0.1: specification and canonical references;
- v0.2: expressions and poses;
- v0.3: motion primitives;
- v0.4: Flutter and web components;
- v1.0: stable cross-platform system.

## 13.7 Website motion

Bobo should be animated on the public website in a performance-aware way.

Use:

- Rive for interactive state-based character animation;
- Lottie for short non-interactive success animations;
- CSS or a light motion library for simple transitions.

Possible hero behavior:

- breathe softly;
- blink;
- look toward a card;
- flip a LearnBox card;
- react subtly to scrolling;
- point to a feature.

Requirements:

- lazy-load;
- static fallback;
- `prefers-reduced-motion`;
- no autoplay sound;
- pause when offscreen;
- performance budget;
- no dependency of core navigation on animation.

---

# 14. Artificial intelligence

AI is present from the first version, but the product must remain usable without live AI.

## 14.1 AI behind the scenes

Use AI for:

- word extraction;
- translation drafting;
- CEFR classification;
- German definition;
- example generation;
- grammar metadata;
- article and plural validation;
- conjugation drafting;
- common collocations;
- Persian learner mistakes;
- image prompts;
- image generation;
- pronunciation generation;
- duplicate detection;
- anomaly detection;
- content review support;
- personalized report generation.

## 14.2 AI in the product

Optional online features may include:

- simpler explanation;
- more examples;
- difference between two words;
- contextual example for job or university;
- mnemonic;
- personalized recommendations.

Core cards, images, audio, and daily scheduling must be precomputed or cached.

## 14.3 AI reliability rules

No AI-generated content may automatically become trusted production content without validation.

Use:

- deterministic schema validation;
- multiple-model or multi-pass checks where valuable;
- dictionary/reference checks;
- confidence scores;
- duplicate checks;
- grammar rules;
- human-review queue for low-confidence or high-impact items;
- rollback;
- content versioning;
- user reporting.

## 14.4 Content status

Use:

- draft;
- ai_generated;
- auto_validated;
- needs_review;
- approved;
- published;
- deprecated.

---

# 15. Content model

A vocabulary entry should support:

```text
id
lemma
normalized_lemma
article
part_of_speech
plural
translations_fa
definition_de_simple
cefr_level
ipa
pronunciation_audio
example_sentences
example_translations
sentence_audio
grammar_notes
cases
prepositions
verb_conjugations
separable_prefix
synonyms
antonyms
collocations
common_mistakes_fa
image_assets
topic_tags
migration_tags
exam_tags
source_metadata
confidence_score
content_version
review_status
created_at
updated_at
published_at
```

Use normalized relational structures where appropriate rather than one oversized table.

## 15.1 Content packs

Initial packs:

- A1 essentials;
- A1 migration basics;
- A1 daily conversation;
- A2 daily life;
- A2 work migration;
- A2 academic migration;
- articles;
- separable verbs;
- irregular verbs;
- housing;
- transportation;
- shopping;
- healthcare;
- banking;
- government and appointments;
- workplace;
- university.

Do not copy protected textbook content. Create original selection, ordering, examples, explanations, and visuals.

---

# 16. Monetization

Use a hybrid model:

- free core;
- subscriptions;
- additional one-time content packs;
- possible launch lifetime plan;
- direct PWA purchase where legally and operationally appropriate.

## 16.1 Free tier

Possible initial limits:

- complete starter pack;
- limited new cards per day;
- unlimited due reviews;
- basic statistics;
- personal words with a reasonable limit;
- selected audio and images.

Do not make the free tier useless.

## 16.2 Subscription

Premium may unlock:

- all standard packs;
- advanced reports;
- listening and spelling modes;
- expanded personal vocabulary;
- cloud sync;
- AI-assisted explanations;
- specialized migration content;
- premium Bobo themes;
- multi-device experience.

## 16.3 One-time purchases

Sell optional packs separately, even for subscribers if the business model later supports premium specialist packs.

Examples:

- German for nurses;
- German for software professionals;
- German for university;
- embassy and administration;
- driving and transport;
- specific exam packs;
- industry vocabulary.

Clearly define ownership, restore behavior, and subscription overlap.

## 16.4 Pricing

Do not hardcode final prices in the repository.

Create pricing configuration and market testing support.

Previous working hypotheses may be stored as non-authoritative research notes:

- monthly: 199,000 toman;
- three-month: 449,000 toman;
- annual: 1,190,000 toman;
- limited lifetime campaign: 2,490,000 toman.

Codex must verify current Cafe Bazaar policies, fees, allowed product types, subscription behavior, and official payment SDK documentation immediately before implementation.

## 16.5 Billing architecture

Create a billing abstraction with providers:

- Cafe Bazaar;
- direct web gateway;
- future Google Play;
- future Apple App Store.

Requirements:

- server-side purchase verification;
- idempotency;
- webhook/event processing where available;
- purchase restore;
- subscription entitlement service;
- audit trail;
- refund/revocation handling;
- fraud controls;
- separation of product catalog from provider IDs;
- sandbox and production separation.

---

# 17. Notifications

Support local and server-driven notifications.

Categories:

- daily review;
- at-risk words;
- short-session suggestion;
- weekly report;
- achievement;
- content pack;
- subscription event;
- return after absence.

Rules:

- ask notification permission at a contextually appropriate time, not immediately on first launch;
- explain the benefit before the operating-system prompt;
- quiet hours;
- per-category settings;
- frequency caps;
- behavior-based reduction;
- no manipulative language;
- deep-link to the relevant screen;
- track delivery and open rates without collecting unnecessary data.

---

# 18. Permissions and marketplace compliance

Follow least privilege.

Create `docs/compliance/PERMISSION_REGISTER.md`.

For every permission record:

- platform;
- technical permission name;
- feature requiring it;
- user benefit;
- whether optional;
- when requested;
- fallback if denied;
- data collected;
- storage duration;
- marketplace justification;
- privacy-policy section;
- test evidence.

Expected initial permissions should be minimal.

Potential needs:

- notifications;
- network access;
- optional media/file picker only when user explicitly uploads an image;
- optional microphone only if a future pronunciation-recording feature is activated.

Avoid unless absolutely necessary:

- contacts;
- call logs;
- SMS reading;
- background location;
- precise location;
- broad storage;
- accessibility service;
- installed-app list;
- persistent microphone;
- device identifiers beyond legitimate analytics/security needs.

Codex must verify current Cafe Bazaar, Android, Google Play, and Apple privacy requirements before each submission.

---

# 19. Privacy and security

## 19.1 Data minimization

Collect only data required for learning, account operation, billing, analytics, support, and security.

## 19.2 Required controls

- TLS;
- encryption at rest where supported;
- hashed or encrypted sensitive identifiers;
- secure secrets management;
- role-based admin access;
- audit logs;
- input validation;
- rate limiting;
- anti-automation controls;
- dependency scanning;
- SAST;
- secure headers;
- CSRF protection where applicable;
- token rotation;
- session revocation;
- backup and restore tests;
- data export and deletion workflow;
- incident-response plan.

## 19.3 Admin security

- MFA;
- least privilege;
- separate production access;
- audit every sensitive action;
- no direct casual production database access;
- approval workflow for bulk content publish or destructive operations.

## 19.4 Child safety

The initial target is not specifically children. Do not market as a children’s product without a separate legal, privacy, and design review.

---

# 20. Scale and reliability

The architecture must support growth toward 500,000 installs and potentially 1,000,000 installs.

Do not equate installs with concurrent users. Track:

- registered users;
- MAU;
- DAU;
- peak concurrent sessions;
- reviews per day;
- media bandwidth;
- notification volume;
- billing events;
- AI jobs.

## 20.1 Architectural strategy

Begin with a modular monolith and clear module boundaries.

Avoid premature microservices.

Separate later when justified:

- notification service;
- AI content pipeline;
- analytics;
- media generation;
- billing;
- search.

## 20.2 Offline-first

Use a local database in the app.

Store:

- user profile subset;
- due cards;
- active packs;
- review queue;
- recent media metadata;
- unsynced review events;
- personal cards;
- settings;
- remote configuration snapshot.

Sync rules:

- idempotent event upload;
- conflict strategy;
- retry with backoff;
- observable sync status;
- no lost study progress;
- server reconciliation;
- clock-skew handling.

## 20.3 Performance targets

Define and monitor practical budgets for:

- cold start;
- screen transition;
- card flip;
- local review submission;
- sync;
- image load;
- audio start;
- crash-free sessions;
- ANR rate;
- website Core Web Vitals.

Set exact targets after baseline profiling, then record them in `PERFORMANCE_BUDGETS.md`.

---

# 21. Technical architecture

Codex should validate current stable versions before setup.

Recommended baseline:

## 21.1 Mobile and PWA

- Flutter;
- a state-management approach selected by Codex based on maintainability;
- local database;
- repository pattern;
- typed networking;
- background sync where platform policy allows;
- Firebase-compatible or provider-abstracted crash and push infrastructure;
- feature flags;
- RTL-first UI;
- Persian localization infrastructure.

Use one Flutter codebase where practical, but allow platform-specific adaptations.

## 21.2 Public website

- Next.js;
- server-rendered SEO pages;
- app landing pages;
- blog;
- dictionary pages later;
- download and pricing;
- legal pages;
- Bobo motion components;
- analytics and consent handling.

## 21.3 Admin

Use a secure web admin application, likely Next.js, sharing appropriate design tokens but not exposing internal APIs.

## 21.4 Backend

Recommended:

- NestJS;
- PostgreSQL;
- Redis;
- object storage;
- background jobs;
- message queue when required;
- REST or typed API;
- OpenAPI;
- structured logging;
- observability;
- migrations;
- seed system;
- feature flags;
- remote config.

Codex may choose an alternative only if it documents a clear operational advantage and preserves the product requirements.

## 21.5 Infrastructure

Design provider-neutral infrastructure where practical.

Initial deployment may use managed services to reduce operational burden.

Separate:

- local;
- development;
- staging;
- production.

Infrastructure as code is required before production.

---

# 22. Repository structure

Create a private monorepo named:

`learnbox`

Suggested structure:

```text
learnbox/
├── apps/
│   ├── mobile/
│   ├── website/
│   ├── admin/
│   └── api/
├── packages/
│   ├── design-system/
│   ├── bobo-design-system/
│   ├── learning-engine/
│   ├── content-models/
│   ├── billing-core/
│   ├── analytics-core/
│   ├── shared/
│   └── test-utils/
├── services/
│   ├── content-pipeline/
│   ├── media-worker/
│   └── notification-worker/
├── infrastructure/
├── database/
├── content/
├── brand/
├── docs/
├── scripts/
├── tests/
├── .github/
├── AGENTS.md
├── README.md
├── PRODUCT.md
├── ARCHITECTURE.md
├── ROADMAP.md
├── SECURITY.md
├── CONTRIBUTING.md
└── CHANGELOG.md
```

Codex may adjust names after creating an ADR.

---

# 23. Required documentation

Create and maintain:

```text
docs/
├── product/
│   ├── PRD.md
│   ├── PERSONAS.md
│   ├── USER_JOURNEYS.md
│   ├── FEATURE_CATALOG.md
│   ├── MONETIZATION.md
│   └── METRICS.md
├── design/
│   ├── DESIGN_PRINCIPLES.md
│   ├── INFORMATION_ARCHITECTURE.md
│   ├── USER_FLOWS.md
│   ├── DESIGN_TOKENS.md
│   ├── MOTION.md
│   ├── SOUND.md
│   └── ACCESSIBILITY.md
├── learning/
│   ├── LEARNING_MODEL.md
│   ├── SCHEDULING_ENGINE.md
│   ├── REVIEW_GRADES.md
│   └── CONTENT_PEDAGOGY.md
├── architecture/
│   ├── SYSTEM_CONTEXT.md
│   ├── DATA_MODEL.md
│   ├── API.md
│   ├── OFFLINE_SYNC.md
│   ├── SCALING.md
│   ├── OBSERVABILITY.md
│   └── ADR/
├── content/
│   ├── CONTENT_SCHEMA.md
│   ├── AI_PIPELINE.md
│   ├── QUALITY_RULES.md
│   └── COPYRIGHT_POLICY.md
├── compliance/
│   ├── PERMISSION_REGISTER.md
│   ├── PRIVACY_DATA_MAP.md
│   ├── RETENTION_POLICY.md
│   ├── MARKETPLACE_CHECKLIST.md
│   └── INCIDENT_RESPONSE.md
├── operations/
│   ├── ENVIRONMENTS.md
│   ├── RELEASES.md
│   ├── BACKUP_RESTORE.md
│   ├── RUNBOOK.md
│   └── OWNER_ACTIONS.md
└── storyboard/
    ├── MASTER_PROJECT_STORYBOARD.md
    └── STATUS.md
```

---

# 24. Master project storyboard

The owner wants one large numbered storyboard that explains the entire journey visually.

Codex must create a source-backed storyboard artifact after initial setup.

It should contain numbered stages and be available as:

- editable source;
- high-resolution PNG;
- print-ready PDF;
- web-friendly image;
- status-highlighted version.

Recommended stages:

1. Product foundation
2. Market and user understanding
3. Learning model
4. Information architecture
5. Brand and Bobo system
6. UI design direction
7. Clickable prototype
8. Technical foundation
9. Authentication and onboarding
10. Core review engine
11. Cards, images, and audio
12. Personal vocabulary
13. Gamification
14. Progress analytics
15. Offline sync
16. AI content pipeline
17. Admin panel
18. Notifications
19. Billing and products
20. PWA and website
21. Security and compliance
22. Automated testing
23. Closed alpha
24. Beta and load testing
25. Cafe Bazaar submission
26. Public v1.0
27. Continuous improvement
28. Google Play preparation
29. iOS preparation
30. Growth and content expansion

Maintain `docs/storyboard/STATUS.md` with:

- current stage;
- completed stages;
- next stage;
- blockers;
- owner action if any;
- last updated date.

When communicating with the owner, Codex should say:

> اکنون در مرحله ۱۰ از ۳۰ هستیم: موتور مرور و جلسه یادگیری.

Do not require the owner to interpret technical task boards.

---

# 25. Design system

## 25.1 Design direction

The product should feel:

- modern;
- warm;
- intelligent;
- calm;
- trustworthy;
- lightly playful;
- not childish;
- not visually noisy.

## 25.2 Visual language

- rounded cards;
- controlled depth;
- generous spacing;
- highly legible Persian;
- clear German typography;
- consistent article colors;
- soft three-dimensional visual assets;
- smooth but short motion;
- polished charts;
- strong light mode;
- dark mode can follow after core validation if not included immediately.

## 25.3 Accessibility

Support:

- RTL;
- dynamic text scaling;
- screen reader labels;
- color contrast;
- reduced motion;
- captions/transcripts where needed;
- non-color status cues;
- touch target sizes;
- keyboard navigation for web;
- semantic HTML;
- accessible charts with text summaries.

---

# 26. Product metrics

Create analytics with privacy-aware events.

Primary product metrics:

- onboarding completion;
- first review completion;
- day-1 retention;
- day-7 retention;
- day-30 retention;
- daily session completion;
- review accuracy;
- review backlog;
- weekly active learners;
- words stabilized;
- personal words added;
- notification opt-in;
- crash-free sessions;
- subscription conversion;
- pack conversion;
- churn;
- restore success;
- content report rate.

North-star candidate:

> Weekly active learners who complete meaningful spaced-repetition sessions on at least three days.

Do not finalize the north-star metric until instrumentation and early user testing.

---

# 27. Admin panel

Required modules:

## 27.1 Users

- search;
- profile;
- learning goal;
- level;
- recent activity;
- devices;
- subscription;
- purchases;
- streak;
- review state;
- support notes;
- account suspension;
- export/delete workflow.

## 27.2 Content

- word editor;
- bulk import;
- AI generation;
- validation status;
- version history;
- image/audio generation;
- pack editor;
- publishing;
- rollback;
- user reports;
- duplicate detection.

## 27.3 Billing

- provider products;
- entitlements;
- purchases;
- subscription status;
- refunds/revocations;
- coupons;
- campaigns;
- revenue reporting.

## 27.4 Product operations

- feature flags;
- remote configuration;
- daily limits;
- XP rules;
- notification campaigns;
- A/B tests;
- staged rollout.

## 27.5 Audit

All sensitive admin actions must be logged.

---

# 28. Testing strategy

Codex must not consider a feature complete without appropriate tests.

Required layers:

- unit tests;
- learning-engine property tests;
- API integration tests;
- database migration tests;
- widget/component tests;
- visual regression tests;
- end-to-end tests;
- offline/sync tests;
- billing sandbox tests;
- security tests;
- accessibility checks;
- performance tests;
- load tests;
- content validation tests.

Create representative low-end Android test profiles.

Test Persian RTL thoroughly.

Use synthetic data only in automated tests.

---

# 29. Continuous integration and delivery

Set up GitHub Actions for:

- formatting;
- lint;
- type checks;
- unit tests;
- integration tests;
- build verification;
- dependency scan;
- secret scan;
- migration validation;
- artifact generation;
- preview environments where practical.

Branch strategy:

- protected `main`;
- feature branches;
- pull requests;
- required checks;
- conventional commits or another documented standard;
- changelog;
- tagged releases.

Codex may open and merge its own PRs for reversible work after checks pass, unless repository permissions require owner intervention.

Production deployment must require explicit approval.

---

# 30. Release strategy

## 30.1 Version 0.1 — Foundation

- repository;
- environments;
- design tokens;
- Bobo system skeleton;
- registration;
- onboarding;
- Today shell;
- initial admin;
- initial learning engine;
- 300–500 validated A1 words.

## 30.2 Version 0.2 — Learning loop

- card flip;
- images;
- pronunciation;
- examples;
- response grades;
- offline local queue;
- daily statistics.

## 30.3 Version 0.3 — Motivation

- XP;
- levels;
- streak;
- missions;
- sound;
- haptics;
- charts;
- notifications.

## 30.4 Version 0.4 — AI assistance

- AI-assisted explanations;
- examples;
- comparisons;
- personalized report;
- content pipeline expansion.

## 30.5 Version 0.5 — Monetization

- Cafe Bazaar billing;
- direct PWA billing;
- subscriptions;
- one-time packs;
- restore;
- coupons.

## 30.6 Version 0.6 — Beta

- full A1;
- selected A2;
- load tests;
- security review;
- crash reporting;
- analytics;
- closed beta.

## 30.7 Version 1.0

Stable public Cafe Bazaar release.

Version 1.0 is the first stable public release, not the end of development.

---

# 31. Codex virtual team roles

Codex must explicitly cover these roles during execution:

- Product Manager
- Product Designer
- UX Researcher
- UI Designer
- Frontend Visual Designer
- Flutter UI Developer
- Flutter Application Developer
- Web Frontend Developer
- Backend Engineer
- Software Architect
- Database Engineer
- Offline Sync Engineer
- Learning Science Designer
- SRS Algorithm Engineer
- AI Content Engineer
- German Content Architect
- Persian Localization Editor
- Content QA Reviewer
- Brand Designer
- Bobo Design System Maintainer
- Motion Designer
- Rive/Lottie Engineer
- Sound Designer
- Data Analyst
- Analytics Engineer
- QA Engineer
- Accessibility Reviewer
- Security Engineer
- DevOps/SRE Engineer
- Billing Engineer
- Marketplace Release Manager
- Technical Writer

Codex should switch roles internally without asking the owner.

---

# 32. Decision policy

## Codex decides independently

- frameworks and libraries within the approved architecture;
- naming conventions;
- folder details;
- test frameworks;
- state management;
- caching implementation;
- database indexing;
- code style;
- internal APIs;
- refactoring;
- CI details;
- reversible UI implementation details;
- ordinary dependency updates;
- feature-flag defaults in non-production.

## Owner approval required

- public brand name finalization;
- domain purchase;
- paid service purchase;
- production infrastructure budget;
- legal text acceptance;
- marketplace agreements;
- production credentials;
- final public pricing;
- public release;
- destructive production action;
- user-data deletion outside approved workflows;
- major change to Bobo’s canonical appearance;
- public marketing claims;
- collecting a new sensitive permission or data category.

---

# 33. Owner action protocol

Create `docs/operations/OWNER_ACTIONS.md`.

Whenever owner action is unavoidable, use this format:

```markdown
## اقدام لازم از بهرام

### چرا لازم است؟

یک جمله ساده.

### کاری که انجام می‌دهی

1. ...
2. ...
3. ...

### متن آماده برای کپی

...

### نتیجه‌ای که برای من می‌فرستی

یک اسکرین‌شات یا مقدار مشخص.

### اگر خطا دیدی

دقیقاً چه چیزی را بفرست.
```

Do not provide command-line instructions unless no graphical path exists.

If command-line action is unavoidable:

- provide one command at a time;
- explain where to paste it;
- explain the expected output;
- wait for the result before giving the next risky command.

---

# 34. First-run setup instruction for Codex

Upon receiving this document, Codex must begin execution without asking for routine confirmation.

Perform the following:

1. Create a local folder named `learnbox`.
2. Initialize Git.
3. Create a private GitHub repository named `learnbox` using the connected account.
4. Use `main` as the default branch.
5. Add this document at:
   - `docs/product/MASTER_SPEC.md`
6. Create `AGENTS.md` that summarizes execution rules from this document.
7. Create the monorepo structure.
8. Initialize documentation.
9. Create the ADR system.
10. Create the master storyboard source and status document.
11. Initialize Bobo Design System.
12. Initialize shared design tokens.
13. Create environment templates without secrets.
14. Set up local development containers or equivalent reproducible tooling.
15. Initialize backend, mobile, website, and admin shells.
16. Set up database migrations.
17. Set up CI.
18. Set up lint, formatting, tests, security scanning, and secret scanning.
19. Add issue templates and pull-request template.
20. Create a milestone-based roadmap.
21. Create an initial project board if supported.
22. Commit the foundation.
23. Push to the private GitHub repository.
24. Verify that the repository is private.
25. Run all checks.
26. Fix any failures.
27. Produce a concise Persian progress report for the owner.
28. Ask the owner only for credentials or account actions that are immediately unavoidable.

If GitHub authentication or account authorization is missing, prepare everything locally first, then give the owner exact steps for the smallest required action.

---

# 35. Initial deliverables before feature coding

Before deep implementation, Codex must deliver:

1. repository and CI;
2. architecture overview;
3. database draft;
4. authentication flow;
5. learning engine specification;
6. content schema;
7. initial design direction;
8. three key UI concepts:
   - Today;
   - Card front/back;
   - Progress report;
9. onboarding flow;
10. Bobo canonical asset registry;
11. storyboard;
12. v0.1 implementation plan;
13. risk register;
14. permission register;
15. owner action list.

These are working artifacts, not reasons to delay implementation. Build the foundation in parallel where safe.

---

# 36. Initial risks

Track at least:

- AI-generated linguistic errors;
- inconsistent Bobo imagery;
- poor OTP deliverability;
- excessive review backlog;
- slow media delivery;
- app size;
- low-end Android performance;
- offline sync conflicts;
- billing verification bugs;
- marketplace permission rejection;
- content copyright risk;
- notification fatigue;
- overcomplicated cards;
- gamification distracting from learning;
- infrastructure cost;
- admin account compromise;
- analytics privacy;
- PWA limitations on iOS;
- payment-provider dependency.

Every risk must have an owner, mitigation, signal, and contingency.

---

# 37. Definition of done

A feature is complete only when:

- acceptance criteria are met;
- tests pass;
- Persian RTL is reviewed;
- accessibility is considered;
- analytics are defined;
- error states exist;
- offline behavior is defined;
- loading and empty states exist;
- permissions are documented;
- security implications are reviewed;
- documentation is updated;
- feature flag exists where useful;
- rollback is possible;
- visual QA passes;
- owner-facing behavior is understandable.

---

# 38. Final execution directive

Codex is expected to act as the primary autonomous implementation team for LearnBox.

Do not repeatedly ask what to do next.

Use this specification, create a prioritized plan, execute the highest-value unblocked work, test it, document it, and continue.

When uncertain:

1. prefer the simpler architecture;
2. prefer reversibility;
3. prefer privacy;
4. prefer offline resilience;
5. prefer measurable learning value;
6. prefer consistency with Bobo and the LearnBox design system;
7. record the decision;
8. continue.

Only stop for the owner when a human-only action is truly required.

At every owner update, report:

- current storyboard stage;
- what was completed;
- what is next;
- whether owner action is required.

The first owner-facing message after setup should be concise and in Persian.
