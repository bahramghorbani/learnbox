# Admin content-review bulk approve

One page for the operator: what the two "approve all" buttons do, what they deliberately do not
do, and how to recover if one stops partway through. The feature lives entirely in the existing
**Content & Packs → review** surface; there is no new route, no new security boundary, and no
change to what counts as a passed check or a persisted decision.

## What it adds

Two places in the existing per-card review flow already let an operator click through word by
word. Both now also offer a single button that repeats the same clicks across every remaining
item, instead of the admin doing it one item at a time:

1. **Media completion (pack build, Content & Packs tab)** — after a pack's words are generated,
   each word's image/word-audio/example-audio candidate is accepted one at a time. The
   "تأیید همهٔ N مورد منتظر پذیرش" button, shown only once a scan has found items in that state,
   accepts every ready-and-valid candidate in the pack in turn, then re-scans so the list always
   reflects server truth afterwards.
2. **Six-dimensional review (Content review queue)** — a card's six dimensions
   (`german_linguistic`, `persian_translation`, `provenance`, `visual`, `audio`, `workflow_test`)
   are each marked pass/fail, and only then can the card be given its final editorial approval.
   The "تأیید همهٔ N موردِ نیازمند بررسی" button at the top of the queue panel passes all six
   dimensions and submits the final approve decision for every `needs_review` card in the queue,
   one card at a time.

## What it does not change

- **No new API route.** Both buttons call the exact same endpoints a manual click already used
  (`/api/content/media/accept`, `/api/content/review/check`, `/api/content/review/decision`) —
  once per item, in a loop, from the browser. The server cannot tell a bulk click from N manual
  ones.
- **No weaker guard.** Every call still carries its own CSRF token, idempotency key, and passkey
  step-up re-authentication; every write still lands in the same audit trail. The bulk button
  does not add a batch endpoint that could skip or coalesce that per-item accounting.
- **No publication.** Final editorial approval still only means "out of the review queue" — it is
  not the separate, owner-gated dictionary/pack release step. The bulk buttons touch review state
  only, never `published_at` or pack membership.
- **No forced pass.** If a check or a decision is rejected by the server (a conflict, a
  not-reviewable status, a validation failure), that one item is left exactly as it was and the
  run moves on to the next item — nothing is marked passed/accepted that the server refused.

## What happens on a step-up refusal

A passkey re-authentication can be declined or time out mid-run. When that happens the **entire
bulk run stops immediately** rather than prompting for re-authentication again for every remaining
card — the UI shows how many cards finished before the stop and the operator can click the button
again to resume from wherever the queue stands. This is why the two features are implemented as a
loop over the _existing_ single-item functions instead of a new "approve everything" server call:
every stop point is a real, already-recorded state, never a half-applied batch.

## Where it is used from

Both buttons are inert (and, for media completion, not rendered) until there is at least one
eligible item, and both are disabled while a run is in progress or while any other review action
on the same panel is in flight, so a second click cannot start an overlapping run.

## Tests

- `apps/admin/test/pack-media-bulk-accept-button.test.tsx` — accepts every awaiting item, rescans
  afterwards, and confirms the button only renders when the caller wires an accept function.
- `apps/admin/test/content-review-workspace.test.tsx` —
  `bulk-approves every needs_review card in the queue with one click, via the same per-item requests`
  and `stops a bulk approval run on the first unrecoverable failure, leaving later cards untouched`.
- `apps/admin/test/content-review-presentation.test.tsx` — the "no publication control on the
  review screen" regression test was updated to account for the one added button and still asserts
  its label never contains a publish/delete/price word.
