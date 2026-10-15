import { describe, expect, it } from 'vitest';

import {
  AiProviderError,
  AnthropicTextProvider,
  DEFAULT_AI_GENERATION_LIMITS,
  MODEL_MAX_OUTPUT_TOKENS,
  readAiGenerationConfig,
} from '../lib/server/ai-generation-provider';

/** A fetch double that records the request body and answers with one Messages API payload. */
function fakeFetch(payload: unknown) {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetchImpl, bodies };
}

function reply(stopReason: unknown, text = '{"cards":[]}') {
  return {
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    ...(stopReason === undefined ? {} : { stop_reason: stopReason }),
  };
}

function provider(fetchImpl: typeof fetch) {
  return new AnthropicTextProvider(
    'test-key-not-real',
    'claude-opus-5-5',
    'https://gw.test',
    fetchImpl,
  );
}

const REQUEST = {
  system: 's',
  user: 'u',
  maxOutputTokens: MODEL_MAX_OUTPUT_TOKENS,
  timeoutMs: 5_000,
};

describe('output token ceiling', () => {
  it('defaults every role to the model maximum, not an artificial budget', () => {
    expect(MODEL_MAX_OUTPUT_TOKENS).toBe(128_000);
    expect(DEFAULT_AI_GENERATION_LIMITS.maxOutputTokens).toBe(MODEL_MAX_OUTPUT_TOKENS);
    expect(DEFAULT_AI_GENERATION_LIMITS.reviewerMaxOutputTokens).toBe(MODEL_MAX_OUTPUT_TOKENS);

    const config = readAiGenerationConfig({
      LEARNBOX_ADMIN_CONTENT_AI_ENABLED: 'true',
      LEARNBOX_AI_API_KEY: 'test-key-not-real',
    });
    if (!config.enabled) throw new Error('feature expected on');
    expect(config.limits.maxOutputTokens).toBe(MODEL_MAX_OUTPUT_TOKENS);
    expect(config.limits.reviewerMaxOutputTokens).toBe(MODEL_MAX_OUTPUT_TOKENS);
  });

  it('keeps an explicit lower override for a model with a smaller maximum, never above it', () => {
    const lower = readAiGenerationConfig({
      LEARNBOX_ADMIN_CONTENT_AI_ENABLED: 'true',
      LEARNBOX_AI_MAX_OUTPUT_TOKENS: '64000',
      LEARNBOX_AI_REVIEWER_MAX_OUTPUT_TOKENS: '999999',
    });
    if (!lower.enabled) throw new Error('feature expected on');
    expect(lower.limits.maxOutputTokens).toBe(64_000);
    expect(lower.limits.reviewerMaxOutputTokens).toBe(MODEL_MAX_OUTPUT_TOKENS);
  });

  it('sends the requested ceiling as max_tokens, which the protocol requires', async () => {
    const { fetchImpl, bodies } = fakeFetch(reply('end_turn'));
    await expect(provider(fetchImpl).complete(REQUEST)).resolves.toBe('{"cards":[]}');
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.max_tokens).toBe(MODEL_MAX_OUTPUT_TOKENS);
  });
});

describe('incomplete replies are never accepted', () => {
  // A reply cut off at the model's own ceiling can still contain parseable JSON, so the stop
  // reason — not the parser — decides. Only a reply the model finished itself is usable.
  it.each([
    ['max_tokens', 'max_tokens'],
    ['refusal', 'refusal'],
    ['a missing stop reason', undefined],
    ['an unknown stop reason', 'pause_turn'],
  ])('rejects a reply that stopped with %s, even when its text parses', async (_label, reason) => {
    const { fetchImpl } = fakeFetch(reply(reason, '{"cards":[{"lemma":"Hallo"}]}'));
    const error = await provider(fetchImpl)
      .complete(REQUEST)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiProviderError);
    expect((error as AiProviderError).code).toBe('provider_incomplete_response');
  });
});
