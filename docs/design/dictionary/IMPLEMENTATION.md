# German–Persian dictionary — design = implementation map

Locked visual reference (owner, 2026-11-04): `index.html` — open it directly; `?tour` plays the guided
demo, `#word` opens the word page. Storage and serving boundary: [ADR 0017](../../architecture/ADR/0017-public-dictionary-read-only-release-file.md).
Acceptance: every built page is compared against `shots/`; graphics, motion and layout must match.
Target: `apps/learnbox-website` (Next.js, summer theme). The prototype deliberately uses
the site's real tokens/fonts/assets so it ports 1:1 — no restyling at build time.

## Tokens (already in the site)

- `--ink #17233d`, `--muted`, `--purple #6c3ad6`, `--purple-deep`, `--sun #ffd36a`, `--paper`, `--leaf`
- Motion: `--arrive cubic-bezier(.16,1,.3,1)`, `--spring cubic-bezier(.34,1.56,.64,1)` (= `src/themes/summer` motion)
- Fonts: IRANSansX LB (Persian), Latin system sans for German (`.de`, `dir=ltr`, `unicode-bidi: isolate`)
- New, shared with learner app: `--der #3b82f6`, `--die #ec4899`, `--das #22c55e` (same article colours as the app)

## Routes → components

| Route                                                 | Component                                                                                                                 | Prototype selector                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `/dictionary`                                         | `DictionaryHero` (Berlin sky + floating type sorts, parallax)                                                             | `#hero`, `.sort`                        |
|                                                       | `DictionarySearch` (client; debounced landing route `/dictionary/search`, read-only SQLite FTS5, keyboard nav, `/` focus) | `#search`, `.results`                   |
|                                                       | `WordOfTheDay`, `LevelGrid`, `TopicChips`, `InAppTeaser`                                                                  | `.wotd`, `.levels`, `.topics`, `.inapp` |
| `/dictionary/[lemma]` (server-rendered + cached, SEO) | `WordHeader` (tile-set + article stamp + underline draw)                                                                  | `#whero`                                |
|                                                       | `PronounceButton` (waveform + syllable highlight; audio = licensed recording, fallback TTS)                               | `#play`                                 |
|                                                       | `SaveWord` (localStorage → merged after phone login; nudge at 10)                                                         | `#save`, `#sheet`                       |
|                                                       | `Senses`, `Examples`, `Collocations`                                                                                      | `.card`                                 |
|                                                       | `DeclensionTable` (sliding segmented control)                                                                             | `#seg`, `#decl`                         |
|                                                       | `PersianLearnerTrap` (flip card) — LearnBox-only editorial content                                                        | `#trap`                                 |
|                                                       | `CompoundSplitter`                                                                                                        | `#comp`                                 |
|                                                       | `PackBridge` + 3-question preview quiz (BuBu reacts)                                                                      | `#pack`, `#quiz`                        |

## Motion rules (kept from prototype)

- Only `transform`/`opacity`/`filter` animate; every effect is disabled under `prefers-reduced-motion`.
- Page change uses View Transitions (Next `unstable_ViewTransition` / CSS `view-transition-name`), instant fallback.
- Entrance once per element (IntersectionObserver), never on every scroll.

## Sample data in the prototype

- Word counts, `Termin`/`Feierabend` content and the pack name in the prototype are sample data.
- Sources (all open): German Wiktionary (kaikki, CC BY-SA), farhang (CC BY-SA 3.0), Tatoeba (CC BY).
  Attribution goes in the privacy page.

## Publishing from Admin (ADR 0018)

- Admin → واژه‌نامه → «انتشار» builds a new release from the live file plus every approved panel
  entry, runs the gates (integrity, ≤2% word loss, full search index, Persian meaning on every
  word, German/Persian search smoke) and, only if all pass, swaps `current.json`.
- «برگرداندن نسخهٔ قبلی» points `current.json` back at the previous file.
- Host: `/home/ubuntu/learnbox/dictionary/published` (uid 1001). Admin mounts it read-write and sets
  `LEARNBOX_ADMIN_DICTIONARY_RELEASE_DIR`; the landing mounts it read-only and sets
  `LEARNBOX_DICTIONARY_DIR`. The landing picks up a new release within 10 seconds, no restart.
