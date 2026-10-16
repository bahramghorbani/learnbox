import {
  type CardImageSubjectSource,
  type GermanVoiceMapping,
  type GermanVoiceRole,
  buildSpokenSentenceTarget,
  buildSpokenWordTarget,
  deriveCardImageSubject,
  normalizeGermanArticle,
  resolveEffectiveGermanVoice,
  resolveGermanVoiceRole,
} from './card-media-generation.js';

/**
 * The shared LearnBox card standard.
 *
 * This module does not invent rules. Every check below restates a rule LearnBox already ships:
 * the AI generator field rules (`apps/admin/lib/server/ai-pack-generation-service.ts`), the
 * quality rules (`docs/content/QUALITY_RULES.md`), PDR-010 (article-aware audio, image standard)
 * and the shape of the 35 approved Starter cards. It is the single place those rules are evaluated,
 * so the AI, Repair, manual, file-import, edit and versioning paths cannot disagree.
 *
 * Completeness is NOT validity. An incomplete draft may be saved; its gaps are reported, and they
 * block declaring the card ready (submit for review) and publishing. A gap is never "fixed" by
 * filling a field with invented data.
 */

export type CardMediaKind = 'image' | 'word_audio' | 'sentence_audio';
export const CARD_MEDIA_KINDS: readonly CardMediaKind[] = ['image', 'word_audio', 'sentence_audio'];

export interface CardReadinessIssue {
  field: string;
  code: string;
  message: string;
}

/** Loose canonical content: persisted JSON is read defensively, never trusted to be well-formed. */
export type CardStandardContent = Record<string, unknown>;

const PERSIAN_LETTER = /[\u0600-\u06FF]/;
const BOBO_MENTION = /bobo|بوبو/i;
/** Explicit, linguistically valid "no plural" statements (uncountable / singulare tantum). */
const NOUN_NO_PLURAL = /kein(en)? Plural|nur (im )?Singular|ohne Plural|Singularetantum/i;
/** Plurale tantum: the headword itself is plural, so there is no separate plural form. */
const NOUN_PLURAL_ONLY = /nur (im )?Plural|Pluraletantum/i;
/** Explicit statement that an adjective has no comparison (absolute or indeclinable adjectives). */
const ADJECTIVE_NOT_COMPARABLE = /nicht steigerbar|keine Steigerung|nicht komparierbar/i;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text) : [];
}

function issue(field: string, code: string, message: string): CardReadinessIssue {
  return { field, code, message };
}

function forms(value: string): string[] {
  return value.split(/[,،;؛]/).map((part) => part.trim());
}

/** The effective image subject the generator would send, for checks against the Bobo rule. */
export function effectiveImageSubjectSource(
  content: CardStandardContent,
  brief?: string | null,
): CardImageSubjectSource {
  return {
    lemma: text(content.lemma),
    article: text(content.article) || null,
    brief: brief ?? null,
    imagePrompt: text(content.imagePrompt) || null,
    visualConcept: text(content.visualConcept) || null,
  };
}

function nounRules(content: CardStandardContent, lemma: string): CardReadinessIssue[] {
  const issues: CardReadinessIssue[] = [];
  if (!normalizeGermanArticle(content.article)) {
    issues.push(
      issue('article', 'noun_article_missing', 'اسم باید آرتیکل der، die یا das داشته باشد.'),
    );
  }
  if (lemma && lemma[0] !== lemma[0]!.toUpperCase()) {
    issues.push(issue('lemma', 'noun_not_capitalized', 'اسم آلمانی باید با حرف بزرگ نوشته شود.'));
  }
  const plural = text(content.essentialInflection);
  if (!plural) {
    issues.push(
      issue(
        'essentialInflection',
        'noun_plural_missing',
        'صورت جمع اسم (مثل «die Häuser») یا بیان صریح «kein Plural» / «nur Plural» لازم است.',
      ),
    );
  } else if (
    !/^die\s+\S/i.test(plural) &&
    !NOUN_NO_PLURAL.test(plural) &&
    !NOUN_PLURAL_ONLY.test(plural)
  ) {
    issues.push(
      issue(
        'essentialInflection',
        'noun_plural_invalid',
        'صورت جمع اسم باید با «die» شروع شود یا صراحتاً «kein Plural» / «nur Plural» باشد.',
      ),
    );
  }
  return issues;
}

