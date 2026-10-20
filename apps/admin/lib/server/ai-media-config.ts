/**
 * Phase 1 / Milestone 1.5 — media capability configuration.
 *
 * Capability profiles are separate by design: TEXT (M1.4) keeps its own model setting, and IMAGE
 * and AUDIO each get their own. They are never merged into one generic "AI model" setting, because
 * one model does not serve all three modalities.
 *
 * The German voice mapping is configuration, not business logic. Nothing downstream hard-codes a
 * voice identifier; the canonical article-to-voice rule in `@learnbox/content-models` resolves a
 * role, and this mapping supplies the configured voice for that role.
 */

import {
  validateGermanArticleVoices,
  type GermanVoiceConfigurationIssue,
  type GermanVoiceMapping,
} from '@learnbox/content-models';

import {
  AvalAiMediaProvider,
  DEFAULT_AUDIO_MODEL,
  DEFAULT_IMAGE_MODEL,
  type AiMediaProvider,
} from './ai-media-provider';

export interface AiMediaLimits {
  /** Abort budget for a single image generation call. */
  imageTimeoutMs: number;
  /** Abort budget for a single speech synthesis call. */
  audioTimeoutMs: number;
  /** Hard ceiling on a stored candidate, so a provider cannot fill the database. */
  maxImageBytes: number;
  maxAudioBytes: number;
  /** Ceiling on a spoken target, to bound TTS cost per call. */
  maxSpeechChars: number;
}

export const DEFAULT_AI_MEDIA_LIMITS: AiMediaLimits = {
  imageTimeoutMs: 180_000,
  audioTimeoutMs: 60_000,
  maxImageBytes: 8 * 1024 * 1024,
  maxAudioBytes: 4 * 1024 * 1024,
  maxSpeechChars: 400,
};

/**
 * The shipped German voice mapping: the product owner's final choice of 2026-10-15, made by
 * listening to real `eleven_multilingual_v2` samples of all candidate voices (PDR-010). It is not a
 * native-speaker pronunciation certification. `LEARNBOX_AI_VOICE_*` may override a role, but the
 * result is still checked by `germanVoiceIssue` and never silently replaced.
 */
export const DEFAULT_GERMAN_VOICE_MAPPING: GermanVoiceMapping = {
  der: 'sage',
  die: 'nova',
  das: 'fable',
  default: 'nova',
};

/** The model the article voices were chosen on; the voice ids below are only valid for it. */
export const QUALIFIED_AUDIO_MODEL = DEFAULT_AUDIO_MODEL;

/** Voice ids AvalAI accepts for `eleven_multilingual_v2` (docs.avalai.ir/en/providers/elevenlabs). */
export const AVALAI_ELEVEN_VOICES: readonly string[] = [
  'alloy',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
];

export type GermanVoiceIssue =
  GermanVoiceConfigurationIssue | 'voice_not_supported' | 'audio_model_not_qualified';

/**
 * The one check every audio path runs before speaking: a qualified model, voice ids the gateway
 * accepts, and three distinct article voices. Any issue refuses audio; nothing substitutes a voice.
 */
export function germanVoiceIssue(
  voices: GermanVoiceMapping,
  model: string,
): GermanVoiceIssue | undefined {
  if (model.trim() !== QUALIFIED_AUDIO_MODEL) return 'audio_model_not_qualified';
  const ids = [voices.der, voices.die, voices.das, voices.default];
  if (ids.some((id) => id !== undefined && !AVALAI_ELEVEN_VOICES.includes(id.trim()))) {
    return 'voice_not_supported';
  }
  return validateGermanArticleVoices(voices);
}

export const GERMAN_VOICE_ISSUE_MESSAGES: Record<GermanVoiceIssue, string> = {
  das_voice_unconfigured: 'صدای جداگانه و تأییدشده برای اسم‌های «das» پیکربندی نشده است.',
  article_voices_not_distinct: 'سه صدای der، die و das باید متفاوت و تأییدشده باشند.',
  voice_not_supported: 'یکی از صداهای پیکربندی‌شده برای مدل صوتی AvalAI معتبر نیست.',
  audio_model_not_qualified:
    'صداهای der، die و das فقط برای مدل eleven_multilingual_v2 تأیید شده‌اند.',
};

export type AiMediaConfig =
  | { enabled: false; reason: 'disabled' }
  | { enabled: true; reason: 'provider_not_configured'; limits: AiMediaLimits }
  | {
      enabled: true;
      provider: AiMediaProvider;
      voices: GermanVoiceMapping;
      limits: AiMediaLimits;
    };

function positiveInt(raw: string | undefined, fallback: number, ceiling: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) return fallback;
  return Math.min(value, ceiling);
}

function voice(raw: string | undefined, fallback: string): string {
  return raw?.trim() || fallback;
}

/**
 * The effective article-voice mapping, with the same `LEARNBOX_AI_VOICE_*` overrides generation
 * uses. Publish readiness needs it even while Media AI is disabled, to judge accepted audio.
 */
export function readGermanVoiceMapping(
  environment: Record<string, string | undefined>,
): GermanVoiceMapping {
  return {
    der: voice(environment.LEARNBOX_AI_VOICE_DER, DEFAULT_GERMAN_VOICE_MAPPING.der),
    die: voice(environment.LEARNBOX_AI_VOICE_DIE, DEFAULT_GERMAN_VOICE_MAPPING.die),
    das: voice(environment.LEARNBOX_AI_VOICE_DAS, DEFAULT_GERMAN_VOICE_MAPPING.das ?? ''),
    default: voice(environment.LEARNBOX_AI_VOICE_DEFAULT, DEFAULT_GERMAN_VOICE_MAPPING.default),
  };
}

/**
 * Resolves the media provider from the environment.
 *
 * Returns `provider_not_configured` rather than throwing when the credential is absent, so a route
 * can answer with an honest reason instead of pretending to generate. There is no stub provider and
 * no development fallback: a missing key means no media, never placeholder media.
 */
export function readAiMediaConfig(environment: Record<string, string | undefined>): AiMediaConfig {
  if (environment.LEARNBOX_ADMIN_MEDIA_AI_ENABLED !== 'true') {
    return { enabled: false, reason: 'disabled' };
  }

  const limits: AiMediaLimits = {
    ...DEFAULT_AI_MEDIA_LIMITS,
    maxSpeechChars: positiveInt(
      environment.LEARNBOX_AI_MAX_SPEECH_CHARS,
      DEFAULT_AI_MEDIA_LIMITS.maxSpeechChars,
      2000,
    ),
    audioTimeoutMs: positiveInt(
      environment.LEARNBOX_AI_AUDIO_TIMEOUT_MS,
      DEFAULT_AI_MEDIA_LIMITS.audioTimeoutMs,
      300_000,
    ),
  };

  const apiKey = environment.LEARNBOX_AI_API_KEY?.trim();
  if (!apiKey) return { enabled: true, reason: 'provider_not_configured', limits };

  return {
    enabled: true,
    provider: new AvalAiMediaProvider(
      apiKey,
      environment.LEARNBOX_AI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL,
      environment.LEARNBOX_AI_AUDIO_MODEL?.trim() || DEFAULT_AUDIO_MODEL,
      environment.LEARNBOX_AI_BASE_URL?.trim() || undefined,
      // Unset by default: the native format is only requested once AvalAI support is qualified.
      environment.LEARNBOX_AI_AUDIO_OUTPUT_FORMAT?.trim() || undefined,
    ),
    voices: readGermanVoiceMapping(environment),
    limits,
  };
}
