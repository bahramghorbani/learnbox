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

import { Agent, fetch as undiciFetch } from 'undici';

export interface AiTextCompletionRequest {
  system: string;
  user: string;
  maxOutputTokens: number;
  /** Abort budget for a single provider call. */
  timeoutMs: number;
  /** Per-call model selected by the trusted server; never browser input for reviewer/repair. */
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
  | 'provider_unavailable'
  | 'provider_rejected'
  | 'provider_timeout'
  | 'provider_empty_response'
  | 'provider_incomplete_response';

export interface AiProviderAttemptEvidence {
  stage: 'fetch_started' | 'response_headers' | 'response_body';
  elapsedMs: number;
  httpStatus: number | null;
  requestId: string | null;
}

export class AiProviderError extends Error {
  constructor(
    readonly code: AiProviderErrorCode,
    message: string,
    readonly attempt?: AiProviderAttemptEvidence,
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
    // undici's own fetch, not Node's bundled one: the per-call Agent below must come from the same
    // undici version as the fetch that uses it.
    fetchImpl: typeof fetch = undiciFetch as unknown as typeof fetch,
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
    // One deadline for the whole call: connecting, waiting for headers AND reading the body. The
    // timer stays armed until the body is fully read. undici's own limits default to 300 s, which
    // would end a longer allowed call early, so this call's Agent uses the same budget. The Agent
    // is local to this provider call; the process-wide dispatcher is never touched.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    const dispatcher = new Agent({
      headersTimeout: request.timeoutMs,
      bodyTimeout: request.timeoutMs,
    });
    const timedOut = (error: unknown) =>
      controller.signal.aborted ||
      ['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(
        String((error as { cause?: { code?: unknown } })?.cause?.code ?? ''),
      );
    const timeoutError = () =>
      new AiProviderError('provider_timeout', 'پاسخ سرویس هوش مصنوعی در زمان مجاز نرسید.');
    try {
      const init = {
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
        dispatcher,
      };
      let response: Response;
      try {
        response = await this.#fetchImpl(this.#endpoint, init);
      } catch (error) {
        // An abort and a transport failure are reported distinctly so the job can say which it was.
        if (timedOut(error)) throw timeoutError();
        throw new AiProviderError('provider_unavailable', 'اتصال به سرویس هوش مصنوعی برقرار نشد.');
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
      } catch (error) {
        if (timedOut(error)) throw timeoutError();
        throw new AiProviderError('provider_empty_response', 'پاسخ سرویس هوش مصنوعی خوانا نبود.');
      }

      // Only a reply the model finished on its own is usable. `max_tokens` (the model's own output
      // ceiling), `refusal`, a missing reason or anything else means the text may be cut off; a
      // cut-off JSON prefix can still parse, so this is checked before any content is read.
      const stopReason = (payload as { stop_reason?: unknown } | null)?.stop_reason;
      if (stopReason !== 'end_turn') {
        throw new AiProviderError(
          'provider_incomplete_response',
          'پاسخ سرویس هوش مصنوعی کامل نشد و پذیرفته نشد.',
        );
      }

      const text = extractAnthropicText(payload);
      if (!text) {
        throw new AiProviderError(
          'provider_empty_response',
          'سرویس هوش مصنوعی پاسخ خالی برگرداند.',
        );
      }
      return text;
    } finally {
      // Every path — success, rejection, timeout — releases the timer and this call's sockets.
      clearTimeout(timer);
      void dispatcher.destroy().catch(() => undefined);
    }
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
      /** Default models per role; the generator default may be overridden per job by the Admin. */
      models: AiModelRoles;
    };

/**
 * Server-side technical ceilings. They exist to stop runaway loops, accidental repeats and broken
 * operations, not to budget money: a prompt can ask for more, the plan is clamped to these.
 */
export interface AiGenerationLimits {
  /** Hard ceiling on cards per job, whatever the prompt says. */
  maxCards: number;
  /** Cards requested per provider call. */
  batchSize: number;
  /** Retries of a single failing step before the job fails honestly. */
  maxBatchAttempts: number;
  maxPromptChars: number;
  perCallTimeoutMs: number;
  /**
   * `max_tokens` of one plan or generator call (adaptive thinking draws on the same budget).
   * Defaults to the model's own maximum: it is a required API parameter, not a spending cap.
   */
  maxOutputTokens: number;
  /** `max_tokens` of one reviewer or repair call; defaults to the model's own maximum. */
  reviewerMaxOutputTokens: number;
  /** Automatic repair rounds per card before its findings are reported as unresolved. */
  maxRepairRounds: number;
  /** Extra generation batches allowed to replace invalid, duplicate or unresolved cards. */
  maxReplacementBatches: number;
}

