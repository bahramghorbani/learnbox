'use client';

import { useEffect, useRef } from 'react';
import { StoreBadges } from '../components/landing/StoreBadges';

// Picker shown instead of jumping straight to Cafe Bazaar: lets iPhone/web users
// pick the right destination too. Native <dialog> gives centering, focus-trap and
// Escape-to-close for free.
export function GetAppModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="app-picker"
      dir="rtl"
      aria-labelledby="app-picker-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="app-picker-inner">
        <button type="button" className="app-picker-close" aria-label="بستن" onClick={onClose}>
          ×
        </button>
        <span className="app-picker-kicker">ادامهٔ یادگیری</span>
        <h2 id="app-picker-title">لرن‌باکس را هر جا دوست داری باز کن</h2>
        <p>برای مرور واژه‌ها با یادآوری هوشمند، نسخهٔ مناسب دستگاهت را انتخاب کن.</p>
        <StoreBadges variant="download" />
      </div>
    </dialog>
  );
}
