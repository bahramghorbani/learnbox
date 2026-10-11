'use client';

import React, { useEffect, useRef, type ReactNode } from 'react';

/**
 * The approved overlay primitive, shared by every Admin surface that needs one.
 *
 * It lived inside `ContentPackForms` while only the content forms opened a modal. The support
 * screen needs the same dialog, and importing it from the forms module would have pulled the whole
 * pack-form bundle onto the users route, so it moved here. `ContentPackForms` re-exports it, which
 * is why its existing callers are untouched.
 *
 * Markup and class names stay the frozen prototype's `.scrim`/`.modal` primitives, re-scoped as
 * `.cp-*`. No new visual language is introduced here.
 */

export function CpModal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  wide?: boolean;
}) {
  const headingId = `cp-modal-${title.replace(/\s+/g, '-')}`;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Every caller passes a fresh inline arrow, so `onClose` cannot be an effect dependency: the
  // effect would tear down and re-run on every parent render, and its cleanup would hand focus
  // back to the opener while the dialog is still on screen. The ref keeps the latest callback
  // without making the setup depend on its identity.
  const closeRequest = useRef(onClose);
  closeRequest.current = onClose;

  // Escape closes, focus moves into the dialog, Tab stays inside it, and the control that opened
  // the dialog gets focus back on close — otherwise a keyboard operator is returned to the top of
  // the page and a screen reader loses its place after every confirmation.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;

    function focusables(): HTMLElement[] {
      const root = dialogRef.current;
      if (!root) return [];
      return [
        ...root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ];
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') return closeRequest.current();
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    // A dialog without a form field still has to take focus, or the keyboard stays on the page
    // behind the scrim; the close button is the guaranteed target.
    const initial =
      dialogRef.current?.querySelector<HTMLElement>('input, select, textarea') ?? closeRef.current;
    initial?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  return (
    <div
      className="cp-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={wide ? 'cp-modal is-wide' : 'cp-modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        ref={dialogRef}
      >
        <div className="cp-modal-head">
          <h3 id={headingId}>{title}</h3>
          <button
            type="button"
            className="cp-x-btn"
            onClick={onClose}
            aria-label="بستن"
            ref={closeRef}
          >
            ✕
          </button>
        </div>
        <div className="cp-modal-body">{children}</div>
        <div className="cp-modal-foot">{footer}</div>
      </div>
    </div>
  );
}
