# LB-DS-STARTER-EDITORIAL-PRECHECK — non-authoritative editorial pre-review

- Branch: `content/starter-editorial-fix`
- Base commit: `fdd99145e4a35692e5c47bda29b664a3d2ba2928` (origin/main)
- Local commit: pending parent verification; no push, no PR
- Scope: bounded editorial pass on the 15 pending Start A1 drafts only (`content/packs/learnbox-start/vocabulary/start-a1-catalog-35-pending-drafts.json`), plus the single derived integrity hash it feeds (`content/packs/learnbox-start/validation/start-a1-35-catalog-slice.json` → `integrity.pendingDraftsSha256`), plus this report.
- Untouched: original 20-item vertical slice (`start-a1-vertical-slice-drafts.json`), approval ledger, catalog counts/gates/blockers, validators, code, tests, ADRs, manifest, runtime, auth, migration, flags, media, deployment, seed, publication.
- Authority: **AI pre-review is NOT product-owner approval.** Every item keeps `status: needs_review`, `media: []`, AI-assisted provenance, no approval fields. All gates remain pending (`seedable: false`, `publicationBlocked: true`, 20 linguistically reviewed / 0 release-approved). Owner linguistic review of the changed examples is still required.

## What changed

Three pending drafts carried German examples that duplicated example sentences already used by the original 20-item slice (exact string match in two cases; a third echoed a slice example one-to-one). Replacements are simple, natural, A1-appropriate, and scan non-duplicate against all 35 items' German and Persian example strings:

| Item             | Old German example   | Old Persian example | New German example     | New Persian example    |
| ---------------- | -------------------- | ------------------- | ---------------------- | ---------------------- |
| `start-a1-essen` | Ich esse Brot.       | من نان می‌خورم.     | Ich esse zu Mittag.    | من ناهار می‌خورم.      |
| `start-a1-gross` | Das Haus ist groß.   | خانه بزرگ است.      | Der Elefant ist groß.  | فیل بزرگ است.          |
| `start-a1-kalt`  | Das Wasser ist kalt. | آب سرد است.         | Im Winter ist es kalt. | در زمستان هوا سرد است. |

Rationale: `Ich esse Brot.` is byte-identical to the slice `start-a1-brot` example; `Das Wasser ist kalt.` is byte-identical to the slice `start-a1-wasser` example; `Das Haus ist groß.` mirrors the slice `start-a1-klein`/`start-a1-haus` example frame (`Das Haus ist klein.`) as a semantic/echo duplicate flagged in prior read-only inspection. Persian translations were replaced together with their German counterparts so each example pair stays a translation pair.

No stray-quote or ZWNJ artifacts were confirmed in Persian fields on re-scan: ZWNJ usage (`می‌خورم`, `تخم‌مرغ`, `غیرقابل‌شمارش`, `بی‌قاعده`, …) is standard Persian half-space, no Arabic yeh/kaf, no ASCII quotes, no bidi marks, no double/trailing ZWNJ, no double spaces or leading/trailing whitespace in any string. Prior-inspection concern recorded as not-reproducible.

## Item-by-item editorial pre-review (all `review_status: pending_owner_review`)

Per item: current fields (unchanged unless noted), changed fields, unresolved questions/risks. This is a mechanical/editorial pass only — no linguistic approval claim.

### 1. `start-a1-fenster` — Fenster (noun, das)

- review_status: pending_owner_review
- Current: lemma Fenster; noun; article das; A1; persian پنجره; German def „Ein Teil der Wand, den man öffnen kann."; inflection „die Fenster"; example „Das Fenster ist offen." / „پنجره باز است."; topics home/household; difficulty 1; media []; provenance ai_assisted; needs_review.
- Changed: none.
- Unresolved/risks: Persian meaning/example and German example await owner linguistic review; „Fenster" plural identical to singular form is correct (das Fenster / die Fenster).

