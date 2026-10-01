'use client';

import { useState } from 'react';

type LogoutState = 'idle' | 'confirming' | 'pending' | 'failed' | 'unsent';

interface LogoutPanelProps {
  /** Ends the server session. Resolves true when the session was actually revoked. */
  onLogout: () => Promise<boolean>;
  /** Clears device-local learner state and returns to the signed-out experience. */
  onLoggedOut: () => void;
  /**
   * LB-B35 CP4 (safe logout; absent = v1.2.1). Tries to send every unsent answer BEFORE the session is
   * ended (the flush needs the session) and resolves with how many are still unsent. When any remain the
   * learner chooses; nothing on the device is discarded silently.
   */
  onFlushUnsent?: () => Promise<number>;
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
export function LogoutPanel({ onLogout, onLoggedOut, onFlushUnsent }: LogoutPanelProps) {
  const [state, setState] = useState<LogoutState>('idle');
  const [unsent, setUnsent] = useState(0);

  const endSession = () => {
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

  const handleConfirm = () => {
    if (!onFlushUnsent) {
      endSession();
      return;
    }
    setState('pending');
    void onFlushUnsent()
      .then((remaining) => {
        if (remaining > 0) {
          setUnsent(remaining);
          setState('unsent');
          return;
        }
        endSession();
      })
      .catch(() => {
        // The count is unknown, so assume answers may remain rather than risk losing them.
        setUnsent(1);
        setState('unsent');
      });
  };

  if (state === 'unsent') {
    return (
      <div className="settings-row settings-row-block">
        <span className="settings-row-copy">
          <strong>پاسخ‌های ارسال‌نشده</strong>
          <small data-testid="logout-unsent-count">
            {unsent.toLocaleString('fa-IR')} پاسخ هنوز به حساب شما فرستاده نشده است. اگر اکنون خارج
            شوید و آن‌ها را نگه ندارید، از این دستگاه پاک می‌شوند.
          </small>
        </span>
        <div className="settings-row-actions">
          <button
            className="text-button"
            type="button"
            onClick={handleConfirm}
            data-testid="logout-retry-send"
          >
            تلاش دوباره برای ارسال
          </button>
          <button
            className="text-button settings-danger-action"
            type="button"
            onClick={endSession}
            data-testid="logout-discard-and-exit"
          >
            خروج و حذف این پاسخ‌ها
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => setState('idle')}
            data-testid="logout-stay"
          >
            ماندن در حساب
          </button>
        </div>
      </div>
    );
  }

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
