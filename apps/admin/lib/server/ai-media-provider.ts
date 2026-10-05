/**
 * Phase 1 / Milestone 1.5 — the AI media provider boundary.
 *
 * Mirrors the M1.4 text provider deliberately: one interface, one implementation, server-only.
 * The credential is read from the environment, never returned, never logged and never placed in a
 * response, a stored asset or generation metadata.
 *
 * Capability profiles stay separate. An image model and a TTS model are configured and selected
 * independently, because one model does not serve both modalities well. There is no cross-modality
 * fallback and no silent substitution: if the selected model or voice is rejected, the real failure
 * is reported.
 */

import { AiProviderError } from './ai-generation-provider';

/** AvalAI fronts both the image and the speech protocols used here. */
const DEFAULT_BASE_URL = 'https://api.avalai.ir';

/**
 * Canonical defaults.
 *
 * `flux.2-pro` is the model the canonical LearnBox visual contract already names and the model
 * whose output passed LearnBox visual QA at 1024x1024 (ADR 0004); it is not the most expensive
 * option, it is the one proven against this standard.
 *
 * `eleven_multilingual_v2` is a genuinely multilingual German voice family from the same vendor
 * family already validated for LearnBox German audio, and — unlike the Gemini TTS models on this
 * gateway — it REJECTS an unknown voice instead of quietly returning audio in some other voice.
 * That rejection is what makes the canonical article-to-voice mapping provable at runtime.
 */
export const DEFAULT_IMAGE_MODEL = 'flux.2-pro';
export const DEFAULT_AUDIO_MODEL = 'eleven_multilingual_v2';
export const CANONICAL_IMAGE_SIZE = '1024x1024';

export type GeneratedImageContentType = 'image/png' | 'image/jpeg';

export interface GeneratedImage {
  bytes: Buffer;
  contentType: GeneratedImageContentType;
  /** The model that actually served the request, for attribution. */
  model: string;
  provider: string;
  /** Provider-reported cost unit when supplied; never inferred. */
  estimatedCostUnit: number | null;
}

export interface GeneratedAudio {
  bytes: Buffer;
  contentType: 'audio/mpeg';
  model: string;
  provider: string;
  /** The voice actually requested, for attribution and for proving the voice mapping. */
  voice: string;
}

export interface ImageGenerationRequest {
  prompt: string;
  /** Per-request model override chosen by the Admin; falls back to the configured image model. */
  model?: string;
  size?: string;
  timeoutMs: number;
}

export interface SpeechSynthesisRequest {
  /** The exact spoken target LearnBox constructed from canonical card data. */
  text: string;
  voice: string;
  /** Per-request model override chosen by the Admin; falls back to the configured audio model. */
  model?: string;
  timeoutMs: number;
}

export interface AiMediaProvider {
  readonly provider: string;
  readonly imageModel: string;
  readonly audioModel: string;
  generateImage(request: ImageGenerationRequest): Promise<GeneratedImage>;
  synthesizeSpeech(request: SpeechSynthesisRequest): Promise<GeneratedAudio>;
  /** Image-capable models this account may select. [] when the catalog cannot be read. */
  listImageModels(): Promise<string[]>;
  /** TTS-capable models this account may select. [] when the catalog cannot be read. */
  listAudioModels(): Promise<string[]>;
}

/**
 * Identifies the real format from the bytes rather than trusting a provider header or assuming a
 * format from the model name. An unrecognised payload fails closed.
 */
function sniffImageContentType(bytes: Buffer): GeneratedImageContentType {
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return 'image/png';
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  throw new AiProviderError(
    'provider_empty_response',
    'پاسخ تصویری سرویس در قالب شناخته‌شده‌ای نیست.',
  );
}

/** mp3 frames start with an ID3 tag or an MPEG frame sync. */
function assertMp3(bytes: Buffer): void {
  const isId3 = bytes.length > 3 && bytes.subarray(0, 3).toString('ascii') === 'ID3';
  const isFrameSync = bytes.length > 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  if (!isId3 && !isFrameSync) {
    throw new AiProviderError('provider_empty_response', 'پاسخ صوتی سرویس قابل استفاده نیست.');
  }
}

/**
 * Maps a transport/HTTP failure onto a typed error.
 *
 * The provider's own error body is deliberately never read into the message: AvalAI error payloads
 * echo a masked fragment of the submitted credential, so propagating or logging them would leak
 * key material. Only the status code shapes the outcome.
 */
function providerFailure(status: number, what: string): AiProviderError {
  if (status === 408 || status === 504) {
    return new AiProviderError('provider_timeout', `زمان ${what} به پایان رسید.`);
  }
  if (status === 400 || status === 404 || status === 422) {
    // A rejected model or voice must surface as a real failure, never a silent substitution.
    return new AiProviderError(
      'provider_rejected',
      `سرویس ${what} را نپذیرفت (کد ${status}). مدل یا صدای انتخاب‌شده را بررسی کنید.`,
    );
  }
  return new AiProviderError('provider_unavailable', `سرویس ${what} در دسترس نیست (کد ${status}).`);
}