### 2. `start-a1-zimmer` — Zimmer (noun, das)

- review_status: pending_owner_review
- Current: lemma Zimmer; noun; article das; A1; persian اتاق; German def „Ein Raum in einer Wohnung oder in einem Haus."; inflection „die Zimmer"; example „Das Zimmer ist groß." / „اتاق بزرگ است."; topics home/household; difficulty 1; media []; provenance ai_assisted; needs_review.
- Changed: none.
- Unresolved/risks: none specific. Example shares the „X ist groß." frame with slice `start-a1-tisch` and pending `start-a1-stadt`/`start-a1-gross`-replacement candidates; sentence differs by subject noun, scan non-duplicate. Owner may still prefer more variety later.

### 3. `start-a1-uhr` — Uhr (noun, die)

- review_status: pending_owner_review
- Current: lemma Uhr; noun; article die; A1; persian ساعت; German def „Ein Gerät, das die Zeit zeigt."; inflection „die Uhren"; example „Die Uhr ist neu." / „ساعت نو است."; topics time/daily_life; difficulty 1; media []; provenance ai_assisted; needs_review.
- Changed: none.
- Unresolved/risks: „neu" example sentence; no dup vs slice `start-a1-neu` (which uses Auto). OK.

### 4. `start-a1-milch` — Milch (noun, die)

- review_status: pending_owner_review
- Current: lemma Milch; noun; article die; A1; persian شیر; German def „Ein weißes Getränk, das von der Kuh kommt."; inflection „kein Plural im üblichen Gebrauch"; example „Ich trinke Milch." / „من شیر می‌نوشم."; topics food/daily_life; difficulty 1; media []; provenance ai_assisted; needs_review.
- Changed: none.
- Unresolved/risks: none specific. Example verb trinken complements slice/pending drink items without duplicate sentences.

### 5. `start-a1-kaffee` — Kaffee (noun, der)

- review_status: pending_owner_review
- Current: lemma Kaffee; noun; article der; A1; persian قهوه; German def „Ein heißes Getränk, das viele Menschen am Morgen trinken."; inflection „kein Plural im üblichen Gebrauch"; example „Der Kaffee ist heiß." / „قهوه داغ است."; topics food/daily_life; difficulty 1; media []; provenance ai_assisted; needs_review.
- Changed: none.
- Unresolved/risks: none specific.

### 6. `start-a1-ei` — Ei (noun, das)

- review_status: pending_owner_review
- Current: lemma Ei; noun; article das; A1; persian تخم‌مرغ; German def „Ein Lebensmittel vom Huhn."; inflection „die Eier"; example „Ich esse ein Ei." / „من یک تخم‌مرغ می‌خورم."; topics food/daily_life; difficulty 1; media []; provenance ai_assisted; needs_review.
- Changed: none.
- Unresolved/risks: none specific. Distinct from `start-a1-essen` (essen example no longer names a food, avoiding Brot/Ei/Apfel echo).

### 7. `start-a1-tee` — Tee (noun, der)

- review_status: pending_owner_review
- Current: lemma Tee; noun; article der; A1; persian چای; German def „Ein heißes Getränk aus Blättern."; inflection „die Tees"; example „Der Tee ist heiß." / „چای داغ است."; topics food/daily_life; difficulty 1; media []; provenance ai_assisted; needs_review.
- Changed: none.
- Unresolved/risks: none specific. Frame-adjacent to Kaffee „ist heiß." example; sentences differ by subject noun, scan non-duplicate. Owner may prefer variety; recorded as minor.

### 8. `start-a1-stadt` — Stadt (noun, die)

- review_status: pending_owner_review
- Current: lemma Stadt; noun; article die; A1; persian شهر; German def „Ein großer Ort, in dem viele Menschen wohnen."; inflection „die Städte"; example „Die Stadt ist groß." / „شهر بزرگ است."; topics place/city; difficulty 1; media []; provenance ai_assisted; needs_review.
- Changed: none.
- Unresolved/risks: none specific.

