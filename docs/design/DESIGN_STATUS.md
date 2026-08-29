# LearnBox UI and graphic design status

**Last reviewed:** 2026-08-29
**Decision:** the product has a credible visual direction and several reviewed concept screens, but it does not yet have a complete production design system for every product surface. Coding must not treat the concept board as a blanket approval for every future screen.

## What is ready to show

These reviewed concept references are available in `docs/design/concepts/`:

- `today-concept.png` — Today dashboard and daily review CTA.
- `words-screen-concept.png` — personal/start vocabulary list.
- `progress-screen-concept.png` — weekly progress and continuation CTA.
- `onboarding-goal-concept.png` — learner goal selection.
- `card-concept.png` — vocabulary card direction.
- `auth-phone-concept-v1.png` — phone authentication direction.
- `admin-content-review-concept-v1.png` — Admin content review direction.
- `bobo-expression-review-v2.png` — approved Bobo expression reference.

They are design references and review artifacts, not proof that the corresponding production flow is complete.

## Visual direction currently established

- Persian-first RTL with German terms and technical strings isolated as LTR.
- Warm off-white canvas, white surfaces, deep navy ink, blue primary action, apricot secondary accent and restrained lavender support color.
- IRANSansX family for Persian and product UI, with accessible contrast and clear numeric hierarchy.
- Rounded but controlled surfaces, low decoration, generous touch targets and calm learning-focused hierarchy.
- Bobo is a supporting character, not a substitute for information hierarchy; canonical assets must not be altered without owner approval.
- Motion is short and purposeful; reduced-motion behavior is required.

The mobile theme currently encodes the core tokens in `apps/mobile/lib/ui/learnbox_theme.dart`, and the Web learner implementation has a corresponding reviewed visual QA record in `docs/design/UI_QA.md`.

## Readiness matrix

| Surface                    | Visual direction                             | Code evidence                                  | Product-readiness | Next design work                                                              |
| -------------------------- | -------------------------------------------- | ---------------------------------------------- | ----------------- | ----------------------------------------------------------------------------- |
| Splash / launch            | Ready direction                              | Implemented launch shell and asset seam        | Partial           | Final asset states, loading/reconnect behavior, accessibility                 |
| Onboarding                 | Reviewed concept + implemented flow          | Web and mobile foundations exist               | Partial           | Final logo/Bobo decision, validation/error states, analytics copy             |
| Today                      | Reviewed concept + implemented base          | Today screen and primary CTA exist             | Partial           | Server-backed counts, premium discovery, offline/sync states                  |
| Review card                | Reviewed concept + implemented learning loop | Flip, pronunciation, grading, completion exist | Partial           | Full card system, richer media states, QA across devices                      |
| Words                      | Reviewed concept + implemented base          | List/search foundation exists                  | Partial           | Filters, canonical/personal distinction, loading/empty/error polish           |
| Progress                   | Reviewed concept + local implementation      | Device-local progress is tested                | Not release-ready | Server-backed history, streak rules, empty/loading/error, truthful chart data |
| Profile / Settings         | Direction only                               | No complete product surface                    | Not implemented   | Full design and interaction spec before implementation                        |
| Store / Pack detail        | Direction only                               | Commerce foundation only                       | Not implemented   | Catalog, comparison, checkout, receipt/error/refund states                    |
| Purchases / My Packs       | Direction only                               | Entitlement foundation only                    | Not implemented   | Entitlement, restore, revoke, support states                                  |
| Admin Content Factory      | Concept reference exists                     | Foundation and review seams exist              | Partial           | Complete workflow board, job states, batch review, release controls           |
| Responsive / accessibility | Principles established                       | Important tests exist                          | Partial           | Cross-surface audit, screen reader/keyboard and device matrix                 |

## Design milestone added to delivery

Design is a first-class workstream in M0/M1 and must not be improvised during implementation:

1. **D0 — Consolidate visual language:** approve the token set, typography, Bobo/brand usage, icon rules and responsive grid. Contract draft: [`D0_VISUAL_LANGUAGE.md`](./D0_VISUAL_LANGUAGE.md) (ready for review).
2. **D1 — Complete learner UI kit:** finalize Splash, Onboarding, Today, Review, Words, Progress, Profile and Settings, including loading, empty, error, offline and sync states. State board: [`D1_LEARNER_UI_KIT.md`](./D1_LEARNER_UI_KIT.md) (draft, ready for review).
3. **D2 — Complete commerce/admin surfaces:** finalize Store, Pack detail, offer comparison, checkout result, Purchases, My Packs and Admin Content Factory/review.
4. **D3 — Visual verification:** review mobile screenshots at target sizes, Web responsive states, RTL/LTR, accessibility, reduced motion and implementation parity.

A surface can move to production implementation only when its design state, copy state, accessibility states and acceptance criteria are recorded.

## Honest conclusion

LearnBox does not start from zero visually. It has a strong, coherent visual direction and enough reviewed concepts to continue product design. It is not yet correct to call the entire application graphically production-ready because Profile, Settings, Store, Purchases, full sync states and Admin commerce/content surfaces still need designed and reviewed states.
