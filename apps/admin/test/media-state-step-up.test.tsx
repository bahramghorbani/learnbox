// @vitest-environment jsdom

import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CardMediaPanel } from '../app/components/CardMediaPanel';
import { loadMediaState } from '../app/components/ContentPacksWorkspace';
import { PackMediaCompletion } from '../app/components/PackMediaCompletion';
import { StepUpRefusedError } from '../app/components/step-up-reauth';

/**
 * The media-state read sits behind the recent-auth guard (428). Defect guarded: the Admin read it
 * with a plain fetch, so an expired recent-auth window showed "خواندن وضعیت رسانه ناموفق بود"
 * instead of offering the passkey step-up, and a pack scan reported every card as unreadable.
 */

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let authenticate: () => Promise<{ id: string }>;
vi.mock('@simplewebauthn/browser', () => ({ startAuthentication: async () => authenticate() }));

const media = [{ kind: 'image' as const, accepted: null, latestCandidate: null }];

function stubFetch(stateResponses: Array<() => Response>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url === '/api/auth/reauth/options') return Response.json({ challenge: 'c' });
      if (url === '/api/auth/reauth/verify') return new Response(null, { status: 204 });
      const next = stateResponses.shift();
      if (!url.startsWith('/api/content/media/state') || !next)
        throw new Error(`unexpected ${url}`);
      return next();
    }),
  );
  return calls;
}

const required = () => Response.json({ code: 'reauthentication_required' }, { status: 428 });

beforeEach(() => {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => '__Host-learnbox_admin_csrf=csrf-token-value',
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  delete (document as unknown as { cookie?: string }).cookie;
});

describe('media state step-up', () => {
  it('re-authenticates in place on 428 and returns the retried state', async () => {
    authenticate = async () => ({ id: 'credential' });
    const calls = stubFetch([required, () => Response.json({ media })]);

    await expect(loadMediaState('card-1')).resolves.toEqual(media);
    expect(calls.filter((url) => url === '/api/auth/reauth/verify')).toHaveLength(1);
    expect(calls.filter((url) => url.startsWith('/api/content/media/state'))).toHaveLength(2);
  });

  it('throws the operator message when the passkey prompt is cancelled', async () => {
    authenticate = async () => {
      throw Object.assign(new Error('cancelled'), { name: 'NotAllowedError' });
    };
    stubFetch([required]);

    await expect(loadMediaState('card-1')).rejects.toBeInstanceOf(StepUpRefusedError);
  });

  it('stops a pack scan after one refused step-up instead of prompting per card', async () => {
    authenticate = async () => {
      throw Object.assign(new Error('cancelled'), { name: 'NotAllowedError' });
    };
    const calls = stubFetch([required, required, required]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    vi.stubGlobal('React', { createElement, Fragment });

    await act(async () => {
      root.render(
        createElement(PackMediaCompletion, {
          packId: 'pack-fixture',
          cards: ['a', 'b', 'c'].map((cardId) => ({ cardId, label: cardId })),
          loadState: loadMediaState,
          loadJob: async () => undefined,
          createJob: async () => ({ ok: true as const, status: 'nothing_needed' as const }),
          stopJob: async () => ({ ok: false as const, message: 'unused' }),
          onOpenCard: () => undefined,
          onFinished: () => undefined,
        }),
      );
    });
    await act(async () => {
      container.querySelector('button')!.click();
    });

    expect(calls.filter((url) => url === '/api/auth/reauth/options')).toHaveLength(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('لغو شد');
    expect(container.textContent).not.toContain('تأیید و ساخت');
    await act(async () => root.unmount());
  });

  it('does not offer a paid estimate or false all-clear for partially unreadable media state', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    vi.stubGlobal('React', { createElement, Fragment });

    await act(async () => {
      root.render(
        createElement(PackMediaCompletion, {
          packId: 'pack-fixture',
          cards: [
            { cardId: 'readable', label: 'خوانا' },
            { cardId: 'unreadable', label: 'ناخوانا' },
          ],
          loadState: async (cardId) => (cardId === 'readable' ? media : undefined),
          loadJob: async () => undefined,
          createJob: async () => ({ ok: true as const, status: 'nothing_needed' as const }),
          stopJob: async () => ({ ok: false as const, message: 'unused' }),
          onOpenCard: () => undefined,
          onFinished: () => undefined,
        }),
      );
    });
    await act(async () => {
      container.querySelector('button')!.click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('برآورد و ساخت');
    expect(container.textContent).not.toContain('هیچ رسانه‌ای برای ساخت لازم نیست');
    expect(
      [...container.querySelectorAll('button')].some((button) =>
        button.textContent?.startsWith('تأیید و ساخت'),
      ),
    ).toBe(false);
    await act(async () => root.unmount());
  });

  it('card panel: a refused step-up shows only the authentication message, then reads on retry', async () => {
    let refuse = true;
    authenticate = async () => {
      if (refuse) throw Object.assign(new Error('cancelled'), { name: 'NotAllowedError' });
      return { id: 'credential' };
    };
    const state = [{ kind: 'image', accepted: null, latestCandidate: null }];
    const calls = stubFetch([required, required, () => Response.json({ media: state })]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CardMediaPanel, {
          cardId: 'card-1',
          cardLabel: 'der Tisch',
          onClose: () => undefined,
          onLoadState: () => loadMediaState('card-1'),
          onGenerate: async () => ({ ok: false as const, message: 'unused' }),
          onAccept: async () => ({ ok: true as const }),
          assetUrl: (id: string) => `/asset/${id}`,
        }),
      );
    });

    const alerts = [...container.querySelectorAll('[role="alert"]')].map((e) => e.textContent);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain('وضعیت رسانه');
    expect(container.textContent).not.toContain('خواندن وضعیت رسانه ناموفق بود');
    expect(container.textContent).not.toContain('ذخیره');
    expect(container.textContent).not.toContain('در حال خواندن');

    refuse = false;
    const retry = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'خواندن دوباره',
    )!;
    await act(async () => retry.click());

    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(0);
    expect(container.querySelector('[data-cm-kind="image"]')).not.toBeNull();
    expect(calls.filter((url) => url === '/api/auth/reauth/verify')).toHaveLength(1);
    await act(async () => root.unmount());
  });

  it('card panel: after bounded polling, refresh observes a durable outcome without a second generation', async () => {
    const generating = [
      {
        kind: 'word_audio' as const,
        accepted: null,
        latestCandidate: { id: 'candidate-1', kind: 'word_audio', status: 'generating' },
      },
    ];
    const ready = [
      {
        kind: 'word_audio' as const,
        accepted: null,
        latestCandidate: { id: 'candidate-1', kind: 'word_audio', status: 'ready' },
      },
    ];
    const onLoadState = vi.fn().mockResolvedValueOnce(generating).mockResolvedValueOnce(ready);
    const onGenerate = vi.fn(async () => ({ ok: false as const, message: 'network unavailable' }));
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CardMediaPanel, {
          cardId: 'card-1',
          cardLabel: 'die U-Bahn',
          onClose: () => undefined,
          onLoadState,
          onGenerate,
          onAccept: async () => ({ ok: true as const }),
          assetUrl: (id: string) => `/asset/${id}`,
        }),
      );
    });

    const refresh = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'به‌روزرسانی وضعیت',
    );
    expect(refresh).toBeTruthy();
    await act(async () => refresh!.click());

    expect(onLoadState).toHaveBeenCalledTimes(2);
    expect(onGenerate).not.toHaveBeenCalled();
    expect(container.textContent).toContain('نامزد آمادهٔ بررسی');
    await act(async () => root.unmount());
  });
});
