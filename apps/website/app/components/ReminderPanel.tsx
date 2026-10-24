'use client';

import { useEffect, useState } from 'react';

import {
  readReminderStatus,
  subscribeToReminders,
  unsubscribeFromReminders,
} from '../reminder-subscription';

interface ReminderPanelProps {
  /** NEXT_PUBLIC_VAPID_PUBLIC_KEY, baked in at build time. Absent = push isn't configured yet. */
  vapidPublicKey?: string;
}

const label = 'یادآوری روزانهٔ مرور';
const statusMessages: Record<string, string> = {
  subscribed: 'یادآوری روزانه فعال شد.',
  unsubscribed: 'یادآوری روزانه خاموش شد.',
  permission_denied: 'اجازهٔ نوتیفیکیشن در مرورگر رد شد؛ بدون آن یادآوری ارسال نمی‌شود.',
  unsupported: 'این مرورگر یا دستگاه از نوتیفیکیشن پشتیبانی نمی‌کند.',
  error: 'ذخیرهٔ این تنظیم با مشکل مواجه شد؛ دوباره تلاش کنید.',
};

/**
 * Settings → daily review-reminder toggle (LB-B19 made real).
 *
 * Server state is the source of truth (read on mount from /api/learner/notifications/status);
 * the browser Push subscription is only a side effect of turning it on.
 */
export function ReminderPanel({ vapidPublicKey }: ReminderPanelProps) {
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [statusKey, setStatusKey] = useState<string>('');

  useEffect(() => {
    void readReminderStatus().then(setEnabled);
  }, []);

  const handleToggle = (next: boolean) => {
    setPending(true);
    setStatusKey('');
    if (next) {
      void subscribeToReminders(vapidPublicKey ?? '').then((result) => {
        setPending(false);
        if (result === 'subscribed') {
          setEnabled(true);
          setStatusKey('subscribed');
        } else {
          setEnabled(false);
          setStatusKey(result);
        }
      });
    } else {
      void unsubscribeFromReminders().then((ok) => {
        setPending(false);
        setEnabled(!ok && enabled);
        setStatusKey(ok ? 'unsubscribed' : 'error');
      });
    }
  };

  return (
    <div className="settings-row settings-row-switch">
      <label className="settings-switch-control">
        <input
          id="reminder-notification-switch"
          className="settings-switch-input"
          type="checkbox"
          role="switch"
          checked={enabled}
          aria-checked={enabled}
          aria-label={label}
          disabled={pending}
          onChange={(event) => handleToggle(event.target.checked)}
        />
        <span className="settings-row-copy">
          <strong>{label}</strong>
          <small>هر روز یک نوتیفیکیشن انگیزشی برای ادامهٔ مرور کلمات دریافت می‌کنید.</small>
        </span>
        <span className="settings-switch-track" aria-hidden="true" />
      </label>
      {statusKey ? (
        <p className="settings-save-status" role="status" data-testid="reminder-status">
          {statusMessages[statusKey]}
        </p>
      ) : null}
    </div>
  );
}
