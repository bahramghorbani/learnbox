// @vitest-environment jsdom

import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SupportTicketsScreen } from '../app/components/SupportTicketsScreen';

const existingTicket = {
  id: '22222222-2222-4222-8222-222222222222',
  ticketNumber: 1001,
  subject: 'مشکل ورود',
  message: 'لطفاً دسترسی من را بررسی کنید.',
  supportReply: 'واحد پشتیبانی پاسخ شما را بررسی کرد.',
  status: 'answered' as const,
  createdAt: '2026-11-25T10:00:00+00:00',
  respondedAt: '2026-11-25T10:01:00+00:00',
  closedAt: null,
};
const createdTicket = {
  ...existingTicket,
  id: '33333333-3333-4333-8333-333333333333',
  ticketNumber: 1002,
  subject: 'بسته فعال نمی‌شود',
  message: 'لطفاً وضعیت بسته را بررسی کنید.',
  supportReply: null,
  status: 'open' as const,
  respondedAt: null,
};

let container: HTMLElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;
let onDone = vi.fn();

beforeEach(() => {
  onDone = vi.fn();
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return Response.json({ ticket: createdTicket }, { status: 201 });
      return Response.json({ tickets: [existingTicket] });
    }),
  );
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
});

async function render() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(SupportTicketsScreen, { onBack: vi.fn(), onDone }));
    await Promise.resolve();
  });
}

function input(id: string) {
  const element = container?.querySelector(`#${id}`);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    throw new Error(`input not found: ${id}`);
  }
  return element;
}

function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) throw new Error('native value setter is unavailable');
  setter.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('SupportTicketsScreen', () => {
  it('shows a stable TK reference, status, and the attributed support reply', async () => {
    await render();

    expect(container?.textContent).toContain('TK1001');
    expect(container?.textContent).toContain('پاسخ داده شده');
    expect(container?.textContent).toContain('واحد پشتیبانی LearnBox');
    expect(container?.textContent).toContain(existingTicket.supportReply);
  });

  it('submits only subject and message, then adds the server-issued ticket reference', async () => {
    await render();
    const subject = input('support-subject');
    const message = input('support-message');
    await act(async () => {
      setValue(subject, createdTicket.subject);
      setValue(message, createdTicket.message);
    });
    await act(async () => {
      container
        ?.querySelector('form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    const fetchMock = vi.mocked(fetch);
    const [, init] = fetchMock.mock.calls[1] ?? [];
    expect(init?.body).toBe(
      JSON.stringify({ subject: createdTicket.subject, message: createdTicket.message }),
    );
    expect(new Headers(init?.headers).get('idempotency-key')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(container?.textContent).toContain('TK1002');
    expect(container?.textContent).toContain('پیام شما ثبت شد');
    expect(container?.textContent).toContain('کارشناسان از همین صفحه پاسخ می‌دهند.');
    const done = [...(container?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'بازگشت به صفحه اصلی',
    );
    await act(async () => done?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('submits with a valid idempotency UUID when randomUUID is unavailable', async () => {
    await render();
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(0),
    });
    await act(async () => {
      setValue(input('support-subject'), createdTicket.subject);
      setValue(input('support-message'), createdTicket.message);
    });
    await act(async () => {
      container
        ?.querySelector('form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    const [, init] = vi.mocked(fetch).mock.calls[1] ?? [];
    expect(new Headers(init?.headers).get('idempotency-key')).toBe(
      '00000000-0000-4000-8000-000000000000',
    );
    expect(container?.textContent).toContain('پیام شما ثبت شد');
  });
});
