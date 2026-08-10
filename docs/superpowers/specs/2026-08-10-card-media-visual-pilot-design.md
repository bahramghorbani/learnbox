# Card media visual pilot — design

## Goal

Create a small, review-only AvalAI media pilot for the existing LearnBox Start A1 slice. The
pilot establishes one attractive, semantically unambiguous visual language before any bulk media
generation or attachment decision.

## Confirmed direction

- Produce three 1024×1024 PNG review candidates for `Haus`, `Wasser`, and `Brot`.
- Use `flux.2-pro` through the existing local-only AvalAI seam.
- Keep a warm off-white studio ground with a restrained LearnBox-purple/lilac accent.
- Make one teaching concept dominant, recognizable at mobile card size, and prohibit text,
  watermarks, logos, visual clutter, and ambiguous secondary concepts.
- Concrete nouns use an object or place only. `Haus` and `Wasser` must not use Bobo.
- `Brot` uses one loaf as its only teaching concept. The future action card `kaufen` is a separate
  card and must not be inferred from the bread image.
- Existing canonical Bobo assets remain untouched. No generated character is canonical, and an
  opaque Bobo image must not be composited into a card.

## Audio pilot

The already selected low-latency `eleven_flash_v2_5` seam remains the audio candidate source.
For each approved card, generate a German word clip and a German example-sentence clip. Validate
format, duration, complete pronunciation, and text transcription before any attachment decision.

## Boundaries

- Credential stays only in ignored `.env.avalai.local`; it is never copied into a script, Git,
  browser, card, or documentation.
- Outputs are review candidates only. They remain outside a production deployment and do not
  change private-media receipts, content release state, feature flags, or public availability.
- Existing Start images and audio remain intact until each replacement passes visual/audio QA and
  receives an explicit attachment decision.
- AvalAI cost is limited to the three-image pilot and, after visual approval, the corresponding
  six audio clips.

## Visual art direction

### Haus

A single friendly, dimensional German-style home is centered and fills most of the frame. The
house silhouette, door, roof, and windows are clear; no people, furniture, signs, or scenery
compete with it.

### Wasser

A clear drinking glass with visible water is centered against the same studio ground. Glass,
water level, and reflection must read immediately; do not add food, hands, bottles, labels, or
text.

### Brot

One clear, appetizing loaf of bread fills the visual focus. No hands, people, payment card,
counter, label, packaging, currency, receipt, brand mark, or text appears in the frame.

## Quality gate

1. Inspect all three images at full size and at mobile-card scale.
2. Reject any image with generated text, watermark, unapproved Bobo-like character, unclear
   primary concept, or visual clutter.
3. Record provider/model, prompt version, dimensions, checksum, and reviewer decision in the
   existing candidate/receipt workflow.
4. Present the approved visual sample to the owner before producing the remaining 17 images.
5. Only after visual approval, create and QA the six related audio candidates; do not attach or
   publish them as part of this pilot.

## Testing and rollback

- Re-run the existing AvalAI, candidate-QA, media-hand-off, and full repository quality gates for
  any committed metadata or validator change.
- A rejected candidate is deleted only from the local candidate area and never replaces the
  current checked-in media. No production rollback is necessary because this pilot has no release
  action.
