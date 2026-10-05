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

import type { GermanVoiceMapping } from '@learnbox/content-models';

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
 * The shipped German voice mapping.
 *
 * These are verified: each produces distinct audio, and each was transcribed back as German by
 * the gateway's ASR. DAS is intentionally left unset — no voice in the configured family is
 * documented or verified as genuinely younger-sounding, so DAS deterministically uses the DIE
 * female voice and that fallback is recorded on every asset. Setting `LEARNBOX_AI_VOICE_DAS`
 * switches DAS to a younger voice with no code change.
 */
export const DEFAULT_GERMAN_VOICE_MAPPING: GermanVoiceMapping = {
  der: 'onyx',
  die: 'nova',
  das: undefined,
  default: 'nova',
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
  };

  const apiKey = environment.LEARNBOX_AI_API_KEY?.trim();
  if (!apiKey) return { enabled: true, reason: 'provider_not_configured', limits };

  const dasVoice = environment.LEARNBOX_AI_VOICE_DAS?.trim();

  return {
    enabled: true,
    provider: new AvalAiMediaProvider(
      apiKey,
      environment.LEARNBOX_AI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL,
      environment.LEARNBOX_AI_AUDIO_MODEL?.trim() || DEFAULT_AUDIO_MODEL,
      environment.LEARNBOX_AI_BASE_URL?.trim() || undefined,
    ),
    voices: {
      der: voice(environment.LEARNBOX_AI_VOICE_DER, DEFAULT_GERMAN_VOICE_MAPPING.der),
      die: voice(environment.LEARNBOX_AI_VOICE_DIE, DEFAULT_GERMAN_VOICE_MAPPING.die),
      // Absent stays absent: that is what triggers the deterministic DIE fallback.
      das: dasVoice || undefined,
      default: voice(environment.LEARNBOX_AI_VOICE_DEFAULT, DEFAULT_GERMAN_VOICE_MAPPING.default),
    },
    limits,
  };
}