function verbRules(content: CardStandardContent): CardReadinessIssue[] {
  const value = text(content.essentialInflection);
  if (!value) {
    return [
      issue(
        'essentialInflection',
        'verb_forms_missing',
        'سه صورت اصلی فعل لازم است: سوم‌شخص مفرد حال، گذشتهٔ ساده و Perfekt (مثل «geht, ging, ist gegangen»).',
      ),
    ];
  }
  const parts = forms(value);
  const perfect = parts[2] ?? '';
  if (parts.length !== 3 || parts.some((part) => !part) || !/^(hat|ist)\b/i.test(perfect)) {
    return [
      issue(
        'essentialInflection',
        'verb_forms_invalid',
        'صورت‌های فعل باید سه بخش باشند و Perfekt با «hat» یا «ist» شروع شود.',
      ),
    ];
  }
  return [];
}

function adjectiveRules(content: CardStandardContent): CardReadinessIssue[] {
  const value = text(content.essentialInflection);
  if (ADJECTIVE_NOT_COMPARABLE.test(value)) return [];
  const parts = value ? forms(value) : [];
  if (parts.length === 3 && parts.every(Boolean) && /^am\s+\S/i.test(parts[2]!)) return [];
  return [
    issue(
      'essentialInflection',
      value ? 'adjective_comparison_invalid' : 'adjective_comparison_missing',
      'صفت باید صورت‌های مقایسه‌ای داشته باشد (مثل «klein, kleiner, am kleinsten») یا صراحتاً «nicht steigerbar» باشد.',
    ),
  ];
}

/**
 * Text completeness of one card, by part of speech. Returns no issue for a complete card.
 *
 * `imageBrief` is the curated visual-contract brief for the card, when one exists; it is the
 * effective image subject and therefore the one checked against the no-Bobo rule.
 */
