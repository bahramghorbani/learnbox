/**
 * Canonical LearnBox card-media generation rules.
 *
 * This module is the single runtime source of truth for three permanent product rules. They live
 * here — in the domain layer — rather than in an Admin prompt or a provider adapter, so that
 * changing the TTS/image model or provider cannot alter learner-facing pronunciation or the
 * LearnBox visual language.
 *
 * 1. WORD-AUDIO ARTICLE RULE. For a German noun card carrying a canonical article, the spoken
 *    word target is `article + lemma` ("der Tisch"), never the bare lemma. The article is part of
 *    the learner-facing pronunciation target. LearnBox constructs it from canonical card data; the
 *    model is never asked to infer or supply it.
 * 2. ARTICLE -> VOICE RULE. Voice identity is derived deterministically from the canonical article.
 * 3. IMAGE PROMPT RULE. A card image prompt is the card's subject brief composed with the
 *    canonical LearnBox visual style, which is owned by the versioned visual contract in
 *    `content/packs/learnbox-start/prompts/` — not by a prompt written inside the Admin.
 */

export type GermanArticle = 'der' | 'die' | 'das';

/** The canonical set of German articles LearnBox stores on a card. */
const GERMAN_ARTICLES: readonly string[] = ['der', 'die', 'das'];

/**
 * Canonical article test. Exported so every layer (import validation, audio generation, Admin
 * write path) agrees on exactly one definition instead of re-implementing the check.
 */
export function isGermanArticle(value: unknown): value is GermanArticle {
  return typeof value === 'string' && GERMAN_ARTICLES.includes(value.trim().toLowerCase());
}

/** Returns the normalized canonical article, or undefined when the card genuinely has none. */
export function normalizeGermanArticle(value: unknown): GermanArticle | undefined {
  if (!isGermanArticle(value)) return undefined;
  return value.trim().toLowerCase() as GermanArticle;
}

/** The minimum canonical card shape the audio rules need. */
export interface SpokenTargetCard {
  lemma: string;
  article?: string | null;
}

/**
 * Builds the exact German phrase the learner must hear for a vocabulary card's word audio.
 *
 * Nouns with a canonical article are spoken as `article + lemma`. Verbs, adjectives, adverbs,
 * phrases and anything else with no canonical article are spoken as the canonical German term
 * itself — an article is never invented for them.
 *
 * An article value that is not a canonical German article is treated as "no article" rather than
 * being concatenated blindly, so malformed data can never put a non-word into learner audio.
 */
export function buildSpokenWordTarget(card: SpokenTargetCard): string {
  const lemma = card.lemma?.trim();
  if (!lemma) throw new Error('A spoken word target requires a canonical lemma.');

  const article = normalizeGermanArticle(card.article);
  if (!article) return lemma;

  // Defensive: canonical data keeps the article in its own field, but if a lemma already carries
  // it, do not produce "der der Tisch".
  const firstWord = lemma.split(/\s+/, 1)[0]?.toLowerCase();
  if (firstWord && GERMAN_ARTICLES.includes(firstWord)) return lemma;

  return `${article} ${lemma}`;
}

/**
 * Builds the spoken target for example-sentence audio: the complete canonical German sentence,
 * unchanged. The Persian translation is never spoken as learner German audio, and the canonical
 * sentence is not rewritten for the benefit of the TTS model.
 */
export function buildSpokenSentenceTarget(germanSentence: string | null | undefined): string {
  const sentence = germanSentence?.trim();
  if (!sentence) throw new Error('A spoken sentence target requires a canonical German sentence.');
  return sentence;
}

/** The voice identity a card resolves to, derived only from canonical card data. */
export type GermanVoiceRole =
  'der_masculine' | 'die_feminine' | 'das_neuter' | 'default_no_article';

/** Configured German voices per role. All three article voices must be distinct before audio runs. */
export interface GermanVoiceMapping {
  der: string;
  die: string;
  das?: string;
  default: string;
}

export type GermanVoiceConfigurationIssue =
  'das_voice_unconfigured' | 'article_voices_not_distinct';

/**
 * Validates the qualification boundary independently from provider configuration. The default
 * voice is deliberately excluded: it is not a fourth required article voice.
 */
export function validateGermanArticleVoices(
  mapping: GermanVoiceMapping,
): GermanVoiceConfigurationIssue | undefined {
  const der = mapping.der.trim();
  const die = mapping.die.trim();
  const das = mapping.das?.trim();
  if (!das || das === die) return 'das_voice_unconfigured';
  if (!der || !die || der === die || der === das) return 'article_voices_not_distinct';
  return undefined;
}

