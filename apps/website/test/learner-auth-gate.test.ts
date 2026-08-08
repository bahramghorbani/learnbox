// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthGate } from '../app/components/AuthGate';
import { resolveLearnerAuthMode } from '../app/learner-auth-mode';

describe('learner authentication mode', () => {
  it.each([
    [undefined, 'local-prototype'],
    ['false', 'local-prototype'],
    ['TRUE', 'local-prototype'],
    [' true', 'local-prototype'],
    ['true', 'server-otp'],
  ] as const)('selects %s as %s', (value, expectedMode) => {
    expect(resolveLearnerAuthMode(value)).toBe(expectedMode);
  });

  it('keeps the public learner OTP UI flag disabled by default', () => {
    expect(readRepositoryFile('.env.example')).toContain(
      'NEXT_PUBLIC_LEARNBOX_OTP_UI_ENABLED=false',
    );
  });
});

describe('learner server OTP boundary', () => {
  it('uses only the existing same-origin OTP routes and shared sequential verifier', () => {
    const source = readWebsiteFile('../app/components/AuthGate.tsx');

    expect(source).toContain("fetch('/api/auth/otp/request'");
    expect(source).toContain("fetch('/api/auth/otp/verify'");
    expect(source).toContain('verifyOtpChallenges(challenges');
  });

  it('keeps OTP values only in component memory and never falls back to prototype sign-in', () => {
    const source = readWebsiteFile('../app/components/AuthGate.tsx');

    expect(source).not.toMatch(/localStorage|sessionStorage|console\./);
    expect(source).not.toMatch(/fallback.{0,40}local|local.{0,40}fallback/i);
    expect(source).toContain("mode === 'local-prototype'");
    expect(source).toContain("mode === 'server-otp'");
  });
});

describe('learner server OTP behavior', () => {
  let rendered: RenderedGate | undefined;

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
  });

  it('authenticates only after the exact 204 verification response', async () => {
    const onAuthenticated = vi.fn();
    const fetchMock = mockFetch(response(201, challenge('first-challenge-id-0001')), response(204));

    rendered = await renderServerGate(onAuthenticated);
    await rendered.requestCode();
    await rendered.enterCode('12345');

    expect(onAuthenticated).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('continues from a rejected newest challenge to the next remembered challenge', async () => {
    const onAuthenticated = vi.fn();
    const oldest = challenge('oldest-challenge-id-0002');
    const newest = challenge('newest-challenge-id-0003');
    const fetchMock = mockFetch(
      response(201, oldest),
      response(201, newest),
      response(400, { error: 'verification_failed' }),
      response(204),
    );

    rendered = await renderServerGate(onAuthenticated);
    await rendered.requestCode();
    await rendered.resendCode();
    await rendered.enterCode('12345');

    expect(onAuthenticated).toHaveBeenCalledTimes(1);
    expect(verificationChallengeIds(fetchMock)).toEqual([newest.challengeId, oldest.challengeId]);
  });

  it.each([403, 503])(
    'stops verification on HTTP %s without authenticating locally',
    async (status) => {
      const onAuthenticated = vi.fn();
      const oldest = challenge('oldest-challenge-id-0002');
      const newest = challenge('newest-challenge-id-0003');
      const fetchMock = mockFetch(
        response(201, oldest),
        response(201, newest),
        response(status, { error: 'otp_unavailable' }),
      );

      rendered = await renderServerGate(onAuthenticated);
      await rendered.requestCode();
      await rendered.resendCode();
      await rendered.enterCode('12345');

      expect(onAuthenticated).not.toHaveBeenCalled();
      expect(verificationChallengeIds(fetchMock)).toEqual([newest.challengeId]);
      expect(rendered.text()).toContain('ارسال پیامک اکنون در دسترس نیست؛ دوباره تلاش کنید.');
    },
  );

  it('keeps server OTP unauthenticated after a network error', async () => {
    const onAuthenticated = vi.fn();
    mockFetch(
      response(201, challenge('first-challenge-id-0001')),
      new Error('network unavailable'),
    );

    rendered = await renderServerGate(onAuthenticated);
    await rendered.requestCode();
    await rendered.enterCode('12345');

    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(rendered.text()).toContain('ارتباط با سرویس انجام نشد؛ دوباره تلاش کنید.');
    expect(rendered.text()).toContain('کد پیامک‌شده را وارد کن');
    expect(rendered.text()).not.toContain('کد آزمایشی را وارد کن');
  });

  it('disables resend until the server-provided cooldown is reached', async () => {
    const onAuthenticated = vi.fn();
    mockFetch(
      response(
        201,
        challenge('first-challenge-id-0001', new Date(Date.now() + 60_000).toISOString()),
      ),
    );

    rendered = await renderServerGate(onAuthenticated);
    await rendered.requestCode();

    expect(rendered.resendButton().disabled).toBe(true);
  });

  it('masks the full mobile number on the server OTP screen', async () => {
    const onAuthenticated = vi.fn();
    mockFetch(response(201, challenge('first-challenge-id-0001')));

    rendered = await renderServerGate(onAuthenticated);
    await rendered.requestCode();

    expect(rendered.text()).toContain('0912•••4567');
    expect(rendered.text()).not.toContain('09121234567');
  });
});

type RenderedGate = {
  button(label: string): HTMLButtonElement;
  enterCode(value: string): Promise<void>;
  requestCode(): Promise<void>;
  resendButton(): HTMLButtonElement;
  resendCode(): Promise<void>;
  text(): string;
  unmount(): Promise<void>;
};

async function renderServerGate(onAuthenticated: () => void): Promise<RenderedGate> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await act(async () => {
    root.render(createElement(AuthGate, { mode: 'server-otp', onAuthenticated }));
  });

  return {
    button: (label) => buttonByText(container, label),
    enterCode: async (value) => {
      await setInputValue(container, 'login-code', value);
      await submitForm(container);
    },
    requestCode: async () => {
      await setInputValue(container, 'mobile-number', '09121234567');
      await submitForm(container);
    },
    resendButton: () => buttonStartingWith(container, 'ارسال دوباره'),
    resendCode: async () => {
      await act(async () => {
        buttonByText(container, 'ارسال دوبارهٔ کد').click();
      });
    },
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function mockFetch(...results: Array<Response | Error>) {
  const fetchMock = vi.fn(async () => {
    const next = results.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error('Unexpected fetch call');
    return next;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function response(status: number, body: unknown = null): Response {
  return { status, json: async () => body } as Response;
}

function challenge(challengeId: string, resendAvailableAt = '1970-01-01T00:00:00.000Z') {
  return {
    challengeId,
    expiresAt: '2026-08-08T10:05:00.000Z',
    resendAvailableAt,
  };
}

function verificationChallengeIds(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .filter(([path]) => path === '/api/auth/otp/verify')
    .map(([, options]) => JSON.parse((options as RequestInit).body as string).challengeId);
}

function buttonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent === label,
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

function buttonStartingWith(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.startsWith(label),
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

async function setInputValue(container: HTMLElement, id: string, value: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`Input not found: ${id}`);
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submitForm(container: HTMLElement): Promise<void> {
  const form = container.querySelector('form');
  if (!form) throw new Error('Form not found');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

function readWebsiteFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'test', relativePath), 'utf8');
}

function readRepositoryFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), '../..', relativePath), 'utf8');
}