export function evaluateCardCompleteness(
  content: CardStandardContent,
  options: { imageBrief?: string | null } = {},
): CardReadinessIssue[] {
  const issues: CardReadinessIssue[] = [];
  const lemma = text(content.lemma);
  const partOfSpeech = text(content.partOfSpeech);
  if (!lemma) issues.push(issue('lemma', 'lemma_missing', 'واژهٔ آلمانی الزامی است.'));

  const pronunciation = content.pronunciation as { ipa?: unknown } | undefined;
  if (!text(pronunciation?.ipa)) {
    issues.push(
      issue('pronunciation.ipa', 'ipa_missing', 'تلفظ IPA برای آماده‌شدن و انتشار کارت الزامی است.'),
    );
  }

  const meanings = textList(content.persianMeanings);
  if (meanings.length === 0 || meanings.some((meaning) => !meaning)) {
    issues.push(
      issue('persianMeanings', 'persian_meaning_missing', 'حداقل یک معنی فارسی لازم است.'),
    );
  } else if (meanings.some((meaning) => !PERSIAN_LETTER.test(meaning))) {
    issues.push(
      issue('persianMeanings', 'persian_meaning_not_persian', 'معنی کارت باید به فارسی باشد.'),
    );
  }

  const examples = Array.isArray(content.examples)
    ? (content.examples as Array<{ german?: unknown; persian?: unknown }>)
    : [];
  const first = examples[0];
  if (!first || !text(first.german) || !text(first.persian)) {
    issues.push(
      issue(
        'examples',
        'example_missing',
        'یک جملهٔ مثال کامل آلمانی همراه ترجمهٔ فارسی لازم است.',
      ),
    );
  } else if (!PERSIAN_LETTER.test(text(first.persian))) {
    issues.push(
      issue('examples', 'example_translation_not_persian', 'ترجمهٔ مثال باید به فارسی باشد.'),
    );
  }

  if (!text(content.simpleGermanDefinition)) {
    issues.push(
      issue('simpleGermanDefinition', 'definition_missing', 'تعریف سادهٔ آلمانی لازم است.'),
    );
  }
  const grammarNote = text(content.grammarNote);
  if (!grammarNote) {
    issues.push(issue('grammarNote', 'grammar_note_missing', 'نکتهٔ دستوری فارسی لازم است.'));
  } else if (!PERSIAN_LETTER.test(grammarNote)) {
    issues.push(
      issue('grammarNote', 'grammar_note_not_persian', 'نکتهٔ دستوری باید به فارسی باشد.'),
    );
  }

  if (partOfSpeech === 'noun') {
    issues.push(...nounRules(content, lemma));
  } else if (normalizeGermanArticle(content.article)) {
    issues.push(
      issue('article', 'article_on_non_noun', 'فقط اسم آرتیکل دارد؛ این کارت اسم نیست.'),
    );
  }
  if (partOfSpeech === 'verb') issues.push(...verbRules(content));
  if (partOfSpeech === 'adjective') issues.push(...adjectiveRules(content));

  if (!text(content.imagePrompt) && !text(content.visualConcept) && !options.imageBrief) {
    issues.push(
      issue('visual', 'image_concept_missing', 'مفهوم تصویر یا راهنمای تصویر لازم است.'),
    );
  } else if (lemma) {
    const subject = deriveCardImageSubject(
      effectiveImageSubjectSource(content, options.imageBrief),
    );
    if (BOBO_MENTION.test(subject)) {
      issues.push(
        issue(
          'imagePrompt',
          'image_subject_mentions_bobo',
          'بوبو نباید در تصویر آموزشی باشد؛ تصویر فقط مفهوم واژه را نشان دهد.',
        ),
      );
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------------------------
// Media references stored on a card version.
// ---------------------------------------------------------------------------------------------

/**
 * The three reference shapes LearnBox has persisted:
 *  - `url`: the original `VersionedMediaAsset` (HTTPS url + qualityStatus);
 *  - `bundled`: the Starter shape (`pathname` under `learnbox-start/`, files shipped in the app);
 *  - `pinned`: an accepted Admin candidate pinned into a published version at publish time.
 * The Starter data holds both an array and a kind-keyed object; both are read without loss.
 */
export type CardMediaReference =
  | {
      source: 'url';
      kind: CardMediaKind;
      assetId: string;
      version: number;
      url: string;
      qualityStatus: string;
    }
  | { source: 'bundled'; kind: CardMediaKind; assetId: string; pathname: string; mimeType: string }
  | {
      source: 'pinned';
      kind: CardMediaKind;
      assetId: string;
      candidateId: string;
      objectKey: string;
      checksum: string;
      mediaType: string;
      qualityStatus: 'approved';
    };

export interface CardMediaReadResult {
  references: CardMediaReference[];
  issues: CardReadinessIssue[];
  /** Kept only so a writer can preserve the persisted container shape (array or kind map). */
  container: 'array' | 'map' | 'absent';
}

const BUNDLED_PATHNAME =
  /^learnbox-start\/[a-z0-9-]+\/(image|word_audio|sentence_audio)\/v[0-9]+\.(jpg|png|mp3)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Same shape `card_media_candidates.object_key` is constrained to (migration 0025). */
const ADMIN_OBJECT_KEY =
  /^admin\/card-media\/[a-z0-9-]{1,128}\/(image|word_audio|sentence_audio)\/[0-9a-f-]{36}\.(png|jpg|mp3)$/;
const PINNED_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'audio/mpeg']);
const SHA256 = /^[a-f0-9]{64}$/;

function isMediaKind(value: unknown): value is CardMediaKind {
  return typeof value === 'string' && (CARD_MEDIA_KINDS as readonly string[]).includes(value);
}

function readOne(entry: unknown, position: string): CardMediaReference | CardReadinessIssue {
  const invalid = issue(
    'media',
    'media_reference_invalid',
    `ارجاع رسانهٔ ${position} ساختار شناخته‌شده‌ای ندارد و باید اصلاح شود.`,
  );
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return invalid;
  const record = entry as Record<string, unknown>;
  const kind = record.kind;
  const assetId = text(record.assetId);
  if (!isMediaKind(kind) || !assetId) return invalid;
  if (typeof record.candidateId === 'string') {
    const objectKey = text(record.objectKey);
    const keyMatch = ADMIN_OBJECT_KEY.exec(objectKey);
    if (
      !UUID.test(record.candidateId) ||
      !keyMatch ||
      keyMatch[1] !== kind ||
      !SHA256.test(text(record.checksum)) ||
      !PINNED_MEDIA_TYPES.has(text(record.mediaType)) ||
      record.qualityStatus !== 'approved'
    ) {
      return invalid;
    }
    return {
      source: 'pinned',
      kind,
      assetId,
      candidateId: record.candidateId,
      objectKey,
      checksum: text(record.checksum),
      mediaType: text(record.mediaType),
      qualityStatus: 'approved',
    };
  }
  if (typeof record.pathname === 'string') {
    const pathname = record.pathname.trim();
    const match = BUNDLED_PATHNAME.exec(pathname);
    if (!match || match[1] !== kind) return invalid;
    return { source: 'bundled', kind, assetId, pathname, mimeType: text(record.mimeType) };
  }
  if (typeof record.url === 'string') {
    return {
      source: 'url',
      kind,
      assetId,
      version: typeof record.version === 'number' ? record.version : Number.NaN,
      url: record.url,
      qualityStatus: text(record.qualityStatus),
    };
  }
  return invalid;
}

/** Reads every persisted media reference; a malformed entry is a clear issue, never a crash. */
export function readCardMediaReferences(media: unknown): CardMediaReadResult {
  if (media === undefined || media === null) {
    return { references: [], issues: [], container: 'absent' };
  }
  const references: CardMediaReference[] = [];
  const issues: CardReadinessIssue[] = [];
  let container: CardMediaReadResult['container'];
  let entries: Array<[string, unknown]>;
  if (Array.isArray(media)) {
    container = 'array';
    entries = media.map((entry, index) => [String(index + 1), entry]);
  } else if (typeof media === 'object') {
    container = 'map';
    entries = Object.entries(media as Record<string, unknown>);
  } else {
    return {
      references,
      issues: [issue('media', 'media_container_invalid', 'فهرست رسانهٔ کارت ساختار نامعتبری دارد.')],
      container: 'absent',
    };
  }
  for (const [position, entry] of entries) {
    const read = readOne(entry, position);
    if ('code' in read) {
      issues.push(read);
      continue;
    }
    if (container === 'map' && position !== read.kind) {
      issues.push(
        issue(
          'media',
          'media_reference_kind_mismatch',
          `کلید رسانهٔ «${position}» با نوع «${read.kind}» هم‌خوان نیست.`,
        ),
      );
      continue;
    }
    references.push(read);
  }
  return { references, issues, container };
}

// ---------------------------------------------------------------------------------------------
// Media validity against the card's current effective content.
// ---------------------------------------------------------------------------------------------

/** What a medium must match, derived only from the parts of the card that medium depends on. */
export interface ExpectedCardMedia {
  image: { subject: string } | { error: string };
  word_audio: { spokenTarget: string; voiceRole: GermanVoiceRole } | { error: string };
  sentence_audio: { spokenTarget: string; voiceRole: GermanVoiceRole } | { error: string };
}

export function expectedCardMedia(
  content: CardStandardContent,
  options: { imageBrief?: string | null } = {},
): ExpectedCardMedia {
  const card = { lemma: text(content.lemma), article: text(content.article) || null };
  const voiceRole = resolveGermanVoiceRole(card);
  const examples = Array.isArray(content.examples)
    ? (content.examples as Array<{ german?: unknown }>)
    : [];
  const attempt = <T>(build: () => T): T | { error: string } => {
    try {
      return build();
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'invalid' };
    }
  };
  return {
    image: attempt(() => ({
      subject: deriveCardImageSubject(effectiveImageSubjectSource(content, options.imageBrief)),
    })),
    word_audio: attempt(() => ({ spokenTarget: buildSpokenWordTarget(card), voiceRole })),
    sentence_audio: attempt(() => ({
      spokenTarget: buildSpokenSentenceTarget(text(examples[0]?.german)),
      voiceRole,
    })),
  };
}

