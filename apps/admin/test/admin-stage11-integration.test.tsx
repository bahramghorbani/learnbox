// @vitest-environment jsdom

import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CpModal } from '../app/components/AdminModal';
import { faDate, faDateTime, faRelative } from '../app/components/fa-dates';
import { faNum } from '../app/components/fa-digits';
import { CARD_BADGE, PACK_BADGE, badgeFor } from '../app/components/status-badges';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Stage 11 stabilisation guards. Each test pins a defect the full-UI audit found, so the fix
 * cannot silently regress: a second date formatter drifting off Tehran, a modal that lets the
 * keyboard escape behind the scrim, or the pack badge map forking again (LB-B53).
 */
describe('Admin Stage 11 integration guards', () => {
  it('renders every timestamp in Tehran, not the operator browser timezone', () => {
    // 21:00 UTC is already 00:30 on the next Tehran day (+03:30), and the next Jalali day with it.
    // Pinned as a literal: on a UTC runner, dropping `timeZone` moves this back a whole day.
    expect(faDateTime('2026-10-11T21:00:00.000Z')).toBe('۲۰ مهر ۱۴۰۵، ۰:۳۰');
    expect(faDate('2026-10-11T21:00:00.000Z')).toBe('۲۰ مهر ۱۴۰۵');
    // An unparseable value is shown as given rather than silently becoming "now".
    expect(faDateTime('not-a-date')).toBe('not-a-date');
    expect(faDate(null)).toBe('—');
    expect(faRelative(null)).toBe('—');
  });

  it('formats counts with the frozen prototype separator', () => {
    expect(faNum(12438)).toBe('۱۲,۴۳۸');
    // The Persian locale separator (U+066C) is NOT the approved one.
    expect(faNum(12438)).not.toContain('\u066c');
  });

  it('keeps one canonical pack and card badge map (LB-B53)', () => {
    expect(PACK_BADGE.published).toEqual(['b-green', 'منتشر شده']);
    expect(CARD_BADGE.rejected).toEqual(['b-rose', 'ردشده']);
    // An unmapped status prints itself instead of vanishing behind a guess.
    expect(badgeFor(PACK_BADGE, 'quarantined')).toEqual(['b-grey', 'quarantined']);
  });

  describe('modal focus management', () => {
    let container: HTMLElement | undefined;
    let root: ReturnType<typeof createRoot> | undefined;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.append(container);
      root = createRoot(container);
    });

    afterEach(async () => {
      if (root) await act(async () => root?.unmount());
      container?.remove();
      root = undefined;
      container = undefined;
    });

    function Harness({ withInput }: { withInput: boolean }) {
      const [open, setOpen] = useState(false);
      return createElement(
        'div',
        null,
        createElement(
          'button',
          { type: 'button', id: 'opener', onClick: () => setOpen(true) },
          'باز کردن',
        ),
        open
          ? createElement(CpModal, {
              title: 'تأیید',
              onClose: () => setOpen(false),
              footer: createElement('button', { type: 'button', id: 'confirm' }, 'تأیید'),
              children: withInput ? createElement('input', { id: 'first-field' }) : 'بدون فیلد',
            })
          : null,
      );
    }

    it('focuses a field-less dialog and returns focus to its opener on close', async () => {
      await act(async () => root?.render(createElement(Harness, { withInput: false })));
      const opener = container?.querySelector<HTMLButtonElement>('#opener');
      opener?.focus();
      await act(async () => opener?.click());

      // No form field: focus must still land inside the dialog, on the close button.
      expect(document.activeElement?.className).toBe('cp-x-btn');

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
      expect(container?.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement?.id).toBe('opener');
    });

    it('traps Tab inside the dialog in both directions', async () => {
      await act(async () => root?.render(createElement(Harness, { withInput: true })));
      await act(async () => container?.querySelector<HTMLButtonElement>('#opener')?.click());

      expect(document.activeElement?.id).toBe('first-field');

      const confirm = container?.querySelector<HTMLButtonElement>('#confirm');
      confirm?.focus();
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      });
      // Last control + Tab wraps to the first control, never to the page behind the scrim.
      expect(document.activeElement?.className).toBe('cp-x-btn');

      await act(async () => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
        );
      });
      expect(document.activeElement?.id).toBe('confirm');
    });
  });
});
