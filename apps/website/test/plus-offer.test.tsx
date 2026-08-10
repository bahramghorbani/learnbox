// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SupportivePlusOfferDecision } from '../app/paywall';

describe('SupportivePlusOffer', () => {
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

  it('renders the supportive copy when the decision says to display', async () => {
    rendered = await renderOffer({
      decision: {
        eligible: true,
        shouldDisplay: true,
        supportiveCopy: 'یادگیری آرام و بدون عجله ادامه پیدا کند.',
        signal: 'meaningful_progress',
      },
    });

    expect(rendered.text()).toContain('یادگیری آرام و بدون عجله');
    expect(rendered.text()).toContain('فعلاً نه، ادامهٔ یادگیری');
  });

  it('renders nothing when the decision says not to display', async () => {
    rendered = await renderOffer({
      decision: {
        eligible: false,
        shouldDisplay: false,
        supportiveCopy: '',
        signal: null,
      },
    });

    expect(rendered.text()).toBe('');
  });

  it('invokes the dismiss callback from the dismiss button', async () => {
    let dismissed = false;
    rendered = await renderOffer({
      decision: {
        eligible: true,
        shouldDisplay: true,
        supportiveCopy: 'متن پشتیبان.',
        signal: null,
      },
      onDismiss: () => {
        dismissed = true;
      },
    });

    await rendered.clickButton('فعلاً نه');
    expect(dismissed).toBe(true);
  });
});

type Rendered = {
  clickButton(label: string): Promise<void>;
  text(): string;
  unmount(): Promise<void>;
};

async function renderOffer(props: {
  decision: SupportivePlusOfferDecision;
  onDismiss?: () => void;
}): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const { SupportivePlusOffer } = await import('../app/components/SupportivePlusOffer.js');
  await act(async () => {
    root.render(
      createElement(SupportivePlusOffer as FunctionComponent<typeof props>, {
        onDismiss: () => {},
        ...props,
      }),
    );
  });

  return {
    clickButton: async (label) => {
      const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
        candidate.textContent?.trim().startsWith(label),
      );
      if (!button) throw new Error(`Button not found: ${label}`);
      await act(async () => button.click());
    },
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
