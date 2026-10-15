import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

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

const DONE = JSON.stringify(reply('end_turn'));

/**
 * A real local HTTP server (no network, no provider), so the call goes through the shipped undici
 * fetch and Agent. `handle` decides when headers and body are sent; `closed` resolves when the
 * client drops the connection, which is how an aborted request is observed from the server side.
 */
async function localProvider(handle: (res: ServerResponse) => void) {
  let closed!: () => void;
  const clientClosed = new Promise<void>((resolve) => {
    closed = resolve;
  });
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    res.on('close', () => {
      if (!res.writableFinished) closed();
    });
    req.resume();
    handle(res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  servers.push(server);
  const ai = new AnthropicTextProvider(
    'test-key-not-real',
    'claude-opus-5-5',
    `http://127.0.0.1:${port}`,
  );
  return { ai, clientClosed };
}
const servers: Array<ReturnType<typeof createServer>> = [];
afterEach(() => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    server.close();
  }
  vi.useRealTimers();
});

async function failure(promise: Promise<unknown>) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AiProviderError);
  return (error as AiProviderError).code;
}

describe('one deadline covers the whole provider call', () => {
  it('gives this call its own Agent with header and body limits equal to the call budget', async () => {
    let init: (RequestInit & { dispatcher?: { options?: unknown } }) | undefined;
    const fetchImpl = (async (_url: unknown, given?: RequestInit) => {
      init = given;
      return new Response(DONE, { status: 200 });
    }) as typeof fetch;
    await provider(fetchImpl).complete({ ...REQUEST, timeoutMs: 600_000 });
    const dispatcher = init?.dispatcher as unknown as Record<symbol, unknown>;
    expect(dispatcher).toBeDefined();
    const options = Object.getOwnPropertySymbols(dispatcher)
      .map((key) => dispatcher[key])
      .find((value) => (value as { headersTimeout?: unknown })?.headersTimeout !== undefined);
    expect(options).toMatchObject({ headersTimeout: 600_000, bodyTimeout: 600_000 });
  });

  it('clears the deadline timer on success and on every failure', async () => {
    vi.useFakeTimers();
    const ok = (async () => new Response(DONE, { status: 200 })) as typeof fetch;
    const rejected = (async () => new Response('no', { status: 503 })) as typeof fetch;
    const unreadable = (async () => new Response('{', { status: 200 })) as typeof fetch;
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await provider(ok).complete(REQUEST);
    expect(vi.getTimerCount()).toBe(0);
    for (const fetchImpl of [rejected, unreadable, down]) {
      await provider(fetchImpl)
        .complete(REQUEST)
        .catch(() => undefined);
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it('accepts headers that arrive late but inside the budget', async () => {
    const { ai } = await localProvider((res) => {
      setTimeout(() => res.writeHead(200, { 'content-type': 'application/json' }).end(DONE), 300);
    });
    await expect(ai.complete({ ...REQUEST, timeoutMs: 3_000 })).resolves.toBe('{"cards":[]}');
  });

  it('times out while waiting for headers and drops the connection', async () => {
    const { ai, clientClosed } = await localProvider(() => undefined);
    const started = Date.now();
    expect(await failure(ai.complete({ ...REQUEST, timeoutMs: 400 }))).toBe('provider_timeout');
    expect(Date.now() - started).toBeLessThan(2_000);
    await clientClosed;
  });

  it('keeps the deadline running while the body is read, and never returns a partial body', async () => {
    // Headers and the first half of a valid reply arrive at once; the rest never comes in time.
    const { ai, clientClosed } = await localProvider((res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write(DONE.slice(0, 20));
      setTimeout(() => res.end(DONE.slice(20)), 5_000);
    });
    const started = Date.now();
    expect(await failure(ai.complete({ ...REQUEST, timeoutMs: 400 }))).toBe('provider_timeout');
    expect(Date.now() - started).toBeLessThan(2_000);
    await clientClosed;
  });

  it('bounds a body that keeps trickling by the total budget, not by the idle gap', async () => {
    // A byte every 100 ms never trips an idle-based body timeout; only the overall deadline ends it.
    const { ai, clientClosed } = await localProvider((res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      const tick = setInterval(() => res.write(' '), 100);
      res.on('close', () => clearInterval(tick));
    });
    const started = Date.now();
    expect(await failure(ai.complete({ ...REQUEST, timeoutMs: 600 }))).toBe('provider_timeout');
    expect(Date.now() - started).toBeLessThan(2_000);
    await clientClosed;
  });

  // Run once, on demand (LB_LONG_TIMEOUT_PROOF=1): Node's bundled fetch gives up at 300 s.
  it.runIf(process.env.LB_LONG_TIMEOUT_PROOF === '1')(
    'accepts headers delayed past 300 s within a 600 s budget',
    async () => {
      const { ai } = await localProvider((res) => {
        setTimeout(
          () => res.writeHead(200, { 'content-type': 'application/json' }).end(DONE),
          310_000,
        );
      });
      const started = Date.now();
      await expect(ai.complete({ ...REQUEST, timeoutMs: 600_000 })).resolves.toBe('{"cards":[]}');
      console.log(
        `long-timeout-proof: accepted after ${Math.round((Date.now() - started) / 1000)} s`,
      );
    },
    620_000,
  );
});
