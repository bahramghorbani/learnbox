// @vitest-environment jsdom

import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminAuthGate } from '../app/components/AdminAuthGate';
import { PasskeySignIn } from '../app/components/PasskeySignIn';
import { resolveAdminAuthMode } from '../app/admin-auth-mode';

vi.mock('@simplewebauthn/browser', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    startAuthentication: vi.fn(async () => ({ id: 'credential' })),
  };
});

import { startAuthentication } from '@simplewebauthn/browser';
import { _browserSupportsWebAuthnInternals } from '@simplewebauthn/browser';

const mockedStartAuthentication = vi.mocked(startAuthentication);

type Rendered = {
  container: HTMLElement;
  text(): string;
  button(label: string): HTMLButtonElement | null;
  findText(value: string): boolean;
  unmount(): Promise<void>;
};

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function render(node: ReactNode): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return {
    container,
    text: () => container.textContent ?? '',
    button: (label) =>
      Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === label,
      ) ?? null,
    findText: (value) => (container.textContent ?? '').includes(value),
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function stubSessionFetch(status: number, body?: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/session')) {
        return new Response(status === 200 ? JSON.stringify(body ?? {}) : null, { status });
      }
      if (url.includes('/api/auth/login/options')) {
        return new Response(JSON.stringify({ challenge: 'challenge' }), { status: 200 });
      }
      if (url.includes('/api/auth/login/verify')) {
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 404 });
    }),
  );
}

beforeEach(() => {
  mockedStartAuthentication.mockReset();
  mockedStartAuthentication.mockImplementation(async () => ({ id: 'credential' }) as never);
  _browserSupportsWebAuthnInternals.stubThis = (value) => value;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('admin passkey UI', () => {
  it('keeps the local prototype visible without touching auth endpoints when the flag is disabled', async () => {
    stubSessionFetch(200, { authenticated: true });
    const mode = resolveAdminAuthMode();
    const rendered = await render(
      createElement(AdminAuthGate, { mode }, createElement('div', null, 'workspace')),
    );

    expect(mode).toBe('local-prototype');
    expect(rendered.text()).toContain('workspace');
    expect(rendered.findText('ورود مدیر')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    await rendered.unmount();
  });

  it('restores a signed-in session from the server without asking for a passkey', async () => {
    stubSessionFetch(200, { authenticated: true, recent: true });
    const rendered = await render(
      createElement(
        AdminAuthGate,
        { mode: 'server-passkey' },
        createElement('div', null, 'workspace'),
      ),
    );

    expect(rendered.text()).toContain('workspace');
    expect(rendered.findText('ورود مدیر')).toBe(false);
    await rendered.unmount();
  });

  it('shows the passkey sign-in card when the server reports no session', async () => {
    stubSessionFetch(401);
    const rendered = await render(
      createElement(
        AdminAuthGate,
        { mode: 'server-passkey' },
        createElement('div', null, 'workspace'),
      ),
    );

    expect(rendered.findText('ورود مدیر LearnBox')).toBe(true);
    expect(rendered.button('ورود با Passkey')).not.toBeNull();
    await rendered.unmount();
  });

  it('completes the browser ceremony and reveals the workspace after a verified passkey', async () => {
    stubSessionFetch(401);
    const rendered = await render(
      createElement(
        AdminAuthGate,
        { mode: 'server-passkey' },
        createElement('div', null, 'workspace'),
      ),
    );
    expect(rendered.button('ورود با Passkey')).not.toBeNull();

    const button = rendered.button('ورود با Passkey')!;
    await act(async () => {
      button.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(rendered.text()).toContain('workspace');
    await rendered.unmount();
  });

  it('reports a generic failure and stays signed out when the ceremony fails', async () => {
    stubSessionFetch(401);
    mockedStartAuthentication.mockImplementation(async () => {
      throw new Error('user cancelled');
    });
    const rendered = await render(
      createElement(
        AdminAuthGate,
        { mode: 'server-passkey' },
        createElement('div', null, 'workspace'),
      ),
    );

    await act(async () => {
      rendered.button('ورود با Passkey')!.click();
    });

    expect(rendered.findText('ورود انجام نشد')).toBe(true);
    expect(rendered.text()).not.toContain('workspace');
    await rendered.unmount();
  });

  it('reveals the workspace through the gate after an authenticating passkey sign-in', async () => {
    stubSessionFetch(401);
    const rendered = await render(
      createElement(
        AdminAuthGate,
        { mode: 'server-passkey' },
        createElement('div', null, 'workspace'),
      ),
    );
    expect(rendered.findText('ورود مدیر LearnBox')).toBe(true);
    const button = rendered.button('ورود با Passkey')!;
    await act(async () => {
      button.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(rendered.text()).toContain('workspace');
    await rendered.unmount();
  });

  it('explains unsupported browsers instead of starting a ceremony', async () => {
    stubSessionFetch(401);
    _browserSupportsWebAuthnInternals.stubThis = () => false;
    const rendered = await render(
      createElement(
        AdminAuthGate,
        { mode: 'server-passkey' },
        createElement('div', null, 'workspace'),
      ),
    );

    expect(rendered.findText('مرورگرهای به‌روز و دارای Passkey')).toBe(true);
    expect(mockedStartAuthentication).not.toHaveBeenCalled();
    expect(rendered.text()).not.toContain('workspace');
    await rendered.unmount();
  });

  it('keeps the sign-in button disabled while the ceremony is pending and focusable when idle', async () => {
    stubSessionFetch(401);
    let resolveAssertion: (value: { id: string }) => void;
    const pendingAssertion = new Promise<{ id: string }>((resolve) => {
      resolveAssertion = resolve;
    });
    mockedStartAuthentication.mockImplementation(async () => pendingAssertion as never);
    const onAuthenticated = vi.fn();
    const rendered = await render(createElement(PasskeySignIn, { onAuthenticated }));
    const button = rendered.button('ورود با Passkey')!;
    expect(button.disabled).toBe(false);
    button.focus();
    expect(document.activeElement).toBe(button);

    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    expect(button.disabled).toBe(true);
    await act(async () => {
      resolveAssertion!({ id: 'credential' });
      await pendingAssertion;
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onAuthenticated).toHaveBeenCalledOnce();
    await rendered.unmount();
  });

  it('announces the loading state politely and falls back to the sign-in card', async () => {
    let resolveFetch: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await pendingFetch;
        return new Response(null, { status: 401 });
      }),
    );

    const rendered = await render(
      createElement(
        AdminAuthGate,
        { mode: 'server-passkey' },
        createElement('div', null, 'workspace'),
      ),
    );

    expect(rendered.findText('در حال بررسی ورود امن…')).toBe(true);
    const loading = rendered.container.querySelector('[aria-live="polite"]');
    expect(loading).not.toBeNull();

    await act(async () => {
      resolveFetch!(new Response(null, { status: 401 }));
      await pendingFetch;
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(rendered.findText('ورود مدیر LearnBox')).toBe(true);
    await rendered.unmount();
  });
});
