// @vitest-environment jsdom

import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('InstallAppBanner', () => {
  let root: ReturnType<typeof createRoot> | undefined;
  let container: HTMLDivElement | undefined;
  const dismissedKey = 'learnbox-install-banner-dismissed-v1';

  afterEach(async () => {
    await act(async () => root?.unmount());
    container?.remove();
    vi.unstubAllGlobals();
  });

  function stubReactGlobal() {
    vi.stubGlobal('React', { createElement, Fragment });
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  }

  function stubUserAgent(ua: string) {
    Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
  }

  // ponytail: Node 22+'s own global `localStorage` shadows jsdom's working
  // implementation under this project's vitest config, so tests get a real
  // (if minimal) Storage polyfill instead of chasing the Node/jsdom interplay.
  function stubLocalStorage() {
    const store = new Map<string, string>();
    const storage: Storage = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => void store.set(key, value),
      removeItem: (key) => void store.delete(key),
      clear: () => store.clear(),
      key: (index) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    };
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  }

  function stubMatchMedia(standalone: boolean) {
    window.matchMedia = vi.fn().mockReturnValue({ matches: standalone }) as unknown as typeof window.matchMedia;
  }

  async function render() {
    const { InstallAppBanner } = await import('./InstallAppBanner.js');
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(InstallAppBanner));
    });
  }

  it('stays hidden when already running standalone (already installed)', async () => {
    stubReactGlobal();
    stubLocalStorage();
    stubMatchMedia(true);
    stubUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/604.1');
    await render();
    expect(container!.querySelector('.install-app-banner')).toBeNull();
  });

  it('shows the iOS instructional steps (no native install API exists there)', async () => {
    stubReactGlobal();
    stubLocalStorage();
    stubMatchMedia(false);
    stubUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/604.1');
    await render();
    expect(container!.querySelector('.install-app-banner-ios-steps')).not.toBeNull();
    expect(container!.querySelector('.install-app-banner-cta')).toBeNull();
  });

  it('dismiss persists to localStorage so the banner stays hidden on remount', async () => {
    stubReactGlobal();
    stubLocalStorage();
    stubMatchMedia(false);
    stubUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/604.1');
    await render();
    await act(async () => {
      container!.querySelector<HTMLButtonElement>('.install-app-banner-close')!.click();
    });
    expect(container!.querySelector('.install-app-banner')).toBeNull();
    expect(window.localStorage.getItem(dismissedKey)).toBe('1');

    await act(async () => root?.unmount());
    container?.remove();
    await render();
    expect(container!.querySelector('.install-app-banner')).toBeNull();
  });

  it('shows an install CTA on Android once beforeinstallprompt fires, and prompts on tap', async () => {
    stubReactGlobal();
    stubLocalStorage();
    stubMatchMedia(false);
    stubUserAgent('Mozilla/5.0 (Linux; Android 14) AppleWebKit Chrome Mobile Safari');
    await render();
    expect(container!.querySelector('.install-app-banner')).toBeNull();

    const prompt = vi.fn(async () => undefined);
    await act(async () => {
      const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
        prompt: typeof prompt;
      };
      event.prompt = prompt;
      window.dispatchEvent(event);
    });
    const cta = container!.querySelector<HTMLButtonElement>('.install-app-banner-cta');
    expect(cta).not.toBeNull();

    await act(async () => {
      cta!.click();
    });
    expect(prompt).toHaveBeenCalledTimes(1);
  });
});
