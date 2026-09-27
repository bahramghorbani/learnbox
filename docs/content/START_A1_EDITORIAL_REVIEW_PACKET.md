# LearnBox Start — editorial review packet

**Batch:** `learnbox-start-a1-vertical-slice-drafts-v1`  
**State:** German and Persian review confirmed by the product owner on 2026-07-27; publication blocked

## Reviewer instruction

For every item, record a separate pass/fail decision for German linguistic accuracy, Persian
translation, provenance, visual QA, audio QA and app-flow validation. Do not approve any item
until all six decisions are recorded by the appropriate reviewer. A failed check returns the item
to `needs_review`; it never silently becomes published.

The product owner confirmed the German linguistic and Persian translation dimensions for all 20
drafts. Provenance, visual QA, audio QA and app-flow validation remain deliberately pending
because no production media or in-app slice has been created.

## Linguistic and Persian review list

| ID                           | German draft       | Persian draft          | Must be checked                            |
| ---------------------------- | ------------------ | ---------------------- | ------------------------------------------ |
| `start-a1-haus`              | Haus               | خانه                   | article, plural, definition, example       |
| `start-a1-tisch`             | Tisch              | میز                    | article, plural, definition, example       |
| `start-a1-tuer`              | Tür                | در                     | article, plural, definition, example       |
| `start-a1-bett`              | Bett               | تخت                    | article, plural, definition, example       |
| `start-a1-apfel`             | Apfel              | سیب                    | article, plural, definition, example       |
| `start-a1-brot`              | Brot               | نان                    | article, plural, definition, example       |
| `start-a1-wasser`            | Wasser             | آب                     | article, countability, definition, example |
| `start-a1-bahnhof`           | Bahnhof            | ایستگاه قطار           | article, plural, definition, example       |
| `start-a1-schule`            | Schule             | مدرسه                  | article, plural, definition, example       |
| `start-a1-lernen`            | lernen             | یاد گرفتن              | conjugation, grammar note, example         |
| `start-a1-wohnen`            | wohnen             | زندگی کردن؛ ساکن بودن  | conjugation, grammar note, example         |
| `start-a1-kaufen`            | kaufen             | خریدن                  | conjugation, grammar note, example         |
| `start-a1-warten`            | warten             | منتظر ماندن            | conjugation, preposition, example          |
| `start-a1-gluecklich`        | glücklich          | خوشحال                 | definition, adjective use, example         |
| `start-a1-muede`             | müde               | خسته                   | definition, adjective use, example         |
| `start-a1-klein`             | klein              | کوچک                   | definition, adjective use, example         |
| `start-a1-guten-tag`         | Guten Tag          | روز بخیر؛ سلام         | register, Persian equivalent, example      |
| `start-a1-wie-geht-es-ihnen` | Wie geht es Ihnen? | حال شما چطور است؟      | formal register, capitalization, example   |
| `start-a1-danke`             | danke              | ممنون؛ سپاسگزارم       | usage, Persian equivalent, example         |
| `start-a1-entschuldigung`    | Entschuldigung     | ببخشید؛ معذرت می‌خواهم | usage, Persian equivalent, example         |

## Handoff boundary

The complete draft data is in
`content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json`. This packet does
not approve any content and does not ask a reviewer to create media. The confirmed linguistic
outcomes must be recorded in the content-review ledger. Only after the remaining provenance,
visual, audio and app-flow outcomes are recorded may the media plan move from `not_requested` to
a provider-specific staging task.
