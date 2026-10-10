// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchWithStepUp,
  requestStepUpReauth,
  stepUpMessage,
} from '../app/components/step-up-reauth';

/**
 * Inline step-up re-authentication (the 428 fix for the content workspaces).
 *
 * What is asserted is the operator's contract: a refused mutation raises ONE passkey prompt, is
 * retried ONCE with the identical request so the server cannot apply it twice, and every outcome
 * the operator can produce — cancel, failure, expired session — reports in Persian that the typed
 * data is still there. Nothing here asserts the five-minute policy itself; that is the server's and
 * the route suites prove it there.
 */

type Assertion = { id: string };
let authenticate: () => Promise<Assertion>;

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: async () => authenticate(),
}));

function cancelled() {
  const error = new Error('The operation either timed out or was not allowed.');
  error.name = 'NotAllowedError';
  return error;
}

/** Mutation init mirrors the workspaces: one idempotency key created before the first attempt. */
function mutationInit(key = 'key-0001') {
  return {
    method: 'POST',
    credentials: 'same-origin' as RequestCredentials,
    headers: {
      'content-type': 'application/json',
      'x-learnbox-csrf-token': 'csrf-token-value',
      'idempotency-key': key,
    },
    body: JSON.stringify({ cardVersionId: 'version-1', dimension: 'visual', outcome: 'passed' }),
  };
}

type Route = (init: RequestInit | undefined) => Response | Promise<Response>;

function stubFetch(routes: Record<string, Route>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes[url];
    if (!route) return new Response(null, { status: 404 });
    return route(init);
  });
  vi.stubGlobal('fetch', mock);
  return { calls, mock };
}

const mutationUrl = '/api/content/review/check';

function keysSentTo(calls: Array<{ url: string; init?: RequestInit }>, url: string) {
  return calls
    .filter((call) => call.url === url)
    .map((call) => new Headers(call.init?.headers).get('idempotency-key'));
}