async function postJson(
  url: string,
  apiKey: string,
  body: unknown,
  timeoutMs: number,
  what: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw providerFailure(response.status, what);
    return response;
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiProviderError('provider_timeout', `زمان ${what} به پایان رسید.`);
    }
    throw new AiProviderError('provider_unavailable', `سرویس ${what} در دسترس نیست.`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The only shipped media provider. Speaks the OpenAI-compatible `/v1/images/generations` and
 * `/v1/audio/speech` protocols, so the base URL decides which host answers.
 */
export class AvalAiMediaProvider implements AiMediaProvider {
  readonly provider: string;

  constructor(
    private readonly apiKey: string,
    readonly imageModel: string = DEFAULT_IMAGE_MODEL,
    readonly audioModel: string = DEFAULT_AUDIO_MODEL,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
  ) {
    this.provider = new URL(this.baseUrl).host;
  }

  async generateImage(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const model = request.model?.trim() || this.imageModel;
    const response = await postJson(
      `${this.baseUrl}/v1/images/generations`,
      this.apiKey,
      {
        model,
        prompt: request.prompt,
        size: request.size ?? CANONICAL_IMAGE_SIZE,
        n: 1,
        response_format: 'b64_json',
      },
      request.timeoutMs,
      'تولید تصویر',
    );

    const payload = (await response.json()) as {
      data?: { b64_json?: string; url?: string }[];
      estimated_cost?: { unit?: number };
    };
    const item = payload.data?.[0];
    let bytes: Buffer | undefined;
    if (typeof item?.b64_json === 'string' && item.b64_json.length > 0) {
      bytes = Buffer.from(item.b64_json, 'base64');
    } else if (typeof item?.url === 'string') {
      const fetched = await fetch(item.url);
      if (!fetched.ok) throw providerFailure(fetched.status, 'دریافت تصویر تولیدشده');
      bytes = Buffer.from(await fetched.arrayBuffer());
    }
    if (!bytes?.length) {
      throw new AiProviderError('provider_empty_response', 'سرویس تصویری تولید نکرد.');
    }

    return {
      bytes,
      contentType: sniffImageContentType(bytes),
      model,
      provider: this.provider,
      estimatedCostUnit:
        typeof payload.estimated_cost?.unit === 'number' ? payload.estimated_cost.unit : null,
    };
  }

  async synthesizeSpeech(request: SpeechSynthesisRequest): Promise<GeneratedAudio> {
    const text = request.text?.trim();
    if (!text) {
      throw new AiProviderError('provider_rejected', 'متن گفتار نمی‌تواند خالی باشد.');
    }
    const voice = request.voice?.trim();
    if (!voice) {
      throw new AiProviderError('provider_rejected', 'صدای گفتار تعیین نشده است.');
    }
    const model = request.model?.trim() || this.audioModel;

    const response = await postJson(
      `${this.baseUrl}/v1/audio/speech`,
      this.apiKey,
      { model, voice, input: text, response_format: 'mp3' },
      request.timeoutMs,
      'تولید صدا',
    );

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length)
      throw new AiProviderError('provider_empty_response', 'سرویس صدایی تولید نکرد.');
    assertMp3(bytes);

    return { bytes, contentType: 'audio/mpeg', model, provider: this.provider, voice };
  }

  private async listModels(pattern: RegExp): Promise<string[]> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(`${this.baseUrl}/v1/models`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          signal: controller.signal,
        });
        if (!response.ok) return [];
        const payload = (await response.json()) as { data?: { id?: unknown }[] };
        return (payload.data ?? [])
          .map((entry) => (typeof entry.id === 'string' ? entry.id : undefined))
          .filter((id): id is string => Boolean(id) && pattern.test(id!))
          .sort();
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // The catalogue is a convenience for the Admin picker; never surface provider internals.
      return [];
    }
  }

  /**
   * Capability is not inferred from a name alone: these patterns narrow the catalogue to families
   * this gateway actually serves on the image endpoint, and the Admin selection is still validated
   * against the live list before use.
   */
  listImageModels(): Promise<string[]> {
    return this.listModels(
      /^(flux|cf\.flux|gpt-image|gemini-[\d.]+(-pro|-flash)?[\w.-]*-image|qwen-image|seedream|gen4_image|z-image)/i,
    );
  }

  listAudioModels(): Promise<string[]> {
    return this.listModels(/^(eleven_|tts-1|gpt-audio|gemini-[\w.-]*-tts|groq\.playai-tts)/i);
  }
}