/** The attribution recorded on a generated candidate (`card_media_candidates`). */
export interface RecordedMediaAttribution {
  kind: CardMediaKind;
  spokenTarget?: string | null;
  voice?: string | null;
  voiceRole?: string | null;
  imageSubject?: string | null;
  imageStandardVersion?: string | null;
}

export type MediaValidity = 'valid' | 'stale' | 'unverifiable';

/**
 * Whether recorded media still matches the card. Only the content a medium depends on is
 * compared: an edited example invalidates sentence audio only; an edited meaning invalidates
 * nothing; a changed article invalidates the word and sentence audio (voice) and the image subject
 * only when the subject was derived from it.
 */
export function evaluateMediaValidity(
  recorded: RecordedMediaAttribution,
  content: CardStandardContent,
  options: {
    imageBrief?: string | null;
    imageStandardVersion?: string;
    voiceMapping?: GermanVoiceMapping;
  } = {},
): MediaValidity {
  const expected = expectedCardMedia(content, options)[recorded.kind];
  if ('error' in expected) return 'stale';
  if (recorded.kind === 'image') {
    if (!recorded.imageSubject) return 'unverifiable';
    if (
      options.imageStandardVersion &&
      recorded.imageStandardVersion !== options.imageStandardVersion
    ) {
      return 'stale';
    }
    return recorded.imageSubject === (expected as { subject: string }).subject
      ? 'valid'
      : 'stale';
  }
  const audio = expected as { spokenTarget: string; voiceRole: GermanVoiceRole };
  if (!recorded.spokenTarget || !recorded.voiceRole) return 'unverifiable';
  if (recorded.spokenTarget !== audio.spokenTarget || recorded.voiceRole !== audio.voiceRole) {
    return 'stale';
  }
  if (options.voiceMapping && recorded.voice) {
    try {
      const effective = resolveEffectiveGermanVoice(
        { lemma: text(content.lemma), article: text(content.article) || null },
        options.voiceMapping,
      );
      if (effective.voice !== recorded.voice) return 'stale';
    } catch {
      return 'stale';
    }
  }
  return 'valid';
}

