// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InviteGate } from '../app/components/InviteGate';

const consentWording =
  'LearnBox در مرحلهٔ آزمایشی محدود است. ممکن است خطا یا تغییر در تجربه ببینی. لطفاً فقط اطلاعاتی را وارد کن که برای آزمایش لازم است؛ برای گزارش مشکل می‌توانی از راه ارتباطی اعلام‌شده استفاده کنی. می‌توانی درخواست حذف دادهٔ آزمایشی‌ات را بدهی.';

describe('invite gate boundary', () => {
  it('calls the same-origin invite check route with only the code', () => {
    const source = readWebsiteFile('../app/components/InviteGate.tsx');

    expect(source).toContain("fetch('/api/auth/invite/check'");
    expect(source).toContain('JSON.stringify({ code: code.trim() })');
    expect(source).toContain('onInviteAccepted');
    expect(source).toContain('mode === \'local-prototype\'');
  });

  it('keeps the invite code and state only in component memory', () => {
    const source = readWebsiteFile('../app/components/InviteGate.tsx');

    expect(source).not.toMatch(/localStorage|sessionStorage|console\./);
    expect(source).not.toMatch(/checkbox|type="checkbox"/);
  });

  it('shows the approved closed-alpha consent wording verbatim', () => {
    const source = readWebsiteFile('../app/components/InviteGate.tsx');

    expect(source).toContain(consentWording);
  });
});

describe('invite gate behavior', () => {
  let rendered: RenderedInviteGate | undefined;

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
  });

  it('renders nothing in local prototype mode and accepts immediately', async () => {
    const onInviteAccepted = vi.fn();
    const fetchMock = vi.fn();

    rendered = await renderGate('local-prototype', onInviteAccepted);

    expect(rendered.text()).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onInviteAccepted).not.toHaveBeenCalled();
  });

  it('accepts only after the exact 204 response from the invite route', async () => {
    const onInviteAccepted = vi.fn();
    const fetchMock = mockFetch(response(204));

    rendered = await renderGate('server-invite', onInviteAccepted);
    await rendered.enterCode('ALPHA-2026');

    expect(onInviteAccepted).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/auth/invite/check');
    expect(JSON.parse(String(options.body))).toEqual({ code: 'ALPHA-2026' });
  });

  it.each([
    [400, { error: 'invite_invalid' }, 'دعوت‌نامهٔ این کد معتبر نیست.'],
    [403, { error: 'invite_limited' }, 'این کد دعوت دیگر قابل استفاده نیست یا درخواست‌ها زیاد شده است؛ کمی صبر کنید.'],
    [503, { error: 'invite_unavailable' }, 'ورود با دعوت‌نامه اکنون در دسترس نیست؛ دوباره تلاش کنید.'],
  ] as const)('keeps the gate closed on HTTP %s', async (status, body, expectedMessage) => {
    const onInviteAccepted = vi.fn();
    mockFetch(response(status, body));

    rendered = await renderGate('server-invite', onInviteAccepted);
    await rendered.enterCode('ALPHA-2026');

    expect(onInviteAccepted).not.toHaveBeenCalled();
    expect(rendered.text()).toContain(expectedMessage);
  });

  it('keeps the gate closed after a network error', async () => {
    const onInviteAccepted = vi.fn();
    mockFetch(new Error('network unavailable'));

    rendered = await renderGate('server-invite', onInviteAccepted);
    await rendered.enterCode('ALPHA-2026');

    expect(onInviteAccepted).not.toHaveBeenCalled();
    expect(rendered.text()).toContain('ورود با دعوت‌نامه اکنون در دسترس نیست؛ دوباره تلاش کنید.');
  });

  it('disables submission until a code is entered and never shows a consent checkbox', async () => {
    const onInviteAccepted = vi.fn();
    rendered = await renderGate('server-invite', onInviteAccepted);

    expect(rendered.submitButton().disabled).toBe(true);
    expect(rendered.container().querySelector('input[type="checkbox"]')).toBeNull();
    expect(rendered.text()).toContain(consentWording);

    await rendered.enterCode('ALPHA-2026');
    expect(rendered.submitButton().disabled).toBe(false);
  });
});

type RenderedInviteGate = {
  container(): HTMLElement;
  enterCode(value: string): Promise<void>;
  submitButton(): HTMLButtonElement;
  text(): string;
  unmount(): Promise<void>;
};

async function renderGate(
  mode: 'local-prototype' | 'server-invite',
  onInviteAccepted: () => void,
): Promise<RenderedInviteGate> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await act(async () => {
    root.render(createElement(InviteGate, { mode, onInviteAccepted }));
  });

  return {
    container: () => container,
    enterCode: async (value) => {
      await setInputValue(container, 'invite-code', value);
      await submitForm(container);
    },
    submitButton: () => {
      const button = container.querySelector('button');
      if (!button) throw new Error('Submit button not found');
      return button as HTMLButtonElement;
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
