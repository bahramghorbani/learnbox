/**
 * Phase 1 / Milestone 1.4 — the AI provider boundary.
 *
 * Deliberately one interface with one method and one implementation. LearnBox business logic
 * (planning, batching, validation, acceptance) talks only to `AiTextProvider`, so swapping or
 * adding a vendor later is a new class plus one `readAiGenerationConfig` branch — but this
 * milestone ships no routing layer, no model registry and no second vendor.
 *
 * Everything here is server-only. The key is read from the environment, never returned, never
 * logged and never placed in a response or a generated card. `describe()` exposes provider and
 * model names only, which is what the Admin UI and the audit trail need.
 */

export interface AiTextCompletionRequest {
  system: string;
  user: string;
  maxOutputTokens: number;
  /** Abort budget for a single provider call. */
  timeoutMs: number;
  /** Per-job model override chosen by the Admin; falls back to the configured default. */
  model?: string;
}

export interface AiTextProvider {
  readonly provider: string;
  readonly model: string;
  /** Returns the model's raw text response. Throws `AiProviderError` on any failure. */
  complete(request: AiTextCompletionRequest): Promise<string>;
  /**
   * Text models this account may select, for the Admin's model picker. Returns [] when the
   * catalog cannot be read — the credential stays inside the provider either way.
   */
  listTextModels(): Promise<string[]>;
}

export type AiProviderErrorCode =
  'provider_unavailable' | 'provider_rejected' | 'provider_timeout' | 'provider_empty_response';

export class AiProviderError extends Error {
  constructor(
    readonly code: AiProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

const ANTHROPIC_VERSION = '2023-06-01';
/** AvalAI exposes Anthropic's own wire protocol, so one implementation serves both. */
const DEFAULT_BASE_URL = 'https://api.avalai.ir';

/**
 * The only shipped provider. Uses `fetch` directly — no SDK dependency for one POST.
 *
 * It speaks the Anthropic `/v1/messages` protocol; the base URL decides which host answers, so the
 * same class serves Anthropic directly or an Anthropic-compatible gateway. `provider` records the
 * host that actually served the request, which is what the audit trail needs.
 */
export class AnthropicTextProvider implements AiTextProvider {
  readonly provider: string;

  // A real JS private field, not a TypeScript `private`: `private` is erased at compile time, so
  // the key would remain an enumerable own property and leak through JSON.stringify or any logger
  // that serialises this object. `#` fields are invisible to both.
  readonly #apiKey: string;
  readonly #endpoint: string;
  readonly #fetchImpl: typeof fetch;

  readonly #baseUrl: string;

  constructor(
    apiKey: string,
    readonly model: string,
    baseUrl: string = DEFAULT_BASE_URL,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.#apiKey = apiKey;
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#endpoint = `${this.#baseUrl}/v1/messages`;
    this.#fetchImpl = fetchImpl;
    this.provider = hostLabel(this.#baseUrl);
  }

  listTextModels(): Promise<string[]> {
    return listClaudeTextModels(this.#apiKey, this.#baseUrl, this.#fetchImpl);
  }

  async complete(request: AiTextCompletionRequest): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    let response: Response;
    try {
      response = await this.#fetchImpl(this.#endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.#apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          // The job's selected model wins; the configured default is the fallback.
          model: request.model ?? this.model,
          max_tokens: request.maxOutputTokens,
          system: request.system,
          messages: [{ role: 'user', content: request.user }],
        }),
        signal: controller.signal,
      });
    } catch (error) {
      // An abort and a transport failure are reported distinctly so the job can say which it was.
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AiProviderError('provider_timeout', 'پاسخ سرویس هوش مصنوعی در زمان مجاز نرسید.');
      }
      throw new AiProviderError('provider_unavailable', 'اتصال به سرویس هوش مصنوعی برقرار نشد.');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // The provider body may echo request content; only the status is surfaced or logged.
      throw new AiProviderError(
        'provider_rejected',
        `سرویس هوش مصنوعی درخواست را نپذیرفت (کد ${response.status}).`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AiProviderError('provider_empty_response', 'پاسخ سرویس هوش مصنوعی خوانا نبود.');
    }

    const text = extractAnthropicText(payload);
    if (!text) {
      throw new AiProviderError('provider_empty_response', 'سرویس هوش مصنوعی پاسخ خالی برگرداند.');
    }
    return text;
  }
}

