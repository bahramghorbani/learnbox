'use client';

/**
 * Browser-side half of the daily review-reminder toggle (LB-B19 made real).
 *
 * Deliberately has no React state of its own: SettingsScreen owns the on/off UI and calls these
 * functions, which only talk to the Push API and this app's own /api/learner/notifications/*
 * routes (never a third-party SDK).
 */

export type ReminderSubscribeResult = 'subscribed' | 'unsupported' | 'permission_denied' | 'error';

function base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Settings → toggling reminders ON. */
export async function subscribeToReminders(
  vapidPublicKey: string,
): Promise<ReminderSubscribeResult> {
  if (!isPushSupported() || !vapidPublicKey) return 'unsupported';

  const permission =
    Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return 'permission_denied';

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(vapidPublicKey),
      });
    }

    const response = await fetch('/api/learner/notifications/subscribe', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });
    return response.ok ? 'subscribed' : 'error';
  } catch {
    return 'error';
  }
}

/** Settings → toggling reminders OFF. Best-effort browser unsubscribe; the server side always wins. */
export async function unsubscribeFromReminders(): Promise<boolean> {
  try {
    const response = await fetch('/api/learner/notifications/unsubscribe', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (isPushSupported()) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
    }
    return response.ok;
  } catch {
    return false;
  }
}

/** What Settings shows on mount, read from the server (the source of truth, not the browser). */
export async function readReminderStatus(): Promise<boolean> {
  try {
    const response = await fetch('/api/learner/notifications/status', {
      method: 'GET',
      credentials: 'same-origin',
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { enabled?: boolean };
    return Boolean(body.enabled);
  } catch {
    return false;
  }
}
