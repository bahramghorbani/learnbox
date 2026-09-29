'use client';

import { useState } from 'react';

type LogoutState = 'idle' | 'confirming' | 'pending' | 'failed';

interface LogoutPanelProps {
  /** Ends the server session. Resolves true when the session was actually revoked. */
  onLogout: () => Promise<boolean>;
  /** Clears device-local learner state and returns to the signed-out experience. */
  onLoggedOut: () => void;
}

/**
 * Settings → sign out (LB-B27).
 *
 * Confirmation is deliberate rather than a bare button: with v1.2 sessions lasting
 * up to 30 days, signing out means the learner must receive another SMS code to get
 * back in, so an accidental tap has a real cost.
 *
 * A failed sign-out must NOT pretend to succeed. If the server cannot revoke the
 * session, the learner stays signed in and is told, rather than being dropped into
 * a signed-out-looking UI while the session is still live server-side.
 */
export function LogoutPanel({ onLogout, onLoggedOut }: LogoutPanelProps) {
  const [state, setState] = useState<LogoutState>('idle');

  const handleConfirm = () => {
    setState('pending');
    void onLogout()
      .then((revoked) => {
        if (revoked) {
          onLoggedOut();
          return;
        }
        setState('failed');
      })
      .catch(() => {
        setState('failed');
      });
  };

  if (state === 'confirming' || state === 'pending' || state === 'failed') {
    return (
      <div className="settings-row settings-row-block">
        <span className="settings-row-copy">
          <strong>خروج از حساب</strong>
          <small>
            برای ورود دوباره، کد پیامکی جدیدی به شمارهٔ شما فرستاده می‌شود. پیشرفت و مرورهای شما روی
            حساب‌تان محفوظ می‌ماند.
          </small>
        </span>
        {state === 'failed' ? (
          <p className="settings-save-status" role="alert">
            خروج انجام نشد و همچنان وارد حساب هستید. لطفاً دوباره تلاش کنید.
          </p>
        ) : null}
        <div className="settings-row-actions">
          <button
            className="text-button settings-danger-action"
            type="button"
            onClick={handleConfirm}
            disabled={state === 'pending'}
            data-testid="logout-confirm"
          >
            {state === 'pending' ? 'در حال خروج…' : 'بله، خارج شو'}
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => setState('idle')}
            disabled={state === 'pending'}
            data-testid="logout-cancel"
          >
            انصراف
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-row">
      <span className="settings-row-copy">
        <strong>خروج از حساب</strong>
        <small>از این دستگاه خارج می‌شوید؛ اطلاعات حساب شما پاک نمی‌شود.</small>
      </span>
      <button
        className="text-button"
        type="button"
        onClick={() => setState('confirming')}
        data-testid="logout-open"
      >
        خروج
      </button>
    </div>
  );
}