/**
 * Claude text models the account can actually use, for the Admin's model selector.
 *
 * Served by the gateway's OpenAI-compatible catalog surface. Returns [] rather than throwing: a
 * catalog outage must not block generation with an already-valid default model.
 */
export async function listClaudeTextModels(
  apiKey: string,
  baseUrl: string = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/v1/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    const data = (payload as { data?: unknown })?.data;
    if (!Array.isArray(data)) return [];
    return data
      .map((entry) => String((entry as { id?: unknown })?.id ?? ''))
      .filter((id) => id.toLowerCase().includes('claude'))
      .sort();
  } catch {
    return [];
  }
}

/** Host of the serving endpoint, for honest provider attribution in the audit trail. */
function hostLabel(baseUrl: string): string {
  try {
    return new URL(baseUrl).host.replace(/^api\./, '');
  } catch {
    return 'unknown';
  }
}

function extractAnthropicText(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return '';
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) =>
      typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text'
        ? String((block as { text?: unknown }).text ?? '')
        : '',
    )
    .join('')
    .trim();
}

/**
 * Feature availability and provider availability are SEPARATE.
 *
 * `enabled` is the feature flag: it governs whether the AI surface exists at all. `provider` is
 * present only when a credential is configured. The split matters because inspecting and accepting
 * an already-generated job needs no provider — gating those on the credential would strand
 * reviewed content the moment a key is rotated or removed.
 */
export type AiGenerationConfig =
  | { enabled: false; reason: 'disabled' }
  | {
      enabled: true;
      /** Absent when no credential is configured; generation then fails honestly. */
      provider?: AiTextProvider;
      reason?: 'provider_not_configured';
      limits: AiGenerationLimits;
    };

/** Server-side cost/scale ceilings. A prompt can ask for more; the plan is clamped to these. */
export interface AiGenerationLimits {
  /** Hard ceiling on cards per job, whatever the prompt says. */
  maxCards: number;
  /** Cards requested per provider call. */
  batchSize: number;
  /** Retries of a single failing batch before the job fails honestly. */
  maxBatchAttempts: number;
  maxPromptChars: number;
  perCallTimeoutMs: number;
  maxOutputTokens: number;
}

export const DEFAULT_AI_GENERATION_LIMITS: AiGenerationLimits = {
  maxCards: 500,
  batchSize: 25,
  maxBatchAttempts: 3,
  maxPromptChars: 2000,
  perCallTimeoutMs: 120_000,
  maxOutputTokens: 8000,
};

const DEFAULT_MODEL = 'claude-sonnet-4-5';

function positiveInt(raw: string | undefined, fallback: number, ceiling: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) return fallback;
  return Math.min(value, ceiling);
}

/**
 * Resolves the provider from the environment.
 *
 * Returns `provider_not_configured` rather than throwing when the credential is absent, so the
 * route can answer 503 with an honest reason instead of pretending to generate. There is no
 * development fallback and no stub provider: a missing key means no generation, never fake cards.
 */
export function readAiGenerationConfig(
  environment: Record<string, string | undefined>,
): AiGenerationConfig {
  if (environment.LEARNBOX_ADMIN_CONTENT_AI_ENABLED !== 'true') {
    return { enabled: false, reason: 'disabled' };
  }
  const limits: AiGenerationLimits = {
    ...DEFAULT_AI_GENERATION_LIMITS,
    maxCards: positiveInt(
      environment.LEARNBOX_AI_MAX_CARDS,
      DEFAULT_AI_GENERATION_LIMITS.maxCards,
      DEFAULT_AI_GENERATION_LIMITS.maxCards,
    ),
    batchSize: positiveInt(
      environment.LEARNBOX_AI_BATCH_SIZE,
      DEFAULT_AI_GENERATION_LIMITS.batchSize,
      100,
    ),
  };
  const apiKey = environment.LEARNBOX_AI_API_KEY?.trim();
  if (!apiKey) return { enabled: true, reason: 'provider_not_configured', limits };
  return {
    enabled: true,
    provider: new AnthropicTextProvider(
      apiKey,
      environment.LEARNBOX_AI_MODEL?.trim() || DEFAULT_MODEL,
      environment.LEARNBOX_AI_BASE_URL?.trim() || undefined,
    ),
    limits,
  };
}