export interface EffectiveGermanVoice {
  role: GermanVoiceRole;
  voice: string;
  /**
   * True when a DAS/neuter card deterministically uses the same adult German female voice
   * configured for DIE because no suitable younger German voice is configured. Persisted with the
   * asset so the fallback is always identifiable after the fact.
   */
  usesDieFallbackForDas: boolean;
}

/** Maps a canonical card to its voice role. Never asks a model to guess grammatical gender. */
export function resolveGermanVoiceRole(card: SpokenTargetCard): GermanVoiceRole {
  const article = normalizeGermanArticle(card.article);
  if (article === 'der') return 'der_masculine';
  if (article === 'die') return 'die_feminine';
  if (article === 'das') return 'das_neuter';
  return 'default_no_article';
}

/**
 * Resolves the effective voice for a card. A missing or duplicated article voice is invalid; the
 * caller must refuse generation rather than substituting a different article's voice.
 */
export function resolveEffectiveGermanVoice(
  card: SpokenTargetCard,
  mapping: GermanVoiceMapping,
): EffectiveGermanVoice {
  const role = resolveGermanVoiceRole(card);

  if (role === 'der_masculine') return { role, voice: mapping.der, usesDieFallbackForDas: false };
  if (role === 'die_feminine') return { role, voice: mapping.die, usesDieFallbackForDas: false };

  if (role === 'das_neuter') {
    const younger = mapping.das?.trim();
    if (!younger || younger === mapping.die.trim()) {
      throw new Error('A distinct DAS voice is required.');
    }
    return { role, voice: younger, usesDieFallbackForDas: false };
  }

  return { role, voice: mapping.default, usesDieFallbackForDas: false };
}

/**
 * The canonical LearnBox image standard, loaded from the versioned visual contract that already
 * governs the shipped card images. `style` carries the LearnBox visual language; a card-specific
 * subject brief is composed with it rather than replacing it.
 */
export interface LearnBoxImageStandard {
  version: string;
  model: string;
  style: string;
}

/** The canonical card shape the image rule needs. */
export interface CardImageSubjectSource {
  lemma: string;
  article?: string | null;
  /** Curated canonical visual concept, when editorial review has recorded one. */
  visualConcept?: string | null;
  /**
   * The card's English image prompt. Image models are prompted in English, while the AI generator
   * writes `visualConcept` in Persian for the reviewer, so the prompt outranks the concept.
   */
  imagePrompt?: string | null;
  /** Curated canonical per-card brief from the versioned visual contract, when one exists. */
  brief?: string | null;
}

/**
 * Derives the subject brief for a card image from canonical card data.
 *
 * A curated brief, then the card's English image prompt, then its visual concept wins — those are
 * reviewed canonical values. Only when none exists is a conservative brief derived from the lemma,
 * following the composition the existing contract briefs use (one dominant, centered subject).
 */
export function deriveCardImageSubject(card: CardImageSubjectSource): string {
  const curated = card.brief?.trim() || card.imagePrompt?.trim() || card.visualConcept?.trim();
  if (curated) return curated;

  const lemma = card.lemma?.trim();
  if (!lemma) throw new Error('A card image subject requires a canonical lemma.');

  const article = normalizeGermanArticle(card.article);
  // The German term identifies the subject for the image model; the canonical style string
  // already forbids rendering any text, so naming the term cannot put letters in the frame.
  const subject = article ? `${article} ${lemma}` : lemma;
  return `One clear, unambiguous depiction of the German concept "${subject}", large and centered as the single dominant teaching concept.`;
}

const REQUIRED_IMAGE_POLICY =
  'Depict only the card meaning, clearly and respectfully for Iranian learners; for an abstract word show one clear, directly related situation; no Bobo or any mascot character; no text, letters, numbers, typography, brand logos, watermarks, UI, labels, or clutter.';

/**
 * Composes the final image prompt with the canonical visual contract and non-negotiable quality
 * policy. The explicit policy keeps every current and future contract from omitting learner-safe
 * constraints.
 */
export function buildCardImagePrompt(
  card: CardImageSubjectSource,
  standard: LearnBoxImageStandard,
): string {
  const style = standard.style?.trim();
  if (!style) throw new Error('The canonical LearnBox image standard must define a style.');
  return `${deriveCardImageSubject(card)} ${style} ${REQUIRED_IMAGE_POLICY}`;
}