### 9. `start-a1-supermarkt` — Supermarkt (noun, der)

- review_status: pending_owner_review
- Current: lemma Supermarkt; noun; article der; A1; persian سوپرمارکت; German def „Ein großes Geschäft, in dem man Lebensmittel kauft."; inflection „die Supermärkte"; example „Ich kaufe im Supermarkt ein." / „من از سوپرمارکت خرید می‌کنم."; topics shopping/place; difficulty 1; media []; provenance ai_assisted; needs_review.
- Changed: none.
- Unresolved/risks: none specific.

### 10. `start-a1-gehen` — gehen (verb)

- review_status: pending_owner_review
- Current: lemma gehen; verb; A1; persian رفتن; German def „Sich zu Fuß von einem Ort zu einem anderen bewegen."; inflection „geht, ging, ist gegangen"; example „Ich gehe zur Schule." / „من به مدرسه می‌روم."; topics transport/core_verb; difficulty 1; media []; provenance ai_assisted; needs_review.
- Changed: none.
- Unresolved/risks: none specific. No dup with slice `start-a1-schule` „Die Schule ist heute offen." (different sentence).

### 11. `start-a1-essen` — essen (verb)

- review_status: pending_owner_review
- Current after change: lemma essen; verb; A1; persian خوردن; German def „Etwas als Nahrung zu sich nehmen."; inflection „isst, aß, hat gegessen"; example now „Ich esse zu Mittag." / „من ناهار می‌خورم."; topics food/core_verb; difficulty 1; media []; provenance ai_assisted; needs_review.
- Changed: examples[0].german and examples[0].persian (old: „Ich esse Brot." / „من نان می‌خورم." — exact duplicate of slice `start-a1-brot` example).
- Unresolved/risks: new sentence unverified linguistically by owner. „zu Mittag" is A1-appropriate idiom for lunch; Persian „من ناهار می‌خورم." matches. Owner should confirm naturalness and that example still fits the item's visual concept (Bobo eats at a table). If owner prefers an object-accented example (e.g. with Apfel/Ei), reuse must stay scan-non-duplicate.

### 12. `start-a1-trinken` — trinken (verb)

- review_status: pending_owner_review
- Current: lemma trinken; verb; A1; persian نوشیدن; German def „Eine Flüssigkeit zu sich nehmen."; inflection „trinkt, trank, hat getrunken"; example „Ich trinke Wasser." / „من آب می‌نوشم."; topics food/core_verb; difficulty 1; media []; provenance ai_assisted; needs_review.
- Changed: none.
- Unresolved/risks: none specific. Sentence frame vs slice `start-a1-wasser` example „Das Wasser ist kalt." differs; non-duplicate. Note: slice item `start-a1-wasser` carries „Das Wasser ist kalt." and the kalt pending item previously duplicated it (now fixed at item 13).

### 13. `start-a1-gross` — groß (adjective)

