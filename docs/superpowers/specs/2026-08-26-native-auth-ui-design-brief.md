# LearnBox Native Auth UI Design Brief

**Status:** design-only proposal; no UI implementation or composition authorization
**Reference surface:** existing web `AuthGate` and LearnBox mobile theme
**Primary surface archetype:** **Configure** — a short, trust-building two-step form, not a marketing hero

## Objective

Create a Persian-first native authentication flow that feels like the existing LearnBox web app while respecting native ergonomics. The flow must be calm, direct, accessible, and explicit about what is happening. It must remain unreachable in ordinary default-disabled builds until a separately approved composition task.

## Locked visual language from the web app

- Font: `IRANSansX LearnBox`; use the bundled mobile font and the existing `buildLearnBoxTheme()`.
- Canvas: warm `#FFFAF4`; surfaces white; ink `#1E293B`; muted `#64748B`.
- Primary action: `#4D6BFE`; lavender support surface `#F3ECFF`; apricot only as a small accent, never as an error or primary action.
- Radius rhythm: 18dp controls, 20dp cards, 28dp outer feature surface where a card is needed.
- RTL is the default. German examples, phone numbers, and OTP are isolated with `TextDirection.ltr`/`Bidi` semantics.
- Bobo may be used as one purposeful reassurance illustration; do not turn the form into a decorative card grid.

## Flow and states

### 1. Phone entry

- Brand mark/name at the top with generous but compact safe-area spacing.
- Heading equivalent to web: `به LearnBox خوش آمدی`.
- One short explanation: `برای ادامه، شمارهٔ موبایل خودت را وارد کن.`
- Phone field uses a clear `+98` prefix and numeric keyboard; preserve the web app's visual grouping.
- Primary action: `ارسال کد ورود`.
- Supporting privacy copy remains visible but quiet: the number is used only for this sign-in attempt.
- Validation is inline, specific, Persian, and announced to screen readers.

### 2. OTP entry

- Back/change-number action is visually secondary and at least 44dp tall.
- Heading equivalent to web: `کد پیامک‌شده را وارد کن`.
- Masked phone number uses LTR semantics.
- One five-digit OTP field with one-time-code autofill, Persian digit normalization, visible focus, and no logging.
- Primary action: `تأیید کد`.
- Resend is secondary, disabled during cooldown, and exposes the remaining time in Persian digits.
- Never reveal token/session material or raw server response to the learner.

### Required states

- initial, focused, valid, invalid phone, requesting, code entry, invalid code, expired challenge, rate limited, offline/timeout, generic server unavailable, verified, and back/change-number.
- Loading must preserve layout to avoid jumps; controls become unavailable without losing entered phone state.
- Errors must be recoverable and must not shame the learner.

## Responsive composition

- Phone portrait is primary: content width is full minus 20–24dp horizontal padding.
- Compact-height devices prioritize heading, field, primary action, and privacy copy; illustration is optional and may disappear.
- Large devices cap content width around 440dp and keep the visual center of gravity above the fold.
- Keyboard appearance must not hide the focused field or primary action; use scroll-safe layout.
- Do not add bottom navigation or review content to the auth surface.

## Accessibility and interaction quality

- Every control has a semantic Persian label and a minimum 44dp hit area.
- Maintain WCAG-friendly contrast for ink, muted text, links, errors, and button states.
- `Semantics` must describe loading, cooldown, errors, and success without reading secrets.
- Focus order follows RTL reading order and the task sequence.
- Support reduced motion; animation is optional and never blocks the action.
- Do not rely on color alone for invalid, loading, or success states.

## Explicit non-goals

This brief does not authorize `main.dart` composition, enabling auth flags, endpoint or provider activation, real OTP delivery, Preview deployment, Production, background work, analytics, review-sync, or changes to the existing review flow.

## Acceptance criteria for a later implementation task

1. Screenshot review at 320dp, 360dp, 412dp widths and compact height.
2. Widget tests cover every required state and semantic labels.
3. Existing web copy and token values remain aligned unless a deliberate copy/design decision is documented.
4. No new dependency, permission, network call, provider, secret, or background lifecycle is introduced by UI alone.
5. Default builds remain signed-out and show the existing launch/review composition.
6. A product/design review explicitly approves the final visual direction before composition work begins.