/**
 * Largest `max_tokens` the synchronous Messages API accepts for the owner's models (Claude Opus
 * 5.5 and Claude Fable 5.1 both document 128K). The Anthropic protocol makes `max_tokens`
 * required, so the field cannot simply be omitted; sending the model maximum means the only
 * output ceiling left is the model's own. A model with a lower maximum needs the env override.
 */
export const MODEL_MAX_OUTPUT_TOKENS = 128_000;

export const DEFAULT_AI_GENERATION_LIMITS: AiGenerationLimits = {
  maxCards: 500,
  batchSize: 25,
  maxBatchAttempts: 3,
  maxPromptChars: 2000,
  perCallTimeoutMs: 240_000,
  maxOutputTokens: MODEL_MAX_OUTPUT_TOKENS,
  reviewerMaxOutputTokens: MODEL_MAX_OUTPUT_TOKENS,
  maxRepairRounds: 2,
  maxReplacementBatches: 3,
};

/**
 * The models the owner chose (2026-10-15). Generation (plan, vocabulary, cards) and independent
 * review/repair are configured separately so either can be replaced without touching the other.
 */
export const DEFAULT_GENERATOR_MODEL = 'claude-opus-5-5';
export const DEFAULT_REVIEWER_MODEL = 'claude-fable-5-1';

/** Models used by one job, pinned at plan time. */
export interface AiModelRoles {
  generator: string;
  reviewer: string;
  repair: string;
}

function boundedInt(raw: string | undefined, fallback: number, minimum: number, ceiling: number) {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) return fallback;
  return Math.min(value, ceiling);
}

function positiveInt(raw: string | undefined, fallback: number, ceiling: number): number {
  return boundedInt(raw, fallback, 1, ceiling);
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
  const defaults = DEFAULT_AI_GENERATION_LIMITS;
  const limits: AiGenerationLimits = {
    ...defaults,
    maxCards: positiveInt(environment.LEARNBOX_AI_MAX_CARDS, defaults.maxCards, defaults.maxCards),
    batchSize: positiveInt(environment.LEARNBOX_AI_BATCH_SIZE, defaults.batchSize, 100),
    perCallTimeoutMs: positiveInt(
      environment.LEARNBOX_AI_CALL_TIMEOUT_MS,
      defaults.perCallTimeoutMs,
      600_000,
    ),
    maxOutputTokens: positiveInt(
      environment.LEARNBOX_AI_MAX_OUTPUT_TOKENS,
      defaults.maxOutputTokens,
      MODEL_MAX_OUTPUT_TOKENS,
    ),
    reviewerMaxOutputTokens: positiveInt(
      environment.LEARNBOX_AI_REVIEWER_MAX_OUTPUT_TOKENS,
      defaults.reviewerMaxOutputTokens,
      MODEL_MAX_OUTPUT_TOKENS,
    ),
    // 0 is meaningful: review only, never repair automatically.
    maxRepairRounds: boundedInt(
      environment.LEARNBOX_AI_MAX_REPAIR_ROUNDS,
      defaults.maxRepairRounds,
      0,
      5,
    ),
    maxReplacementBatches: boundedInt(
      environment.LEARNBOX_AI_MAX_REPLACEMENT_BATCHES,
      defaults.maxReplacementBatches,
      0,
      10,
    ),
  };
  const generator = environment.LEARNBOX_AI_MODEL?.trim() || DEFAULT_GENERATOR_MODEL;
  const reviewer = environment.LEARNBOX_AI_REVIEWER_MODEL?.trim() || DEFAULT_REVIEWER_MODEL;
  const models: AiModelRoles = {
    generator,
    reviewer,
    // Repair belongs to the reviewing side by default (owner decision), but is separately settable.
    repair: environment.LEARNBOX_AI_REPAIR_MODEL?.trim() || reviewer,
  };
  const apiKey = environment.LEARNBOX_AI_API_KEY?.trim();
  if (!apiKey) return { enabled: true, reason: 'provider_not_configured', limits, models };
  return {
    enabled: true,
    provider: new AnthropicTextProvider(
      apiKey,
      generator,
      environment.LEARNBOX_AI_BASE_URL?.trim() || undefined,
    ),
    limits,
    models,
  };
}
