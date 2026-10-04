# PDR-009 — Admin UI design freeze and Bobo variant policy

- **Status:** approved
- **Date:** 2026-10-04
- **Supersedes:** the restrictive "one immutable Bobo PNG" reading of PDR-003 / `BOBO_SYSTEM.md`

## Context

The Admin UI visual prototype (`prototypes/admin-ui-v1`, 12 screens, Persian-first RTL) was built
from the owner-approved reference concept and reviewed by the product owner. Two questions were
left open in the prototype's `DEVIATIONS.md`: whether new Bobo variants may be created, and
whether the first sidebar item should be renamed. Both are now decided.

## Decision

### 1. Bobo variants are allowed; Bobo's identity is not

The invariant is Bobo's **character identity**, not one immutable asset file.

**Must stay constant:** face, recognizable facial characteristics, core proportions, overall
character identity. Bobo must not be redesigned into a different character.

**Allowed to vary:** clothing (including seasonal and event-specific), poses, gestures,
expressions and behavioural states, contextual scenes, activity states, motion/animation, and
UI-specific mascot compositions.

Representative contexts: Nowruz, Yalda, Christmas, autumn/winter/summer, learning, celebrating,
waiting, success, empty state, error state, AI/content generation, Store/promotional.

Existing canonical assets are reused whenever they already satisfy the design need. A new variant
is created only when an existing asset does not. Any new Bobo asset intended to ship must preserve
the identity invariant and be stored and versioned as an official LearnBox asset.

### 2. Sidebar first item stays «خانه / نمای کلی»

Approved as-is. It is not renamed to «داشبورد».

### 3. Admin UI prototype is APPROVED / DESIGN FROZEN

`prototypes/admin-ui-v1` is the approved LearnBox Admin UI/UX direction. Future Admin
implementation derives from it rather than independently redesigning the Admin.

Design may change only for a real usability problem, an implementation constraint, or an explicit
product-owner decision. Speculative redesign and additional visual exploration are out of scope.

## Rationale

A mascot that can only ever appear in one pose and one outfit cannot carry seasonal, emotional or
state-specific UI moments, and the product needs those. Identity — not file immutability — is what
protects a coherent public character. Freezing the Admin direction stops repeated redesign cycles
and lets implementation start from a settled visual system.

## Affected systems

Admin UI implementation, Bobo asset pipeline and governance, design documentation, content and
media QA, any future seasonal or state-specific mascot work.

## Consequences and implementation notes

- `BOBO_SYSTEM.md` asset governance is updated: derived variants are explicit and permitted; the
  identity invariant and the anti-rabbit silhouette rule remain.
- The current Admin prototype is **not** modified by this decision. It continues to use the
  already-selected official Bobo asset (`welcome-v2.png`). No redesign was performed.
- `DEVIATIONS.md` items 1 and 6 in the prototype are resolved by this record; the prototype file
  itself is left byte-identical so the exported review artifact stays valid.
- This record does not authorize starting the Admin implementation or Phase 1, and changes nothing
  in Production.

## Reversibility

The freeze is a product-owner decision and can be lifted by the product owner. The Bobo identity
invariant is deliberately harder to reverse: changing Bobo's face, proportions or character
identity still requires explicit owner approval, exactly as before.
