// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileScreen } from '../app/components/ProfileScreen';
import { AVATARS } from '../lib/learner-profile-fields';

// v1.2 profile integration (owner-reported on a physical iPhone):
//  1. masked mobile number must keep digit order inside RTL text
//  2. Home greeting uses the server first name, else «یادگیرنده عزیز»
//  3. Home header circle shows the selected predefined avatar, else the current fallback

type TodayProps = { reviewCount: number; displayName?: string | null; avatarId?: string | null };

let mounted: { container: HTMLElement; unmount: () => Promise<void> } | undefined;

beforeEach(() => {
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('[]', { status: 200 })),
  );
});

afterEach(async () => {
  await mounted?.unmount();
  mounted = undefined;
  vi.unstubAllGlobals();
});

async function mount<P extends object>(Component: FunctionComponent<P>, props: P) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(Component, props)));
  mounted = {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
  return container;
}

async function renderToday(props: TodayProps) {
  const { TodayScreen } = await import('../app/components/TodayScreen.jsx');
  return mount(TodayScreen as FunctionComponent<TodayProps>, props);
}

describe('Home greeting name', () => {
  it('uses the server first name when present', async () => {
    const c = await renderToday({ reviewCount: 0, displayName: 'بهرام' });
    expect(c.querySelector('.home-name')?.textContent).toBe('بهرام');
  });

  it.each([[null], [undefined], ['']])('keeps «یادگیرنده عزیز» for %j', async (name) => {
    const c = await renderToday({ reviewCount: 0, displayName: name as string | null });
    expect(c.querySelector('.home-name')?.textContent).toBe(name === '' ? '' : 'یادگیرنده عزیز');
  });

  it('renders the name as text, never as markup', async () => {
    const c = await renderToday({ reviewCount: 0, displayName: '<img src=x onerror=alert(1)>' });
    expect(c.querySelector('.home-name img')).toBeNull();
    expect(c.querySelector('.home-name')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('Home header avatar', () => {
  it.each(AVATARS.map((a) => [a.id, a.src] as const))(
    'shows predefined avatar %s',
    async (id, src) => {
      const c = await renderToday({ reviewCount: 0, avatarId: id });
      const holder = c.querySelector('.avatar.avatar-image');
      expect(holder?.getAttribute('data-avatar-id')).toBe(id);
      const img = holder?.querySelector('img');
      expect(img).not.toBeNull();
      expect(decodeURIComponent(img?.getAttribute('src') ?? '')).toContain(src);
      expect(c.querySelector('.avatar svg')).toBeNull();
    },
  );

  it.each([[null], [undefined], ['not-a-real-avatar'], ['https://evil.example/a.png']])(
    'keeps the current fallback circle for %j',
    async (id) => {
      const c = await renderToday({ reviewCount: 0, avatarId: id as string | null });
      expect(c.querySelector('.avatar-image')).toBeNull();
      expect(c.querySelector('.avatar svg')).not.toBeNull();
    },
  );
});

describe('Profile mobile number bidi', () => {
  it('isolates the masked number as one LTR run inside the RTL page', async () => {
    const c = await mount(ProfileScreen as unknown as FunctionComponent<Record<string, unknown>>, {
      goal: 'life',
      onChooseGoal: () => {},
      onNavigate: () => {},
      onOpenSettings: () => {},
      pendingReviewCount: 0,
      identity: { status: 'ok', maskedPhone: '0938***4003' },
    });
    const run = c.querySelector('bdi.profile-phone');
    expect(run?.getAttribute('dir')).toBe('ltr');
    expect(run?.textContent).toBe('۰۹۳۸***۴۰۰۳');
  });

  it('falls back to the neutral label without a number', async () => {
    const c = await mount(ProfileScreen as unknown as FunctionComponent<Record<string, unknown>>, {
      goal: 'life',
      onChooseGoal: () => {},
      onNavigate: () => {},
      onOpenSettings: () => {},
      pendingReviewCount: 0,
      identity: { status: 'unavailable' },
    });
    expect(c.querySelector('bdi.profile-phone')).toBeNull();
    expect(c.textContent).toContain('حساب LearnBox');
  });
});

describe('LearnerHome wiring (server profile only)', () => {
  const src = readFileSync(resolve(process.cwd(), 'app/LearnerHome.tsx'), 'utf8');

  it('reads name/avatar from the authenticated server profile behind the flag, never localStorage', () => {
    expect(src).toContain("fetch('/api/learner/profile/details'");
    expect(src).toMatch(
      /!profileIdentityEnabled \|\| !authenticated \|\| !isServerOtp \|\| !sessionUserId/,
    );
    expect(src).not.toMatch(/localStorage[^;\n]*(firstName|avatarId)/);
  });

  it('drops the cached profile on session change and passes it to Today and saves to Home', () => {
    expect(src).toMatch(
      /setProfileIdentity\(\{ status: 'unavailable' \}\);\s*setProfileCard\(null\);/,
    );
    expect(src).toContain('displayName={profileCard?.firstName ?? null}');
    expect(src).toContain('avatarId={profileCard?.avatarId ?? null}');
    expect(src).toContain('onProfileDetails=');
  });

  it('ignores a late profile response that belongs to another session', () => {
    expect(src).toMatch(
      /activeSessionSubjectRef\.current !== expectedUserId\) return;\s*setProfileCard/,
    );
  });
});
