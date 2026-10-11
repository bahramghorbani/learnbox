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

  // Escape closes, and focus moves into the dialog — the prototype's overlay behaviour.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    dialogRef.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

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
          <button type="button" className="cp-x-btn" onClick={onClose} aria-label="بستن">
            ✕
          </button>
        </div>
        <div className="cp-modal-body">{children}</div>
        <div className="cp-modal-foot">{footer}</div>
      </div>
    </div>
  );
}
