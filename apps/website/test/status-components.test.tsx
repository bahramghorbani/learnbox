// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkStatus } from '../app/components/NetworkStatus';
import { PronunciationButton } from '../app/components/PronunciationButton';

describe('NetworkStatus', () => {
  let rendered: Rendered | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
  });

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows the offline hint only when the browser is offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    rendered = await renderStatus();
    expect(rendered.text()).toContain('اینترنت قطع است');
  });

  it('shows nothing while the browser is online', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    rendered = await renderStatus();
    expect(rendered.text()).toBe('');
  });

  it('reacts to a later offline event', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    rendered = await renderStatus();
    expect(rendered.text()).toBe('');

    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(rendered.text()).toContain('اینترنت قطع است');

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(rendered.text()).toBe('');
  });
});

describe('PronunciationButton', () => {
  let rendered: Rendered | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
  });

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('plays a media source when provided', async () => {
    const playMock = vi.fn(() => Promise.resolve());
    vi.stubGlobal(
      'Audio',
      class {
        onplay: (() => void) | null = null;
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        play = playMock;
      },
    );

    rendered = await renderPronunciation({ text: 'Haus', src: '/audio/haus.mp3' });
    await rendered.clickButton();

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to speech synthesis when no media source is provided', async () => {
    const speakMock = vi.fn();
    const cancelMock = vi.fn();
    vi.stubGlobal('speechSynthesis', { cancel: cancelMock, speak: speakMock });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        lang = '';
        rate = 0;
        text: string;
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      },
    );

    rendered = await renderPronunciation({ text: 'Haus' });
    await rendered.clickButton();

    expect(speakMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable when the audio source errors', async () => {
    vi.stubGlobal(
      'Audio',
      class {
        onplay: (() => void) | null = null;
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        play = () => Promise.reject(new Error('blocked'));
      },
    );

    rendered = await renderPronunciation({ text: 'Haus', src: '/audio/haus.mp3' });
    await rendered.clickButton();

    expect(rendered.text()).toContain('صدا در دسترس نیست');
  });
});

type Rendered = {
  clickButton(): Promise<void>;
  text(): string;
  unmount(): Promise<void>;
};

async function renderStatus(): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await act(async () => {
    root.render(createElement(NetworkStatus as FunctionComponent));
  });

  return {
    clickButton: async () => {
      throw new Error('clickButton is only available for PronunciationButton renders.');
    },
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function renderPronunciation(props: { text: string; src?: string }): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await act(async () => {
    root.render(createElement(PronunciationButton as FunctionComponent<typeof props>, props));
  });

  return {
    clickButton: async () => {
      const button = container.querySelector('button');
      if (!button) throw new Error('Pronunciation button not found.');
      await act(async () => button.click());
    },
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