/** One medium's readiness as resolved by the server from its real source. */
export interface CardMediaReadiness {
  kind: CardMediaKind;
  state: 'valid' | 'missing' | 'stale' | 'unverifiable' | 'pending_acceptance';
  source?: 'admin_candidate' | 'bundled' | 'url';
}

const MEDIA_LABEL: Record<CardMediaKind, string> = {
  image: 'تصویر',
  word_audio: 'صدای واژه',
  sentence_audio: 'صدای مثال',
};

const MEDIA_STATE_MESSAGE: Record<Exclude<CardMediaReadiness['state'], 'valid'>, string> = {
  missing: 'وجود ندارد',
  stale: 'با متن فعلی کارت هم‌خوان نیست و باید دوباره ساخته شود',
  unverifiable: 'هم‌خوانی آن با متن کارت قابل اثبات نیست',
  pending_acceptance: 'ساخته شده ولی هنوز پذیرفته نشده است',
};

/** Media readiness expressed as issues; every kind must be valid before publishing. */
export function mediaReadinessIssues(media: readonly CardMediaReadiness[]): CardReadinessIssue[] {
  const issues: CardReadinessIssue[] = [];
  for (const kind of CARD_MEDIA_KINDS) {
    const state = media.find((item) => item.kind === kind)?.state ?? 'missing';
    if (state === 'valid') continue;
    issues.push(
      issue(`media.${kind}`, `media_${state}`, `${MEDIA_LABEL[kind]}: ${MEDIA_STATE_MESSAGE[state]}.`),
    );
  }
  return issues;
}

/** A pinned reference to an accepted Admin candidate, written into a published version. */
export interface PinnedCardMedia {
  kind: CardMediaKind;
  assetId: string;
  candidateId: string;
  objectKey: string;
  checksum: string;
  mediaType: string;
  qualityStatus: 'approved';
}

/**
 * Replaces the references of the pinned kinds and keeps every other reference verbatim, in the
 * persisted container shape (array or kind-keyed map), so Starter data is never reshaped.
 */
export function pinCardMedia(media: unknown, pins: readonly PinnedCardMedia[]): unknown {
  if (pins.length === 0) return media;
  const kinds = new Set(pins.map((pin) => pin.kind));
  if (media && typeof media === 'object' && !Array.isArray(media)) {
    const next: Record<string, unknown> = { ...(media as Record<string, unknown>) };
    for (const pin of pins) next[pin.kind] = { ...pin };
    return next;
  }
  const kept = Array.isArray(media)
    ? media.filter(
        (entry) =>
          !(entry && typeof entry === 'object' && kinds.has((entry as { kind?: CardMediaKind }).kind!)),
      )
    : [];
  return [...kept, ...pins.map((pin) => ({ ...pin }))];
}

/** Two contents need the same medium when that medium's expected inputs are identical. */
export function sameMediaInputs(
  kind: CardMediaKind,
  current: CardStandardContent,
  previous: CardStandardContent,
  options: { imageBrief?: string | null } = {},
): boolean {
  const a = expectedCardMedia(current, options)[kind];
  const b = expectedCardMedia(previous, options)[kind];
  if ('error' in a || 'error' in b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