- review_status: pending_owner_review
- Current after change: lemma groß; adjective; A1; persian بزرگ; German def „Von großer Größe; nicht klein."; inflection „groß, größer, am größten"; example now „Der Elefant ist groß." / „فیل بزرگ است."; topics adjective/description; difficulty 1; media []; provenance ai_assisted; needs_review.
- Changed: examples[0].german and examples[0].persian (old: „Das Haus ist groß." / „خانه بزرگ است." — one-to-one echo of slice `start-a1-klein` and `start-a1-haus` example frame „Das Haus ist klein."; also risked learner confusion with slice `start-a1-klein`).
- Unresolved/risks: new sentence unverified linguistically by owner. Elephant example is a simple, high-visibility size contrast; Persian „فیل بزرگ است." matches. Existing item visualConcept/imagePrompt describe a large house beside a smaller tree — example sentence no longer matches that visual; media/visual QA (later gate) may want the image prompt or example realigned. Owner decision required.

### 14. `start-a1-kalt` — kalt (adjective)

- review_status: pending_owner_review
- Current after change: lemma kalt; adjective; A1; persian سرد; German def „Mit niedriger Temperatur; nicht warm."; inflection „kalt, kälter, am kältesten"; example now „Im Winter ist es kalt." / „در زمستان هوا سرد است."; topics adjective/description; difficulty 1; media []; provenance ai_assisted; needs_review.
- Changed: examples[0].german and examples[0].persian (old: „Das Wasser ist kalt." / „آب سرد است." — exact duplicate of slice `start-a1-wasser` example).
- Unresolved/risks: new sentence unverified linguistically by owner. „Im Winter ist es kalt." is canonical A1 impersonal-es weather sentence; Persian translation matches. Item visualConcept (frosted winter window) now aligns better than before. Owner confirm.

### 15. `start-a1-neu` — neu (adjective)

- review_status: pending_owner_review
- Current: lemma neu; adjective; A1; persian جدید; German def „Noch nicht lange da; nicht alt."; inflection „neu, neuer, am neuesten"; example „Das Auto ist neu." / „ماشین نو است."; topics adjective/description; difficulty 1; media []; provenance ai_assisted; needs_review.
- Changed: none.
- Unresolved/risks: none specific. No dup with slice `start-a1-uhr` „Die Uhr ist neu." (different subject noun). Note prior slice/`uhr`-pending frame overlap resolved by distinct subjects.

## Batch-level notes

- All 15 items: `status: needs_review`, `media: []`, `version: 1`, `source.provider: ai_suggestion`, `provenance.sourceType: ai_assisted`, no approval fields. Unchanged.
- `start-a1-35-catalog-slice.json`: only `integrity.pendingDraftsSha256` updated (`ef8cd1…` → `766ed7aa…`) to match the edited pending-drafts file. Counts (35/35 drafted, 20 linguistically reviewed, 0 approved, 0 missing), `seedable: false`, blockers, `publicationBlocked: true`, `draftedItemIds`, `pendingDraftedItemIds` unchanged.
- Remaining duplicate scan result: one German/Persian example pair is duplicated **inside the original 20-item slice** (`start-a1-haus` ↔ `start-a1-klein`, both „Das Haus ist klein." / „خانه کوچک است."). This is pre-existing, outside the authorized scope (original 20 never touched), and flagged here for owner awareness — not changed by this pass.
- No duplicate remains between the 15 pending drafts and the original 20 (German or Persian example strings, normalized compare).

## Verification performed

- JSON parse of both edited files; round-trip-safe surgical edit (6 lines +6/−6 in pending file; 1 line in snapshot hash).
- Duplicate-example scan across all 35 (German + Persian normalized): pending↔slice clean; only pre-existing slice-internal haus/klein pair remains.
- Persian artifact re-scan (quotes, Arabic yeh/kaf, bidi marks, ZWNJ placement/duplication/trailing, whitespace): clean.
- API seed-gate focused test (hash match vs real pending file, counts/blockers): see run record below.
- Content-factory batch-validation test: see run record below.
- Relevant Start validators (`verify:start-slice`, `verify:start-drafts`, `verify:linguistic-approval`, `verify:source-scope`, `verify:start-provenance-ledger`, `verify:start-candidate-qa`, `verify:media-handoff`, `verify:start-attachment-draft`, `verify:start-v2-image-attachment-draft`, `verify:start-private-media-attestation`, `verify:start-v2-images-private-media-attestation`, `verify:private-media-delivery`, `verify:start-local-media-preview`, `verify:start-pack-v2-contract`): see run record below.
- Prettier check on changed files; documentation-governance / ai-continuity / ai-worker-queue validators; `git diff --check`.
- Commit: local only. No push, no PR. Parent verifies independently.

## Secrets or production changes

None.

## Bobo canonical status

Unchanged.