describe('step-up re-authentication', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '__Host-learnbox_admin_csrf=csrf-token-value',
    });
    authenticate = async () => ({ id: 'credential' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (document as unknown as { cookie?: string }).cookie;
  });

  it('leaves a request that was not refused completely alone', async () => {
    const { calls } = stubFetch({
      [mutationUrl]: () => Response.json({ status: 'applied' }),
    });
    const { response, stepUp } = await fetchWithStepUp(mutationUrl, mutationInit());
    expect(response.status).toBe(200);
    expect(stepUp).toBe('not-required');
    expect(calls).toHaveLength(1);
    expect(calls.some((call) => call.url.startsWith('/api/auth/reauth'))).toBe(false);
  });

  it('re-authenticates on 428 and retries the SAME request exactly once', async () => {
    let attempts = 0;
    const { calls } = stubFetch({
      [mutationUrl]: () => {
        attempts += 1;
        return attempts === 1
          ? Response.json({ code: 'reauthentication_required' }, { status: 428 })
          : Response.json({ status: 'applied' });
      },
      '/api/auth/reauth/options': () => Response.json({ challenge: 'challenge' }),
      '/api/auth/reauth/verify': () => new Response(null, { status: 204 }),
    });

    const { response, stepUp } = await fetchWithStepUp(mutationUrl, mutationInit('key-4242'));

    expect(stepUp).toBe('confirmed');
    expect(response.status).toBe(200);
    expect(attempts).toBe(2);
    // The retry is the same mutation, not a second one: identical key, identical body.
    expect(keysSentTo(calls, mutationUrl)).toEqual(['key-4242', 'key-4242']);
    const bodies = calls.filter((call) => call.url === mutationUrl).map((call) => call.init?.body);
    expect(new Set(bodies).size).toBe(1);
    // Exactly one ceremony, so the operator sees one passkey prompt.
    expect(calls.filter((call) => call.url === '/api/auth/reauth/verify')).toHaveLength(1);
  });

  it('does not retry when the operator cancels the passkey prompt', async () => {
    let attempts = 0;
    stubFetch({
      [mutationUrl]: () => {
        attempts += 1;
        return Response.json({ code: 'reauthentication_required' }, { status: 428 });
      },
      '/api/auth/reauth/options': () => Response.json({ challenge: 'challenge' }),
      '/api/auth/reauth/verify': () => new Response(null, { status: 204 }),
    });
    authenticate = async () => {
      throw cancelled();
    };

    const { response, stepUp } = await fetchWithStepUp(mutationUrl, mutationInit());

    expect(stepUp).toBe('cancelled');
    expect(response.status).toBe(428);
    expect(attempts).toBe(1);
    expect(stepUpMessage(stepUp)).toContain('حفظ شده است');
  });

  it('reports a failed assertion without retrying', async () => {
    let attempts = 0;
    stubFetch({
      [mutationUrl]: () => {
        attempts += 1;
        return Response.json({ code: 'reauthentication_required' }, { status: 428 });
      },
      '/api/auth/reauth/options': () => Response.json({ challenge: 'challenge' }),
      '/api/auth/reauth/verify': () => Response.json({ code: 'invalid' }, { status: 400 }),
    });

    const { stepUp } = await fetchWithStepUp(mutationUrl, mutationInit());

    expect(stepUp).toBe('failed');
    expect(attempts).toBe(1);
    expect(stepUpMessage(stepUp)).toContain('ناموفق');
    expect(stepUpMessage(stepUp)).toContain('حفظ شده است');
  });

  it('calls an expired session what it is instead of a failed passkey', async () => {
    stubFetch({
      [mutationUrl]: () => Response.json({ code: 'reauthentication_required' }, { status: 428 }),
      '/api/auth/reauth/options': () => Response.json({ code: 'unauthorized' }, { status: 401 }),
    });

    const { stepUp } = await fetchWithStepUp(mutationUrl, mutationInit());

    expect(stepUp).toBe('session-expired');
    expect(stepUpMessage(stepUp)).toContain('منقضی');
  });

  it('cannot loop: a second 428 after a confirmed step-up is reported, not re-prompted', async () => {
    let attempts = 0;
    const { calls } = stubFetch({
      [mutationUrl]: () => {
        attempts += 1;
        return Response.json({ code: 'reauthentication_required' }, { status: 428 });
      },
      '/api/auth/reauth/options': () => Response.json({ challenge: 'challenge' }),
      '/api/auth/reauth/verify': () => new Response(null, { status: 204 }),
    });

    const { response, stepUp } = await fetchWithStepUp(mutationUrl, mutationInit());

    expect(stepUp).toBe('confirmed');
    expect(response.status).toBe(428);
    expect(attempts).toBe(2);
    expect(calls.filter((call) => call.url === '/api/auth/reauth/verify')).toHaveLength(1);
    expect(stepUpMessage(stepUp)).toContain('یک‌بار دیگر تلاش کنید');
  });

  it('raises one prompt for mutations refused at the same time, and retries both', async () => {
    let prompts = 0;
    let firstAttempts = 0;
    let secondAttempts = 0;
    const second = '/api/content/review/decision';
    const { calls } = stubFetch({
      [mutationUrl]: () => {
        firstAttempts += 1;
        return firstAttempts === 1
          ? Response.json({ code: 'reauthentication_required' }, { status: 428 })
          : Response.json({ status: 'applied' });
      },
      [second]: () => {
        secondAttempts += 1;
        return secondAttempts === 1
          ? Response.json({ code: 'reauthentication_required' }, { status: 428 })
          : Response.json({ status: 'applied' });
      },
      '/api/auth/reauth/options': () => Response.json({ challenge: 'challenge' }),
      '/api/auth/reauth/verify': () => new Response(null, { status: 204 }),
    });
    authenticate = async () => {
      prompts += 1;
      return { id: 'credential' };
    };

    const [a, b] = await Promise.all([
      fetchWithStepUp(mutationUrl, mutationInit('key-a')),
      fetchWithStepUp(second, mutationInit('key-b')),
    ]);

    expect(prompts).toBe(1);
    expect(a.response.status).toBe(200);
    expect(b.response.status).toBe(200);
    expect(calls.filter((call) => call.url === '/api/auth/reauth/verify')).toHaveLength(1);
  });

  it('refuses to start a ceremony without the CSRF cookie', async () => {
    Object.defineProperty(document, 'cookie', { configurable: true, get: () => '' });
    const { calls } = stubFetch({
      '/api/auth/reauth/options': () => Response.json({ challenge: 'challenge' }),
    });
    expect(await requestStepUpReauth()).toBe('failed');
    expect(calls).toHaveLength(0);
  });
});
